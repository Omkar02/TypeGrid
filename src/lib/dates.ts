import type { IsoDate } from "@/lib/types";

/**
 * Calendar-date helpers.
 *
 * Everything here works in **local time** and formats by hand rather than going
 * through `toISOString()`, which converts to UTC and can shift a date by a day
 * for anyone east or west of Greenwich. A release date is a date, not an
 * instant, and it must read the same to everyone looking at it.
 */

export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` to local midnight. */
export function fromIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Weeks start on Monday — these are work schedules, not US wall calendars. */
export const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * The 6×7 day grid covering `month`, padded with neighbouring days so every
 * week is complete. Always 42 cells, so the grid never changes height as you
 * page through months.
 */
export function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  // getDay() is 0=Sunday; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - leading);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/**
 * `weeks` columns of 7 days each, starting from the Monday of `from`'s week.
 * Column-major, which is exactly how a GitHub-style heatmap is laid out.
 */
export function weekColumns(from: Date, weeks: number): Date[][] {
  const start = startOfWeek(from);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      return date;
    }),
  );
}

const shortMonthFormatter = new Intl.DateTimeFormat("en", { month: "short" });

/** "Aug" — for the month ruler above a heatmap. */
export function formatShortMonth(date: Date): string {
  return shortMonthFormatter.format(date);
}

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

const dayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatMonthLabel(date: Date): string {
  return monthFormatter.format(date);
}

export function formatDayLabel(iso: IsoDate): string {
  return dayFormatter.format(fromIsoDate(iso));
}

/** Whole days from today to `iso`; negative means the date has passed. */
export function daysFromToday(iso: IsoDate): number {
  const today = fromIsoDate(todayIso());
  const target = fromIsoDate(iso);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "in 3 days", "today", "2 days ago". */
export function relativeDayLabel(iso: IsoDate): string {
  const delta = daysFromToday(iso);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  return delta > 0 ? `in ${delta} days` : `${Math.abs(delta)} days ago`;
}
