"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock } from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isComponentNode, isLinkedInstance } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { NODE_ICONS } from "@/components/editor/entity-icons";
import { MODULE_KIND_META } from "@/lib/module-kinds";

export function LayersPanel() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (id: string, depth: number): React.ReactNode => {
    const node = doc.nodes[id];
    if (!node) return null;
    const linked = isLinkedInstance(node);
    // A linked global module carries the library's own symbol, so the tree
    // shows at a glance which components are owned elsewhere.
    const Icon = linked ? MODULE_KIND_META.module.Icon : NODE_ICONS[node.kind];
    const isSelected = selection.includes(id);
    // Linked instances never expand: their contents are not editable here.
    const isGroup = isComponentNode(node) && !linked;
    const isCollapsed = collapsed.has(id);

    return (
      <div key={id}>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            const store = useEditorStore.getState();
            if (e.shiftKey) store.toggleInSelection(id);
            else store.select([id]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              useEditorStore.getState().select([id]);
            }
          }}
          onMouseEnter={() => useEditorStore.getState().setHovered(id)}
          onMouseLeave={() => useEditorStore.getState().setHovered(null)}
          className={cn(
            "group flex h-7 cursor-default items-center gap-1 rounded px-1 text-xs",
            isSelected ? "bg-sky-500/15 text-foreground" : "hover:bg-accent",
            node.hidden && "opacity-45",
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {isGroup ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed(id);
              }}
              className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}

          <Icon
            className={cn(
              "size-3.5 shrink-0",
              linked ? "text-violet-500" : "text-muted-foreground",
            )}
            strokeWidth={1.75}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useEditorStore.getState().setNodeFlag(id, "locked", !node.locked);
            }}
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground",
              node.locked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={node.locked ? "Unlock" : "Lock"}
          >
            {node.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useEditorStore.getState().setNodeFlag(id, "hidden", !node.hidden);
            }}
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground",
              node.hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={node.hidden ? "Show" : "Hide"}
          >
            {node.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>
        </div>

        {isGroup && !isCollapsed
          ? [...node.childIds].reverse().map((childId) => renderRow(childId, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Layers
        </p>
        {doc.rootIds.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            Nothing on the canvas yet.
          </p>
        ) : (
          // Reversed so the topmost node in z-order sits at the top of the list.
          [...doc.rootIds].reverse().map((id) => renderRow(id, 0))
        )}
      </div>
    </ScrollArea>
  );
}
