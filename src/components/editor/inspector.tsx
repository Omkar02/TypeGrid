"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Boxes,
  ChevronsDown,
  ChevronsUp,
  Copy,
  PackagePlus,
  Trash2,
  Unlink,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { framesForMove, framesForResize } from "@/lib/nodes";
import {
  type AnyEntityNode,
  type MetadataField,
  type NodeStyle,
  isComponentNode,
  isLinkedInstance,
} from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { NODE_ICONS } from "@/components/editor/entity-icons";

// ---------------------------------------------------------------------------
// Small field primitives
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-3">
      <p className="pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
        {label}
      </span>
      <Input
        type="number"
        step={step}
        disabled={disabled}
        className="h-7 text-xs"
        value={draft ?? Math.round(value * 100) / 100}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) {
            const parsed = Number(draft);
            if (!Number.isNaN(parsed)) onCommit(parsed);
            setDraft(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowTransparent = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowTransparent?: boolean;
}) {
  const isTransparent = value === "transparent";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] uppercase text-muted-foreground">
        {label}
      </span>
      <input
        type="color"
        value={isTransparent ? "#ffffff" : value}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded border bg-background p-0.5"
        aria-label={`${label} colour`}
      />
      <Input
        className="h-7 flex-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {allowTransparent ? (
        <Button
          type="button"
          variant={isTransparent ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={() => onChange(isTransparent ? "#ffffff" : "transparent")}
        >
          none
        </Button>
      ) : null}
    </div>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <Input
        className="h-7 text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

export function Inspector({
  metadata,
  onSaveModule,
}: {
  metadata: MetadataField[];
  onSaveModule: () => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const selectedId = selection[selection.length - 1];
  const node = selectedId ? doc.nodes[selectedId] : undefined;

  if (!node) {
    return <CanvasInspector metadata={metadata} />;
  }

  const Icon = NODE_ICONS[node.kind];
  const store = useEditorStore.getState;

  const commitFrame = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    const current = useEditorStore.getState();
    const frame = current.doc.nodes[node.id].frame;
    current.beginHistory();
    if (patch.x !== undefined || patch.y !== undefined) {
      current.setFrames(
        framesForMove(
          current.doc.nodes,
          [node.id],
          (patch.x ?? frame.x) - frame.x,
          (patch.y ?? frame.y) - frame.y,
        ),
      );
    }
    if (patch.w !== undefined || patch.h !== undefined) {
      current.setFrames(
        framesForResize(useEditorStore.getState().doc.nodes, node.id, frame, {
          ...frame,
          w: Math.max(1, patch.w ?? frame.w),
          h: Math.max(1, patch.h ?? frame.h),
        }),
      );
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-background">
            <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
          </span>
          <Input
            className="h-7 text-xs"
            value={node.name}
            onChange={(e) => store().renameNode(node.id, e.target.value)}
          />
        </div>

        <Section title="Layout">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={node.frame.x}
              onCommit={(x) => commitFrame({ x })}
            />
            <NumberField
              label="Y"
              value={node.frame.y}
              onCommit={(y) => commitFrame({ y })}
            />
            <NumberField
              label="W"
              value={node.frame.w}
              disabled={isLinkedInstance(node)}
              onCommit={(w) => commitFrame({ w })}
            />
            <NumberField
              label="H"
              value={node.frame.h}
              disabled={isLinkedInstance(node)}
              onCommit={(h) => commitFrame({ h })}
            />
          </div>
          <NumberField
            label="Rot"
            value={node.rotation}
            onCommit={(rotation) => {
              store().beginHistory();
              store().setRotation(node.id, rotation);
            }}
          />
          {isLinkedInstance(node) ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Size comes from the module. Move it freely — a resize here would be
              discarded on the next sync.
            </p>
          ) : null}
        </Section>

        {isLinkedInstance(node) ? (
          <Section title="Global module">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Linked instance. Its contents are owned by the module and refresh
              here whenever the module changes, so it stays identical in every
              document.
            </p>
            <Button
              asChild
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
            >
              <Link href="/modules">
                <Boxes className="size-3.5" />
                Edit in Modules
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={() => store().detachInstance(node.id)}
            >
              <Unlink className="size-3.5" />
              Detach to edit here
            </Button>
          </Section>
        ) : isComponentNode(node) ? (
          <Section title="Component">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {node.childIds.length} {node.childIds.length === 1 ? "entity" : "entities"}
              {node.moduleId ? " · copied from a template" : ""}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={onSaveModule}
            >
              <PackagePlus className="size-3.5" />
              Save as module
            </Button>
          </Section>
        ) : (
          <>
            <ContentSection node={node} metadata={metadata} />
            <AppearanceSection node={node} />
          </>
        )}

        <Section title="Arrange">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => store().reorderSelection("front")}
            >
              <ChevronsUp className="size-3.5" /> Front
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => store().reorderSelection("back")}
            >
              <ChevronsDown className="size-3.5" /> Back
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => store().duplicateSelection()}
            >
              <Copy className="size-3.5" /> Duplicate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-destructive hover:text-destructive"
              onClick={() => store().deleteSelection()}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------

