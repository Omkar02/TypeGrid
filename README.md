# TypeGrid

Author localized email on an infinite, Figma-style canvas.

```
Tenant → Project → Campaign → Document → Component → Entity
```

- **Tenant** — owns everything, including the global module library. Single and
  implicit today; there is no switcher.

- **Project** — a workspace.
- **Campaign** — one email. Owns the locale list, the source locale, and the `${metadata}` keys.
- **Document** — that email in **one locale**. This is the canvas you edit.
- **Component** — a group of entities. Saved and reused, it's a **module**.
- **Entity** — text, button, image, area, divider, spacer.

Each document also carries an expected release date, surfaced as a project-wide
schedule.

Locales are unique within a campaign, so a document is addressed by its locale
code — there is no separate slug.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Demo content seeds itself on first visit; "Reset demo
data" on the home page restores it.

## The flows

**Find your way around.** The home, project and campaign pages all carry a
navigation tree — project → campaign → locale — with a search field that matches
campaign names, project names and locale codes.

**Author an email.** Every document lives at:

```
/p/<project>/email/<campaign>/<locale>
/p/acme-growth/email/welcome-email/de
```

Drag entities from the **Insert** panel onto the canvas, or click one to drop it
in view. Select, move, resize, rotate, group, restyle in the inspector.

Double-click a text entity to edit it **in place**, with a floating toolbar for
bold, italic, underline and links. Content is stored as HTML and pasting is
forced to plain text — both so the result survives real mail clients.

Selected nodes carry three kinds of grip: eight to resize, four just outside the
corners to **rotate** (hold `⇧` for 15° steps), and one on the top-left diagonal
for **corner radius**.

**Work across locales.** A campaign page lists one document per locale, with the
source locale marked. **Add locales** creates new documents pre-filled from an
existing one, so translating means editing copy rather than rebuilding layout.
In the editor, the toolbar's locale switcher navigates between sibling locales —
each has its own URL and its own undo history.

**Plan the release.** Every document carries an expected release date. Set one
for the whole campaign when you create it, or per document from the campaign
page.

The **schedule** is a GitHub-style heatmap — a week per column, a day per cell,
shaded by how many documents ship that day. It runs from four weeks ago through
the next year, since releases are forward-looking. The panel underneath opens on
today and lists what ships on whichever day you click — jump straight into a
canvas from there.

- **Project page** — that project's documents, in that project's colour.
- **Home page** — every project at once. A cell takes the colour of the project
  contributing most that day; the detail panel shows the full breakdown.

Projects are colour-coded from twelve options when you create them, and new
projects default to the first unused colour.

**Build and reuse modules.** Select anything on the canvas → **Save as module**
(inspector, or the Modules panel). Saved modules appear in the **Modules** panel;
drag one onto any canvas, or double-click to drop it in view. Each drop is an
independent copy.

**Modules.** The **Modules** button on the home page opens the tenant-wide
library at `/modules` — create, rename, retag and delete there, and edit artwork
on its own canvas at `/modules/<slug>`. Both that page and the editor's Modules
panel are searchable by name or tag. Everything there is usable from every
project in the tenant, in two kinds:

| | Global module | Template |
|---|---|---|
| Placed as | a **linked instance** | an independent **copy** |
| Edited | only in the module editor | freely, inside the document |
| Across documents | identical, always | diverges once you touch it |

A linked instance refreshes from its module whenever the document is opened, so
a global module stays the same everywhere. Select one and use **Detach to edit
here** to turn it into a plain copy. Delete a module and its instances keep
their artwork — they simply detach.

## Canvas shortcuts

Press the keyboard button in the editor toolbar for the full grid — every
shortcut is **rebindable**, and overrides are saved to your preferences.

| | |
|---|---|
| Tools | `V` select · `H` pan |
| Insert | `T` text · `B` button · `I` image · `R` area · `L` divider · `S` spacer |
| Group / ungroup | `G` (toggles on the selection) |
| Z-order | `Q` back · `E` forward · `⇧Q` to back · `⇧E` to front |
| Duplicate | `⌘D`, or hold `D` and drag to leave the original behind |
| Lock / hide | `⇧L` · `⇧H` |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Zoom | `1` fit · `2` selection · `0` 100% · `=` / `-` |
| Grid / snapping | `⌘'` · `⌘;` |
| Pan | Space-drag, middle-drag, or scroll |
| Zoom the canvas | `⌘`/`Ctrl` + scroll |
| Edit text / enter group | Double-click |
| Step out | `Escape` |
| Nudge | Arrows (`⇧` for 5× the grid step) |

Hold `⇧` while dragging to constrain to an axis; while resizing to keep the
aspect ratio.

## Layout

```
src/
  app/                     routes; the editor is email/[campaignSlug]/[locale]
  components/
    canvas/                infinite canvas, entity renderers, token context
    editor/                toolbar, locale switcher, palette, layers, inspector
    app/                   list-page chrome, navigation tree, dialogs, schedule
  lib/
    types.ts               domain model
    locales.ts             locale codes, display names, normalization
    dates.ts               calendar-date helpers (local time, no timezones)
    colors.ts              the twelve project colours and heatmap intensities
    geometry.ts            viewport maths, resize handles
    nodes.ts               entity blueprints, tree walking, transforms
    modules.ts             extract a selection into a reusable subtree
    repo/                  Repository interface + localStorage implementation
  store/editor-store.ts    Zustand + Immer canvas state, history, mutations
```

## Storage

Everything lives in `localStorage` under `typegrid:v2`, behind the `Repository`
interface in `src/lib/repo/repository.ts`. Moving to Firebase means writing a
second implementation of that interface and changing one line in
`src/lib/repo/index.ts`.

## Design log

Decisions, trade-offs and open questions are recorded with timestamps in
[`notes.md`](./notes.md).
