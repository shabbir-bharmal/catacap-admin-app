import { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link,
  List,
  ListOrdered,
  RemoveFormatting,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  suggestions?: { id: number; key?: string; value: string }[];
  maxLength?: number;
}

const ALLOWED_TAGS = new Set([
  "P",
  "DIV",
  "BR",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "OL",
  "UL",
  "LI",
  "A",
]);

const DROPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "META",
  "LINK",
  "HEAD",
  "TITLE",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "OPTION",
]);

const MENTION_CLASS_NAME =
  "bg-sky-100 text-sky-900 rounded-md px-1.5 py-0.5 inline-block mx-0.5 font-medium select-none";

const MENTION_REQUIRED_CLASSES = [
  "bg-sky-100",
  "text-sky-900",
  "select-none",
];

const MENTION_TEXT_PATTERN = /^\{[^{}]+\}$/;

// Only treat a span as a mention chip if it matches the exact shape produced
// by `insertMention` below: contenteditable=false, all of the mention CSS
// classes present, and text content shaped like `{Placeholder}`. Anything
// else is treated as foreign formatting and unwrapped.
function isTrustedMentionSpan(el: Element): boolean {
  if (el.tagName !== "SPAN") return false;
  if (el.getAttribute("contenteditable") !== "false") return false;
  const text = (el.textContent || "").trim();
  if (!MENTION_TEXT_PATTERN.test(text)) return false;
  const classes = el.classList;
  for (const required of MENTION_REQUIRED_CLASSES) {
    if (!classes.contains(required)) return false;
  }
  // Mention chips are leaf nodes that only contain text — reject anything
  // with nested elements (e.g. an attacker wrapping a script in a fake chip).
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType !== Node.TEXT_NODE) return false;
  }
  return true;
}

// Rebuild a safe mention span from scratch — never clone untrusted attributes
// (style, on*, etc.) from the source element.
function rebuildMentionSpan(el: Element): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = MENTION_CLASS_NAME;
  span.contentEditable = "false";
  span.textContent = (el.textContent || "").trim();
  return span;
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  return /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed);
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    // Drop comments, processing instructions, etc.
    return null;
  }

  const el = node as Element;

  if (DROPPED_TAGS.has(el.tagName)) {
    return null;
  }

  // Preserve mention chips, but rebuild them from a fixed template so we
  // never carry over untrusted attributes (style, on*, etc.).
  if (isTrustedMentionSpan(el)) {
    return rebuildMentionSpan(el);
  }

  if (ALLOWED_TAGS.has(el.tagName)) {
    const tagName = el.tagName.toLowerCase();

    // For anchors, only keep the <a> wrapper when the href is safe and
    // present. Otherwise unwrap the anchor so its text content survives
    // without an empty/broken link tag.
    if (tagName === "a") {
      const href = (el.getAttribute("href") || "").trim();
      if (!isSafeHref(href)) {
        const frag = document.createDocumentFragment();
        el.childNodes.forEach((child) => {
          const sanitized = sanitizeNode(child);
          if (sanitized) frag.appendChild(sanitized);
        });
        return frag;
      }
      const newAnchor = document.createElement("a");
      newAnchor.setAttribute("href", href);
      newAnchor.setAttribute("target", "_blank");
      newAnchor.setAttribute("rel", "noopener noreferrer");
      el.childNodes.forEach((child) => {
        const sanitized = sanitizeNode(child);
        if (sanitized) newAnchor.appendChild(sanitized);
      });
      return newAnchor;
    }

    const newEl = document.createElement(tagName);
    el.childNodes.forEach((child) => {
      const sanitized = sanitizeNode(child);
      if (sanitized) newEl.appendChild(sanitized);
    });

    return newEl;
  }

  // Unwrap any tag that isn't allowed: keep the text content,
  // drop the wrapper and all of its attributes (style, class, etc.).
  const frag = document.createDocumentFragment();
  el.childNodes.forEach((child) => {
    const sanitized = sanitizeNode(child);
    if (sanitized) frag.appendChild(sanitized);
  });
  return frag;
}

function sanitizeHtmlToFragment(html: string): DocumentFragment {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const out = document.createDocumentFragment();
  doc.body.childNodes.forEach((child) => {
    const sanitized = sanitizeNode(child);
    if (sanitized) out.appendChild(sanitized);
  });
  return out;
}

function plainTextToFragment(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, idx) => {
    if (line.length > 0) {
      frag.appendChild(document.createTextNode(line));
    }
    if (idx < lines.length - 1) {
      frag.appendChild(document.createElement("br"));
    }
  });
  return frag;
}