function ContentSection({
  node,
  metadata,
}: {
  node: AnyEntityNode;
  metadata: MetadataField[];
}) {
  const update = (patch: Record<string, unknown>) =>
    useEditorStore.getState().updateProps(node.id, patch);

  switch (node.kind) {
    case "text":
      return (
        <Section title="Content">
          <Textarea
            className="min-h-24 text-xs"
            value={node.props.content}
            onChange={(e) => update({ content: e.target.value })}
          />
          <TokenHints metadata={metadata} />
        </Section>
      );
    case "button":
      return (
        <Section title="Content">
          <TextRow
            label="Label"
            value={node.props.label}
            onChange={(label) => update({ label })}
          />
          <TextRow
            label="Link"
            value={node.props.href}
            onChange={(href) => update({ href })}
            placeholder="https://…"
          />
          <TokenHints metadata={metadata} />
        </Section>
      );
    case "image":
      return (
        <Section title="Content">
          <TextRow
            label="Source"
            value={node.props.src}
            onChange={(src) => update({ src })}
            placeholder="https://…"
          />
          <TextRow
            label="Alt text"
            value={node.props.alt}
            onChange={(alt) => update({ alt })}
          />
          <div className="space-y-1">
            <span className="text-[10px] uppercase text-muted-foreground">Fit</span>
            <Select
              value={node.props.fit}
              onValueChange={(fit) => update({ fit })}
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="fill">Fill</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Section>
      );
    case "area":
      return (
        <Section title="Content">
          <TextRow
            label="Label"
            value={node.props.label}
            onChange={(label) => update({ label })}
          />
        </Section>
      );
    default:
      return null;
  }
}

function TokenHints({ metadata }: { metadata: MetadataField[] }) {
  if (metadata.length === 0) return null;
  return (
    <p className="text-[10px] leading-relaxed text-muted-foreground">
      Tokens:{" "}
      {metadata.map((field, i) => (
        <span key={field.key}>
          {i > 0 ? ", " : ""}
          <code className="rounded bg-muted px-1 py-0.5">{`\${${field.key}}`}</code>
        </span>
      ))}
    </p>
  );
}

const ALIGN_OPTIONS = [
  { value: "left" as const, Icon: AlignLeft },
  { value: "center" as const, Icon: AlignCenter },
  { value: "right" as const, Icon: AlignRight },
];

function AppearanceSection({ node }: { node: AnyEntityNode }) {
  const update = (patch: Partial<NodeStyle>) =>
    useEditorStore.getState().updateStyle(node.id, patch);
  const hasText = node.kind === "text" || node.kind === "button";

  return (
    <>
      {hasText ? (
        <Section title="Typography">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Size"
              value={node.style.fontSize}
              onCommit={(fontSize) => update({ fontSize })}
            />
            <NumberField
              label="Wght"
              value={node.style.fontWeight}
              step={100}
              onCommit={(fontWeight) => update({ fontWeight })}
            />
            <NumberField
              label="Line"
              value={node.style.lineHeight}
              step={0.1}
              onCommit={(lineHeight) => update({ lineHeight })}
            />
            <NumberField
              label="Trk"
              value={node.style.letterSpacing}
              step={0.1}
              onCommit={(letterSpacing) => update({ letterSpacing })}
            />
          </div>
          <TextRow
            label="Font family"
            value={node.style.fontFamily}
            onChange={(fontFamily) => update({ fontFamily })}
          />
          <div className="flex gap-1">
            {ALIGN_OPTIONS.map(({ value, Icon }) => (
              <Button
                key={value}
                type="button"
                variant={node.style.textAlign === value ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7 flex-1", node.style.textAlign === value && "border")}
                onClick={() => update({ textAlign: value })}
                aria-label={`Align ${value}`}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
          <ColorField
            label="Text"
            value={node.style.color}
            onChange={(color) => update({ color })}
          />
        </Section>
      ) : null}

      <Section title="Appearance">
        <ColorField
          label="Fill"
          value={node.style.fill}
          onChange={(fill) => update({ fill })}
          allowTransparent
        />
        <ColorField
          label="Border"
          value={node.style.borderColor}
          onChange={(borderColor) => update({ borderColor })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Bord"
            value={node.style.borderWidth}
            onCommit={(borderWidth) => update({ borderWidth })}
          />
          <NumberField
            label="Rad"
            value={node.style.radius}
            onCommit={(radius) => update({ radius })}
          />
          <NumberField
            label="Pad X"
            value={node.style.paddingX}
            onCommit={(paddingX) => update({ paddingX })}
          />
          <NumberField
            label="Pad Y"
            value={node.style.paddingY}
            onCommit={(paddingY) => update({ paddingY })}
          />
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-muted-foreground">Opacity</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {Math.round(node.style.opacity * 100)}%
            </span>
          </div>
          <Slider
            value={[node.style.opacity * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={([next]) => update({ opacity: next / 100 })}
          />
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function CanvasInspector({ metadata }: { metadata: MetadataField[] }) {
  const background = useEditorStore((s) => s.doc.background);
  const nodeCount = useEditorStore((s) => s.doc.rootIds.length);

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        <Section title="Canvas">
          <ColorField
            label="Backdrop"
            value={background}
            onChange={(color) => useEditorStore.getState().setBackground(color)}
          />
          <p className="text-[11px] text-muted-foreground">
            {nodeCount} top-level {nodeCount === 1 ? "node" : "nodes"}
          </p>
        </Section>

        <Section title="Metadata">
          {metadata.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No metadata keys on this document yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {metadata.map((field) => (
                <li key={field.key} className="text-[11px]">
                  <code className="rounded bg-muted px-1 py-0.5">{`\${${field.key}}`}</code>
                  <span className="ml-2 text-muted-foreground">
                    {field.defaultValue || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Shortcuts">
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li>Space / middle-drag — pan</li>
            <li>⌘ + scroll — zoom</li>
            <li>Double-click text — edit in place</li>
            <li>G group/ungroup · Q/E send back/forward</li>
            <li>Hold D + drag — duplicate</li>
          </ul>
          <p className="pt-1 text-[10px] text-muted-foreground">
            The keyboard button in the toolbar lists everything, and lets you
            rebind any of it.
          </p>
        </Section>

        <Separator />
      </div>
    </ScrollArea>
  );
}
