import type { ProjectColor } from "@/lib/colors";
import type {
  Campaign,
  CanvasDoc,
  CanvasVersion,
  IsoDate,
  MetadataField,
  Module,
  ModuleKind,
  Project,
  Tenant,
  TypeDocument,
  UserPreferences,
  VersionTargetType,
} from "@/lib/types";

/**
 * Storage contract for the whole app.
 *
 * Every method is async even though the current implementation is synchronous
 * localStorage — that is deliberate. Swapping in Firebase later means writing a
 * second implementation of this interface and changing one line in `index.ts`,
 * with no call-site churn.
 */
export interface Repository {
  /** The current tenant. Single and implicit for now — there is no switcher. */
  getTenant(): Promise<Tenant>;

  // Preferences
  getPreferences(): Promise<UserPreferences>;
  updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences>;

  // Versions
  listVersions(
    targetType: VersionTargetType,
    targetId: string,
  ): Promise<CanvasVersion[]>;
  /**
   * Records the canvas if it differs from the newest version. Returns null when
   * nothing changed. Saves inside the same editing burst fold into the previous
   * entry instead of consuming a slot; pass `separate` to force a fresh entry,
   * which a restore needs so the state it was restored *from* survives.
   */
  captureVersion(
    targetType: VersionTargetType,
    targetId: string,
    canvas: CanvasDoc,
    options?: { separate?: boolean },
  ): Promise<CanvasVersion | null>;
  getVersion(id: string): Promise<CanvasVersion | null>;

  // Projects
  listProjects(): Promise<Project[]>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Campaigns
  listCampaigns(projectId: string): Promise<Campaign[]>;
  getCampaignBySlug(projectId: string, slug: string): Promise<Campaign | null>;
  /** Also creates one document per locale in `locales`. */
  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;

  /**
   * Adds locales to the campaign and creates a document for each, in one write.
   * Each new document starts as a copy of `copyFromLocale`'s canvas (the
   * campaign's default locale when omitted) — the natural starting point for a
   * translation. Locales already on the campaign are skipped rather than
   * throwing, so a multi-select picker can submit its whole selection.
   */
  addLocales(
    campaignId: string,
    locales: string[],
    options?: AddLocalesOptions,
  ): Promise<TypeDocument[]>;
  /** Removes a locale and its document. Refuses to remove the default locale. */
  removeLocale(campaignId: string, locale: string): Promise<void>;
  setDefaultLocale(campaignId: string, locale: string): Promise<Campaign>;

  // Documents (one per locale)
  listDocuments(campaignId: string): Promise<TypeDocument[]>;
  /** Every document across every campaign in a project, for the tree and schedule. */
  listDocumentsByProject(projectId: string): Promise<TypeDocument[]>;
  /** Sets or clears a document's expected release date. */
  setDocumentRelease(
    documentId: string,
    releaseAt: IsoDate | null,
  ): Promise<TypeDocument>;

  /**
   * Every document joined to its campaign and project, for the schedule
   * heatmaps. Scoped to one project when `projectId` is given, otherwise
   * across all of them.
   */
  listSchedule(projectId?: string): Promise<ScheduleRow[]>;

  /**
   * Projects, campaigns and documents for the navigation tree. Scoped to one
   * project when `projectId` is given, otherwise the whole tenant.
   */
  listNavigation(projectId?: string): Promise<NavigationData>;
  getDocument(id: string): Promise<TypeDocument | null>;
  getDocumentByLocale(
    campaignId: string,
    locale: string,
  ): Promise<TypeDocument | null>;
  saveCanvas(documentId: string, canvas: CanvasDoc): Promise<void>;

  // Modules (saved, reusable components)
  /** Global modules, plus this project's own when `projectId` is given. */
  listModules(projectId?: string): Promise<Module[]>;
  /** Every tenant-wide module and template, for the Modules library. */
  listGlobalModules(): Promise<Module[]>;
  getModuleBySlug(slug: string): Promise<Module | null>;
  createModule(input: CreateModuleInput): Promise<Module>;
  updateModule(id: string, patch: Partial<Module>): Promise<Module>;
  deleteModule(id: string): Promise<void>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: ProjectColor;
}

/**
 * One scheduled document joined to its campaign and project.
 *
 * A read model rather than three round trips plus a client-side join: both the
 * project schedule and the cross-project home schedule need exactly this shape.
 */
export interface ScheduleRow {
  document: TypeDocument;
  campaign: Campaign;
  project: Project;
}

/**
 * Everything the navigation tree draws, in one read.
 *
 * Kept flat rather than pre-nested: the tree groups it client-side anyway, and
 * a flat shape is what a real backend would return from three indexed queries.
 */
export interface NavigationData {
  projects: Project[];
  campaigns: Campaign[];
  documents: TypeDocument[];
}

export interface CreateCampaignInput {
  projectId: string;
  name: string;
  locales?: string[];
  defaultLocale?: string;
  metadata?: MetadataField[];
  /** Applied to every locale document created with the campaign. */
  releaseAt?: IsoDate | null;
}

export interface AddLocalesOptions {
  /** Canvas to clone from. Defaults to the campaign's source locale. */
  copyFromLocale?: string;
  /** Expected release date for the new documents. */
  releaseAt?: IsoDate | null;
}

export interface CreateModuleInput {
  /** null = global to the tenant. */
  projectId: string | null;
  /** Defaults to `template` — a plain, freely editable copy. */
  kind?: ModuleKind;
  name: string;
  tags?: string[];
  /** Omit to start from an empty component the user fills on the canvas. */
  nodes?: Module["nodes"];
  rootId?: string;
  size?: Module["size"];
}
