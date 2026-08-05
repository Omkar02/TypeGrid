"use client";

import Link from "next/link";
import { ArrowRight, Boxes, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/app/app-header";
import { ColorDot } from "@/components/app/color-picker";
import { CreateProjectDialog } from "@/components/app/create-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { NavigationTree } from "@/components/app/navigation-tree";
import { ScheduleHeatmap } from "@/components/app/schedule-heatmap";
import { Button } from "@/components/ui/button";
import { useRepoQuery } from "@/hooks/use-repo";
import { repo, resetToSeed } from "@/lib/repo";

export default function ProjectsPage() {
  const { data: projects } = useRepoQuery(() => repo.listProjects(), []);
  const { data: schedule } = useRepoQuery(() => repo.listSchedule(), []);
  const { data: navigation } = useRepoQuery(() => repo.listNavigation(), []);

  const takenColors = (projects ?? []).map((p) => p.color);

  return (
    <div className="min-h-dvh">
      <AppHeader
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                void resetToSeed().then(() => toast.success("Demo data restored"));
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset demo data
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Link href="/modules">
                <Boxes className="size-3.5" />
                Modules
              </Link>
            </Button>
            <CreateProjectDialog takenColors={takenColors} />
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-lg tracking-tight">Projects</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Project → Campaign → Document → Component → Entity. A campaign is one
            email; a document is that email in one locale.
          </p>
        </div>

        <div className="mb-8">
          <ScheduleHeatmap
            rows={schedule ?? []}
            title="All projects"
            showProject
            emptyHint="Nothing scheduled across any project yet. Give a campaign an expected release date and it will show up here."
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
          <NavigationTree
            data={navigation ?? { projects: [], campaigns: [], documents: [] }}
            title="All documents"
          />

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Projects
            </h2>
        {projects === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : projects.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/p/${project.slug}`}
                  className="group flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-foreground/25 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <ColorDot color={project.color} />
                      <span className="truncate">{project.name}</span>
                    </span>
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {project.description || "No description"}
                  </p>
                  <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
                    /p/{project.slug}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No projects yet"
            description="Create a project to start authoring localized email campaigns."
            action={<CreateProjectDialog takenColors={takenColors} />}
          />
        )}
          </section>
        </div>
      </main>
    </div>
  );
}
