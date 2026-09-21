"use client";

import { useEffect } from "react";
import { previewStylesheetHref } from "./print-fonts";

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
