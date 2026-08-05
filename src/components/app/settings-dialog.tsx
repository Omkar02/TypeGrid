"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";
import type { UserPreferences } from "@/lib/types";

const MIN_VERSIONS = 1;
const MAX_VERSIONS = 50;

export function SettingsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="size-3.5" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {open ? <SettingsBody onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({ onDone }: { onDone: () => void }) {
  const { data: prefs } = useRepoQuery(() => repo.getPreferences(), []);

  // The form is mounted only once preferences have loaded, so it can seed its
  // own state from them and then own it outright — syncing on every store event
  // would fight the user mid-edit.
  if (!prefs) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </>
    );
  }

  return <SettingsForm prefs={prefs} onDone={onDone} />;
}

function SettingsForm({
  prefs,
  onDone,
}: {
  prefs: UserPreferences;
  onDone: () => void;
}) {
  const [versionLimit, setVersionLimit] = useState(prefs.versionLimit);
  const [collaboration, setCollaboration] = useState(prefs.collaboration);

  const save = async () => {
    await repo.updatePreferences({
      versionLimit: Math.min(MAX_VERSIONS, Math.max(MIN_VERSIONS, versionLimit)),
      collaboration,
    });
    toast.success("Settings saved");
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Stored in your preferences, alongside your keyboard map.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>Versions kept</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {versionLimit} per document
            </span>
          </div>
          <Slider
            value={[versionLimit]}
            min={MIN_VERSIONS}
            max={MAX_VERSIONS}
            step={1}
            onValueChange={([next]) => setVersionLimit(next)}
            aria-label="Versions kept"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Applies to documents and modules alike. A version is only recorded
            when the content actually changed, and edits made within the same
            burst fold into one entry — so this is roughly “last {versionLimit}{" "}
            editing sessions”, not the last {versionLimit} keystrokes.
          </p>
        </section>

        <section className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={collaboration}
              onChange={(e) => setCollaboration(e.target.checked)}
              className="mt-1 size-3.5 accent-foreground"
            />
            <span>
              Multi-user editing
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                Broadcasts your cursor and shows other people editing the same
                document. Works across tabs and windows on this machine today;
                across machines once the app is on a hosted database. Cursors
                are labelled by colour until sign-in exists to name them.
              </span>
            </span>
          </label>
        </section>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void save()}>Save settings</Button>
      </DialogFooter>
    </>
  );
}
