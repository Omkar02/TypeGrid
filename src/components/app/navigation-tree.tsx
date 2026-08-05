"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, Mail, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ColorDot } from "@/components/app/color-picker";
import { cn } from "@/lib/utils";
import { localeFullLabel, localeInfo } from "@/lib/locales";
import type { NavigationData } from "@/lib/repo/repository";
import type { Campaign, Project, TypeDocument } from "@/lib/types";

/**
 * Project → Campaign → locale navigation, shared by the home, project and
 * campaign pages.
 *
 * The project level always renders, even when only one project is in scope, so
 * the shape of the tree is the same wherever you meet it.
 */
export function NavigationTree({
  data,
  title = "Documents",
}: {
  data: NavigationData;
  title?: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { projects, campaigns, documents } = data;

  const documentsByCampaign = useMemo(() => {
    const map = new Map<string, Map<string, TypeDocument>>();
    for (const document of documents) {
      let locales = map.get(document.campaignId);
      if (!locales) {
        locales = new Map();
        map.set(document.campaignId, locales);
      }
      locales.set(document.locale, document);
    }
    return map;
  }, [documents]);

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  // A campaign survives the filter on its own name, its project's name, or any
  // of its locale codes — so "de" and "acme" both narrow usefully.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter((campaign) => {
      const project = projectsById.get(campaign.projectId);
      return (
        campaign.name.toLowerCase().includes(needle) ||
        (project?.name.toLowerCase().includes(needle) ?? false) ||
        campaign.locales.some((l) => l.toLowerCase().includes(needle))
      );
    });
  }, [campaigns, query, projectsById]);

  const searching = query.trim().length > 0;

  const campaignsByProject = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const campaign of matches) {
      const list = map.get(campaign.projectId);
      if (list) list.push(campaign);
      else map.set(campaign.projectId, [campaign]);
    }
    return map;
  }, [matches]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // While searching, everything opens — a hidden match is a useless match.
  const isCollapsed = (id: string) => !searching && collapsed.has(id);

  // While searching, a project with no surviving campaign drops out entirely.
  const visibleProjects = searching
    ? projects.filter((p) => (campaignsByProject.get(p.id)?.length ?? 0) > 0)
    : projects;

  const renderCampaign = (campaign: Campaign, depth: number) => {
    const project = projectsById.get(campaign.projectId);
    if (!project) return null;

    const campaignHref = `/p/${project.slug}/email/${campaign.slug}`;
    const locales = documentsByCampaign.get(campaign.id);
    const collapsedHere = isCollapsed(campaign.id);

    // Source locale first, then the campaign's own order.
    const ordered = [
      campaign.defaultLocale,
      ...campaign.locales.filter((l) => l !== campaign.defaultLocale),
    ];

    return (
      <div key={campaign.id}>
        <div
          className={cn(
            "group flex h-7 items-center gap-1 rounded pr-1",
            pathname === campaignHref ? "bg-accent" : "hover:bg-accent/60",
          )}
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => toggle(campaign.id)}
            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={
              collapsedHere ? `Expand ${campaign.name}` : `Collapse ${campaign.name}`
            }
            aria-expanded={!collapsedHere}
          >
            {collapsedHere ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
          <Mail className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <Link
            href={campaignHref}
            className="min-w-0 flex-1 truncate text-xs"
            title={campaign.name}
          >
            {campaign.name}
          </Link>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {campaign.locales.length}
          </span>
        </div>

        {!collapsedHere
          ? ordered.map((locale) => {
              const document = locales?.get(locale);
              const href = `${campaignHref}/${locale}`;
              const { flag } = localeInfo(locale);

              return (
                <Link
                  key={locale}
                  href={href}
                  title={localeFullLabel(locale)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded pr-1",
                    pathname === href ? "bg-sky-500/15" : "hover:bg-accent/60",
                    !document && "opacity-50",
                  )}
                  style={{ paddingLeft: depth * 12 + 28 }}
                >
                  {flag ? (
                    <span aria-hidden className="shrink-0 text-[11px]">
                      {flag}
                    </span>
                  ) : (
                    <FileText className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="shrink-0 text-xs tabular-nums">{locale}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                    {localeFullLabel(locale)}
                  </span>
                  {locale === campaign.defaultLocale ? (
                    <span className="shrink-0 rounded border px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                      src
                    </span>
                  ) : null}
                </Link>
              );
            })
          : null}
      </div>
    );
  };

  const renderProject = (project: Project) => {
    const group = campaignsByProject.get(project.id) ?? [];
    const projectHref = `/p/${project.slug}`;
    const collapsedHere = isCollapsed(project.id);

    return (
      <div key={project.id}>
        <div
          className={cn(
            "flex h-7 items-center gap-1 rounded pr-1",
            pathname === projectHref ? "bg-accent" : "hover:bg-accent/60",
          )}
        >
          <button
            type="button"
            onClick={() => toggle(project.id)}
            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={
              collapsedHere ? `Expand ${project.name}` : `Collapse ${project.name}`
            }
            aria-expanded={!collapsedHere}
          >
            {collapsedHere ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
          <ColorDot color={project.color} className="size-2" />
          <Link
            href={projectHref}
            className="min-w-0 flex-1 truncate text-xs"
            title={project.name}
          >
            {project.name}
          </Link>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {group.length}
          </span>
        </div>

        {!collapsedHere ? group.map((c) => renderCampaign(c, 1)) : null}
      </div>
    );
  };

  const total = matches.reduce((sum, c) => sum + c.locales.length, 0);

  return (
    <nav
      aria-label="Documents"
      className="rounded-lg border lg:sticky lg:top-16"
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {total}
        </span>
      </div>

      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            className="h-7 pl-8 text-xs"
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          No projects yet.
        </p>
      ) : matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          No campaign matches “{query.trim()}”.
        </p>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <div className="p-1.5">
            {visibleProjects.map(renderProject)}
          </div>
        </ScrollArea>
      )}
    </nav>
  );
}
