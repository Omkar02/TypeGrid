"use client";

import { memo } from "react";
import { ImageIcon } from "lucide-react";

import { resolveTokens } from "@/lib/nodes";
import type { AnyEntityNode, EntityNode, NodeStyle } from "@/lib/types";
import { useTokens } from "@/components/canvas/tokens-context";

/** Style bits shared by every entity, in world units (the layer handles zoom). */
function baseStyle(style: NodeStyle): React.CSSProperties {
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign,
    borderRadius: style.radius,
    opacity: style.opacity,
    background: style.fill === "transparent" ? undefined : style.fill,
    border:
      style.borderWidth > 0
        ? `${style.borderWidth}px solid ${style.borderColor}`
        : undefined,
  };
}

function TextView({ node }: { node: EntityNode<"text"> }) {
  const tokens = useTokens();
  return (
    <div
      className="h-full w-full whitespace-pre-wrap break-words [&_a]:underline"
      style={{
        ...baseStyle(node.style),
        padding: `${node.style.paddingY}px ${node.style.paddingX}px`,
      }}
      // Content is rich text authored in this app by the person viewing it, and
      // stored as HTML because the output medium is HTML email. `pre-wrap` is
      // kept so plain-text content written before rich editing still breaks on
      // its newlines.
      dangerouslySetInnerHTML={{
        __html: resolveTokens(node.props.content, tokens),
      }}
    />
  );
}

function ButtonView({ node }: { node: EntityNode<"button"> }) {
  const tokens = useTokens();
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        ...baseStyle(node.style),
        padding: `${node.style.paddingY}px ${node.style.paddingX}px`,
      }}
    >
      <span className="truncate">{resolveTokens(node.props.label, tokens)}</span>
    </div>
  );
}

function ImageView({ node }: { node: EntityNode<"image"> }) {
  const tokens = useTokens();
  const src = resolveTokens(node.props.src, tokens);

  if (!src) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400"
        style={{ ...baseStyle(node.style), border: "1px dashed #d4d4d8" }}
      >
        <ImageIcon className="size-6" strokeWidth={1.5} />
        <span style={{ fontSize: 11 }}>Image</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden" style={baseStyle(node.style)}>
      {/* Arbitrary author-supplied URLs — next/image would need remote patterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={node.props.alt}
        draggable={false}
        className="h-full w-full"
        style={{ objectFit: node.props.fit, borderRadius: node.style.radius }}
      />
    </div>
  );
}

function AreaView({ node }: { node: EntityNode<"area"> }) {
  return <div className="h-full w-full" style={baseStyle(node.style)} />;
}

function DividerView({ node }: { node: EntityNode<"divider"> }) {
  return (
    <div
      className="h-full w-full"
      style={{
        background: node.style.fill === "transparent" ? "#e5e7eb" : node.style.fill,
        borderRadius: node.style.radius,
        opacity: node.style.opacity,
      }}
    />
  );
}

function SpacerView() {
  return (
    <div className="h-full w-full rounded-[2px] border border-dashed border-neutral-300/70 bg-neutral-100/30" />
  );
}

/** Renders one entity's visual content. Chrome (outlines, handles) lives elsewhere. */
export const EntityView = memo(function EntityView({
  node,
}: {
  node: AnyEntityNode;
}) {
  switch (node.kind) {
    case "text":
      return <TextView node={node} />;
    case "button":
      return <ButtonView node={node} />;
    case "image":
      return <ImageView node={node} />;
    case "area":
      return <AreaView node={node} />;
    case "divider":
      return <DividerView node={node} />;
    case "spacer":
      return <SpacerView />;
  }
});
