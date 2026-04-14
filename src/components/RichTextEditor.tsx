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

  const handlePaste = useCallback(() => {
    setTimeout(() => {
      if (!editorRef.current) return;
      if (enforceMaxLength()) return;
      onChange(editorRef.current.innerHTML);
    }, 0);
  }, [enforceMaxLength, onChange]);

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
    { icon: RemoveFormatting, command: "removeFormat", label: "Clear Formatting", testId: "button-clear-format" },
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
