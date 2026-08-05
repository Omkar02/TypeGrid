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
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/app/color-picker";
import { LocaleGrid } from "@/components/locale/locale-grid";
import { LocaleSelect } from "@/components/locale/locale-select";
import { nextFreeColor, type ProjectColor } from "@/lib/colors";
import { repo } from "@/lib/repo";

function useSubmit<T>(run: () => Promise<T>, onDone: (result: T) => void) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      onDone(await run());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return { busy, submit };
}

// ---------------------------------------------------------------------------

export function CreateProjectDialog({
  /** Colours already in use, so the default lands on a free one. */
  takenColors = [],
}: {
  takenColors?: ProjectColor[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>(() =>
    nextFreeColor(takenColors),
  );

  const { busy, submit } = useSubmit(
    () => repo.createProject({ name: name.trim(), description, color }),
    (project) => {
      setOpen(false);
      setName("");
      setDescription("");
      toast.success(`Created “${project.name}”`);
      router.push(`/p/${project.slug}`);
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="size-3.5" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project holds campaigns; each campaign holds one document per
            locale.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              autoFocus
              placeholder="Acme Growth"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function CreateCampaignDialog({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [locales, setLocales] = useState<string[]>(["en", "de"]);
  const [sourceLocale, setSourceLocale] = useState("en");
  const [releaseAt, setReleaseAt] = useState("");

  // The source must stay inside the selection; fall back to the first pick.
  const source = locales.includes(sourceLocale) ? sourceLocale : locales[0];

  const { busy, submit } = useSubmit(
    () =>
      repo.createCampaign({
        projectId,
        name: name.trim(),
        locales: locales.length > 0 ? locales : ["en"],
        defaultLocale: source ?? "en",
        releaseAt: releaseAt || null,
        metadata: [
          { key: "first_name", label: "First name", defaultValue: "Sam" },
          { key: "product_name", label: "Product name", defaultValue: "Acme" },
          {
            key: "cta_url",
            label: "CTA URL",
            defaultValue: "https://acme.test/app",
          },
        ],
      }),
    (campaign) => {
      setOpen(false);
      setName("");
      toast.success(
        `Created “${campaign.name}” with ${campaign.locales.length} locale${
          campaign.locales.length === 1 ? "" : "s"
        }`,
      );
      router.push(`/p/${projectSlug}/email/${campaign.slug}`);
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="size-3.5" />
          New campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            One email, authored once per locale. A blank document is created for
            every locale you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              value={name}
              autoFocus
              placeholder="Welcome Email"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Locales</Label>
            <LocaleGrid
              value={locales}
              onChange={setLocales}
              emptyHint="Pick at least one locale."
            />
          </div>

          {locales.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="campaign-source">Source locale</Label>
              <LocaleSelect
                id="campaign-source"
                value={source}
                onChange={setSourceLocale}
                locales={locales}
              />
              <p className="text-[11px] text-muted-foreground">
                Other locales are translated from this one. It cannot be deleted.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="campaign-release">Expected release</Label>
            <Input
              id="campaign-release"
              type="date"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Optional. Applied to every locale document and shown on the project
              schedule; each document can be moved individually afterwards.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || !name.trim() || locales.length === 0}
          >
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
