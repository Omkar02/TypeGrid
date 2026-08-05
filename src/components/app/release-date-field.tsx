"use client";

import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { daysFromToday, relativeDayLabel } from "@/lib/dates";
import { repo } from "@/lib/repo";
import type { TypeDocument } from "@/lib/types";

/** Inline expected-release editor for one document. Saves on change. */
export function ReleaseDateField({ document }: { document: TypeDocument }) {
  const [value, setValue] = useState(document.releaseAt ?? "");
  const [saving, setSaving] = useState(false);

  const commit = async (next: string) => {
    setValue(next);
    setSaving(true);
    try {
      await repo.setDocumentRelease(document.id, next || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the date");
      setValue(document.releaseAt ?? "");
    } finally {
      setSaving(false);
    }
  };

  const overdue = value ? daysFromToday(value) < 0 : false;

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={`release-${document.id}`}
        className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        Release
      </label>
      <input
        id={`release-${document.id}`}
        type="date"
        value={value}
        disabled={saving}
        onChange={(e) => void commit(e.target.value)}
        className={cn(
          "h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-[11px] tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          overdue && "border-amber-500/60",
        )}
      />
      <span
        className={cn(
          "shrink-0 text-[10px]",
          overdue ? "text-amber-600" : "text-muted-foreground",
        )}
      >
        {value ? relativeDayLabel(value) : "unscheduled"}
      </span>
    </div>
  );
}
