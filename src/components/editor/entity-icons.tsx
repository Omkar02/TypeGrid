"use client";

import {
  Boxes,
  ImageIcon,
  Minus,
  MoveVertical,
  RectangleHorizontal,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { NodeKind } from "@/lib/types";

export const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  text: Type,
  button: RectangleHorizontal,
  image: ImageIcon,
  area: Square,
  divider: Minus,
  spacer: MoveVertical,
  component: Boxes,
};
