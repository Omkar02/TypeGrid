"use client";

import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
  tag?: string;
}

export function AppHeader({
  crumbs = [],
  actions,
}: {
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        <Link
          href="/"
          className="shrink-0 rounded px-1 py-0.5 font-semibold tracking-tight hover:bg-accent"
        >
          TypeGrid
        </Link>
        {crumbs.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            <span className="text-muted-foreground">/</span>
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="truncate rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate px-1 py-0.5">{crumb.label}</span>
            )}
            {crumb.tag ? (
              <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {crumb.tag}
              </span>
            ) : null}
          </Fragment>
        ))}
      </nav>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
