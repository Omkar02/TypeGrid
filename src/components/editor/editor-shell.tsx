"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBindings } from "@/hooks/use-bindings";
import { usePresence } from "@/hooks/use-presence";
import { useDocSync } from "@/hooks/use-doc-sync";
import { useRepoQuery } from "@/hooks/use-repo";
import { syncLinkedInstances } from "@/lib/modules";
import { repo } from "@/lib/repo";
import type { Campaign, Project, TypeDocument } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { TokenProvider } from "@/components/canvas/tokens-context";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { Inspector } from "@/components/editor/inspector";
import { LayersPanel } from "@/components/editor/layers-panel";
import { ModuleLibrary } from "@/components/editor/module-library";
import { Palette } from "@/components/editor/palette";
import { SaveModuleDialog } from "@/components/editor/save-module-dialog";

const AUTOSAVE_DELAY_MS = 600;

export function EditorShell({
  project,
  campaign,
  document,
}: {
  project: Project;
  campaign: Campaign;
  document: TypeDocument;
}) {
  const [saveModuleOpen, setSaveModuleOpen] = useState(false);
  const bindings = useBindings();
  const { data: prefs } = useRepoQuery(() => repo.getPreferences(), []);
  const collaborating = prefs?.collaboration ?? false;
  const { peers, report } = usePresence(document.id, collaborating);
  useDocSync(document.id, collaborating);

  const doc = useEditorStore((s) => s.doc);
  const dirty = useEditorStore((s) => s.dirty);
  const loadedIdRef = useRef<string | null>(null);

  const { data: modules } = useRepoQuery(
    () => repo.listModules(project.id),
    [project.id],
  );

  // Load once per document. Refetches triggered by our own saves must not
  // stomp on in-progress edits or reset undo history. Switching locale changes
  // the document id, which is exactly when a reload *should* happen.
  //
  // Linked global-module instances are rebuilt from their current definitions
  // as the document opens — that is what makes a global module identical
  // everywhere. Any change is marked dirty so autosave writes it back.
  useEffect(() => {
    if (loadedIdRef.current === document.id) return;
    if (modules === undefined) return; // wait, or the sync would wipe the links
    loadedIdRef.current = document.id;

    const store = useEditorStore.getState();
    const { doc: synced, changed } = syncLinkedInstances(document.canvas, modules);
    store.loadCanvas(document.id, synced);
    if (changed > 0) store.markDirty();
  }, [document, modules]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const state = useEditorStore.getState();

      // The store can move on between scheduling this timer and it firing —
      // switching locale swaps the canvas but not this closure's `document.id`.
      // Writing anyway would copy the new locale's canvas into the old
      // locale's document, silently destroying it.
      if (state.documentId !== document.id) return;

      void repo
        .saveCanvas(document.id, state.doc)
        .then(() => {
          useEditorStore.getState().markSaved();
          // Version *after* the save succeeds, so history never contains a
          // state the document itself never reached.
          return repo
            .captureVersion("document", document.id, state.doc, {
              separate: state.versionBoundary,
            })
            .then(() => useEditorStore.getState().clearVersionBoundary());
        })
        .catch((err: unknown) => {
          // The document can legitimately vanish underneath us — "reset demo
          // data", or a locale removed in another tab. Surface it instead of
          // letting it escape as an unhandled rejection.
          toast.error(
            err instanceof Error ? err.message : "Could not save this document",
          );
        });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, dirty, document.id]);

  const tokens = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of campaign.metadata) out[field.key] = field.defaultValue;
    return out;
  }, [campaign.metadata]);

  return (
    <TokenProvider value={tokens}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <EditorToolbar
          project={project}
          campaign={campaign}
          document={document}
          bindings={bindings}
          peerCount={peers.length}
          onRestore={(version) => {
            const store = useEditorStore.getState();
            store.beginHistory();
            store.replaceCanvas(version.canvas);
          }}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
            <Tabs defaultValue="insert" className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-2 grid shrink-0 grid-cols-3">
                <TabsTrigger value="insert" className="text-[11px]">
                  Insert
                </TabsTrigger>
                <TabsTrigger value="layers" className="text-[11px]">
                  Layers
                </TabsTrigger>
                <TabsTrigger value="modules" className="text-[11px]">
                  Modules
                </TabsTrigger>
              </TabsList>
              <TabsContent value="insert" className="min-h-0 flex-1">
                <Palette />
              </TabsContent>
              <TabsContent value="layers" className="min-h-0 flex-1">
                <LayersPanel />
              </TabsContent>
              <TabsContent value="modules" className="min-h-0 flex-1">
                <ModuleLibrary
                  projectId={project.id}
                  onSaveSelection={() => setSaveModuleOpen(true)}
                />
              </TabsContent>
            </Tabs>
          </aside>

          <div className="min-w-0 flex-1">
            <InfiniteCanvas
              className="h-full w-full"
              bindings={bindings}
              peers={peers}
              onPresence={report}
            />
          </div>

          <aside className="w-64 shrink-0 border-l bg-background">
            <Inspector
              metadata={campaign.metadata}
              onSaveModule={() => setSaveModuleOpen(true)}
            />
          </aside>
        </div>
      </div>

      <SaveModuleDialog
        open={saveModuleOpen}
        onOpenChange={setSaveModuleOpen}
        projectId={project.id}
      />
    </TokenProvider>
  );
}
