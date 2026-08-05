"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EMPTY_LEVEL_COLOR,
  type ProjectColor,
  cellColor,
  colorSpec,
} from "@/lib/colors";
import {
  formatDayLabel,
  formatShortMonth,
  isSameMonth,
  relativeDayLabel,
  toIsoDate,
  todayIso,
  weekColumns,
} from "@/lib/dates";
import { localeInfo } from "@/lib/locales";
import type { ScheduleRow } from "@/lib/repo/repository";
import type { IsoDate } from "@/lib/types";

/**
 * A year of release dates as a GitHub-style contribution heatmap: one column
 * per week, one cell per day, intensity by how many documents ship that day.
 *
 * Unlike GitHub's graph — which looks backwards at what happened — a release
 * schedule is mostly forward-looking, so the window starts a few weeks in the
 * past and runs forward for the rest of the year.
 */
const WEEKS_BEFORE_TODAY = 4;
const TOTAL_WEEKS = 53;

/** Row labels, Monday-first. Only alternate rows are labelled, like GitHub. */
const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

interface DayBucket {
  rows: ScheduleRow[];
  /** Project whose colour the cell takes — the one with the most that day. */
  dominant: ProjectColor;
}

export function ScheduleHeatmap({
  rows,
  title = "Schedule",
  /** Shows the project name in the day detail. Set on the cross-project view. */
  showProject = false,
  emptyHint,
}: {
  rows: ScheduleRow[];
  title?: string;
  showProject?: boolean;
  emptyHint?: string;
}) {
  const today = todayIso();
  // Today is selected up front — an empty detail pane below the grid is wasted
  // space, and "what ships today" is the question people arrive with.
  const [selected, setSelected] = useState<IsoDate>(today);

  const columns = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - WEEKS_BEFORE_TODAY * 7);
    return weekColumns(start, TOTAL_WEEKS);
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<IsoDate, DayBucket>();
    for (const row of rows) {
      const date = row.document.releaseAt;
      if (!date) continue;
      const bucket = map.get(date);
      if (bucket) bucket.rows.push(row);
      else map.set(date, { rows: [row], dominant: row.project.color });
    }

    for (const bucket of map.values()) {
      bucket.rows.sort(
        (a, b) =>
          a.project.name.localeCompare(b.project.name) ||
          a.campaign.name.localeCompare(b.campaign.name) ||
          a.document.locale.localeCompare(b.document.locale),
      );
      bucket.dominant = dominantColor(bucket.rows);
    }
    return map;
  }, [rows]);

  const scheduled = rows.filter((r) => r.document.releaseAt).length;
  const unscheduled = rows.length - scheduled;

  const inWindow = useMemo(() => {
    let total = 0;
    for (const column of columns) {
      for (const date of column) {
        total += byDay.get(toIsoDate(date))?.rows.length ?? 0;
      }
    }
    return total;
  }, [columns, byDay]);

  // A month label sits above the first column that starts a new month.
  const monthLabels = columns.map((column, index) => {
    const first = column[0];
    if (index === 0) return formatShortMonth(first);
    return isSameMonth(first, columns[index - 1][0])
      ? ""
      : formatShortMonth(first);
  });

  const selectedBucket = selected ? byDay.get(selected) : undefined;

  return (
    <section aria-label={`${title} heatmap`} className="rounded-lg border">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
        <h2 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {inWindow} scheduled in this window
          {unscheduled > 0 ? ` · ${unscheduled} unscheduled` : ""}
        </span>
      </header>

      <div className="space-y-2 p-3">
        {/*
          Columns flex to fill the parent, and cells are square via aspect-ratio
          rather than a fixed size — so the grid grows with the container. The
          min-width plus overflow keeps cells legible on narrow screens.

          Both the label column and the week columns start with an `h-3` row so
          the day labels line up with the cells whatever height they resolve to.
        */}
        <div className="overflow-x-auto">
          {/*
            The padding is slack for `hover:scale-125`: a scaled cell grows
            ~2px beyond its track, and without room the outermost columns push
            past the scroll container and raise a scrollbar on hover. The grid
            is `flex-1` of this box, so the padding narrows it to suit.
          */}
          <div className="flex min-w-[620px] items-stretch gap-1 p-1">
            <div className="flex w-6 shrink-0 flex-col gap-[3px]">
              <span className="h-3" />
              {ROW_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="flex flex-1 items-center text-[9px] leading-none text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>

            {/*
              Grid rather than flex: 53 equal tracks. `flex-1` across this many
              children accumulates sub-pixel rounding and overflows the parent
              by a pixel or two, which is enough to raise a scrollbar.
            */}
            <div
              className="grid min-w-0 flex-1 gap-[3px]"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
              }}
            >
              {columns.map((column, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-[3px]">
                  {/* Deliberately allowed to overflow its column, like GitHub's. */}
                  <span className="h-3 whitespace-nowrap text-[9px] leading-3 text-muted-foreground">
                    {monthLabels[index]}
                  </span>
                  {column.map((date) => {
                    const iso = toIsoDate(date);
                    const bucket = byDay.get(iso);
                    const count = bucket?.rows.length ?? 0;
                    const isToday = iso === today;
                    const isSelected = iso === selected;

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelected(iso)}
                        title={`${
                          count === 0
                            ? "Nothing scheduled"
                            : `${count} ${count === 1 ? "document" : "documents"}`
                        } — ${formatDayLabel(iso)} (${relativeDayLabel(iso)})`}
                        aria-label={`${formatDayLabel(iso)}, ${count} scheduled`}
                        className={cn(
                          "aspect-square w-full rounded-[2px] outline-none transition-transform hover:scale-125",
                          isToday && "ring-1 ring-foreground ring-offset-1",
                          isSelected && "ring-2 ring-sky-500 ring-offset-1",
                        )}
                        style={{
                          backgroundColor: bucket
                            ? cellColor(bucket.dominant, count)
                            : EMPTY_LEVEL_COLOR,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground">Today is outlined</p>

        <DayDetail
          iso={selected}
          bucket={selectedBucket}
          showProject={showProject}
          emptyHint={scheduled === 0 ? emptyHint : undefined}
        />
      </div>
    </section>
  );
}

/** Fixed height so the page does not jump as you click between days. */
const DETAIL_HEIGHT = "h-32";

function DayDetail({
  iso,
  bucket,
  showProject,
  emptyHint,
}: {
  iso: IsoDate;
  bucket: DayBucket | undefined;
  showProject: boolean;
  /** Shown instead of "nothing scheduled" when the whole schedule is empty. */
  emptyHint?: string;
}) {
  const count = bucket?.rows.length ?? 0;

  return (
    <div className="rounded-md border bg-muted/30">
      <p className="flex items-baseline gap-1.5 border-b px-2.5 py-1.5 text-[11px]">
        {formatDayLabel(iso)}
        <span className="text-muted-foreground">({relativeDayLabel(iso)})</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {count} {count === 1 ? "document" : "documents"}
        </span>
      </p>

      <div className={cn("overflow-y-auto p-1.5", DETAIL_HEIGHT)}>
      {count === 0 ? (
        <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          {emptyHint ??
            "Nothing scheduled on this day. Pick another, or set a release date from a campaign page."}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {(bucket?.rows ?? []).map(({ document, campaign, project }) => {
            const { flag } = localeInfo(document.locale);
            return (
              <li key={document.id}>
                <Link
                  href={`/p/${project.slug}/email/${campaign.slug}/${document.locale}`}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] transition-colors hover:bg-accent"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorSpec(project.color).base }}
                  />
                  {flag ? (
                    <span aria-hidden className="shrink-0">
                      {flag}
                    </span>
                  ) : null}
                  <span className="shrink-0 tabular-nums">{document.locale}</span>
                  <span className="truncate">{campaign.name}</span>
                  {showProject ? (
                    <span className="ml-auto shrink-0 truncate text-muted-foreground">
                      {project.name}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

/** The project contributing most rows that day; ties break on project name. */
function dominantColor(rows: ScheduleRow[]): ProjectColor {
  const counts = new Map<string, { count: number; row: ScheduleRow }>();
  for (const row of rows) {
    const entry = counts.get(row.project.id);
    if (entry) entry.count += 1;
    else counts.set(row.project.id, { count: 1, row });
  }
  let best = rows[0];
  let bestCount = 0;
  for (const { count, row } of counts.values()) {
    if (
      count > bestCount ||
      (count === bestCount && row.project.name.localeCompare(best.project.name) < 0)
    ) {
      best = row;
      bestCount = count;
    }
  }
  return best.project.color;
}
