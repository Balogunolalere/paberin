"use client";

import { useEffect } from "react";
import { previewStylesheetHref, setLiveFonts, type PrintFont } from "./print-fonts";

/**
 * Loads the preview stylesheet, once per document, when a service offers fonts.
 *
 * Deliberately lazy: the Google stylesheet is a single small request and the
 * browser then fetches ONLY the families actually rendered — a customer who
 * never sees a font picker downloads nothing at all. This app is React 18, which
 * does not hoist a <link> rendered in the body, so it is injected into <head>.
 *
 * When the real font files are dropped into `public/fonts/`, they win over these
 * fallbacks automatically (they are first in each stack) and this link can go.
 */
export function usePreviewFonts(enabled: boolean): void {
  // The shop's own font list, fetched once per page session from a public
  // endpoint — the catalogue is not a secret, and the picker needs it to name the
  // right face for a font this bundle has never seen.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";
        const res = await fetch(`${base}/api/settings?brand=SKYAL`, { cache: "no-store" });
        const body = await res.json();
        const raw = body?.data?.print_fonts;
        if (!raw || cancelled) return;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) setLiveFonts(parsed as PrintFont[]);
      } catch {
        // Offline or blocked: the built-in ten still render.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const href = previewStylesheetHref();
    if (document.querySelector(`link[data-preview-fonts="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.previewFonts = href;
    document.head.appendChild(link);
  }, [enabled]);
}
