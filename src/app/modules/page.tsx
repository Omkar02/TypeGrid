"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePreview } from "@/components/editor/module-preview";
import { CreateGlobalModuleDialog } from "@/components/modules/create-global-module-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepoQuery } from "@/hooks/use-repo";
import { MODULE_KINDS, MODULE_KIND_META } from "@/lib/module-kinds";
import { cn } from "@/lib/utils";
import { repo } from "@/lib/repo";
import type { Module } from "@/lib/types";

/**
 * The tenant's module library — the one place modules and templates are
 * created, renamed, retagged and deleted. Artwork is edited on the module
 * canvas at `/modules/<slug>`.
 */
export default function ModulesPage() {
  const { data: tenant } = useRepoQuery(() => repo.getTenant(), []);
  const { data: all } = useRepoQuery(() => repo.listGlobalModules(), []);
  const [query, setQuery] = useState("");

  // Name or tag — the two things people actually remember about a module.
  const needle = query.trim().toLowerCase();
  const modules = all?.filter(
    (m) =>
      !needle ||
      m.name.toLowerCase().includes(needle) ||
      m.tags.some((t) => t.toLowerCase().includes(needle)),
  );

  return (
    <div className="min-h-dvh">
      <AppHeader
        crumbs={[{ label: "Modules", tag: tenant?.name }]}
        actions={<CreateGlobalModuleDialog />}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-lg tracking-tight">Modules</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Reusable components available in every project in this tenant, in two
            flavours: <strong className="font-normal text-foreground">global
            modules</strong> stay identical everywhere and are only editable
            here, while <strong className="font-normal text-foreground">templates
            </strong> are copied into a document and edited there.
          </p>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or tag…"
            aria-label="Search modules"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {modules === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : all?.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Create a global module for something that must stay identical, or a template for a starting point."
            action={<CreateGlobalModuleDialog />}
          />
        ) : modules.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <div className="space-y-10">
            {MODULE_KINDS.map((kind) => {
              const meta = MODULE_KIND_META[kind];
              const group = modules.filter((m) => m.kind === kind);

              return (
                <section key={kind}>
                  <div className="mb-3">
                    <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <meta.Icon
                        className={cn(
                          "size-3.5",
                          kind === "module" ? "text-violet-500" : "",
                        )}
                        strokeWidth={2}
                      />
                      {meta.plural}
                    </h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {meta.blurb}
                    </p>
                  </div>

                  {group.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[11px] text-muted-foreground">
                      {needle ? "No match." : "None yet."}
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.map((module) => (
                        <li key={module.id}>
                          <ModuleCard module={module} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function ModuleCard({ module }: { module: Module }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(module.name);
  const [tags, setTags] = useState(module.tags.join(", "));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await repo.updateModule(module.id, {
        name: name.trim() || module.name,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast.success("Module updated");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update module");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await repo.deleteModule(module.id);
    toast.success(`Deleted “${module.name}”`);
  };

  const entityCount = Object.keys(module.nodes).length - 1;
  const KindIcon = MODULE_KIND_META[module.kind].Icon;

  return (
    <div className="group flex h-full flex-col gap-3 rounded-lg border p-3">
      <Link
        href={`/modules/${module.slug}`}
        className="block rounded-md transition-opacity hover:opacity-80"
        title={`Edit ${module.name} on the canvas`}
      >
        <div className="flex justify-center rounded-md border bg-muted/30 p-2">
          <ModulePreview
            nodes={module.nodes}
            rootId={module.rootId}
            size={module.size}
            box={{ w: 220, h: 110 }}
          />
        </div>
      </Link>

      {editing ? (
        <div className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs"
            aria-label="Module name"
            autoFocus
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags, comma separated"
            className="h-7 text-xs"
            aria-label="Module tags"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 text-[11px]"
              disabled={busy}
              onClick={() => void save()}
            >
              <Check className="size-3.5" />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => {
                setName(module.name);
                setTags(module.tags.join(", "));
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm">
              <KindIcon
                className={cn(
                  "size-3.5 shrink-0",
                  module.kind === "module"
                    ? "text-violet-500"
                    : "text-muted-foreground",
                )}
                strokeWidth={2}
              />
              <span className="truncate">{module.name}</span>
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {entityCount} {entityCount === 1 ? "entity" : "entities"} ·{" "}
              {Math.round(module.size.w)}×{Math.round(module.size.h)}
              {module.tags.length > 0 ? ` · ${module.tags.join(", ")}` : ""}
            </p>
          </div>

          <div className="mt-auto flex gap-1.5">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 flex-1 gap-1.5 text-[11px]"
            >
              <Link href={`/modules/${module.slug}`}>
                <Pencil className="size-3.5" />
                Edit canvas
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => setEditing(true)}
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
              onClick={() => void remove()}
              aria-label={`Delete ${module.name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
