"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { CreateCampaignDialog } from "@/components/app/create-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { ColorDot } from "@/components/app/color-picker";
import { NavigationTree } from "@/components/app/navigation-tree";
import { ScheduleHeatmap } from "@/components/app/schedule-heatmap";
import { LocaleChip } from "@/components/locale/locale-chip";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = use(params);

  const { data: project } = useRepoQuery(
    () => repo.getProjectBySlug(projectSlug),
    [projectSlug],
  );
  const { data: campaigns } = useRepoQuery(
    async () => (project ? repo.listCampaigns(project.id) : []),
    [project?.id],
  );
  const { data: navigation } = useRepoQuery(
    async () =>
      project
        ? repo.listNavigation(project.id)
        : { projects: [], campaigns: [], documents: [] },
    [project?.id],
  );
  const { data: schedule } = useRepoQuery(
    async () => (project ? repo.listSchedule(project.id) : []),
    [project?.id],
  );

  // `undefined` = still fetching; `null` = genuinely missing.
  if (project === undefined) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <p className="p-6 text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!project) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader
        crumbs={[{ label: project.name }]}
        actions={
          <CreateCampaignDialog projectId={project.id} projectSlug={project.slug} />
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-lg tracking-tight">
            <ColorDot color={project.color} />
            {project.name}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {project.description || "No description"}
          </p>
        </div>

        <div className="mb-8">
          <ScheduleHeatmap rows={schedule ?? []} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
          <NavigationTree
            data={navigation ?? { projects: [], campaigns: [], documents: [] }}
          />

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Campaigns
            </h2>

            {campaigns && campaigns.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {campaigns.map((campaign) => (
                  <li key={campaign.id}>
                    <Link
                      href={`/p/${project.slug}/email/${campaign.slug}`}
                      className="group flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-foreground/25 hover:bg-accent/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm">{campaign.name}</span>
                        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {campaign.locales.map((locale) => (
                          <LocaleChip
                            key={locale}
                            code={locale}
                            emphasis={locale === campaign.defaultLocale}
                          />
                        ))}
                      </div>
                      <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
                        {campaign.locales.length}{" "}
                        {campaign.locales.length === 1 ? "document" : "documents"}{" "}
                        · {campaign.metadata.length} metadata{" "}
                        {campaign.metadata.length === 1 ? "key" : "keys"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No campaigns yet"
                description="A campaign is one email, authored once per locale."
                action={
                  <CreateCampaignDialog
                    projectId={project.id}
                    projectSlug={project.slug}
                  />
                }
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
