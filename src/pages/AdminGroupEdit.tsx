import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { GroupLeadersSection } from "@/components/group/GroupLeadersSection";
import { ChampionsCatalystsSection } from "@/components/group/ChampionsCatalystsSection";
import { GroupInvestmentsSection } from "@/components/group/GroupInvestmentsSection";
import { fetchGroupDetail, updateGroup, GroupUpdatePayload, GroupLeader, Champion } from "@/api/group/groupApi";
import { fetchInvestmentData } from "@/api/investment/investmentApi";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, User, Crown, Search, Loader2, Check, Copy, ExternalLink, Upload, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Users, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { getUrlBlobContainerImage } from "@/lib/image-utils";
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || "https://qa.catacap.org";

const STEPS = [
  { id: 0, label: "Group Details" },
  { id: 1, label: "Our Why" },
  { id: 2, label: "Community" },
  { id: 3, label: "Investments" },
];

function getToken(): string | null {
  try {
    const persistRoot = localStorage.getItem("persist:root");
    if (persistRoot) {
      const parsed = JSON.parse(persistRoot);
      const tokenStr = parsed.token;
      if (tokenStr) {
        const tokenData = JSON.parse(tokenStr);
        const actual = typeof tokenData === "object" && tokenData !== null ? tokenData.token : tokenData;
        if (actual && actual !== "null" && typeof actual === "string") return actual;
      }
    }
  } catch { }
  return null;
}

interface ManageGroupFormData {
  groupName: string;
  groupWebsite: string;
  groupDescription: string;
  didYouKnow: string;
  groupIdentifier: string;
  mediaLink: string;
  mediaDescription: string;
  requireApproval: boolean;
  makePrivate: boolean;
  deactivateGroup: boolean;
  groupIconPreview: string | null;
  backgroundPreview: string | null;
  themes: string;
  groupThemes: number[];
  metaTitle: string;
  metaDescription: string;
}

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

const normalizeHtmlContent = (html: string): string => {
  if (!html) return "";
  return html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "").trim();
};

function getPlainText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, '\n'),
    'text/html'
  );
  return (doc.body.textContent || '').replace(/\n$/, '');
}

function getPlainTextLength(html: string): number {
  return getPlainText(html).length;
}

const defaultFormData: ManageGroupFormData = {
  groupName: "",
  groupWebsite: "",
  groupDescription: "",
  didYouKnow: "",
  groupIdentifier: "",
  mediaLink: "",
  mediaDescription: "",
  requireApproval: false,
  makePrivate: false,
  deactivateGroup: false,
  groupIconPreview: null,
  backgroundPreview: null,
  themes: "",
  groupThemes: [],
  metaTitle: "",
  metaDescription: ""
};

