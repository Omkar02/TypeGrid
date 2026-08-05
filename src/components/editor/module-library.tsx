"use client";

import { useState } from "react";
import { PackagePlus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MODULE_KINDS, MODULE_KIND_META } from "@/lib/module-kinds";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";
import type { Module } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { MODULE_DRAG_TYPE } from "@/components/canvas/infinite-canvas";
import { ModulePreview } from "@/components/editor/module-preview";

export function ModuleLibrary({
  projectId,
  onSaveSelection,
}: {
  projectId: string;
  onSaveSelection: () => void;
}) {
  const { data: modules } = useRepoQuery(
    () => repo.listModules(projectId),
    [projectId],
  );
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = (modules ?? []).filter(
    (m) =>
      !needle ||
      m.name.toLowerCase().includes(needle) ||
      m.tags.some((t) => t.toLowerCase().includes(needle)),
  );

  const remove = async (module: Module) => {
    await repo.deleteModule(module.id);
    toast.success(`Deleted “${module.name}”`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-2 pb-0">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 w-full gap-1.5 text-xs"
          onClick={onSaveSelection}
        >
          <PackagePlus className="size-3.5" />
          Save selection as module
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            aria-label="Search modules"
            className="h-7 pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {visible.length === 0 ? (
            <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
              {needle
                ? `Nothing matches “${query.trim()}”.`
                : "Nothing saved yet. Select something on the canvas and save it here to reuse it in any campaign."}
            </p>
          ) : (
            MODULE_KINDS.map((kind) => {
              const meta = MODULE_KIND_META[kind];
              const group = visible.filter((m) => m.kind === kind);
              if (group.length === 0) return null;

              return (
                <div key={kind} className="pb-1">
                  <p className="flex items-center gap-1.5 px-1 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <meta.Icon className="size-3" strokeWidth={2} />
                    {meta.plural}
                  </p>

                  {group.map((module) => (
                    <div
                      key={module.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          MODULE_DRAG_TYPE,
                          JSON.stringify(module),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onDoubleClick={() =>
                        useEditorStore.getState().instantiateModuleCentered(module)
                      }
                      className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent p-1.5 transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
                    >
                      <ModulePreview
                        nodes={module.nodes}
                        rootId={module.rootId}
                        size={module.size}
                        box={{ w: 56, h: 40 }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-xs">
                          <meta.Icon
                            className={cn(
                              "size-3 shrink-0",
                              kind === "module"
                                ? "text-violet-500"
                                : "text-muted-foreground",
                            )}
                            strokeWidth={2}
                          />
                          <span className="truncate">{module.name}</span>
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {Math.round(module.size.w)}×{Math.round(module.size.h)}
                          {module.tags.length > 0
                            ? ` · ${module.tags.join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={() => void remove(module)}
                        aria-label={`Delete ${module.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })
          )}

          <p className="px-1 pt-2 text-[10px] leading-relaxed text-muted-foreground">
            Drag onto the canvas, or double-click to drop in view. Global modules
            land linked and stay editable only in Modules; templates land as
            copies you edit here.
          </p>
        </div>
      </ScrollArea>
    </div>
  );
}
