"use client";

import { use } from "react";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { EditorShell } from "@/components/editor/editor-shell";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";

/**
 * The authoring canvas for one locale of one campaign.
 *
 * `email` is a literal segment: the tool is email-only, and the user asked for
 * the surface to be visible in the URL. The locale is the document's own
 * identity within its campaign, so it needs no separate slug.
 *
 *   /p/<project>/email/<campaign>/<locale>
 */
export default function DocumentEditorPage({
  params,
}: {
  params: Promise<{
    projectSlug: string;
    campaignSlug: string;
    locale: string;
  }>;
}) {
  const { projectSlug, campaignSlug, locale } = use(params);

  const { data: project } = useRepoQuery(
    () => repo.getProjectBySlug(projectSlug),
    [projectSlug],
  );
  const { data: campaign } = useRepoQuery(
    async () =>
      project ? repo.getCampaignBySlug(project.id, campaignSlug) : undefined,
    [project?.id, campaignSlug],
  );
  const { data: document } = useRepoQuery(
    async () =>
      campaign ? repo.getDocumentByLocale(campaign.id, locale) : undefined,
    [campaign?.id, locale],
  );

  if (project === null) notFound();
  if (project === undefined || campaign === undefined) return <Loading />;
  if (campaign === null) notFound();
  if (document === undefined) return <Loading />;
  if (document === null) notFound();

  return (
    <EditorShell project={project} campaign={campaign} document={document} />
  );
}

function Loading() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <p className="p-6 text-xs text-muted-foreground">Loading canvas…</p>
    </div>
  );
}
