# TypeGrid — design log

A running, timestamped record of the decisions behind the codebase: what we chose,
what we rejected, and why. Append a new entry whenever a decision is made or
reversed — don't rewrite history in place.

Format: `## YYYY-MM-DD HH:MM TZ — <decision>` followed by **Context / Decision /
Why / Consequences**.

---

## 2026-08-03 12:00 IST — Product shape and hierarchy

**Context.** `ai_instructions.txt` scopes TypeGrid as a webapp for authoring
different *surfaces* (email, website, …), with multi-locale authoring,
auto-translation between locales, and per-surface metadata injected into
documents via `${some-key}`.

**Decision.** Fix the content hierarchy at five levels:

```
Project → Document → Template → Component → Entity
```

- **Project** — a workspace (e.g. "Acme Growth").
- **Document** — a set of templates for exactly *one* surface. Owns the locale
  list and the metadata keys.
- **Template** — one authored artefact, owns a canvas.
- **Component** — a *group* of entities. The user's word for a saved, reusable
  one is a **module**.
- **Entity** — a leaf: text, button, image, area, divider, spacer.

**Why.** Surface belongs on the Document, not the Template, so every template
underneath inherits it and the URL can carry it. Metadata also belongs on the
Document so tokens are shared across a family of templates.

**Consequences.** A template cannot mix surfaces. Moving a template between
surfaces means moving it between documents.

---

## 2026-08-03 12:10 IST — Stack: Next.js + TypeScript + shadcn/ui + monospace

**Decision.** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4,
shadcn/ui on the **radix** base with the `nova` preset, Zustand + Immer for
editor state, `nanoid` for ids. Geist Mono everywhere in the app chrome.

**Why.** Stated preferences from the user. shadcn v4 defaults to the Base UI
component set; we picked `radix` explicitly because it is the long-standing,
better-documented shadcn/ui foundation.

**Consequences.** `globals.css` deliberately maps Tailwind's `--font-sans` to
Geist Mono, so `font-sans` resolves to the mono face app-wide. Canvas *content*
is unaffected — authored entities default to `Helvetica, Arial, sans-serif`,
which is what email clients can actually render.

**Note.** Local Node is v20.12.0; `shadcn@4` and `undici` both want ≥20.18.1 and
emit `EBADENGINE` warnings. Everything installed and built fine, but a Node bump
would silence them.

---

## 2026-08-03 12:20 IST — Persistence: localStorage now, Firebase later

**Context.** No backend exists yet; the user plans to move to Firebase.

**Decision.** Define a single `Repository` interface (`src/lib/repo/repository.ts`)
covering projects, documents, templates and modules. Implement it once against
localStorage (`local-repository.ts`). `src/lib/repo/index.ts` is the only file
that names a concrete backend.

**Why.** Every method is `async` even though localStorage is synchronous —
that's deliberate. Swapping in Firebase means writing `firebase-repository.ts`
and changing one line; no call site changes.

**Consequences.**
- Writes dispatch a `typegrid:changed` window event; `useRepoQuery` listens and
  refetches, which keeps panels in sync without a client cache library.
- The whole store is one JSON blob under `typegrid:v1`. Fine at this data size,
  and it makes "reset demo data" trivial. It will not survive multi-tab
  concurrent editing — acceptable until Firebase lands.

---

## 2026-08-03 12:30 IST — Canvas model: absolute frames, free positioning

**Context.** Choice between (a) email-realistic vertical stacking inside frames,
and (b) true Figma-style free positioning.

**Decision.** Free positioning. Every node — including children of a component —
stores an **absolute world-space** `frame: {x, y, w, h}`.

**Why.** The user chose maximum design freedom over lossless email export.
Absolute frames (rather than nested parent-relative transforms) make
hit-testing, marquee selection, resize handles and bounds math trivial: no
transform stack to walk.

**Consequences.**
- Moving a component = apply the same delta to every descendant
  (`framesForMove`). Resizing = scale descendants proportionally
  (`framesForResize`).
- `reflowAncestors` re-wraps every ancestor component's frame after any child
  change, so group bounds stay honest.
- **Open risk:** HTML email export will be lossy. Free-positioned entities have
  no direct table/row equivalent. When export is built it will need either
  absolute-positioning CSS (poor client support) or a "flatten to rows" pass
  that approximates the layout. Flagged now so it isn't a surprise later.

---

## 2026-08-03 12:45 IST — URL carries the surface

**Decision.** The editor lives at:

```
/p/<project-slug>/<document-slug>/<surface>/<template-slug>
```

e.g. `/p/acme-growth/lifecycle-emails/email/welcome-email`.

`[surface]` is a real dynamic segment, validated against the owning document.

**Why.** The user's requirement was that the URL slug carry "email". A dynamic
segment rather than a hardcoded `email/` folder keeps `web` and `push` working
through the same route.

**Consequences.** A URL whose surface disagrees with its document is **redirected**
to the correct one, not 404'd — the template still exists, the URL was just stale.

