"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MODULE_KINDS, MODULE_KIND_META } from "@/lib/module-kinds";
import { repo } from "@/lib/repo";
import type { ModuleKind } from "@/lib/types";

export function CreateGlobalModuleDialog({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState<ModuleKind>("template");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      // No nodes passed — the repository seeds an empty component so the
      // canvas opens with exactly one root to draw into.
      const created = await repo.createModule({
        projectId: null,
        kind,
        name: name.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast.success(`Created “${created.name}”`);
      setOpen(false);
      setName("");
      setTags("");
      router.push(`/modules/${created.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create module");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="h-8 gap-1.5 text-xs">
          <Plus className="size-3.5" />
          New module
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New module</DialogTitle>
          <DialogDescription>
            Opens a blank canvas. Once saved it is available in every project in
            this tenant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULE_KINDS.map((option) => {
                const meta = MODULE_KIND_META[option];
                const selected = option === kind;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-md border p-2.5 text-left transition-colors",
                      selected
                        ? "border-foreground/40 bg-accent"
                        : "hover:border-foreground/25 hover:bg-accent/40",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs">
                      <meta.Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          option === "module"
                            ? "text-violet-500"
                            : "text-muted-foreground",
                        )}
                        strokeWidth={2}
                      />
                      {meta.label}
                    </span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                      {meta.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-module-name">Name</Label>
            <Input
              id="global-module-name"
              value={name}
              autoFocus
              placeholder="Hero banner"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="global-module-tags">Tags</Label>
            <Input
              id="global-module-tags"
              value={tags}
              placeholder="hero, dark, promo"
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
            Create and open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
