"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractModule } from "@/lib/modules";
import { emptyCanvas } from "@/lib/nodes";
import { repo } from "@/lib/repo";
import { useBindings } from "@/hooks/use-bindings";
import { ShortcutsDialog } from "@/components/editor/shortcuts-dialog";
import type { Bindings } from "@/lib/shortcuts";
import { MODULE_KIND_META } from "@/lib/module-kinds";
import type { Module, ModuleKind } from "@/lib/types";
import { canRedo, canUndo, useEditorStore } from "@/store/editor-store";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { TokenProvider } from "@/components/canvas/tokens-context";
import { Inspector } from "@/components/editor/inspector";
import { LayersPanel } from "@/components/editor/layers-panel";
import { Palette } from "@/components/editor/palette";

const AUTOSAVE_DELAY_MS = 600;

/**
 * The canvas editor for a single global module.
 *
 * Reuses the document editor's canvas, palette, layers and inspector; what
 * differs is what gets saved. A module is a *subtree*, so on every save the
 * canvas is folded back down to one component via `extractModule` — which also
 * means stray top-level entities get absorbed rather than lost.
 *
 * Tokens render raw (`${first_name}`) on purpose: a module has no campaign, so
 * there is nothing to resolve them against until it is dropped into one.
 */
export function ModuleEditorShell({ module }: { module: Module }) {
  const doc = useEditorStore((s) => s.doc);
  const dirty = useEditorStore((s) => s.dirty);
  const loadedIdRef = useRef<string | null>(null);

  const [name, setName] = useState(module.name);
  const bindings = useBindings();

  const viewportWidth = useEditorStore((s) => s.viewportSize.w);
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedIdRef.current === module.id) return;
    loadedIdRef.current = module.id;
    const store = useEditorStore.getState();
    store.loadCanvas(module.id, {
      ...emptyCanvas(),
      nodes: structuredClone(module.nodes),
      rootIds: [module.rootId],
    });
    // Everything drawn here belongs to the module, so the canvas never ends up
    // with siblings that a save would have to wrap.
    store.setRootParent(module.rootId);
  }, [module]);

  // Frame the module once the canvas has measured itself.
  useEffect(() => {
    if (viewportWidth === 0 || fittedRef.current === module.id) return;
    fittedRef.current = module.id;
    useEditorStore.getState().zoomToFit();
  }, [viewportWidth, module.id]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const state = useEditorStore.getState();
      // Same guard as the document editor: never write one canvas into another
      // if the store has moved on since this timer was scheduled.
      if (state.documentId !== module.id) return;

      const extracted = extractModule(state.doc, state.doc.rootIds, name);
      if (!extracted) return;
      void repo
        .updateModule(module.id, {
          nodes: extracted.nodes,
          rootId: extracted.rootId,
          size: extracted.size,
        })
        .then(() => useEditorStore.getState().markSaved())
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "Could not save this module",
          );
        });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, dirty, module.id, name]);

  const commitName = async (next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === module.name) return;
    await repo.updateModule(module.id, { name: trimmed });
  };

  return (
    <TokenProvider value={{}}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <ModuleToolbar
          name={name}
          onNameChange={setName}
          onNameCommit={commitName}
          kind={module.kind}
          dirty={dirty}
          bindings={bindings}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
            <Tabs defaultValue="insert" className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-2 grid shrink-0 grid-cols-2">
                <TabsTrigger value="insert" className="text-[11px]">
                  Insert
                </TabsTrigger>
                <TabsTrigger value="layers" className="text-[11px]">
                  Layers
                </TabsTrigger>
              </TabsList>
              <TabsContent value="insert" className="min-h-0 flex-1">
                <Palette />
              </TabsContent>
              <TabsContent value="layers" className="min-h-0 flex-1">
                <LayersPanel />
              </TabsContent>
            </Tabs>
          </aside>

          <div className="min-w-0 flex-1">
            <InfiniteCanvas className="h-full w-full" bindings={bindings} />
          </div>

          <aside className="w-64 shrink-0 border-l bg-background">
            {/* No campaign here, so no metadata keys to offer. */}
            <Inspector metadata={[]} onSaveModule={() => undefined} />
          </aside>
        </div>
      </div>
    </TokenProvider>
  );
}

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

function ModuleToolbar({
  name,
  onNameChange,
  onNameCommit,
  kind,
  dirty,
  bindings,
}: {
  name: string;
  onNameChange: (next: string) => void;
  onNameCommit: (next: string) => void | Promise<void>;
  kind: ModuleKind;
  dirty: boolean;
  bindings: Bindings;
}) {
  const meta = MODULE_KIND_META[kind];
  const tool = useEditorStore((s) => s.tool);
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
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
          href="/modules"
          className="shrink-0 rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Modules
        </Link>
        <span className="text-muted-foreground">/</span>
      </nav>

      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onBlur={(e) => void onNameCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-7 w-48 text-xs"
        aria-label="Module name"
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

      <ToolButton label="Group — ⌘G" onClick={() => store().groupSelection()}>
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
        <span
          title={meta.blurb}
          className="mr-1 flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          <meta.Icon
            className={cn(
              "size-3",
              kind === "module" ? "text-violet-500" : "",
            )}
            strokeWidth={2}
          />
          {meta.label}
        </span>
        <span
          className={cn(
            "mr-1 text-[10px] uppercase tracking-wider",
            dirty ? "text-amber-600" : "text-muted-foreground",
          )}
        >
          {dirty ? "Saving…" : "Saved"}
        </span>

        <ToolButton label="Zoom out — −" onClick={() => store().zoomByFactor(1 / 1.2)}>
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
        <ToolButton label="Zoom in — +" onClick={() => store().zoomByFactor(1.2)}>
          <ZoomIn className="size-3.5" />
        </ToolButton>
        <ToolButton label="Zoom to fit — 1" onClick={() => store().zoomToFit()}>
          <Maximize className="size-3.5" />
        </ToolButton>
        <ShortcutsDialog bindings={bindings} />
      </div>
    </header>
  );
}