---

## 2026-08-03 13:00 IST — Selection model: Figma semantics

**Decision.**
- A click selects the **outermost** ancestor (so you grab whole components).
- Double-click on a component **drills in** (isolation); the next click selects
  its direct children.
- Double-click on text/button opens an **inline editor** in world space.
- `Escape` unwinds: editing → isolation → selection.
- Resize handles appear only for a **single** selected node.

**Why.** Matches what anyone who has used Figma expects. Multi-select resize was
skipped deliberately: scaling a mixed selection is ambiguous, so multi-select
stays move-only.

---

## 2026-08-03 13:05 IST — Undo history via Immer snapshots

**Decision.** History is a stack of whole `CanvasDoc` snapshots (limit 60).
`beginHistory()` pushes the current doc before a mutation.

**Why.** Immer already produces immutable, structurally-shared docs, so a
"snapshot" is just a reference copy — effectively free. A command/inverse-patch
system would be more memory-efficient but far more code to get right.

**Consequences.** Drag gestures call `beginHistory()` **lazily**, on the first
real movement, so a click that doesn't move anything doesn't pollute the stack.

---

## 2026-08-03 13:15 IST — Modules: copy-on-drop, not linked instances

**Decision.** Saving a selection as a module (`extractModule`) deep-clones the
subtree with fresh ids and normalizes frames to `(0, 0)`. Dropping a module
clones again. The instance records `moduleId` for provenance only.

**Why.** Ships the reuse flow the user asked for without committing to
override/propagation semantics, which is a much bigger design problem.

**Consequences.** Editing a module later does **not** update existing instances.
`moduleId` is already stored, so true linked instances remain possible later.

---

## 2026-08-03 13:25 IST — Autosave

**Decision.** Debounced 600 ms after the last change, writing the whole canvas.
The editor loads a template exactly once per `template.id`
(guarded by a ref).

**Why.** Our own save fires the store-changed event, which refetches the
template. Without the guard, that refetch would reload the canvas mid-edit and
wipe undo history.

**Consequences.** `useRepoQuery` exposes `loading` as "never settled" and callers
branch on `data === undefined` instead — otherwise a background refetch would
flash a spinner over live content.

---

## 2026-08-03 13:35 IST — Verified end to end in Chrome

Confirmed working against the running dev server: seeding, click-to-place,
HTML5 drag-and-drop onto the canvas (drop landed grid-snapped under the
pointer), component drag with children, undo/redo, marquee selection, `⌘G`
grouping with correct nesting in the layers tree, module save + instantiate,
autosave, and `${token}` resolution.

Two rough edges found and fixed in the process:

1. Palette and module-library placement used hardcoded pixel offsets to guess
   the viewport centre. Replaced with `viewportSize` published to the store by
   the canvas's `ResizeObserver`, plus `addEntityCentered` /
   `instantiateModuleCentered`. This also let `zoomToFit` / `zoomByFactor` drop
   their `screen` parameters, removing size plumbing from the toolbar and shell.
2. Template thumbnails on the document page rendered raw `${first_name}`.
   Wrapped the list in a `TokenProvider` seeded from the document's metadata.

---

## 2026-08-04 11:30 IST — **Narrowed to email only, and restructured the hierarchy**

> Supersedes the 2026-08-03 12:00 entry. That hierarchy is no longer accurate.

**Context.** The user scoped the tool down: email is the only surface, and the
hierarchy should name things the way an email team actually talks.

**Decision.** Two changes, made together:

1. **Email only.** `SurfaceKind` is deleted. There is no `web` or `push`.
   Modules lost their `surface` field and are now reusable everywhere.
2. **New hierarchy:**

```
Project → Campaign → Document → Component → Entity
```

Mapping from the old shape:

| Old | New | Notes |
|---|---|---|
| Project | Project | unchanged |
| Document *(surface + locales + metadata)* | **Campaign** | one email, e.g. "Welcome Email" |
| Template *(owned the canvas)* | **Document** | the canvas for **one locale** |
| Component / Entity | unchanged | |

**Why this shape.** Locale is no longer a list hanging off a container with a
single canvas — it is the identity of the editable thing. A campaign is one
email; a document is that email in one language. That makes the localisation
story structural rather than bolted on: each locale gets its own canvas, its own
URL, and its own undo history, while the campaign holds what must stay common
(the locale set, the source locale, and the `${metadata}` keys).

**Consequences.**

- `locale` is unique within a campaign, so it *is* the document's slug. There is
  no separate slug field on documents.
- Creating a campaign creates one document per locale immediately — a campaign
  with no documents is meaningless.
- `addLocale` seeds the new document as a **copy of the source locale's canvas**,
  not a blank one. Translating should mean editing copy, not rebuilding layout.
  This is the hook the future auto-translation pass plugs into.
- The default locale is the *source*: it cannot be deleted, and `setDefaultLocale`
  must be used to move that role before removing it.
