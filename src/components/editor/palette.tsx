"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ENTITY_BLUEPRINTS, ENTITY_KINDS } from "@/lib/nodes";
import { useEditorStore } from "@/store/editor-store";
import { ENTITY_DRAG_TYPE } from "@/components/canvas/infinite-canvas";
import { NODE_ICONS } from "@/components/editor/entity-icons";

/**
 * Draggable source list for new entities. Also supports click-to-place, which
 * drops the entity in the middle of the current viewport.
 */
export function Palette() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Entities
        </p>
        {ENTITY_KINDS.map((kind) => {
          const blueprint = ENTITY_BLUEPRINTS[kind];
          const Icon = NODE_ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ENTITY_DRAG_TYPE, kind);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => useEditorStore.getState().addEntityCentered(kind)}
              className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-background text-muted-foreground group-hover:text-foreground">
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs">{blueprint.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {blueprint.hint}
                </span>
              </span>
            </button>
          );
        })}

        <p className="px-2 pt-3 text-[10px] leading-relaxed text-muted-foreground">
          Drag onto the canvas, or click to drop one in view.
        </p>
      </div>
    </ScrollArea>
  );
}
