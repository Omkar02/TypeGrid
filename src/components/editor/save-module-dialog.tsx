"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractModule } from "@/lib/modules";
import { repo } from "@/lib/repo";
import type { CanvasDoc } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { ModulePreview } from "@/components/editor/module-preview";

export function SaveModuleDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as module</DialogTitle>
          <DialogDescription>
            Reusable in every campaign and locale. Dropping a module creates an
            independent copy.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so form state seeds itself from the current
            selection instead of needing a reset effect. */}
        {open ? (
          <SaveModuleForm
            projectId={projectId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SaveModuleForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);

  const [name, setName] = useState(() => defaultName(doc, selection));
  const [tags, setTags] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const extracted = useMemo(
    () => extractModule(doc, selection, name || "Module"),
    [doc, selection, name],
  );

  const save = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      await repo.createModule({
        projectId: shared ? null : projectId,
        name: name.trim() || "Module",
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        nodes: extracted.nodes,
        rootId: extracted.rootId,
        size: extracted.size,
      });
      toast.success(`Saved “${name.trim() || "Module"}” to the module library`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save module");
    } finally {
      setSaving(false);
    }
  };

  if (!extracted) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Select something on the canvas first.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onDone}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
          <ModulePreview
            nodes={extracted.nodes}
            rootId={extracted.rootId}
            size={extracted.size}
            box={{ w: 96, h: 64 }}
          />
          <p className="text-xs text-muted-foreground">
            {Object.keys(extracted.nodes).length - 1} entities ·{" "}
            {Math.round(extracted.size.w)}×{Math.round(extracted.size.h)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="module-name">Name</Label>
          <Input
            id="module-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="module-tags">Tags</Label>
          <Input
            id="module-tags"
            value={tags}
            placeholder="hero, dark, promo"
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            className="mt-1 size-3.5 accent-foreground"
          />
          <span>
            Make it global
            <span className="block text-[11px] text-muted-foreground">
              Available in every project in this tenant, and managed from Global
              modules.
            </span>
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save module"}
        </Button>
      </DialogFooter>
    </>
  );
}

function defaultName(doc: CanvasDoc, selection: string[]): string {
  const first = selection[0] ? doc.nodes[selection[0]] : undefined;
  return selection.length === 1 && first ? first.name : "New module";
}