- Switching locale in the editor is a **navigation**, not in-place state. Each
  locale is a separate URL and a separate undo stack. Simpler and more honest
  than trying to keep N canvases live at once.

**URL.** `email` stays as a literal path segment even though it is now the only
surface:

```
/p/<project-slug>/email/<campaign-slug>/<locale>
/p/acme-growth/email/welcome-email/de
```

The user's original requirement was that the URL carry "email". Keeping it costs
nothing, reads well, and leaves room if surfaces ever come back. Flagging it
because the alternative — dropping the now-redundant segment — is defensible.

**Storage break.** Bumped the localStorage key to `typegrid:v2`. v1 data is
structurally incompatible (no campaigns, documents keyed differently). It is
**not migrated and not deleted** — it only ever held demo content, and leaving it
alone is recoverable if that turns out to be wrong.

**Seed data now demonstrates the locale model.** "Welcome Email" ships as `en`
(source), `de` (genuinely translated), and `ja` (an untranslated copy of `en`) —
which is the realistic state of a new locale, and makes the "needs translation"
problem visible rather than hypothetical.

**Observation worth acting on later.** The German CTA renders as
"Arbeitsbereich öf…" — the translated label overflows a button sized for
English. Text expansion across locales is a real, recurring problem for this
tool, and nothing currently warns about it. A per-locale overflow indicator is
an obvious future feature.

---

## 2026-08-04 12:00 IST — Locale picker: flag grid + dropdown

**Context.** Locales were being typed as a comma-separated string. Unforgiving,
and it gave no sense of what was available.

**Decision.** Two shared components in `src/components/locale/`:

- **`LocaleGrid`** — searchable multi-select checkbox grid. Each cell is flag +
  code + `Language · Country`. Search matches code, language *or* country
  ("japan" finds `ja`). Locales already on the campaign render checked, disabled
  and badged `ADDED` rather than being hidden, so the grid shows the whole
  picture. A free-text field takes any BCP-47 tag not in the catalog.
- **`LocaleSelect`** — single-select dropdown with the same anatomy, used for
  the editor's locale switcher and the "start from" source picker.

**On flags — the known trade-off.** Flags are *countries*, languages are not.
Arabic is not Saudi Arabia; Spanish is not only Spain; English has no flag. This
is a well-known i18n anti-pattern and the reason to be careful with it.

We use them anyway, because they make a thirty-row picker scannable at a glance,
but with a hard rule: **every surface that shows a flag also shows the locale
code.** The flag is decoration; the code carries the identity. `LocaleChip`,
`LocaleGrid`, `LocaleSelect` and both list pages all follow this.

**Implementation notes.**

- Flags are derived, not stored: a region code maps onto the Unicode
  regional-indicator block (`String.fromCodePoint(127397 + charCode)`). No image
  assets, no sprite sheet, no network.
- Tags without a region (`de`, `ja`) get one from a curated
  `DEFAULT_REGION` map. That map is where the debatable calls live — `en` → US,
  `ar` → SA — and it is the single place to change them.
- Language and country names come from `Intl.DisplayNames`, so there is no
  hardcoded name table to drift.
- Chrome on Windows has no flag glyphs and renders the two letters instead
  (`US`, `DE`). That is an acceptable fallback precisely because the code is
  always shown next to it.

**Repository change.** `addLocale` (singular) became **`addLocales`** (plural):
one write, one store event, and locales already present are skipped rather than
throwing — so a multi-select submit is idempotent.

---

## 2026-08-04 12:15 IST — Project tree on the project page

**Decision.** The project page is now two columns: a `ProjectTree` on the left
listing every document in the project as `campaign → locale`, and the campaign
cards on the right.

**Why a tree and not a flat list.** Documents only mean anything relative to
their campaign — `de` on its own is not a thing you can navigate to. The two
levels mirror the data model exactly, and the leaf is the deepest clickable
unit in the app, so the tree doubles as a jump list straight into any canvas.

**Details.**

- Ordering is not stored anywhere new: campaigns come in `listCampaigns` order,
  and locales follow each campaign's own `locales` array with the source hoisted
  first — the same rule the campaign page uses.
- New repository method `listDocumentsByProject(projectId)` so the tree is one
  query instead of one per campaign.
- Leaves are rendered from `campaign.locales`, not from the documents array. A
  locale with no document still shows (dimmed) rather than silently vanishing,
  which would hide a data inconsistency instead of surfacing it.
- Collapse state is local and in-memory. Not persisted — the tree is short and
  the page is not somewhere you live.

**Known inert bit.** The tree highlights the active campaign/document via
`usePathname`, but the tree currently only renders on `/p/<project>`, where
nothing in it can ever match. Kept deliberately: it is four lines, and the
moment this tree is lifted into a shared layout (campaign page, editor) the
highlight is required. Flagging it so it isn't mistaken for working behaviour.

---

## 2026-08-04 13:10 IST — Release dates and the project schedule

**Decision.** Documents gain `releaseAt` — an expected release date — and the
project page gets a month calendar above the tree showing every document's
release across the whole project.