function InlineRichEditor({
  value,
  onChange,
  placeholder = "",
  maxLength,
  rows = 3,
  showLists = false,
  testId = "richtext",
  editorRef: externalRef,
  hasError = false
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  showLists?: boolean;
  testId?: string;
  editorRef?: React.RefObject<HTMLDivElement>;
  hasError?: boolean;
}) {
  const editorRef = externalRef || useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const getTextLength = useCallback(() => {
    if (!editorRef.current) return 0;
    return getPlainTextLength(editorRef.current.innerHTML);
  }, []);

  const truncateToMaxLength = useCallback(() => {
    if (!editorRef.current || !maxLength) return false;
    if (getTextLength() <= maxLength) return false;

    const sel = window.getSelection();

    let charCount = 0;
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    );
    let lastTextNode: Text | null = null;
    const nodesToRemove: Node[] = [];
    let trimmed = false;

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === "BR") {
          if (trimmed) {
            nodesToRemove.push(node);
          } else if (charCount + 1 > maxLength) {
            nodesToRemove.push(node);
            trimmed = true;
          } else {
            charCount += 1;
          }
        }
        continue;
      }

      const textNode = node as Text;
      const nodeLen = textNode.textContent?.length || 0;
      if (!trimmed && charCount + nodeLen > maxLength) {
        const keep = maxLength - charCount;
        textNode.textContent = (textNode.textContent || "").slice(0, keep);
        lastTextNode = textNode;
        charCount = maxLength;
        trimmed = true;
      } else if (trimmed) {
        nodesToRemove.push(textNode);
      } else {
        charCount += nodeLen;
        lastTextNode = textNode;
      }
    }

    const didMutate = nodesToRemove.length > 0 || trimmed;

    for (const node of nodesToRemove) {
      const parent = node.parentNode;
      parent?.removeChild(node);
      if (parent && parent !== editorRef.current && parent.childNodes.length === 0) {
        parent.parentNode?.removeChild(parent);
      }
    }

    try {
      if (lastTextNode && sel) {
        const newRange = document.createRange();
        newRange.setStart(lastTextNode, lastTextNode.textContent?.length || 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    } catch { }

    return didMutate;
  }, [maxLength, getTextLength]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    truncateToMaxLength();
    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
  }, [onChange, truncateToMaxLength]);

  const handleCompositionEnd = useCallback(() => {
    if (!editorRef.current || !maxLength) return;
    if (truncateToMaxLength()) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [maxLength, truncateToMaxLength, onChange]);

  const execCommand = useCallback(
    (command: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false);
      if (editorRef.current) {
        isInternalChange.current = true;
        onChange(editorRef.current.innerHTML);
      }
    },
    [onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!maxLength) return;
      e.preventDefault();
      const pastedText = e.clipboardData.getData("text/plain");
      const currentLen = getTextLength();
      const sel = window.getSelection();
      const selectedLen = sel && !sel.isCollapsed ? (sel.toString().length || 0) : 0;
      const available = maxLength - currentLen + selectedLen;
      if (available <= 0) return;
      const truncated = pastedText.slice(0, available);
      document.execCommand("insertText", false, truncated);
    },
    [maxLength, getTextLength]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        execCommand("bold");
      } else if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        execCommand("italic");
      } else if (e.key === "u" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        execCommand("underline");
      } else if (
        maxLength &&
        getTextLength() >= maxLength &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          e.preventDefault();
        }
      }
    },
    [execCommand, maxLength, getTextLength]
  );

  const minHeight = rows * 24;

  return (
    <div className={`border ${hasError ? "border-destructive" : "border-border"} rounded-md p-3 bg-background`} data-testid={testId}>
      <div className="flex items-center gap-1 border-b border-border pb-2 mb-2">
        {[
          { cmd: "bold", icon: <Bold className="w-3.5 h-3.5" />, title: "Bold" },
          { cmd: "italic", icon: <Italic className="w-3.5 h-3.5" />, title: "Italic" },
          { cmd: "underline", icon: <Underline className="w-3.5 h-3.5" />, title: "Underline" },
          { cmd: "strikeThrough", icon: <Strikethrough className="w-3.5 h-3.5" />, title: "Strikethrough" }
        ].map(({ cmd, icon, title }) => (
          <button
            key={cmd}
            type="button"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => execCommand(cmd)}
            title={title}
            data-testid={`${testId}-${cmd}`}
          >
            {icon}
          </button>
        ))}
        {showLists && (
          <>
            <button
              type="button"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => execCommand("insertUnorderedList")}
              title="Bullet List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => execCommand("insertOrderedList")}
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionEnd={handleCompositionEnd}
        data-placeholder={placeholder}
        className="outline-none text-sm min-h-[var(--editor-min-h)] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none"
        style={{ "--editor-min-h": `${minHeight}px` } as React.CSSProperties}
        data-testid={`${testId}-content`}
      />
    </div>
  );
}