// Strip every formatting wrapper from a fragment, preserving plain text and
// mention chips, and inserting <br> in place of block boundaries so the
// visual line breaks that the user pasted/typed are not lost.
function clearFormattingInPlace(root: Node): void {
  const blockTags = new Set(["P", "DIV", "LI", "OL", "UL"]);

  const flatten = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      return [document.createTextNode(node.textContent || "")];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }
    const el = node as Element;

    if (DROPPED_TAGS.has(el.tagName)) {
      return [];
    }
    if (isTrustedMentionSpan(el)) {
      return [rebuildMentionSpan(el)];
    }
    if (el.tagName === "BR") {
      return [document.createElement("br")];
    }

    const children: Node[] = [];
    el.childNodes.forEach((child) => {
      flatten(child).forEach((c) => children.push(c));
    });

    if (blockTags.has(el.tagName) && children.length > 0) {
      const last = children[children.length - 1];
      if (!(last.nodeType === Node.ELEMENT_NODE && (last as Element).tagName === "BR")) {
        children.push(document.createElement("br"));
      }
    }
    return children;
  };

  const flattened: Node[] = [];
  Array.from(root.childNodes).forEach((child) => {
    flatten(child).forEach((n) => flattened.push(n));
  });

  // Trim a trailing <br> so we don't leave an extra blank line.
  while (flattened.length > 0) {
    const last = flattened[flattened.length - 1];
    if (last.nodeType === Node.ELEMENT_NODE && (last as Element).tagName === "BR") {
      flattened.pop();
    } else {
      break;
    }
  }

  while (root.firstChild) root.removeChild(root.firstChild);
  flattened.forEach((n) => root.appendChild(n));
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  className = "",
  "data-testid": testId,
  suggestions = [],
  maxLength,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValidHtmlRef = useRef<string>(value);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCoords, setMentionCoords] = useState({ top: 0, left: 0 });
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const getPlainTextLength = useCallback((el: HTMLElement) => {
    return el.innerHTML.replace(/<[^>]*>/g, "").length;
  }, []);

  // Set initial HTML only on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value;
      lastValidHtmlRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes only when not focused
  useEffect(() => {
    const el = editorRef.current;
    if (el && el !== document.activeElement) {
      el.innerHTML = value;
      lastValidHtmlRef.current = value;
    }
  }, [value]);

  const enforceMaxLength = useCallback((): boolean => {
    if (!maxLength || !editorRef.current) return false;
    if (getPlainTextLength(editorRef.current) > maxLength) {
      editorRef.current.innerHTML = lastValidHtmlRef.current;
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return true;
    }
    lastValidHtmlRef.current = editorRef.current.innerHTML;
    return false;
  }, [maxLength, getPlainTextLength]);

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  }, [onChange]);

  const handleLink = useCallback(() => {
    const url = prompt("Enter URL:");
    if (url) {
      execCommand("createLink", url);
    }
  }, [execCommand]);

  const handleClearFormatting = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    const hasSelection =
      selection &&
      selection.rangeCount > 0 &&
      !selection.getRangeAt(0).collapsed &&
      editor.contains(selection.getRangeAt(0).commonAncestorContainer);

    if (hasSelection && selection) {
      // Strip formatting from just the selected fragment.
      const range = selection.getRangeAt(0);
      const extracted = range.extractContents();
      const wrapper = document.createElement("div");
      wrapper.appendChild(extracted);
      clearFormattingInPlace(wrapper);

      const insertFrag = document.createDocumentFragment();
      let lastInserted: Node | null = null;
      Array.from(wrapper.childNodes).forEach((node) => {
        insertFrag.appendChild(node);
      });
      if (insertFrag.lastChild) {
        lastInserted = insertFrag.lastChild;
      }
      range.insertNode(insertFrag);

      if (lastInserted) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastInserted);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      // Strip formatting from the entire editor when nothing is selected.
      clearFormattingInPlace(editor);

      const newRange = document.createRange();
      newRange.selectNodeContents(editor);
      newRange.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    if (!enforceMaxLength()) {
      onChange(editor.innerHTML);
      lastValidHtmlRef.current = editor.innerHTML;
    }
    editor.focus();
  }, [enforceMaxLength, onChange]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    if (enforceMaxLength()) return;
    const currentHtml = editorRef.current.innerHTML;
    onChange(currentHtml);

    // Mention detection logic
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || "";
    const atIndex = textBefore.lastIndexOf("@");

    if (atIndex !== -1) {
      const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : " ";
      // Only trigger if @ is at start or preceded by space/newline
      if (charBefore === " " || charBefore === "\u00A0" || charBefore === "\n" || atIndex === 0) {
        const query = textBefore.slice(atIndex + 1);
        // Only trigger if no space in the query
        if (!/\s/.test(query)) {
          const rect = range.getClientRects()[0] || range.startContainer.parentElement?.getBoundingClientRect();
          if (rect) {
            setMentionCoords({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
            setMentionQuery(query);
            setMentionOpen(true);
            setHighlightedIndex(0);
            return;
          }
        }
      }
    }
    setMentionOpen(false);
  }, [onChange, enforceMaxLength]);

  const filteredSuggestions = suggestions.filter((s) =>
    (s.key || s.value).toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const insertMention = useCallback((item: { value: string; key?: string }) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const offset = range.startOffset;
    const text = textNode.textContent || "";
    const atIndex = text.lastIndexOf("@", offset - 1);

    if (atIndex !== -1) {
      // Create the mention span with requested styling
      const span = document.createElement("span");
      span.className = "bg-sky-100 text-sky-900 rounded-md px-1.5 py-0.5 inline-block mx-0.5 font-medium select-none";
      span.contentEditable = "false";
      span.innerText = `{${item.key || item.value}}`;

      // Create a space node to follow the mention
      const spaceNode = document.createTextNode("\u00A0");

      // Replace the "@query" portion with the span and space
      range.setStart(textNode, atIndex);
      range.setEnd(textNode, offset);
      range.deleteContents();

      // Insert in reverse order due to how insertNode works relative to the range start
      range.insertNode(spaceNode);
      range.insertNode(span);

      // Move cursor to after the space
      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      if (!enforceMaxLength() && editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    }
    setMentionOpen(false);
  }, [onChange, enforceMaxLength]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!mentionOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if ((e.key === "Enter" || e.key === "Tab") && filteredSuggestions.length > 0) {
      e.preventDefault();
      insertMention(filteredSuggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionOpen(false);
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const editor = editorRef.current;
      if (!editor) return;

      const clipboard = e.clipboardData;
      if (!clipboard) return;

      const html = clipboard.getData("text/html");
      const text = clipboard.getData("text/plain");

      let fragment: DocumentFragment;
      if (html && html.trim().length > 0) {
        fragment = sanitizeHtmlToFragment(html);
        // If sanitization produced nothing meaningful, fall back to plain text.
        if (!fragment.firstChild && text) {
          fragment = plainTextToFragment(text);
        }
      } else {
        fragment = plainTextToFragment(text || "");
      }

      if (!fragment.firstChild) return;

      const previousHtml = editor.innerHTML;

      const selection = window.getSelection();
      if (
        !selection ||
        selection.rangeCount === 0 ||
        !editor.contains(selection.getRangeAt(0).commonAncestorContainer)
      ) {
        // No valid caret inside the editor — append at end.
        editor.appendChild(fragment);
      } else {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const lastNode = fragment.lastChild;
        range.insertNode(fragment);

        if (lastNode) {
          const newRange = document.createRange();
          newRange.setStartAfter(lastNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }

      if (maxLength && getPlainTextLength(editor) > maxLength) {
        editor.innerHTML = previousHtml;
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        return;
      }

      lastValidHtmlRef.current = editor.innerHTML;
      onChange(editor.innerHTML);
    },
    [maxLength, getPlainTextLength, onChange],
  );

  const hasContent = value.replace(/<[^>]*>/g, "").trim().length > 0;

  const moveCursorToEnd = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, []);

  const handleFocus = useCallback(() => {
    // Only move cursor to end if it's currently at the start and there is content
    // This allows users to click to a specific position without it jumping
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range.startOffset === 0 && range.endOffset === 0 && hasContent) {
        moveCursorToEnd();
      }
    } else if (hasContent) {
      moveCursorToEnd();
    }
  }, [hasContent, moveCursorToEnd]);

  const toolbarButtons = [
    { icon: Bold, command: "bold", label: "Bold", testId: "button-bold" },
    { icon: Italic, command: "italic", label: "Italic", testId: "button-italic" },
    { icon: Underline, command: "underline", label: "Underline", testId: "button-underline" },
    { icon: Link, command: "link", label: "Link", testId: "button-link", onClick: handleLink },
    { icon: ListOrdered, command: "insertOrderedList", label: "Ordered List", testId: "button-ordered-list" },
    { icon: List, command: "insertUnorderedList", label: "Unordered List", testId: "button-unordered-list" },
    { icon: RemoveFormatting, command: "removeFormat", label: "Clear Formatting", testId: "button-clear-format", onClick: handleClearFormatting },
  ];

  return (
    <div className={`border rounded-md overflow-hidden ${className}`} data-testid={testId}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/40" data-testid="rich-text-toolbar">
        {toolbarButtons.map((btn) => (
          <Button
            key={btn.command}
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={(e) => {
              e.preventDefault();
              if (btn.onClick) {
                btn.onClick();
              } else {
                execCommand(btn.command);
              }
            }}
            title={btn.label}
            data-testid={btn.testId}
          >
            <btn.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>

      <div className="relative">
        {!hasContent && placeholder && (
          <div
            className="absolute top-0 left-0 px-3 py-2 text-sm text-gray-400 pointer-events-none select-none"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          dir="ltr"
          className="min-h-[120px] px-3 py-2 text-sm outline-none focus:ring-0 bg-white dark:bg-background rich-text-editor-content"
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          data-testid={testId ? `${testId}-editor` : "rich-text-content"}
        />


        {mentionOpen && filteredSuggestions.length > 0 && (
          <div
            className="fixed z-50 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
            style={{ top: mentionCoords.top, left: mentionCoords.left }}
          >
            {filteredSuggestions.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer",
                  idx === highlightedIndex && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(item);
                }}
              >
                {item.key || item.value}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