**Why the date lives on the document, not the campaign.** A localized rollout is
usually staggered: source ships first, translations follow. Putting the date on
the campaign would force every locale to ship together and make the calendar a
list of campaigns rather than of actual work. The campaign-level date still
exists in practice — it is just a *default* applied to every document at
creation time, editable per document afterwards.

**`IsoDate` is a calendar date, not a timestamp.** Stored as `YYYY-MM-DD`.
Storing an instant would mean every read converts through a timezone, and a
release "on the 14th" would show as the 13th for anyone west of the line. All of
`src/lib/dates.ts` works in local time and formats by hand rather than going
through `toISOString()`, which silently converts to UTC.

**Where dates are set.**

- **New campaign** — one "Expected release" field applied to every locale
  document created with it.
- **Add locales** — defaults to the *source document's* date, so a new
  translation inherits the schedule it is being translated for.
- **Campaign page** — an inline date field per document, saving on change.

**Calendar behaviour.**

- Fixed 6×7 grid (42 cells), so paging months never changes the page height.
- Weeks start **Monday** — these are work schedules, not US wall calendars.
- Entries show flag + **locale code** + campaign name. The code is there
  deliberately: this is a place where the flag would otherwise be the only
  locale indicator, which the 12:00 entry rules out.
- Past-dated entries render amber, not red. They are "expected release" dates
  that have slipped, not errors.
- Unscheduled documents are **counted in the header, not hidden**. A schedule
  that silently dropped them would make an empty month look like "nothing to
  ship" when the truth is "nothing is planned yet".

**No storage bump.** `releaseAt` is defaulted to `null` when reading documents,
so stores written before this change stay readable. Additive fields do not
justify a version break; the 2026-08-04 11:30 restructure did.

---

## 2026-08-04 14:50 IST — Schedule as a GitHub-style heatmap, project colours

> Replaces the month grid from the 13:10 entry.

**Decision.** The schedule is now a contribution heatmap: one column per week,
one cell per day, intensity by how many documents ship that day. It appears on
the project page scoped to that project, and on the home page across **all**
projects. Projects gain a `color` chosen from twelve at creation.

**Window leans forward.** GitHub's graph looks backwards at what already
happened. A release schedule is mostly forward-looking, so the window starts
4 weeks in the past and runs 53 weeks total — the same one-year strip, weighted
toward what is coming.

**Click a day, not just hover.** A heatmap trades detail for density: you can no
longer read what ships on a date. Hover gives a count via `title`, and clicking
a cell opens a detail list underneath with links into each canvas. That keeps
the navigational value the month grid had.

**Colour carries project identity, intensity carries volume.** On the
cross-project view a cell takes the colour of the project contributing the most
that day (ties break on project name) and the shade comes from the count. A day
mixing projects therefore shows the dominant one, with the full breakdown in the
detail panel. Single-project pages are trivially consistent — every cell is that
project's hue.

**Intensity thresholds are fixed, not relative.** 1 / 2 / 3–4 / 5+. Scaling to
the maximum in view would let one busy day wash out an otherwise active year,
and would make the same date change shade as unrelated data moves.

**Colours are literal hex, not Tailwind classes.** `bg-${color}-500` is built at
runtime and gets purged from the production CSS, so `src/lib/colors.ts` holds
explicit values: a `base` for dots and swatches, plus four heatmap steps. Tuned
for the light UI, which is what the app actually renders — `next-themes` is
installed (a sonner dependency) but there is no provider or toggle, so `.dark`
is never applied.

**New projects default to the first unused colour**, so two projects created
back to back never look alike by accident.

**No storage bump.** `color` defaults on read, exactly like `releaseAt`.

**Dropped:** the "Less → More" legend, at the user's request.

**Layout follow-up.** The grid fills its parent rather than sitting at a fixed
cell size: 53 equal tracks, cells square via `aspect-ratio`, so they grow with
the container (~17px at desktop width instead of 11px). Two things this exposed,
both fixed:

- **Grid, not flex.** `flex-1` across 53 children accumulates sub-pixel rounding
  and overflowed the parent by ~2px — enough to raise a scrollbar. A grid with
  `repeat(53, minmax(0, 1fr))` sizes the tracks against the container exactly.
- **Slack for the hover scale.** `hover:scale-125` on an edge cell pushed past
  the scroll container and raised a scrollbar on hover. The inner box now
  carries `p-1`, which both leaves room and narrows the grid to suit. Verified
  by forcing `scale(1.25)` on all four corner cells and checking
  `scrollWidth`/`scrollHeight` stay equal to the client box.

A `min-w-[620px]` floor plus `overflow-x-auto` keeps cells legible on narrow
screens, where scrolling is the right answer.

---

## 2026-08-04 15:30 IST — Tenant abstraction and the global module library

**Decision.** A `Tenant` sits above projects, and modules gain a first-class
home: `/modules`, reached from a **Global modules** button on the home page.
Modules there are created, renamed, retagged and deleted; their artwork is
edited on a canvas at `/modules/<slug>`.

