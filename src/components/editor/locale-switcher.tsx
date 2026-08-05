"use client";

import { useRouter } from "next/navigation";

import { LocaleSelect } from "@/components/locale/locale-select";
import type { Campaign } from "@/lib/types";

/**
 * Moves between the sibling locale documents of one campaign. Switching is a
 * navigation, not in-place state — each locale is its own URL and its own
 * undo history.
 */
export function LocaleSwitcher({
  campaign,
  locale,
  basePath,
}: {
  campaign: Campaign;
  locale: string;
  /** e.g. `/p/acme-growth/email/welcome-email` */
  basePath: string;
}) {
  const router = useRouter();

  return (
    <LocaleSelect
      value={locale}
      onChange={(next) => {
        if (next !== locale) router.push(`${basePath}/${next}`);
      }}
      locales={campaign.locales}
      annotate={(code) =>
        code === campaign.defaultLocale ? "source" : undefined
      }
      ariaLabel="Locale"
      triggerClassName="h-7 w-auto gap-1.5 border-0 bg-accent/60 px-2 text-[11px] shadow-none"
    />
  );
}
