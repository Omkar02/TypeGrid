"use client";

import {
  DEFAULT_PROJECT_COLOR,
  isProjectColor,
  nextFreeColor,
} from "@/lib/colors";
import { newId, nowIso, uniqueSlug } from "@/lib/id";
import { normalizeLocale } from "@/lib/locales";
import { createComponent, emptyCanvas } from "@/lib/nodes";
import type {
  Campaign,
  CanvasDoc,
  CanvasNode,
  CanvasVersion,
  IsoDate,
  Module,
  Project,
  Size,
  Tenant,
  TypeDocument,
  UserPreferences,
  VersionTargetType,
} from "@/lib/types";
import type {
  AddLocalesOptions,
  CreateCampaignInput,
  CreateModuleInput,
  CreateProjectInput,
  NavigationData,
  Repository,
  ScheduleRow,
} from "@/lib/repo/repository";

/**
 * v2 introduced the Project -> Campaign -> Document(locale) hierarchy and
 * dropped multi-surface support. v1 data is structurally incompatible and is
 * left untouched rather than migrated — it only ever held demo content.
 */
const STORAGE_KEY = "typegrid:v2";

interface Db {
  preferences: UserPreferences;
  versions: CanvasVersion[];
  tenants: Tenant[];
  projects: Project[];
  campaigns: Campaign[];
  documents: TypeDocument[];
  modules: Module[];
}

export const DEFAULT_VERSION_LIMIT = 10;
/** Versions saved within this window fold into the previous one. */
const VERSION_COALESCE_MS = 45_000;

export function blankPreferences(): UserPreferences {
  return {
    shortcuts: {},
    versionLimit: DEFAULT_VERSION_LIMIT,
    collaboration: false,
  };
}

/**
 * FNV-1a over the serialised canvas. Fast, allocation-light, and good enough to
 * answer the only question asked of it: "is this the same content as last
 * time?" A collision would cost one skipped version, not corruption.
 */
function fingerprintCanvas(canvas: CanvasDoc): string {
  const json = JSON.stringify(canvas);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + json.length.toString(36);
}

function blankDb(): Db {
  return {
    preferences: blankPreferences(),
    versions: [],
    tenants: [],
    projects: [],
    campaigns: [],
    documents: [],
    modules: [],
  };
}

/** `rotation` post-dates the first canvases; default it rather than migrate. */
function withRotation(
  nodes: Record<string, CanvasNode> | undefined,
): Record<string, CanvasNode> {
  if (!nodes) return {};
  const out: Record<string, CanvasNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    out[id] = node.rotation === undefined ? { ...node, rotation: 0 } : node;
  }
  return out;
}

function withNodeDefaults(canvas: CanvasDoc | undefined): CanvasDoc {
  if (!canvas) return emptyCanvas();
  return { ...canvas, nodes: withRotation(canvas.nodes) };
}

/** Stable id for the implicit single tenant, so it survives reseeds. */
export const DEFAULT_TENANT_ID = "tnt_default";