**Interpretation flagged.** The request said global modules should "only be
edited from the project page i.e there would be a module list which would
facilitate the edit and create; delete also". Read as: the global-modules page
*is* that list, and it owns the full lifecycle. If the intent was instead a
module manager inside each project, that is a different placement — the list
component would move rather than be rebuilt.

**Tenant scope is real but single.** One implicit tenant with a stable id
(`tnt_default`), `tenantId` on `Project` and `Module`, and `repo.getTenant()`.
No switcher and no tenant in the URL. The point is that "global" has an actual
boundary rather than meaning "everything in this browser" — and that the
Firebase migration has a scope key to hang security rules on.

`Module.projectId === null` already meant "available to every project"; that is
now explicitly the tenant-global case, and the editor's save dialog says so.

**A module always has exactly one root.** Creating one with no artwork seeds an
empty component, so the canvas opens with a single root to draw into.

**Bug caught while testing this.** Saving folds the canvas back to a subtree via
`extractModule`, which wraps multiple roots in a *new* component. Add one entity
at the canvas root, save, reload, add another, save — and the module gains a
nesting level every session, accumulating forever. Fixed properly rather than
papered over: the store gained `rootParentId`, and the module editor sets it to
the module's root, so newly created nodes are parented *into* the module instead
of becoming siblings. Verified after the fix: 5 nodes, exactly 1 component, all
children parented to the root, bounds unchanged at 600×280.

The same change fixed a second annoyance — new entities were landing at the
viewport centre, far from a module anchored near the origin, ballooning its
bounds. The editor now zoom-to-fits once the canvas has measured itself, so
"centre" means inside the module.

---

## 2026-08-04 15:55 IST — Two kinds: global modules vs templates

**Decision.** The library is now just **Modules**, holding two kinds that differ
in one thing — what happens when you place them.

| | Global module | Template |
|---|---|---|
| Placed as | a **linked instance** | an independent **copy** |
| Edited | only in the module editor | freely, inside the document |
| Across documents | identical, always | diverges the moment you touch it |

`Module.kind` carries this, and `ComponentNode.linked` marks a placed instance.

**Linked means synced, not referenced.** An instance still stores its subtree —
the canvas model stays self-contained, with no resolve-at-render indirection.
What makes "identical everywhere" true is `syncLinkedInstances`, which rebuilds
every linked instance from its module as the document opens, keeping the
instance's position. Edits therefore land on next open rather than live, which
is the right trade for a mail authoring tool and a fraction of the complexity.

Two edge cases handled rather than left to rot:

- **Module deleted** → the instance keeps its artwork and quietly detaches. The
  alternative, work vanishing from a document because someone tidied the
  library, is unacceptable.
- **Reclassified as a template** → existing instances detach into plain copies,
  matching what that kind means.

**Editing is blocked at the source, not just hidden.** Clicking anything inside
a linked instance selects the *instance*; double-click will not drill in or open
inline text editing; resize handles are suppressed and W/H are disabled in the
inspector — a resize would be discarded on the next sync, so offering it would
be a lie. Position stays free, since sync preserves it. **Detach to edit here**
is the escape hatch.

**Symbols.** `MODULE_KIND_META` is the single source for each kind's icon and
wording, used by the Modules page, the editor's Modules panel and the layers
tree. A linked instance shows the global-module icon in violet instead of the
generic component icon, and does not expand — there is nothing editable inside.

**`isLinkedInstance` returns a plain boolean on purpose.** As a type predicate
narrowing to `ComponentNode` it broke the negative branch: TypeScript concluded
that a non-linked node could not be a component at all, which is nonsense — an
unlinked component is still a component.

**Seed shows both**: the footer is a global module (legally identical
everywhere); the hero and CTA are templates (starting points).

Stores predating the split default to `template`, which is exactly the
copy-on-drop behaviour they already had.

---

## 2026-08-04 16:15 IST — One navigation tree everywhere, with campaign search

> Supersedes the 12:15 entry. `ProjectTree` is now `NavigationTree` and is no
> longer project-only — which also retires the "known inert bit" flagged there.

**Decision.** The tree appears on the home, project and campaign pages, and
gained a search field.

**The project level always renders**, even with one project in scope. I first
collapsed it away as redundant indentation; the user corrected that, and they
are right — the tree's job is to show the hierarchy, and a shape that changes
depending on how many projects you happen to have is harder to read, not
easier. Project → Campaign → locale, everywhere.

**Campaign page shows the whole project, not just itself.** Scoping the tree to
the campaign you are already looking at would make it a restatement of the page.
Scoped to the project, it is navigation: sibling campaigns are one click away,
and the current one is highlighted.

**The active highlight now earns its keep.** It was dead code when the tree only
rendered on `/p/<project>`, where nothing could ever match `usePathname`. On the
campaign page the campaign row matches; from a document URL the locale row does.

