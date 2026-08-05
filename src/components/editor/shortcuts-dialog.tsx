"use client";

import { useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { repo } from "@/lib/repo";
import {
  type Bindings,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  comboFromEvent,
  defaultBindings,
  findConflict,
  formatCombo,
  isModifierOnly,
} from "@/lib/shortcuts";

/**
 * The keyboard map, as a grid, with click-to-rebind.
 *
 * Overrides are written to preferences, so they follow the user rather than the
 * browser tab — and travel with the rest of the data when storage moves.
 */
export function ShortcutsDialog({ bindings }: { bindings: Bindings }) {
  const [open, setOpen] = useState(false);
  const [listeningId, setListeningId] = useState<string | null>(null);

  // While capturing, every key belongs to the picker — otherwise pressing "v"
  // to rebind would also switch tools underneath the dialog.
  useEffect(() => {
    if (!listeningId) return;

    const onKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isModifierOnly(e)) return;

      if (e.key === "Escape") {
        setListeningId(null);
        return;
      }

      const combo = comboFromEvent(e);
      const clash = findConflict(bindings, combo, listeningId);
      if (clash) {
        toast.error(`${formatCombo(combo)} is already “${clash.label}”`);
        return;
      }

      await repo.updatePreferences({
        shortcuts: { ...stripDefaults({ ...bindings, [listeningId]: combo }) },
      });
      setListeningId(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listeningId, bindings]);

  const resetAll = async () => {
    await repo.updatePreferences({ shortcuts: {} });
    toast.success("Shortcuts reset to defaults");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setListeningId(null);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="size-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Keyboard shortcuts</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Click any key to rebind it, then press the combination you want.
            Escape cancels.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => {
              const rows = SHORTCUTS.filter((s) => s.group === group);
              if (rows.length === 0) return null;

              return (
                <section key={group}>
                  <h3 className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {group}
                  </h3>
                  <ul className="space-y-0.5">
                    {rows.map((def) => {
                      const combo = bindings[def.id] ?? def.defaultCombo;
                      const listening = listeningId === def.id;
                      const changed =
                        !def.fixed && combo !== def.defaultCombo;

                      return (
                        <li
                          key={def.id}
                          className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-accent/50"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {def.label}
                          </span>

                          {def.fixed ? (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {def.gesture}
                            </span>
                          ) : (
                            <>
                              {changed ? (
                                <button
                                  type="button"
                                  title="Reset to default"
                                  aria-label={`Reset ${def.label}`}
                                  onClick={() =>
                                    void repo.updatePreferences({
                                      shortcuts: stripDefaults({
                                        ...bindings,
                                        [def.id]: def.defaultCombo,
                                      }),
                                    })
                                  }
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                >
                                  <RotateCcw className="size-3" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  setListeningId(listening ? null : def.id)
                                }
                                className={cn(
                                  "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition-colors",
                                  listening
                                    ? "animate-pulse border-sky-500 text-sky-600"
                                    : "hover:border-foreground/30",
                                )}
                              >
                                {listening ? "Press keys…" : formatCombo(combo)}
                              </button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => void resetAll()}>
            Reset all
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Persist only what differs, so future default changes reach existing users. */
function stripDefaults(bindings: Bindings): Bindings {
  const defaults = defaultBindings();
  const out: Bindings = {};
  for (const [id, combo] of Object.entries(bindings)) {
    if (combo && combo !== defaults[id]) out[id] = combo;
  }
  return out;
}