export function defaultTenant(): Tenant {
  const ts = nowIso();
  return {
    id: DEFAULT_TENANT_ID,
    name: "Acme",
    slug: "acme",
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Fired after every write so open views can refetch. */
export const STORE_EVENT = "typegrid:changed";

/**
 * localStorage-backed Repository. Intentionally dumb: read the whole blob,
 * mutate, write it back. At this data size that costs nothing, and it keeps the
 * swap to Firebase a pure drop-in.
 */
export class LocalRepository implements Repository {
  private read(): Db {
    if (typeof window === "undefined") return blankDb();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankDb();
      const parsed = JSON.parse(raw) as Partial<Db>;
      return {
        preferences: { ...blankPreferences(), ...(parsed.preferences ?? {}) },
        // Stores written before the tenant abstraction have none; synthesise
        // the implicit one rather than forcing a migration.
        tenants:
          parsed.tenants && parsed.tenants.length > 0
            ? parsed.tenants
            : [defaultTenant()],
        // `color` was added after v2 shipped, same as `releaseAt` below.
        projects: (parsed.projects ?? []).map((p) => ({
          ...p,
          tenantId: p.tenantId ?? DEFAULT_TENANT_ID,
          color: isProjectColor(p.color) ? p.color : DEFAULT_PROJECT_COLOR,
        })),
        versions: parsed.versions ?? [],
        campaigns: parsed.campaigns ?? [],
        // `releaseAt` was added after v2 shipped. Defaulting it on read keeps
        // older stores readable without a version bump or a migration step.
        documents: (parsed.documents ?? []).map((d) => ({
          ...d,
          releaseAt: d.releaseAt ?? null,
          canvas: withNodeDefaults(d.canvas),
        })),
        modules: (parsed.modules ?? []).map((m) => ({
          ...m,
          nodes: withRotation(m.nodes),
          tenantId: m.tenantId ?? DEFAULT_TENANT_ID,
          // Stores predating the split held copy-on-drop components, which is
          // exactly what a template is.
          kind: m.kind ?? "template",
        })),
      };
    } catch {
      return blankDb();
    }
  }

  private write(db: Db): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    window.dispatchEvent(new CustomEvent(STORE_EVENT));
  }

  /** Replaces the entire store. Used by the seeder and by "reset demo data". */
  async replaceAll(db: Db): Promise<void> {
    this.write(db);
  }

  async isEmpty(): Promise<boolean> {
    return this.read().projects.length === 0;
  }

  // -- Preferences ----------------------------------------------------------

  async getPreferences(): Promise<UserPreferences> {
    return this.read().preferences;
  }

  async updatePreferences(
    patch: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const db = this.read();
    db.preferences = { ...db.preferences, ...patch };
    this.write(db);
    return db.preferences;
  }

  // -- Versions -------------------------------------------------------------

  async listVersions(
    targetType: VersionTargetType,
    targetId: string,
  ): Promise<CanvasVersion[]> {
    return this.read()
      .versions.filter(
        (v) => v.targetType === targetType && v.targetId === targetId,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async captureVersion(
    targetType: VersionTargetType,
    targetId: string,
    canvas: CanvasDoc,
    options: { separate?: boolean } = {},
  ): Promise<CanvasVersion | null> {
    const db = this.read();
    const ts = nowIso();
    const fingerprint = fingerprintCanvas(canvas);

    const mine = db.versions
      .filter((v) => v.targetType === targetType && v.targetId === targetId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const newest = mine[0];

    // Nothing actually changed — autosave fires on plenty of no-ops.
    if (newest && newest.fingerprint === fingerprint) return null;

    // Still inside the same editing burst: fold into the previous entry rather
    // than spending a slot every few seconds of typing.
    if (
      newest &&
      !options.separate &&
      Date.now() - new Date(newest.updatedAt).getTime() < VERSION_COALESCE_MS
    ) {
      const target = db.versions.find((v) => v.id === newest.id)!;
      target.canvas = canvas;
      target.fingerprint = fingerprint;
      target.updatedAt = ts;
      this.write(db);
      return target;
    }

    const version: CanvasVersion = {
      id: newId("ver"),
      targetType,
      targetId,
      canvas,
      fingerprint,
      createdAt: ts,
      updatedAt: ts,
    };
    db.versions.push(version);

    // Keep only the newest `versionLimit` for this target.
    const limit = Math.max(1, db.preferences.versionLimit ?? DEFAULT_VERSION_LIMIT);
    const keep = new Set(
      db.versions
        .filter((v) => v.targetType === targetType && v.targetId === targetId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((v) => v.id),
    );
    db.versions = db.versions.filter(
      (v) =>
        !(v.targetType === targetType && v.targetId === targetId) || keep.has(v.id),
    );

    this.write(db);
    return version;
  }

  async getVersion(id: string): Promise<CanvasVersion | null> {
    return this.read().versions.find((v) => v.id === id) ?? null;
  }

  // -- Tenant ---------------------------------------------------------------

  async getTenant(): Promise<Tenant> {
    return this.read().tenants[0] ?? defaultTenant();
  }

  // -- Projects -------------------------------------------------------------

  async listProjects(): Promise<Project[]> {
    return [...this.read().projects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    return this.read().projects.find((p) => p.slug === slug) ?? null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const db = this.read();
    const ts = nowIso();
    const project: Project = {
      id: newId("prj"),
      tenantId: db.tenants[0]?.id ?? DEFAULT_TENANT_ID,
      name: input.name,
      slug: uniqueSlug(
        input.name,
        db.projects.map((p) => p.slug),
      ),
      description: input.description ?? "",
      color: input.color ?? nextFreeColor(db.projects.map((p) => p.color)),
      createdAt: ts,
      updatedAt: ts,
    };
    db.projects.push(project);
    this.write(db);
    return project;
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    const db = this.read();
    const project = db.projects.find((p) => p.id === id);
    if (!project) throw new Error(`Project ${id} not found`);
    Object.assign(project, patch, { id, updatedAt: nowIso() });
    this.write(db);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    const db = this.read();
    const campaignIds = db.campaigns
      .filter((c) => c.projectId === id)
      .map((c) => c.id);
    db.projects = db.projects.filter((p) => p.id !== id);
    db.campaigns = db.campaigns.filter((c) => c.projectId !== id);
    db.documents = db.documents.filter((d) => !campaignIds.includes(d.campaignId));
    db.modules = db.modules.filter((m) => m.projectId !== id);
    this.write(db);
  }

  // -- Campaigns ------------------------------------------------------------

  async listCampaigns(projectId: string): Promise<Campaign[]> {
    return this.read()
      .campaigns.filter((c) => c.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCampaignBySlug(
    projectId: string,
    slug: string,
  ): Promise<Campaign | null> {
    return (
      this.read().campaigns.find(
        (c) => c.projectId === projectId && c.slug === slug,
      ) ?? null
    );
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const db = this.read();
    const ts = nowIso();

    const locales = dedupeLocales(input.locales ?? ["en"]);
    const defaultLocale =
      input.defaultLocale && locales.includes(normalizeLocale(input.defaultLocale))
        ? normalizeLocale(input.defaultLocale)
        : locales[0];

    const siblings = db.campaigns.filter((c) => c.projectId === input.projectId);
    const campaign: Campaign = {
      id: newId("cmp"),
      projectId: input.projectId,
      name: input.name,
      slug: uniqueSlug(
        input.name,
        siblings.map((c) => c.slug),
      ),
      locales,
      defaultLocale,
      metadata: input.metadata ?? [],
      createdAt: ts,
      updatedAt: ts,
    };
    db.campaigns.push(campaign);

    // A campaign is meaningless without documents — create one per locale.
    for (const locale of locales) {
      db.documents.push(
        blankDocument(campaign.id, locale, ts, input.releaseAt ?? null),
      );
    }

    this.write(db);
    return campaign;
  }

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const db = this.read();
    const campaign = db.campaigns.find((c) => c.id === id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    Object.assign(campaign, patch, { id, updatedAt: nowIso() });
    this.write(db);
    return campaign;
  }

  async deleteCampaign(id: string): Promise<void> {
    const db = this.read();
    db.campaigns = db.campaigns.filter((c) => c.id !== id);
    db.documents = db.documents.filter((d) => d.campaignId !== id);
    this.write(db);
  }

  // -- Locales --------------------------------------------------------------

  async addLocales(
    campaignId: string,
    rawLocales: string[],
    options: AddLocalesOptions = {},
  ): Promise<TypeDocument[]> {
    const db = this.read();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const ts = nowIso();
    const source = db.documents.find(
      (d) =>
        d.campaignId === campaignId &&
        d.locale === (options.copyFromLocale ?? campaign.defaultLocale),
    );
    // Fall back to the source document's date so a new translation inherits
    // the schedule it is being translated for.
    const releaseAt =
      options.releaseAt !== undefined
        ? options.releaseAt
        : (source?.releaseAt ?? null);

    const created: TypeDocument[] = [];
    for (const raw of rawLocales) {
      const locale = normalizeLocale(raw);
      // Skip blanks and duplicates so a multi-select submit is idempotent.
      if (!locale || campaign.locales.includes(locale)) continue;

      const document: TypeDocument = {
        id: newId("doc"),
        campaignId,
        locale,
        releaseAt,
        // Start from the source canvas so translating means editing copy, not
        // rebuilding the layout.
        canvas: source ? structuredClone(source.canvas) : emptyCanvas(),
        createdAt: ts,
        updatedAt: ts,
      };
      campaign.locales.push(locale);
      db.documents.push(document);
      created.push(document);
    }

    if (created.length === 0) return [];

    campaign.updatedAt = ts;
    this.write(db);
    return created;
  }

  async removeLocale(campaignId: string, locale: string): Promise<void> {
    const db = this.read();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (campaign.defaultLocale === locale) {
      throw new Error(
        "Cannot remove the default locale — make another locale the default first",
      );
    }
    campaign.locales = campaign.locales.filter((l) => l !== locale);
    campaign.updatedAt = nowIso();
    db.documents = db.documents.filter(
      (d) => !(d.campaignId === campaignId && d.locale === locale),
    );
    this.write(db);
  }

  async setDefaultLocale(campaignId: string, locale: string): Promise<Campaign> {
    const db = this.read();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (!campaign.locales.includes(locale)) {
      throw new Error(`${locale} is not a locale of this campaign`);
    }
    campaign.defaultLocale = locale;
    campaign.updatedAt = nowIso();
    this.write(db);
    return campaign;
  }

  // -- Documents ------------------------------------------------------------

  async listDocuments(campaignId: string): Promise<TypeDocument[]> {
    const db = this.read();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    const order = campaign?.locales ?? [];
    return db.documents
      .filter((d) => d.campaignId === campaignId)
      // Default locale first, then campaign locale order.
      .sort((a, b) => {
        if (a.locale === campaign?.defaultLocale) return -1;
        if (b.locale === campaign?.defaultLocale) return 1;
        return order.indexOf(a.locale) - order.indexOf(b.locale);
      });
  }

  async listDocumentsByProject(projectId: string): Promise<TypeDocument[]> {
    const db = this.read();
    const campaignIds = new Set(
      db.campaigns.filter((c) => c.projectId === projectId).map((c) => c.id),
    );
    // Ordering is left to the caller — the tree groups by campaign and follows
    // each campaign's own locale order.
    return db.documents.filter((d) => campaignIds.has(d.campaignId));
  }

  async listSchedule(projectId?: string): Promise<ScheduleRow[]> {
    const db = this.read();
    const projects = new Map(db.projects.map((p) => [p.id, p]));
    const campaigns = new Map(db.campaigns.map((c) => [c.id, c]));

    const rows: ScheduleRow[] = [];
    for (const document of db.documents) {
      const campaign = campaigns.get(document.campaignId);
      if (!campaign) continue;
      if (projectId && campaign.projectId !== projectId) continue;
      const project = projects.get(campaign.projectId);
      if (!project) continue;
      rows.push({ document, campaign, project });
    }
    return rows;
  }

  async listNavigation(projectId?: string): Promise<NavigationData> {
    const db = this.read();
    const projects = projectId
      ? db.projects.filter((p) => p.id === projectId)
      : [...db.projects].sort((a, b) => a.name.localeCompare(b.name));

    const projectIds = new Set(projects.map((p) => p.id));
    const campaigns = db.campaigns
      .filter((c) => projectIds.has(c.projectId))
      .sort((a, b) => a.name.localeCompare(b.name));

    const campaignIds = new Set(campaigns.map((c) => c.id));
    const documents = db.documents.filter((d) => campaignIds.has(d.campaignId));

    return { projects, campaigns, documents };
  }

  async setDocumentRelease(
    documentId: string,
    releaseAt: IsoDate | null,
  ): Promise<TypeDocument> {
    const db = this.read();
    const document = db.documents.find((d) => d.id === documentId);
    if (!document) throw new Error(`Document ${documentId} not found`);
    document.releaseAt = releaseAt;
    document.updatedAt = nowIso();
    this.write(db);
    return document;
  }

  async getDocument(id: string): Promise<TypeDocument | null> {
    return this.read().documents.find((d) => d.id === id) ?? null;
  }

  async getDocumentByLocale(
    campaignId: string,
    locale: string,
  ): Promise<TypeDocument | null> {
    return (
      this.read().documents.find(
        (d) => d.campaignId === campaignId && d.locale === locale,
      ) ?? null
    );
  }

  async saveCanvas(documentId: string, canvas: CanvasDoc): Promise<void> {
    const db = this.read();
    const document = db.documents.find((d) => d.id === documentId);
    if (!document) throw new Error(`Document ${documentId} not found`);
    document.canvas = canvas;
    document.updatedAt = nowIso();
    this.write(db);
  }

  // -- Modules --------------------------------------------------------------

  async listModules(projectId?: string): Promise<Module[]> {
    return this.read()
      .modules.filter(
        (m) => m.projectId === null || !projectId || m.projectId === projectId,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listGlobalModules(): Promise<Module[]> {
    return this.read()
      .modules.filter((m) => m.projectId === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getModuleBySlug(slug: string): Promise<Module | null> {
    return this.read().modules.find((m) => m.slug === slug) ?? null;
  }

  async createModule(input: CreateModuleInput): Promise<Module> {
    const db = this.read();
    const ts = nowIso();

    // A module with no subtree yet gets an empty component to draw into, so
    // the canvas editor always has exactly one root to work with.
    const seeded =
      input.nodes && input.rootId
        ? { nodes: input.nodes, rootId: input.rootId, size: input.size }
        : emptyModuleSubtree(input.name);

    const record: Module = {
      id: newId("mod"),
      tenantId: db.tenants[0]?.id ?? DEFAULT_TENANT_ID,
      kind: input.kind ?? "template",
      projectId: input.projectId,
      name: input.name,
      slug: uniqueSlug(
        input.name,
        db.modules.map((m) => m.slug),
      ),
      tags: input.tags ?? [],
      nodes: seeded.nodes,
      rootId: seeded.rootId,
      size: seeded.size ?? { w: 600, h: 200 },
      createdAt: ts,
      updatedAt: ts,
    };
    db.modules.push(record);
    this.write(db);
    return record;
  }

  async updateModule(id: string, patch: Partial<Module>): Promise<Module> {
    const db = this.read();
    const record = db.modules.find((m) => m.id === id);
    if (!record) throw new Error(`Module ${id} not found`);
    Object.assign(record, patch, { id, updatedAt: nowIso() });
    this.write(db);
    return record;
  }

  async deleteModule(id: string): Promise<void> {
    const db = this.read();
    db.modules = db.modules.filter((m) => m.id !== id);
    this.write(db);
  }
}

/** An empty component sized like an email body, ready to be filled in. */
function emptyModuleSubtree(name: string): {
  nodes: Record<string, CanvasNode>;
  rootId: string;
  size: Size;
} {
  const size: Size = { w: 600, h: 200 };
  const component = createComponent(name, { x: 0, y: 0, ...size });
  return { nodes: { [component.id]: component }, rootId: component.id, size };
}

function blankDocument(
  campaignId: string,
  locale: string,
  ts: string,
  releaseAt: IsoDate | null,
): TypeDocument {
  return {
    id: newId("doc"),
    campaignId,
    locale,
    releaseAt,
    canvas: emptyCanvas(),
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Normalizes, drops blanks and de-duplicates while preserving order. */
function dedupeLocales(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const locale = normalizeLocale(raw);
    if (locale && !seen.has(locale)) {
      seen.add(locale);
      out.push(locale);
    }
  }
  return out.length > 0 ? out : ["en"];
}

export type { Db };