**Search matches campaign name, project name *or* locale code**, so "acme", "welcome"
and "de" all narrow usefully. While a query is active every node expands and the
collapsed set is ignored — a match you cannot see is not a match. The header
count reflects the filtered total rather than the full one.

**One query, not three.** Added `listNavigation(projectId?)`, returning flat
`{ projects, campaigns, documents }`. Flat rather than pre-nested because the
tree groups it client-side anyway, and it is the shape a real backend would
return from three indexed queries.

---

## 2026-08-04 16:45 IST — Schedule detail defaults to today; module search

**Schedule detail.** The panel below the heatmap used to say "Pick a day to see
what ships" until you clicked something. It now defaults to **today**, has a
fixed height (`h-32`) and scrolls.

- Defaulting beats prompting: "what ships today" is the question people arrive
  with, and an empty pane below the grid was wasted space.
- Fixed height matters more than it sounds. Without it the page reflows every
  time you click a different day — the content below jumps as the list grows
  and shrinks. A constant box that scrolls keeps the grid still.
- The day header carries the count, so a busy day is legible without scrolling
  to find out how many there are.

**Module search** on both surfaces that list modules — the `/modules` library
and the editor's Modules panel. Matches **name or tag**: the two things people
remember. Sections that lose all their entries say "No match." rather than
disappearing, so the two-kind structure stays visible while filtering.

---

## 2026-08-04 17:15 IST — Bug: entities placed off-screen when unmeasured

**Symptom reported.** After adding entities from the palette they could not be
dragged.

**Actual cause.** They were never where you could reach them. `viewportSize` is
published to the store by the canvas's `ResizeObserver`, and click-to-place
centres against it. `ResizeObserver` delivers its first callback on an
**animation frame** — which never arrives while the tab is backgrounded or
throttled. Until it does, `viewportSize` stays `{0, 0}`, so "the centre of the
viewport" resolves to a *negative* world coordinate and the entity lands just
outside the top-left of the visible area. Nothing to drag, because nothing
visible was created.

Dragging itself was never broken: with the entities on-screen, three in a row
drag correctly.

**Fix, at the cause.** The canvas now measures its own box with
`getBoundingClientRect()` in the mount effect and publishes that immediately,
keeping the observer only for subsequent resizes. There is no longer a window
in which the app holds a size of zero.

**Plus a guard, because silent off-screen placement is a bad failure mode.**
`viewportCenterWorld` no longer centres on a zero-size box; it falls back to a
point that is definitely in view. If the measurement ever fails again, an entity
appears somewhere sensible instead of vanishing.

**Same root cause hit `zoomToFit`**, which also divides by the viewport size —
it collapsed to a degenerate transform instead of framing the content. Both are
verified working now.

**Lesson worth keeping.** Anything that derives geometry from an asynchronously
measured value needs a defined behaviour for "not measured yet". Treating the
absent value as `0` and doing the arithmetic anyway produces a confident wrong
answer, which is far harder to diagnose than an obvious no-op.

---

## 2026-08-04 17:35 IST — Autosave crash, rich text, on-canvas radius + rotate

### Bug: autosave threw `Document … not found`

Reported as happening on double-click. Double-click is incidental — any nudge
between the two clicks marks the canvas dirty, which schedules an autosave. The
save then wrote to a `document.id` captured in the timer's closure, and threw as
an **unhandled rejection** if that document no longer existed (reset demo data,
a locale removed elsewhere). There was no `.catch` anywhere on the path.

Two fixes, and the second is the one that mattered:

1. Errors are caught and surfaced as a toast instead of escaping.
2. **The save now checks `state.documentId === document.id` before writing.**
   The timer captured the *id* but read the canvas *fresh at fire time* — so
   switching locale with unsaved changes could write the new locale's canvas
   into the old locale's document and silently destroy it. That is a data-loss
   bug that happened to be sitting behind the reported crash. The module editor
   had the same shape and got the same guard.

### Rich text

Text entities now edit in place with a small floating toolbar: bold, italic,
underline, link, clear formatting. Deliberately no lists, headings or font
switching — those do not survive mail clients and would produce markup the
canvas cannot faithfully preview.

- **Stored as HTML**, because the output medium is HTML email; any other format
  would need converting on export anyway.
- **The editable node is uncontrolled.** React seeds `innerHTML` once and then
  leaves the DOM alone, syncing outward on input. Re-rendering a
  `contentEditable` from state on every keystroke resets the caret to the start.
- **`styleWithCSS` is forced off**, so bold emits `<b>` rather than
  `<span style="font-weight:bold">`. Semantic tags survive mail clients; Outlook
  is unreliable with inline-styled spans. Worth checking after the fact — the
  browser default produced spans.
- **Paste is forced to plain text.** Pasted markup from elsewhere is exactly
  what renders unpredictably in email.
- **Button labels stay plain.** Inline markup inside a button would not survive
  email rendering, and the button's own style already governs its appearance.

