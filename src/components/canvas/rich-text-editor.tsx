"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Link2, Underline, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EntityNode, Viewport } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";

/**
 * In-place rich text editing.
 *
 * Content is stored as HTML because the output medium is HTML email — anything
 * else would need converting on export anyway. The editable node is
 * *uncontrolled*: React seeds `innerHTML` once on mount and then leaves the DOM
 * alone, syncing outward on input. Re-rendering a `contentEditable` from state
 * on every keystroke resets the caret to the start, which is unusable.
 *
 * Formatting is deliberately limited to bold / italic / underline / link. Those
 * survive every mail client; lists, headings and font switching do not, and
 * would produce markup the canvas cannot faithfully preview.
 */
export function RichTextEditor({
  node,
  viewport,
}: {
  node: EntityNode<"text">;
  viewport: Viewport;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  /** Selection at the moment the link field opened — focus moves to the input. */
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = node.props.content;
    el.focus();
    // Put the caret at the end rather than selecting everything, so typing
    // appends instead of replacing what is there.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Seeded once per node on purpose — see the note above about the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    useEditorStore.getState().updateProps(node.id, { content: el.innerHTML });
  };

  /** `execCommand` is deprecated but is still the only cross-browser way to
   *  apply inline formatting to a selection without hand-rolling Range
   *  surgery. Scope here is small enough that the trade is worth it. */
  const format = (command: string, value?: string) => {
    ref.current?.focus();
    // Off means bold emits `<b>` rather than `<span style="font-weight:bold">`.
    // Semantic tags survive mail clients — Outlook in particular is unreliable
    // with inline-styled spans — so this matters for the output, not just tidiness.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, value);
    commit();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    const selection = window.getSelection();
    if (savedRange.current) {
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    }
    if (url) format("createLink", url);
    else format("unlink");
    setLinkOpen(false);
    setLinkUrl("");
  };

  // The editable div lives inside the world layer, so it inherits pan and zoom.
  // Measuring it gives viewport coordinates directly, which is what a `fixed`
  // toolbar needs — deriving them from the world transform by hand would be
  // offset by wherever the canvas sits on the page.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setToolbar({ x: rect.left, y: rect.top });
  }, [node.frame.x, node.frame.y, viewport.x, viewport.y, viewport.zoom]);

  return (
    <>
      {/*
        Portalled to <body> on purpose. The editor renders inside the world
        layer, which carries a `transform` — and a transformed ancestor becomes
        the containing block for `position: fixed` descendants, so a toolbar
        left in place would be offset by the pan and scaled by the zoom.
      */}
      {createPortal(
      <div
        data-inline-editor
        className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-md border bg-background p-1 shadow-md"
        style={{
          left: toolbar?.x ?? 0,
          top: (toolbar?.y ?? 0) - 40,
          visibility: toolbar ? "visible" : "hidden",
        }}
        onPointerDown={(e) => {
          // Keep the text selection alive while a toolbar button is pressed.
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <ToolbarButton label="Bold" onClick={() => format("bold")}>
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => format("italic")}>
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => format("underline")}>
          <Underline className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          onClick={() => {
            const selection = window.getSelection();
            savedRange.current =
              selection && selection.rangeCount > 0
                ? selection.getRangeAt(0).cloneRange()
                : null;
            setLinkOpen((open) => !open);
          }}
        >
          <Link2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          onClick={() => format("removeFormat")}
        >
          <X className="size-3.5" />
        </ToolbarButton>

        {linkOpen ? (
          <input
            autoFocus
            value={linkUrl}
            placeholder="https://…  (empty to remove)"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkOpen(false);
            }}
            onBlur={applyLink}
            className="ml-1 h-6 w-48 rounded border bg-background px-1.5 text-[11px] outline-none"
          />
        ) : null}
      </div>,
      document.body,
      )}

      <div
        ref={ref}
        data-inline-editor
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={`Edit ${node.name}`}
        onInput={commit}
        onBlur={(e) => {
          // Clicking the toolbar must not end the session.
          if (
            e.relatedTarget instanceof HTMLElement &&
            e.relatedTarget.closest("[data-inline-editor]")
          ) {
            return;
          }
          commit();
          useEditorStore.getState().setEditing(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            commit();
            useEditorStore.getState().setEditing(null);
          }
        }}
        onPaste={(e) => {
          // Paste as plain text: pasted markup from elsewhere is exactly the
          // kind of thing that renders unpredictably in mail clients.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className="absolute whitespace-pre-wrap break-words outline outline-2 outline-sky-500"
        style={{
          left: node.frame.x,
          top: node.frame.y,
          width: node.frame.w,
          minHeight: node.frame.h,
          padding: `${node.style.paddingY}px ${node.style.paddingX}px`,
          color: node.style.color,
          // Transparent stays transparent: the node underneath is hidden while
          // editing, so a white box here would hide whatever it sits on and
          // make light text on a dark section unreadable mid-edit.
          background:
            node.style.fill === "transparent" ? undefined : node.style.fill,
          fontFamily: node.style.fontFamily,
          fontSize: node.style.fontSize,
          fontWeight: node.style.fontWeight,
          lineHeight: node.style.lineHeight,
          letterSpacing: node.style.letterSpacing,
          textAlign: node.style.textAlign,
          borderRadius: node.style.radius,
        }}
      />
    </>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded text-muted-foreground",
        "transition-colors hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
