"use client";

import { addDaysIso, todayIso } from "@/lib/dates";
import { newId, nowIso, slugify } from "@/lib/id";
import { boundsOf, createComponent, createEntity, emptyCanvas } from "@/lib/nodes";
import type {
  Campaign,
  CanvasDoc,
  CanvasNode,
  EntityKind,
  Module,
  ModuleKind,
  NodeStyle,
  Project,
  Rect,
  TypeDocument,
} from "@/lib/types";
import {
  DEFAULT_TENANT_ID,
  blankPreferences,
  defaultTenant,
  type Db,
} from "@/lib/repo/local-repository";

interface EntitySpec {
  kind: EntityKind;
  name?: string;
  frame: Rect;
  props?: Record<string, unknown>;
  style?: Partial<NodeStyle>;
}

/** Builds one component plus its children, all frames absolute. */
function buildComponent(
  name: string,
  specs: EntitySpec[],
  padding = 0,
): { nodes: Record<string, CanvasNode>; rootId: string } {
  const nodes: Record<string, CanvasNode> = {};
  const childIds: string[] = [];

  for (const spec of specs) {
    const entity = createEntity(spec.kind, spec.frame);
    if (spec.name) entity.name = spec.name;
    if (spec.props) {
      entity.props = { ...entity.props, ...spec.props } as typeof entity.props;
    }
    if (spec.style) entity.style = { ...entity.style, ...spec.style };
    nodes[entity.id] = entity;
    childIds.push(entity.id);
  }

  const inner = boundsOf(nodes, childIds) ?? { x: 0, y: 0, w: 0, h: 0 };
  const frame: Rect = {
    x: inner.x - padding,
    y: inner.y - padding,
    w: inner.w + padding * 2,
    h: inner.h + padding * 2,
  };

  const component = createComponent(name, frame, childIds);
  for (const id of childIds) nodes[id].parentId = component.id;
  nodes[component.id] = component;

  return { nodes, rootId: component.id };
}

/** Shifts a subtree so its root sits at (x, y). */
function placeAt(
  built: { nodes: Record<string, CanvasNode>; rootId: string },
  x: number,
  y: number,
): { nodes: Record<string, CanvasNode>; rootId: string } {
  const root = built.nodes[built.rootId];
  const dx = x - root.frame.x;
  const dy = y - root.frame.y;
  for (const node of Object.values(built.nodes)) {
    node.frame = { ...node.frame, x: node.frame.x + dx, y: node.frame.y + dy };
  }
  return built;
}

const EMAIL_WIDTH = 600;

// ---------------------------------------------------------------------------
// Per-locale copy. Layout is identical across locales — only strings differ,
// which is exactly the shape auto-translation will need.
// ---------------------------------------------------------------------------

interface Copy {
  heroHeadline: string;
  heroSub: string;
  bodyText: string;
  ctaLabel: string;
  ctaCaption: string;
  footerLegal: string;
  resetHeadline: string;
  resetBody: string;
  resetCta: string;
}

const COPY: Record<string, Copy> = {
  en: {
    heroHeadline: "Welcome aboard, ${first_name}",
    heroSub:
      "Your ${product_name} workspace is ready. Here is how to get the most out of it.",
    bodyText:
      "Hi ${first_name},\n\nThanks for joining ${product_name}. Your first campaign is already waiting — drag a few modules onto the canvas and you are off.",
    ctaLabel: "Open workspace",
    ctaCaption: "Takes about two minutes.",
    footerLegal:
      "${product_name}, 100 Market St, San Francisco CA\nYou can unsubscribe at any time.",
    resetHeadline: "Reset your password",
    resetBody:
      "Hi ${first_name}, we got a request to reset your ${product_name} password. This link expires in 30 minutes.",
    resetCta: "Choose a new password",
  },
  de: {
    heroHeadline: "Willkommen an Bord, ${first_name}",
    heroSub:
      "Dein ${product_name}-Arbeitsbereich ist bereit. So holst du das Meiste heraus.",
    bodyText:
      "Hallo ${first_name},\n\ndanke, dass du zu ${product_name} gekommen bist. Deine erste Kampagne wartet schon — zieh ein paar Module auf die Arbeitsfläche und los geht's.",
    ctaLabel: "Arbeitsbereich öffnen",
    ctaCaption: "Dauert etwa zwei Minuten.",
    footerLegal:
      "${product_name}, 100 Market St, San Francisco CA\nDu kannst dich jederzeit abmelden.",
    resetHeadline: "Passwort zurücksetzen",
    resetBody:
      "Hallo ${first_name}, wir haben eine Anfrage erhalten, dein ${product_name}-Passwort zurückzusetzen. Dieser Link läuft in 30 Minuten ab.",
    resetCta: "Neues Passwort wählen",
  },
};

