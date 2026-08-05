"use client";

import Link from "next/link";
import {
  Grid2x2,
  Group,
  Hand,
  Magnet,
  Maximize,
  MousePointer2,
  Redo2,
  Ungroup,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canRedo, canUndo, useEditorStore } from "@/store/editor-store";
import { LocaleSwitcher } from "@/components/editor/locale-switcher";
import { ShortcutsDialog } from "@/components/editor/shortcuts-dialog";
import { HistoryDialog } from "@/components/editor/history-dialog";
import { Users } from "lucide-react";
import type { CanvasVersion } from "@/lib/types";
import type { Bindings } from "@/lib/shortcuts";
import type { Campaign, Project, TypeDocument } from "@/lib/types";

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", active && "bg-accent text-accent-foreground")}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar({
  project,
  campaign,
  document,
  bindings,
  peerCount,
  onRestore,
}: {
  project: Project;
  campaign: Campaign;
  document: TypeDocument;
  bindings: Bindings;
  peerCount: number;
  onRestore: (version: CanvasVersion) => void;
}) {
  const campaignPath = `/p/${project.slug}/email/${campaign.slug}`;

  const tool = useEditorStore((s) => s.tool);
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const dirty = useEditorStore((s) => s.dirty);
  const undoable = useEditorStore(canUndo);
  const redoable = useEditorStore(canRedo);
  const selectionCount = useEditorStore((s) => s.selection.length);

  const store = useEditorStore.getState;

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b bg-background px-2">
      <nav className="flex min-w-0 items-center gap-1.5 pr-2 text-xs">
        <Link
          href="/"
          className="shrink-0 rounded px-1 py-0.5 font-semibold tracking-tight hover:bg-accent"
        >
          TypeGrid
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          href={`/p/${project.slug}`}
          className="truncate rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {project.name}
        </Link>
        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          email
        </span>
        <span className="text-muted-foreground">/</span>
        <Link
          href={campaignPath}
          className="truncate rounded px-1 py-0.5 hover:bg-accent"
        >
          {campaign.name}
        </Link>
      </nav>

      <LocaleSwitcher
        campaign={campaign}
        locale={document.locale}
        basePath={campaignPath}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label="Select — V"
        active={tool === "select"}
        onClick={() => store().setTool("select")}
      >
        <MousePointer2 className="size-3.5" />
      </ToolButton>
      <ToolButton
        label="Pan — H or hold Space"
        active={tool === "hand"}
        onClick={() => store().setTool("hand")}
      >
        <Hand className="size-3.5" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton label="Undo — ⌘Z" onClick={() => store().undo()}>
        <Undo2 className={cn("size-3.5", !undoable && "opacity-30")} />
      </ToolButton>
      <ToolButton label="Redo — ⇧⌘Z" onClick={() => store().redo()}>
        <Redo2 className={cn("size-3.5", !redoable && "opacity-30")} />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label="Group — ⌘G"
        onClick={() => store().groupSelection()}
      >
        <Group className={cn("size-3.5", selectionCount < 2 && "opacity-30")} />
      </ToolButton>
      <ToolButton label="Ungroup — ⇧⌘G" onClick={() => store().ungroupSelection()}>
        <Ungroup className={cn("size-3.5", selectionCount === 0 && "opacity-30")} />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label={showGrid ? "Hide grid" : "Show grid"}
        active={showGrid}
        onClick={() => store().toggleGrid()}
      >
        <Grid2x2 className="size-3.5" />
      </ToolButton>
      <ToolButton
        label={snapToGrid ? "Snapping on" : "Snapping off"}
        active={snapToGrid}
        onClick={() => store().toggleSnap()}
      >
        <Magnet className="size-3.5" />
      </ToolButton>

      <div className="ml-auto flex items-center gap-1">
        {peerCount > 0 ? (
          <span className="mr-1 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Users className="size-3" />
            {peerCount + 1}
          </span>
        ) : null}
        <span
          className={cn(
            "mr-1 text-[10px] uppercase tracking-wider",
            dirty ? "text-amber-600" : "text-muted-foreground",
          )}
        >
          {dirty ? "Saving…" : "Saved"}
        </span>

        <ToolButton
          label="Zoom out — −"
          onClick={() => store().zoomByFactor(1 / 1.2)}
        >
          <ZoomOut className="size-3.5" />
        </ToolButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-14 px-0 text-[11px] tabular-nums"
          onClick={() => store().zoomToValue(1)}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <ToolButton
          label="Zoom in — +"
          onClick={() => store().zoomByFactor(1.2)}
        >
          <ZoomIn className="size-3.5" />
        </ToolButton>
        <ToolButton label="Zoom to fit — 1" onClick={() => store().zoomToFit()}>
          <Maximize className="size-3.5" />
        </ToolButton>
        <HistoryDialog
          targetType="document"
          targetId={document.id}
          onRestore={onRestore}
        />
        <ShortcutsDialog bindings={bindings} />
      </div>
    </header>
  );
}