The toolbar is positioned from `getBoundingClientRect()` of the editable node
rather than by converting world coordinates — the editor lives inside the
transformed world layer, so measuring it gives viewport coordinates directly and
pan/zoom come along for free.

**Two follow-up fixes after the user reported not seeing inline editing at all:**

1. **One double-click, not two.** Nearly all text sits inside a component, and
   the Figma-style rule (first double-click drills into the group, second enters
   the text) meant a single double-click just selected something and appeared to
   do nothing. Double-clicking text now opens the editor directly, isolating its
   parent on the way. Components still drill in as before — but text is what
   this tool is *for*, and it should not be gated behind a concept.
2. **The toolbar is portalled to `<body>`.** It used `position: fixed`, but a
   transformed ancestor becomes the containing block for fixed descendants — so
   sitting inside the world layer it was offset by the pan and scaled by the
   zoom. Easy to miss, because at the default viewport it is only ~120px out.

### Rotation and corner radius on the canvas

- `rotation` (degrees, clockwise about the frame centre) is now on every node.
  **The frame itself stays axis-aligned** — rotation is presentation only, so
  bounds, snapping, marquee selection and reflow all keep working untouched.
  The cost is that a rotated node's *selection bounds* are its unrotated box;
  worth it against rewriting every geometry path.
- Four rotate grips sit just outside the corners. Hold `⇧` for 15° steps.
- One radius grip sits on the top-left diagonal and tracks the corner it
  controls, clamped to half the shorter side so corners can never cross.
  Components do not get one — they have no style of their own.
- **Resize accounts for rotation**: the drag delta is inverse-rotated into the
  node's own space before being applied, so handles behave as they look.
- Resize cursors fall back to a neutral one once rotated; past ~22° the
  directional cursors point the wrong way and actively mislead.

---

## 2026-08-04 18:35 IST — Inline-edit fixes, hold-D duplicate, and a latent Immer bug

### Inline editing

Two things were wrong once the editor was open:

- **The canvas was stealing double-clicks inside the editor.** `onDoubleClick`
  had no `[data-inline-editor]` guard, so double-clicking a word — the normal
  way to select one — went to the canvas instead, and reset the isolation on
  the way. `onPointerDown` already had that guard; the double-click handler
  did not.
- **The node was drawn twice.** The editor renders the text itself, and the
  original stayed painted underneath, ghosting at any edge where the two boxes
  disagreed. The node being edited is now skipped in the paint loop.

### Hold `D` and drag to duplicate

Held `D` arms it; drag leaves the original behind. The copy is made with **zero
offset** so the drag supplies every pixel — a copy that jumped 24px before it
started following the pointer would feel broken.

- The modifier lives in the **store**, not a ref, matching `spacePanning`. That
  makes it observable, which is also how the cursor can switch to `copy` — a
  duplicate should never be a surprise.
- A `window` blur clears it. Alt-tabbing mid-hold would otherwise leave it
  stuck, and every later drag would silently duplicate.
- `duplicateSelection` already pushes history, so the move gesture starts
  pre-committed; otherwise undo would need two presses.

### The bug underneath: duplication never worked at all

Chasing why `D`-drag did nothing turned up an uncaught exception, and the cause
was older than the feature:

```js
set((s) => { cloneSubtree(s.doc.nodes, id, …) })   // s.doc.nodes is a Proxy
```

`cloneSubtree` uses `structuredClone`, and **`structuredClone` throws on a
Proxy**. Immer hands the recipe a draft, so every call threw — meaning **⌘D had
been broken since it was written** and I had never tested it. Cloning now
happens against the committed state *before* `set`, and the drafts only receive
finished plain objects.

Worth stating plainly: I shipped that shortcut without exercising it, and it
took an unrelated feature to expose it. The other `cloneSubtree` call sites were
checked and all read from committed state already.

---

## 2026-08-05 14:10 IST — Double-click hit-tests the model, not the DOM

**Symptom.** Inline editing still did not open on a real double-click, despite
passing every test I had written for it.

**Cause.** `setPointerCapture` retargets the *compatibility mouse events* —
`click`, `dblclick` — to the capturing element. The canvas captures the pointer
on every `pointerdown`, so by the time `dblclick` fired, `e.target` was always
the canvas container. `target.closest("[data-node-id]")` therefore returned
null, the handler treated it as a click on empty canvas, cleared the isolation
and returned.

**Why my tests missed it.** Every one dispatched `dblclick` directly at the node
element, which bypasses precisely the retargeting that was broken. Synthetic
events that skip the mechanism under test prove nothing; I confirmed this twice
and shipped it twice. Verified this time by driving real input and converting
page coordinates into the automation's scaled screenshot space.

**Fix.** Double-click now hit-tests the **model** at the pointer's world
position — walking `rootIds` back to front, descending into components, and
inverse-rotating the point into each node's own space before the contains test.
The DOM target is not consulted at all, so pointer capture cannot lie about it.

