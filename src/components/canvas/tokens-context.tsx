"use client";

import { createContext, useContext } from "react";

/** Metadata values used to resolve `${key}` placeholders while authoring. */
const TokenContext = createContext<Record<string, string>>({});

export const TokenProvider = TokenContext.Provider;

export function useTokens(): Record<string, string> {
  return useContext(TokenContext);
}