/** Locales with no translation yet start as a copy of the source locale. */
function copyFor(locale: string): Copy {
  return COPY[locale] ?? COPY.en;
}

// ---------------------------------------------------------------------------
// Canvas builders
// ---------------------------------------------------------------------------

function heroSpecs(copy: Copy, originY: number): EntitySpec[] {
  return [
    {
      kind: "area",
      name: "Hero background",
      frame: { x: 0, y: originY, w: EMAIL_WIDTH, h: 280 },
      props: { label: "Hero" },
      style: { fill: "#111827", borderWidth: 0, radius: 12 },
    },
    {
      kind: "text",
      name: "Headline",
      frame: { x: 48, y: originY + 72, w: 504, h: 60 },
      props: { content: copy.heroHeadline },
      style: {
        color: "#ffffff",
        fontSize: 34,
        fontWeight: 700,
        lineHeight: 1.2,
        textAlign: "center",
      },
    },
    {
      kind: "text",
      name: "Subhead",
      frame: { x: 88, y: originY + 142, w: 424, h: 52 },
      props: { content: copy.heroSub },
      style: {
        color: "#d1d5db",
        fontSize: 15,
        lineHeight: 1.6,
        textAlign: "center",
      },
    },
  ];
}

function ctaSpecs(copy: Copy, originY: number): EntitySpec[] {
  return [
    {
      kind: "button",
      name: "Primary CTA",
      frame: { x: 210, y: originY, w: 180, h: 48 },
      props: { label: copy.ctaLabel, href: "${cta_url}" },
      style: { fill: "#2563eb", color: "#ffffff", radius: 999 },
    },
    {
      kind: "text",
      name: "CTA caption",
      frame: { x: 150, y: originY + 62, w: 300, h: 20 },
      props: { content: copy.ctaCaption },
      style: { color: "#6b7280", fontSize: 13, textAlign: "center" },
    },
  ];
}

function footerSpecs(copy: Copy, originY: number): EntitySpec[] {
  return [
    {
      kind: "divider",
      name: "Rule",
      frame: { x: 0, y: originY, w: EMAIL_WIDTH, h: 1 },
      style: { fill: "#e5e7eb" },
    },
    {
      kind: "text",
      name: "Legal",
      frame: { x: 0, y: originY + 24, w: EMAIL_WIDTH, h: 48 },
      props: { content: copy.footerLegal },
      style: {
        color: "#9ca3af",
        fontSize: 12,
        textAlign: "center",
        lineHeight: 1.6,
      },
    },
  ];
}

function welcomeCanvas(locale: string): CanvasDoc {
  const copy = copyFor(locale);
  const canvas = emptyCanvas();

  const hero = placeAt(buildComponent("Hero", heroSpecs(copy, 0)), 80, 80);
  const body = placeAt(
    buildComponent("Body copy", [
      {
        kind: "text",
        name: "Body",
        frame: { x: 0, y: 0, w: EMAIL_WIDTH, h: 120 },
        props: { content: copy.bodyText },
        style: { fontSize: 16, lineHeight: 1.7, color: "#374151" },
      },
    ]),
    80,
    400,
  );
  const cta = placeAt(buildComponent("CTA", ctaSpecs(copy, 0)), 80, 552);
  const footer = placeAt(buildComponent("Footer", footerSpecs(copy, 0)), 80, 680);

  for (const built of [hero, body, cta, footer]) {
    Object.assign(canvas.nodes, built.nodes);
    canvas.rootIds.push(built.rootId);
  }
  return canvas;
}

function resetCanvas(locale: string): CanvasDoc {
  const copy = copyFor(locale);
  const canvas = emptyCanvas();
  const block = placeAt(
    buildComponent("Reset block", [
      {
        kind: "text",
        name: "Headline",
        frame: { x: 0, y: 0, w: EMAIL_WIDTH, h: 44 },
        props: { content: copy.resetHeadline },
        style: { fontSize: 28, fontWeight: 700, color: "#111827" },
      },
      {
        kind: "text",
        name: "Body",
        frame: { x: 0, y: 64, w: EMAIL_WIDTH, h: 96 },
        props: { content: copy.resetBody },
        style: { fontSize: 16, lineHeight: 1.7, color: "#374151" },
      },
      {
        kind: "button",
        name: "Reset CTA",
        frame: { x: 0, y: 180, w: 220, h: 48 },
        props: { label: copy.resetCta, href: "${cta_url}" },
        style: { fill: "#111827", color: "#ffffff", radius: 8 },
      },
    ]),
    80,
    80,
  );
  Object.assign(canvas.nodes, block.nodes);
  canvas.rootIds.push(block.rootId);
  return canvas;
}