That also delivers what was asked for directly: a double-click **anywhere inside
an element** counts, not only where a child div happens to sit. Landing in a
component's empty space resolves to the component and drills in; landing on text
opens the editor wherever in its box you click.

**Lesson, again.** The previous entry recorded shipping `⌘D` without exercising
it. This is the same failure in a different costume: a test that exercises the
code but not the path. When a bug is reported that contradicts a passing test,
the test is the first suspect.

---

## 2026-08-05 14:30 IST — Rebindable keyboard map

**Editor background.** The inline text editor no longer paints white behind
transparent text. The node underneath is hidden while editing, so a white box
hid whatever it sat on and made light text on a dark section unreadable
mid-edit. Transparent now stays transparent.

### The shortcut set

Both requested keys went in as asked — `g` toggles group/ungroup, `q`/`e` send
backward/forward — plus `⇧Q`/`⇧E` for straight to back/front.

The bigger gap was **insert**: every entity needed a trip to the palette, so
single keys now place one — `T` text, `B` button, `I` image, `R` area (rectangle,
as in Figma), `L` divider (line), `S` spacer. Also `⇧L` lock and `⇧H` hide,
which the layers panel had but the keyboard did not.

`g` is a *toggle* rather than two keys: group when several things are selected,
ungroup when it is a lone component. Nothing else is a sensible reading of the
key in either state, so one binding covers both.

### Rebinding

- **`lib/shortcuts.ts` is the single registry**: id, label, group, default
  combo, optional aliases. Adding a shortcut means one entry plus one `case`.
- Combos normalise to strings like `"shift+mod+z"`, where **`mod` folds ⌘ and
  Ctrl together** so one definition covers both platforms.
- **Only overrides are persisted**, not the whole map. Storing every binding
  would freeze today's defaults into every existing user's preferences, so a
  future default change would silently never reach them.
- Rebinding **refuses a combo already in use** and names the owner, rather than
  quietly stealing it and leaving the other action dead.
- Preferences go through the repository like everything else, so they travel
  with the Firebase migration instead of being stranded in `localStorage`.
- While the picker is listening it captures keys on the **capture phase**;
  otherwise pressing `v` to rebind would also switch tools underneath the
  dialog.
- The bindings map is held in a ref updated by an effect, so the global key
  listener mounts once instead of being torn down on every preference change.

**Escape and the arrow keys stay fixed.** Escape is structural — it is how you
get out of anything — and arrows are the nudge gesture. Mouse gestures appear in
the dialog as documentation with no key chip, because a list that omits them
reads as though they do not exist.

---

## 2026-08-05 14:45 IST — Isometric stack overlay for z-order

**Why.** Z-order is invisible while you change it. `Q`/`E` either appear to do
nothing (when nothing overlaps) or change the picture in a way that is hard to
attribute to the key you pressed. A transient overlay answers "where am I in the
pile, and how much room is left" at the moment the question arises, then leaves.

**Shape.** Bottom-right of the canvas, appearing on any z-order change and
lingering 1.8s past the last one, so holding a key keeps it alive. Plates are
drawn `rotateX(58deg) rotateZ(-45deg)` with each sibling one step up in Z.

**Orthographic, not perspective.** An isometric stack should keep every plate the
same size — distance has to read as *order*, not as depth. A perspective
projection would shrink the far plates and imply a spatial meaning that is not
there.

**No labels on the plates.** I tried both and neither worked: skewed 45° and
squashed 58°, a name is decoration rather than information; counter-rotated back
out of the plane, it comes back cramped and overlapping its neighbours. The
plates now carry only ordering and the highlight, and the active node is named
once underneath, where it can simply be read.

**Derived, never stored.** The store only carries a `zOrderNonce` counter. The
sibling list is recomputed from the document on every render, so the overlay
cannot show a stale stack — and it works for children inside a component, not
just canvas roots, because "siblings" means whichever container the node is in.

Deep stacks window to eight plates centred on the active one, with `+N below` /
`+N above` beneath. Past that a stack stops reading as a stack and starts
reading as noise.

---

## Open questions / not yet built

- **HTML email export.** The hard one, per the free-positioning trade-off above.
- **Auto-translation.** The structure is now in place — source locale, per-locale
  documents, shared metadata — but nothing translates yet. `addLocale` cloning
  from source is the intended entry point.
- **Text-expansion warnings.** See the 2026-08-04 observation: translated copy
  silently overflows layouts sized for the source locale.
- **Locale diffing.** No way to see which locales have drifted from the source
  since they were cloned.
- **Schedule is a plan, not a pipeline.** `releaseAt` records intent; nothing
  tracks whether a document actually shipped, and there is no status
  (draft/approved/sent) or reminder when a date passes.
- **Drag-to-reschedule** on the calendar, and a filter by campaign or locale.
- **Firebase migration.** Interface is ready; implementation is not.
- **Linked module instances.** `moduleId` is recorded but unused.
- **Alignment guides / distribute.** Only grid snapping exists today.
- **Multi-select resize.** Deliberately omitted, see 13:00 entry.
