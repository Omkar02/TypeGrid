"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/id";
import { repo } from "@/lib/repo";
import type { Campaign, MetadataField } from "@/lib/types";

/**
 * Editor for the `${key}` tokens a campaign exposes to its locale documents.
 * Values here are the authoring-time preview defaults, shared by every locale.
 */
export function MetadataEditor({ campaign }: { campaign: Campaign }) {
  const [fields, setFields] = useState<MetadataField[]>(campaign.metadata);
  const [dirty, setDirty] = useState(false);

  const update = (next: MetadataField[]) => {
    setFields(next);
    setDirty(true);
  };

  const save = async () => {
    const cleaned = fields
      .map((f) => ({ ...f, key: slugify(f.key).replace(/-/g, "_") }))
      .filter((f) => f.key.length > 0);
    await repo.updateCampaign(campaign.id, { metadata: cleaned });
    setFields(cleaned);
    setDirty(false);
    toast.success("Metadata saved");
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Metadata
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Shared by every locale. Reference them as{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"${key}"}</code>
          </p>
        </div>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          className="h-7 text-xs"
          disabled={!dirty}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>

      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              className="h-7 flex-1 text-xs"
              value={field.key}
              placeholder="key"
              onChange={(e) =>
                update(
                  fields.map((f, i) =>
                    i === index ? { ...f, key: e.target.value } : f,
                  ),
                )
              }
            />
            <Input
              className="h-7 flex-1 text-xs"
              value={field.defaultValue}
              placeholder="preview value"
              onChange={(e) =>
                update(
                  fields.map((f, i) =>
                    i === index ? { ...f, defaultValue: e.target.value } : f,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => update(fields.filter((_, i) => i !== index))}
              aria-label={`Remove ${field.key}`}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        size="sm"
        className="mt-3 h-7 gap-1.5 text-xs"
        onClick={() =>
          update([...fields, { key: "", label: "", defaultValue: "" }])
        }
      >
        <Plus className="size-3.5" />
        Add key
      </Button>
    </div>
  );
}