/** Normalizes a built subtree to origin and packages it as a Module. */
function toModule(
  built: { nodes: Record<string, CanvasNode>; rootId: string },
  name: string,
  kind: ModuleKind,
  tags: string[],
): Module {
  placeAt(built, 0, 0);
  const root = built.nodes[built.rootId];
  const ts = nowIso();
  return {
    id: newId("mod"),
    tenantId: DEFAULT_TENANT_ID,
    kind,
    // Seeded entries are global: usable from any project in the tenant.
    projectId: null,
    name,
    slug: slugify(name),
    tags,
    size: { w: root.frame.w, h: root.frame.h },
    nodes: built.nodes,
    rootId: built.rootId,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * First-run demo content. Gives both flows something to open: a localized
 * campaign to edit, and a module library to drag from.
 */
export function buildSeedDb(): Db {
  const ts = nowIso();

  const tenant = defaultTenant();

  const project: Project = {
    id: newId("prj"),
    tenantId: tenant.id,
    name: "Acme Growth",
    slug: "acme-growth",
    description: "Lifecycle email for the Acme product suite.",
    color: "blue",
    createdAt: ts,
    updatedAt: ts,
  };

  const metadata = [
    { key: "first_name", label: "First name", defaultValue: "Sam" },
    { key: "product_name", label: "Product name", defaultValue: "Acme" },
    { key: "cta_url", label: "CTA URL", defaultValue: "https://acme.test/app" },
  ];

  const welcome: Campaign = {
    id: newId("cmp"),
    projectId: project.id,
    name: "Welcome Email",
    slug: "welcome-email",
    locales: ["en", "de", "ja"],
    defaultLocale: "en",
    metadata,
    createdAt: ts,
    updatedAt: ts,
  };

  const passwordReset: Campaign = {
    id: newId("cmp"),
    projectId: project.id,
    name: "Password Reset",
    slug: "password-reset",
    locales: ["en", "de"],
    defaultLocale: "en",
    metadata,
    createdAt: ts,
    updatedAt: ts,
  };

  // Dates are relative to today so the schedule always has something in view,
  // and staggered so a translated locale trails its source — the usual shape of
  // a localized rollout.
  const today = todayIso();
  const welcomeRelease: Record<string, string> = {
    en: addDaysIso(today, 3),
    de: addDaysIso(today, 8),
    ja: addDaysIso(today, 8),
  };
  const resetRelease: Record<string, string> = {
    en: addDaysIso(today, 1),
    de: addDaysIso(today, 15),
  };

  const documents: TypeDocument[] = [
    // `ja` has no translation in COPY, so it seeds as an untranslated copy of
    // the source locale — the realistic starting state for a new locale.
    ...welcome.locales.map((locale) => ({
      id: newId("doc"),
      campaignId: welcome.id,
      locale,
      releaseAt: welcomeRelease[locale] ?? null,
      canvas: welcomeCanvas(locale),
      createdAt: ts,
      updatedAt: ts,
    })),
    ...passwordReset.locales.map((locale) => ({
      id: newId("doc"),
      campaignId: passwordReset.id,
      locale,
      releaseAt: resetRelease[locale] ?? null,
      canvas: resetCanvas(locale),
      createdAt: ts,
      updatedAt: ts,
    })),
  ];

  const en = copyFor("en");
  const modules: Module[] = [
    // A mix of both kinds so the distinction is visible out of the box:
    // the footer is legally identical everywhere, the hero is a starting point.
    toModule(buildComponent("Footer", footerSpecs(en, 0)), "Footer", "module", [
      "legal",
    ]),
    toModule(
      buildComponent("Hero banner", heroSpecs(en, 0)),
      "Hero banner",
      "template",
      ["hero", "dark"],
    ),
    toModule(buildComponent("CTA block", ctaSpecs(en, 0)), "CTA block", "template", [
      "cta",
    ]),
  ];

  return {
    preferences: blankPreferences(),
    tenants: [tenant],
    projects: [project],
    campaigns: [welcome, passwordReset],
    documents,
    modules,
  };
}
