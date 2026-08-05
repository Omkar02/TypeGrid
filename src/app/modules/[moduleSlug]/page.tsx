"use client";

import { use } from "react";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { ModuleEditorShell } from "@/components/modules/module-editor-shell";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";

export default function ModuleEditorPage({
  params,
}: {
  params: Promise<{ moduleSlug: string }>;
}) {
  const { moduleSlug } = use(params);

  const { data: module } = useRepoQuery(
    () => repo.getModuleBySlug(moduleSlug),
    [moduleSlug],
  );

  if (module === undefined) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <p className="p-6 text-xs text-muted-foreground">Loading module…</p>
      </div>
    );
  }
  if (module === null) notFound();

  return <ModuleEditorShell module={module} />;
}
