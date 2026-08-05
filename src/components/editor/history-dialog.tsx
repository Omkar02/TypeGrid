"use client";

import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CanvasThumbnail } from "@/components/app/canvas-thumbnail";
import { cn } from "@/lib/utils";
import { relativeDayLabel } from "@/lib/dates";
import { repo } from "@/lib/repo";
import type { CanvasVersion, VersionTargetType } from "@/lib/types";

/**
 * Scrubbable version history.
 *
 * Versions are listed newest-first but the scrubber runs oldest-to-newest, so
 * dragging right moves forward in time the way every timeline does.
 */
export function HistoryDialog({
  targetType,
  targetId,
  onRestore,
}: {
  targetType: VersionTargetType;
  targetId: string;
  onRestore: (version: CanvasVersion) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Version history"
            >
              <History className="size-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Version history</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-2xl">
        {/* Mounted only while open so it always reads fresh versions. */}
        {open ? (
          <HistoryBody
            targetType={targetType}
            targetId={targetId}
            onRestore={(v) => {
              onRestore(v);
              setOpen(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({
  targetType,
  targetId,
  onRestore,
}: {
  targetType: VersionTargetType;
  targetId: string;
  onRestore: (version: CanvasVersion) => void;
}) {
  const [versions, setVersions] = useState<CanvasVersion[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void repo.listVersions(targetType, targetId).then((rows) => {
      if (cancelled) return;
      // Oldest first for the scrubber; the newest is the far right.
      const ordered = [...rows].reverse();
      setVersions(ordered);
      setIndex(Math.max(ordered.length - 1, 0));
    });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  if (!versions) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </>
    );
  }

  if (versions.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Nothing recorded yet. A version is captured the first time you change
            this canvas, and only when the content actually differs.
          </DialogDescription>
        </DialogHeader>
      </>
    );
  }

  const current = versions[Math.min(index, versions.length - 1)];
  const isNewest = index === versions.length - 1;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Version history</DialogTitle>
        <DialogDescription>
          {versions.length} {versions.length === 1 ? "version" : "versions"} kept.
          Drag the timeline to scrub; restoring replaces the canvas and can be
          undone with ⌘Z.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <CanvasThumbnail
            canvas={current.canvas}
            height={260}
            width={560}
            fit="contain"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {index + 1} / {versions.length}
          </span>
          <Slider
            value={[index]}
            min={0}
            max={versions.length - 1}
            step={1}
            onValueChange={([next]) => setIndex(next)}
            className="flex-1"
            aria-label="Version timeline"
          />
          <span className="w-28 shrink-0 text-right text-[11px] text-muted-foreground">
            {isNewest ? "current" : relativeTime(current.updatedAt)}
          </span>
        </div>

        {/* Ticks double as a jump target for a specific version. */}
        <div className="flex gap-1">
          {versions.map((version, i) => (
            <button
              key={version.id}
              type="button"
              onClick={() => setIndex(i)}
              title={new Date(version.updatedAt).toLocaleString()}
              aria-label={`Version ${i + 1}`}
              className={cn(
                "h-6 flex-1 rounded border text-[9px] transition-colors",
                i === index
                  ? "border-sky-500 bg-sky-500/15 text-sky-700"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button
          disabled={isNewest}
          onClick={() => {
            onRestore(current);
            toast.success(`Restored version ${index + 1}`);
          }}
          className="gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          {isNewest ? "This is the current version" : "Restore this version"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Short relative label; the exact timestamp lives in the tick's tooltip. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return relativeDayLabel(iso.slice(0, 10));
}