export default function AdminGroupEdit() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/groups/:identifier/edit");
  const { toast } = useToast();
  const identifier = params?.identifier || "";

  const [formData, setFormData] = useState<ManageGroupFormData>({ ...defaultFormData });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiGroupId, setApiGroupId] = useState<number | null>(null);
  const [apiGroupData, setApiGroupData] = useState<any>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [themeOptions, setThemeOptions] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const groupIconRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const groupAssetsRef = useRef<HTMLDivElement>(null);

  const groupNameRef = useRef<HTMLInputElement>(null);
  const groupWebsiteRef = useRef<HTMLInputElement>(null);
  const groupDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const groupIdentifierRef = useRef<HTMLInputElement>(null);
  const didYouKnowRef = useRef<HTMLDivElement>(null);
  const mediaLinkRef = useRef<HTMLInputElement>(null);
  const mediaDescriptionRef = useRef<HTMLDivElement>(null);

  const FIELD_REFS: Record<string, React.RefObject<any>> = {
    __images__: groupAssetsRef,
    groupName: groupNameRef,
    groupWebsite: groupWebsiteRef,
    groupDescription: groupDescriptionRef,
    didYouKnow: didYouKnowRef,
    groupIdentifier: groupIdentifierRef,
    mediaLink: mediaLinkRef,
    mediaDescription: mediaDescriptionRef,
  };

  const FIELD_STEPS: Record<string, number> = {
    __images__: 0,
    groupName: 0,
    groupWebsite: 0,
    groupDescription: 0,
    didYouKnow: 0,
    groupIdentifier: 0,
    mediaLink: 1,
    mediaDescription: 1,
  };

  const scrollToField = useCallback((field: string) => {
    const fieldStep = FIELD_STEPS[field];
    if (typeof fieldStep === "number" && fieldStep !== currentStep) {
      setCurrentStep(fieldStep);
    }

    window.setTimeout(() => {
      FIELD_REFS[field]?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      FIELD_REFS[field]?.current?.focus?.();
    }, 150);
  }, [currentStep]);

  const [newIconFile, setNewIconFile] = useState<File | null>(null);
  const [newBgFile, setNewBgFile] = useState<File | null>(null);

  const validateField = (field: keyof ManageGroupFormData, value: any, currentDeactivate?: boolean) => {
    const isDeactivated = currentDeactivate ?? formData.deactivateGroup;
    let error = "";

    if (field === "groupName") {
      const val = value?.toString().trim() || "";
      if (!val) error = "Group Name is required";
      else if (val.length < 3) error = "Group name must be at least 3 characters long";
      else if (val.length > 50) error = "Group name cannot exceed 50 characters";
    } else if (field === "groupIdentifier") {
      const val = value?.toString().trim() || "";
      if (!val) error = "Group Identifier is required";
      else if (!/^[a-zA-Z0-9-]+$/.test(val)) error = "Only letters, numbers and hyphens allowed";
    } else if (field === "groupDescription") {
      const val = value?.toString().trim() || "";
      if (!val) error = "Group Description is required";
      else if (val.length < 10) error = "Description must be at least 10 characters";
      else if (val.length > 2000) error = "Description cannot exceed 2000 characters";
    } else if (!isDeactivated) {
      if (field === "groupWebsite") {
        const val = value?.toString().trim() || "";
        if (!val) error = "Website is required";
        else if (!/^(https?:\/\/)?([\w\-]+\.)+[\w\-]{2,}(\/[\w\-]*)*\/?$/.test(val)) {
          error = "Please enter a valid website URL";
        }
      } else if (field === "didYouKnow") {
        const text = getPlainText(value?.toString() || "").trim();
        if (!text) error = "Did you know is required";
      } else if (field === "mediaDescription") {
        const len = getPlainTextLength(value?.toString() || "");
        if (len > 2000) error = "Description of media link cannot exceed 2000 characters";
      }
    }

    if (field === "mediaLink") {
      const val = value?.toString().trim() || "";
      if (val) {
        const pattern =
          /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com|open\.spotify\.com|linkedin\.com\/(learning|events|posts|pulse|video))\/.+$|^spotify:(episode|show|track|playlist|album):[a-zA-Z0-9]+$/;
        if (!pattern.test(val)) {
          error = "Please enter a valid Spotify, YouTube, Vimeo, or LinkedIn (Learning, Event, Post, Video) URL";
        }
      }
    }

    setFormErrors((prev) => ({ ...prev, [field]: error }));
    return error;
  };

  const [imageError, setImageError] = useState("");
  const [backgroundError, setBackgroundError] = useState("");

  const validateImages = (isDeactivated: boolean) => {
    if (isDeactivated) return true;
    let isValid = true;

    if (!formData.groupIconPreview) {
      setImageError("Please upload a profile image.");
      isValid = false;
    } else {
      setImageError("");
    }

    if (!formData.backgroundPreview) {
      setBackgroundError("Please upload a background image.");
      isValid = false;
    } else {
      setBackgroundError("");
    }

    return isValid;
  };

  const updateField = (field: keyof ManageGroupFormData, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "deactivateGroup") {
        validateField("groupName", next.groupName, value);
        validateField("groupIdentifier", next.groupIdentifier, value);
        validateField("groupDescription", next.groupDescription, value);
        validateField("groupWebsite", next.groupWebsite, value);
        validateField("didYouKnow", next.didYouKnow, value);
        validateField("mediaDescription", next.mediaDescription, value);
        validateField("mediaLink", next.mediaLink, value);
        if (value) {
          setImageError("");
          setBackgroundError("");
        }
      } else {
        validateField(field, value);
      }
      return next;
    });
  };

  const toggleTheme = (themeId: number) => {
    setFormData((prev) => {
      const next = prev.groupThemes.includes(themeId) ? prev.groupThemes.filter((id) => id !== themeId) : [...prev.groupThemes, themeId];
      return { ...prev, groupThemes: next };
    });
  };

  const { data: groupData, isLoading: queryLoading } = useQuery({
    queryKey: ["groupDetail", identifier],
    queryFn: () => fetchGroupDetail(identifier),
    enabled: !!identifier,
    staleTime: 0,
    gcTime: 0
  });

  useEffect(() => {
    const loadThemeData = async () => {
      try {
        const data = await fetchInvestmentData();
        setThemeOptions(data.theme || []);
      } catch (err) {
        console.error("Failed to fetch theme data", err);
      }
    };
    loadThemeData();
  }, []);

  useEffect(() => {
    if (!groupData) return;
    const g = groupData.group;
    setApiGroupId(g.id || null);
    setApiGroupData(g);

    const groupThemesArr = g.groupThemes
      ? g.groupThemes
        .split(",")
        .map((t: string) => Number(t.trim()))
        .filter((n: number) => !isNaN(n))
      : [];

    setFormData({
      groupName: g.name || "",
      groupWebsite: g.website || g.groupWebsite || "",
      groupDescription: g.description || "",
      didYouKnow: g.didYouKnow || "",
      groupIdentifier: g.identifier || identifier,
      mediaLink: g.videoLink || g.mediaLink || "",
      mediaDescription: g.ourWhyDescription || g.mediaDescription || "",
      requireApproval: g.isApprouveRequired ?? g.requireApproval ?? false,
      makePrivate: g.isPrivateGroup ?? g.makePrivate ?? false,
      deactivateGroup: g.isDeactivated ?? g.deactivateGroup ?? false,
      groupIconPreview: g.pictureFileName ? getUrlBlobContainerImage(g.pictureFileName) : null,
      backgroundPreview: g.backgroundPictureFileName ? getUrlBlobContainerImage(g.backgroundPictureFileName) : null,
      themes: g.themes || "",
      groupThemes: groupThemesArr,
      metaTitle: g.metaTitle || "",
      metaDescription: g.metaDescription || ""
    });

  }, [groupData, identifier]);

  function handleFileChange(file: File | undefined, type: "icon" | "background") {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      if (type === "icon") setImageError("Only image files are allowed.");
      else setBackgroundError("Only image files are allowed.");
      return;
    }

    const maxSize = type === "icon" ? 200 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      const msg =
        type === "icon" ? "Please, try a different image. The size of the image should be less than 200KB." : "Please, try a different image. The size of the image should be less than 10MB.";
      if (type === "icon") setImageError(msg);
      else setBackgroundError(msg);
      return;
    }

    if (type === "icon") setImageError("");
    else setBackgroundError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (type === "icon") {
        setNewIconFile(file);
        updateField("groupIconPreview", dataUrl);
      } else {
        setNewBgFile(file);
        updateField("backgroundPreview", dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  const handleCopyShareUrl = () => {
    const url = `${FRONTEND_URL}/group/${formData.groupIdentifier}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied to clipboard" });
    });
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    const errorList: string[] = [];

    const fieldsToValidate: (keyof ManageGroupFormData)[] = ["groupName", "groupWebsite", "groupDescription", "didYouKnow", "groupIdentifier", "mediaLink", "mediaDescription"];

    fieldsToValidate.forEach((field) => {
      const err = validateField(field, formData[field]);
      if (err) {
        errors[field] = err;
        errorList.push(err);
      }
    });

    const imagesValid = validateImages(formData.deactivateGroup);

    if (errorList.length > 0 || !imagesValid) {
      setFormErrors(errors);

      if (errorList.length > 0) {
        const firstErrorField = fieldsToValidate.find((f) => errors[f]);
        if (firstErrorField) {
          scrollToField(firstErrorField);
        }

        toast({
          title: "Validation Error",
          description: errorList[0],
          variant: "destructive"
        });
        return;
      }

      scrollToField("__images__");
      toast({
        title: "Validation Error",
        description: !formData.groupIconPreview ? "Please upload a profile image." : "Please upload a background image.",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const token = getToken();
      const base = apiGroupData || {};

      let imgBase64: string | null = null;
      if (newIconFile) {
        imgBase64 = await toBase64(newIconFile);
      }

      let bgBase64: string | null = null;
      if (newBgFile) {
        bgBase64 = await toBase64(newBgFile);
      }

      let formattedVideoLink = formData.mediaLink;
      if (formattedVideoLink && formattedVideoLink.trim() !== "") {
        if (!/^https?:\/\//i.test(formattedVideoLink) && !/^spotify:/i.test(formattedVideoLink)) {
          formattedVideoLink = `https://${formattedVideoLink}`;
        }
      }

      const updatePayload: GroupUpdatePayload = {
        id: apiGroupId!,
        token: token || "",
        name: formData.groupName,
        pictureFileName: typeof imgBase64 === "string" && imgBase64.startsWith("data:image/") ? imgBase64 : base?.pictureFileName || "",
        backgroundPictureFileName: typeof bgBase64 === "string" && bgBase64.startsWith("data:image/") ? bgBase64 : base?.backgroundPictureFileName || "",
        website: formData.groupWebsite,
        description: formData.groupDescription,
        identifier: formData.groupIdentifier,
        videoLink: (formattedVideoLink && formattedVideoLink.trim() !== "") ? formattedVideoLink : null,
        ourWhyDescription: normalizeHtmlContent(formData.mediaDescription) || null,
        didYouKnow: normalizeHtmlContent(formData.didYouKnow),
        originalBalance: base.originalBalance ?? null,
        currentBalance: base.currentBalance ?? null,
        isApprouveRequired: formData.requireApproval,
        isDeactivated: formData.deactivateGroup,
        isOwner: base.isOwner ?? false,
        isFollowing: base.isFollowing ?? false,
        isFollowPending: base.isFollowPending ?? false,
        isLeader: base.isLeader ?? false,
        isCorporateGroup: base.isCorporateGroup ?? false,
        isPrivateGroup: formData.makePrivate,
        themes: formData.themes || "",
        sdGs: base.sdGs || "",
        groupThemes: formData.groupThemes.join(","),
        groupAccountBalance: base.groupAccountBalance || null,
        metaTitle: formData.metaTitle,
        metaDescription: formData.metaDescription
      };

      await updateGroup(apiGroupId!, updatePayload);
      console.log("Group Updated Successfully:", updatePayload);

      toast({ title: "Group Updated", description: `"${formData.groupName}" has been updated successfully.` });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message || "Could not update the group", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (queryLoading) {
    return (
      <AdminLayout title="Edit Investment Group">
        <div className="max-w-8xl mx-auto">
          <div className="space-y-2 mb-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-7 w-72" />
          </div>
          <Skeleton className="h-16 w-full rounded-b-none rounded-t-xl" />
          <Skeleton className="h-[520px] w-full rounded-t-none rounded-b-xl" />
        </div>
      </AdminLayout>
    );
  }

  const shareUrl = `${FRONTEND_URL}/group/${formData.groupIdentifier}`;

  return (
    <AdminLayout title="Edit Investment Group">
      <div className="max-w-8xl mx-auto">
        <Link href="/groups">
          <Button variant="ghost" size="sm" className="gap-1.5 p-0 h-auto text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Groups
          </Button>
        </Link>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h4 className="text-base font-semibold" data-testid="text-page-heading">
              Edit Investment Group
            </h4>
            <p className="text-sm text-muted-foreground">Update the group details below.</p>
          </div>
          <a href={`${FRONTEND_URL}/group/${formData.groupIdentifier}`} target="_blank" rel="noopener noreferrer" data-testid="link-view-group">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              View Mode
            </Button>
          </a>
        </div>

        <Card className="rounded-b-none rounded-t-xl">
          <CardContent className="p-0">
            <div className="border-b border-b-transparent">
              <nav className="flex" data-testid="step-nav">
                {STEPS.map((step, idx) => {
                  const isActive = idx === currentStep;
                  const isDone = idx < currentStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors relative
                        ${isActive ? "text-[#405189] bg-[#405189]/5" : isDone ? "text-[#0ab39c]" : "text-muted-foreground"}
                        ${idx > 0 ? "border-l" : ""}
                      `}
                      onClick={() => setCurrentStep(idx)}
                      data-testid={`step-tab-${idx}`}
                    >
                      <div
                        className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold shrink-0
                        ${isActive ? "bg-[#405189] text-white" : isDone ? "bg-[#0ab39c] text-white" : "bg-muted text-muted-foreground"}
                      `}
                      >
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                      </div>
                      <span className="hidden sm:inline">{step.label}</span>
                      {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#405189]" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          </CardContent>
        </Card>

        {currentStep === 0 && (
          <Card className="rounded-t-none rounded-b-xl">
            <CardContent className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4" ref={groupAssetsRef}>
                <div className="flex flex-col items-center justify-center rounded-md border border-border bg-muted/50 p-4 min-h-[11rem]">
                  <Avatar className="h-20 w-20">
                    {formData.groupIconPreview ? <AvatarImage src={formData.groupIconPreview} alt="Group icon" /> : null}
                    <AvatarFallback className="bg-[#405189]/10 text-[#405189]">
                      <User className="w-10 h-10" />
                    </AvatarFallback>
                  </Avatar>
                  <input ref={groupIconRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0], "icon")} data-testid="input-group-icon-file" />
                  {imageError && <p className="text-[0.8rem] font-medium text-destructive mt-2 text-center">{imageError}</p>}
                </div>
                <div className="col-span-2 flex flex-col items-center justify-center rounded-md border border-border bg-muted/50 p-4 min-h-[11rem]">
                  <div className="relative w-full h-36 rounded-md overflow-hidden bg-muted">
                    {formData.backgroundPreview ? (
                      <img src={formData.backgroundPreview} alt="Background preview" className="absolute inset-0 w-full h-full object-contain" data-testid="img-background-preview" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">Background Preview</span>
                      </div>
                    )}
                  </div>
                  <input ref={backgroundRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0], "background")} data-testid="input-background-file" />
                  {backgroundError && <p className="text-[0.8rem] font-medium text-destructive mt-2 text-center">{backgroundError}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex justify-center">
                  <Button size="sm" onClick={() => groupIconRef.current?.click()} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-change-group-icon">
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {newIconFile ? newIconFile.name : "Change Group Icon"}
                  </Button>
                </div>
                <div className="col-span-2 flex justify-center">
                  <Button size="sm" onClick={() => backgroundRef.current?.click()} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-change-background">
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {newBgFile ? newBgFile.name : "Change Background"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="groupName" className="text-sm">
                    Group Name <span className="text-[#f06548]">*</span>
                  </Label>
                  <Input
                    id="groupName"
                    ref={groupNameRef}
                    value={formData.groupName}
                    onChange={(e) => updateField("groupName", e.target.value)}
                    placeholder="Group name"
                    maxLength={50}
                    className={formErrors.groupName ? "border-destructive" : ""}
                    data-testid="input-group-name"
                  />
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-[0.8rem] font-medium text-destructive">{formErrors.groupName || ""}</p>
                    <p className="text-xs text-muted-foreground">{formData.groupName.length}/50</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="groupWebsite" className="text-sm">
                    Group Website {!formData.deactivateGroup && <span className="text-[#f06548]">*</span>}
                  </Label>
                  <Input
                    id="groupWebsite"
                    ref={groupWebsiteRef}
                    value={formData.groupWebsite}
                    onChange={(e) => updateField("groupWebsite", e.target.value)}
                    placeholder="https://example.com"
                    className={formErrors.groupWebsite ? "border-destructive" : ""}
                    data-testid="input-group-website"
                  />
                  {formErrors.groupWebsite && <p className="text-[0.8rem] font-medium text-destructive">{formErrors.groupWebsite}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="groupDescription" className="text-sm">
                  Group Description <span className="text-[#f06548]">*</span>
                </Label>
                <Textarea
                  id="groupDescription"
                  ref={groupDescriptionRef}
                  value={formData.groupDescription}
                  onChange={(e) => updateField("groupDescription", e.target.value)}
                  placeholder="Describe your investment group's mission, goals, and what makes it unique..."
                  rows={5}
                  maxLength={2000}
                  className={formErrors.groupDescription ? "border-destructive" : ""}
                  data-testid="input-group-description"
                />
                <div className="flex justify-between items-center gap-2">
                  <p className="text-[0.8rem] font-medium text-destructive">{formErrors.groupDescription || ""}</p>
                  <p className="text-xs text-muted-foreground">{formData.groupDescription.length}/2000</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Group Themes</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {themeOptions.map((theme) => (
                    <div key={theme.id} className="flex items-center gap-2">
                      <Checkbox id={`theme-${theme.id}`} checked={formData.groupThemes.includes(theme.id)} onCheckedChange={() => toggleTheme(theme.id)} data-testid={`checkbox-theme-${theme.id}`} />
                      <Label htmlFor={`theme-${theme.id}`} className="text-sm font-normal cursor-pointer">
                        {theme.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Did you know? {!formData.deactivateGroup && <span className="text-[#f06548]">*</span>}</Label>
                <p className="text-xs text-muted-foreground">Explain, in one sentence, the problem your group is solving.</p>
                <InlineRichEditor
                  value={formData.didYouKnow}
                  editorRef={didYouKnowRef}
                  hasError={!!formErrors.didYouKnow}
                  onChange={(html) => updateField("didYouKnow", html)}
                  placeholder="e.g., Women-led companies deliver 2x the revenue per dollar invested."
                  rows={2}
                  maxLength={50}
                  testId="input-did-you-know"
                />
                <div className="flex justify-between items-center gap-2">
                  <p className="text-[0.8rem] font-medium text-destructive">{formErrors.didYouKnow || ""}</p>
                  <p className="text-xs text-muted-foreground">{getPlainTextLength(formData.didYouKnow)}/50</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="groupIdentifier" className="text-sm">
                  Group Identifier <span className="text-[#f06548]">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">This will appear in your group's URL on CataCap.</p>
                <Input
                  id="groupIdentifier"
                  ref={groupIdentifierRef}
                  value={formData.groupIdentifier}
                  onChange={(e) => updateField("groupIdentifier", e.target.value)}
                  placeholder="e.g. my-group"
                  className={formErrors.groupIdentifier ? "border-destructive" : ""}
                  data-testid="input-group-identifier"
                />
                {formErrors.groupIdentifier && <p className="text-[0.8rem] font-medium text-destructive">{formErrors.groupIdentifier}</p>}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="metaTitle" className="text-sm">Meta Title</Label>
                  <Input
                    id="metaTitle"
                    value={formData.metaTitle}
                    onChange={(e) => updateField("metaTitle", e.target.value)}
                    placeholder="Enter meta title"
                    data-testid="input-meta-title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="metaDescription" className="text-sm">Meta Description</Label>
                  <Textarea
                    id="metaDescription"
                    value={formData.metaDescription}
                    onChange={(e) => updateField("metaDescription", e.target.value)}
                    placeholder="Enter meta description"
                    rows={2}
                    data-testid="input-meta-description"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Your Group Share URL</Label>
                <div className="flex items-center gap-2">
                  <Input value={shareUrl} readOnly className="bg-muted/40 text-muted-foreground text-sm" data-testid="input-share-url" />
                  <Button type="button" size="icon" variant="outline" onClick={handleCopyShareUrl} data-testid="button-copy-share-url">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <Label className="text-sm font-medium">Deactivate Group</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Deactivating will hide the group from public listings.</p>
                </div>
                <Switch checked={formData.deactivateGroup} onCheckedChange={(v) => updateField("deactivateGroup", v)} data-testid="switch-deactivate" />
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 1 && (
          <Card className="rounded-t-none rounded-b-xl">
            <CardContent className="p-5 sm:p-6 space-y-5">
              <h5 className="text-base font-semibold" data-testid="text-our-why-heading">
                Our Why
              </h5>

              <div className="space-y-1.5">
                <Label htmlFor="mediaLink" className="text-sm">
                  Media Link
                </Label>
                <p className="text-xs text-muted-foreground">Spotify, YouTube, Vimeo or LinkedIn link</p>
                <Input
                  id="mediaLink"
                  ref={mediaLinkRef}
                  value={formData.mediaLink}
                  onChange={(e) => updateField("mediaLink", e.target.value)}
                  placeholder="e.g. https://www.spotify.com/episode/..."
                  className={formErrors.mediaLink ? "border-destructive" : ""}
                  data-testid="input-media-link"
                />
                {formErrors.mediaLink && <p className="text-[0.8rem] font-medium text-destructive">{formErrors.mediaLink}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Description of media link, especially its value</Label>
                <p className="text-xs text-muted-foreground">Share your group's story, purpose, and mission.</p>
                <InlineRichEditor
                  value={formData.mediaDescription}
                  editorRef={mediaDescriptionRef}
                  hasError={!!formErrors.mediaDescription}
                  onChange={(html) => updateField("mediaDescription", html)}
                  placeholder="Share your group's story, purpose, and mission..."
                  rows={5}
                  maxLength={2000}
                  showLists
                  testId="input-media-description"
                />
                <div className="flex justify-between items-center gap-2">
                  <p className="text-[0.8rem] font-medium text-destructive">{formErrors.mediaDescription || ""}</p>
                  <p className="text-xs text-muted-foreground">{getPlainTextLength(formData.mediaDescription)}/2000</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card className="rounded-t-none rounded-b-xl">
            <CardContent className="p-5 sm:p-6 space-y-5">
              <h5 className="text-base font-semibold" data-testid="text-community-heading">
                Community
              </h5>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-normal">Require your approved before others can follow you.</Label>
                </div>
                <Switch checked={formData.requireApproval} onCheckedChange={(v) => updateField("requireApproval", v)} data-testid="switch-require-approval" />
              </div>

              <div className="border-b border-border" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-normal">Make group private</Label>
                </div>
                <Switch checked={formData.makePrivate} onCheckedChange={(v) => updateField("makePrivate", v)} data-testid="switch-make-private" />
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleSave} disabled={isSubmitting} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-save-group-details">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save Group Details"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <GroupInvestmentsSection
            apiGroupId={apiGroupId}
            cardClassName="rounded-t-none rounded-b-xl"
          />
        )}

        <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t">
          {currentStep > 0 ? (
            <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} data-testid="button-previous">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Previous
            </Button>
          ) : (
            <div />
          )}

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-next">
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
