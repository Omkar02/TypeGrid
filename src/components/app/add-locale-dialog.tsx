"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
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
import { LocaleGrid } from "@/components/locale/locale-grid";
import { LocaleSelect } from "@/components/locale/locale-select";
import { repo } from "@/lib/repo";
import type { Campaign, IsoDate } from "@/lib/types";

export function AddLocaleDialog({
  campaign,
  defaultReleaseAt,
}: {
  campaign: Campaign;
  /** The source document's date, offered as the starting value. */
  defaultReleaseAt?: IsoDate | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Languages className="size-3.5" />
          Add locales
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add locales</DialogTitle>
          <DialogDescription>
            Creates a document per locale, pre-filled from an existing one so
            translating means editing copy, not rebuilding the layout.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the selection resets each time. */}
        {open ? (
          <AddLocaleForm
            campaign={campaign}
            defaultReleaseAt={defaultReleaseAt}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddLocaleForm({
  campaign,
  defaultReleaseAt,
  onDone,
}: {
  campaign: Campaign;
  defaultReleaseAt?: IsoDate | null;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [copyFrom, setCopyFrom] = useState(campaign.defaultLocale);
  const [releaseAt, setReleaseAt] = useState(defaultReleaseAt ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const created = await repo.addLocales(campaign.id, selected, {
        copyFromLocale: copyFrom,
        releaseAt: releaseAt || null,
      });
      toast.success(
        created.length === 1
          ? `Added ${created[0].locale}`
          : `Added ${created.length} locales`,
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add locales");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <LocaleGrid
          value={selected}
          onChange={setSelected}
          locked={campaign.locales}
          emptyHint="Pick one or more locales to add."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="locale-copy-from">Start from</Label>
            <LocaleSelect
              id="locale-copy-from"
              value={copyFrom}
              onChange={setCopyFrom}
              locales={campaign.locales}
              annotate={(code) =>
                code === campaign.defaultLocale ? "source" : undefined
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="locale-release">Expected release</Label>
            <Input
              id="locale-release"
              type="date"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={selected.length === 0 || busy}
        >
          {busy
            ? "Adding…"
            : `Add ${selected.length || ""} ${
                selected.length === 1 ? "locale" : "locales"
              }`.trim()}
        </Button>
      </DialogFooter>
    </>
  );
}
