"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/app/app-header";
import { AddLocaleDialog } from "@/components/app/add-locale-dialog";
import { CanvasThumbnail } from "@/components/app/canvas-thumbnail";
import { MetadataEditor } from "@/components/app/metadata-editor";
import { NavigationTree } from "@/components/app/navigation-tree";
import { ReleaseDateField } from "@/components/app/release-date-field";
import { TokenProvider } from "@/components/canvas/tokens-context";
import { Button } from "@/components/ui/button";
import { useRepoQuery } from "@/hooks/use-repo";
import { localeFullLabel, localeInfo } from "@/lib/locales";
import { repo } from "@/lib/repo";

export default function CampaignPage({
  params,
}: {
  params: Promise<{ projectSlug: string; campaignSlug: string }>;
}) {
  const { projectSlug, campaignSlug } = use(params);

  const { data: project } = useRepoQuery(
    () => repo.getProjectBySlug(projectSlug),
    [projectSlug],
  );
  const { data: campaign } = useRepoQuery(
    async () =>
      project ? repo.getCampaignBySlug(project.id, campaignSlug) : undefined,
    [project?.id, campaignSlug],
  );
  const { data: documents } = useRepoQuery(
    async () => (campaign ? repo.listDocuments(campaign.id) : []),
    [campaign?.id],
  );
  // Scoped to the whole project, so sibling campaigns stay one click away.
  const { data: navigation } = useRepoQuery(
    async () =>
      project
        ? repo.listNavigation(project.id)
        : { projects: [], campaigns: [], documents: [] },
    [project?.id],
  );

  // Preview values so thumbnails read like real mail, not `${first_name}`.
  const tokens = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of campaign?.metadata ?? []) out[field.key] = field.defaultValue;
    return out;
  }, [campaign]);

  // `undefined` = still fetching; `null` = genuinely missing.
  if (project === null) notFound();
  if (project === undefined || campaign === undefined) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <p className="p-6 text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (campaign === null) notFound();

  const basePath = `/p/${project.slug}/email/${campaign.slug}`;

  const makeDefault = async (locale: string) => {
    await repo.setDefaultLocale(campaign.id, locale);
    toast.success(`${locale} is now the source locale`);
  };

  const removeLocale = async (locale: string) => {
    try {
      await repo.removeLocale(campaign.id, locale);
      toast.success(`Removed ${locale}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove locale");
    }
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        crumbs={[
          { label: project.name, href: `/p/${project.slug}` },
          { label: campaign.name, tag: "email" },
        ]}
        actions={
          <AddLocaleDialog
            campaign={campaign}
            defaultReleaseAt={
              (documents ?? []).find(
                (d) => d.locale === campaign.defaultLocale,
              )?.releaseAt
            }
          />
        }
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-lg tracking-tight">{campaign.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {campaign.locales.length}{" "}
            {campaign.locales.length === 1 ? "locale" : "locales"} · source{" "}
            {localeInfo(campaign.defaultLocale).flag} {campaign.defaultLocale} (
            {localeFullLabel(campaign.defaultLocale)})
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
          <NavigationTree
            data={navigation ?? { projects: [], campaigns: [], documents: [] }}
            title="Project"
          />

          <div className="grid gap-8 xl:grid-cols-[1fr_18rem]">
          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Documents
            </h2>

            <TokenProvider value={tokens}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {(documents ?? []).map((document) => {
                  const isSource = document.locale === campaign.defaultLocale;
                  return (
                    <li key={document.id} className="group relative">
                      <Link
                        href={`${basePath}/${document.locale}`}
                        className="block rounded-lg border p-3 transition-colors hover:border-foreground/25 hover:bg-accent/40"
                      >
                        <CanvasThumbnail canvas={document.canvas} />
                        <div className="mt-3 flex items-center gap-2">
                          <span aria-hidden className="text-sm leading-none">
                            {localeInfo(document.locale).flag}
                          </span>
                          <span className="text-sm tabular-nums">
                            {document.locale}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {localeFullLabel(document.locale)}
                          </span>
                          {isSource ? (
                            <span className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              source
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {basePath}/{document.locale}
                        </p>
                      </Link>

                      {/* Outside the Link — a date picker inside a navigation
                          target would fight the click. */}
                      <div className="mt-2 px-3">
                        <ReleaseDateField document={document} />
                      </div>

                      {!isSource ? (
                        <div className="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-6"
                            title="Make source locale"
                            onClick={() => void makeDefault(document.locale)}
                          >
                            <Star className="size-3" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-6"
                            title={`Remove ${document.locale}`}
                            onClick={() => void removeLocale(document.locale)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </TokenProvider>
          </section>

          <aside>
            <MetadataEditor key={campaign.id} campaign={campaign} />
          </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
