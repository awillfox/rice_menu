# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page SvelteKit app that turns a food order into a **100 × 150 mm JPG kitchen
slip** (1181 × 1772 px at 300 DPI). The UI is in Thai. There is no backend, no runtime
network call, and no order data leaves the device: the slip is painted on a `<canvas>`
and downloaded as a Blob, history lives in `localStorage`.

## Commands

```sh
npm run dev          # vite dev on :5173
npm run build        # static output to build/
npm run preview      # serve build/ on :4173 — restart after every build
npm run check        # svelte-kit sync && svelte-check (types, incl. .svelte)
npm run lint         # prettier --check . && eslint .
npm run format       # prettier --write .
```

End-to-end verification — the only test suite in the repo:

```sh
npm run build
npm run preview &
node scripts/verify-slip.mjs [baseUrl]     # default http://localhost:4173
```

It drives real Chromium through a real order and asserts what is easy to claim and hard
to know: Sarabun is actually resident, the JPEG is exactly 1181 × 1772 (read from the
file's own SOF marker), the paper is white not black, history survives reload, overflow
is reported, no horizontal scroll at 390 px, and the slip is byte-identical under two
very different clocks. Output lands in `verify-out/` (screenshots, the exported slip,
`report.json`); the script exits non-zero if any check fails.

There is **no unit-test runner and no way to run a single check** — the script is
all-or-nothing. It needs a Chromium binary: it searches the Playwright cache
(`~/.cache/ms-playwright`) or honours `CHROMIUM_PATH`.

## Architecture

`src/lib/bill/` is the entire domain; the single route is a thin shell over it.

```
types.ts      Bill / OrderItem / Addition, and the Thai serve-mode labels
constants.ts  slip geometry — mm, DPI, and the derived CANVAS_W/CANVAS_H
fonts.ts      ensureFontsReady() / fontsAreResident()
text.ts       Thai-aware line breaking for canvas
render.ts     paints a Bill onto a canvas; returns { clipped, itemFontSize }
export.ts     canvas -> JPEG blob, filename, download
history.ts    localStorage read/write with defensive normalisation
```

`src/routes/+page.svelte` (~460 lines) holds _all_ UI state as Svelte 5 runes and is the
only component. Runes mode is forced project-wide in `vite.config.ts`. `+layout.ts` sets
`prerender = true` and `adapter-static` emits a fully static `build/`.

### Invariants that are load-bearing

Break any of these and the failure is silent or only visible in the exported file.

- **The preview canvas _is_ the export canvas.** The on-screen slip is that one bitmap
  scaled down with CSS, never a separate DOM rendering. Preview and output cannot drift
  apart, and nothing is screenshotted. Keep it that way.
- **`await ensureFontsReady()` before any render.** `fillText` draws with whatever font
  is already resident; it will not trigger a webfont fetch and will not wait for one.
  Most Linux/CI images have no Thai system font, so drawing early yields tofu boxes with
  no error. Sarabun is self-hosted in `static/fonts/` for this reason, `@font-face`d in
  `src/routes/layout.css` with Google's own unicode-range split.
- **Fill the paper white first.** JPEG has no alpha channel — unpainted pixels encode as
  black, not transparent.
- **The slip carries no timestamp.** `bill.createdAt` names the file and labels history
  entries; `render.ts` deliberately never draws it. `verify-slip.mjs` enforces this by
  rendering the same order under two clocks and comparing bitmaps.
- **Overflow is reported, never silently truncated.** Item text steps down through
  `ITEM_SIZES` (72→26 px) until the list fits; if items still do not fit, whole items are
  dropped, `renderBill` returns the count in `clipped`, and the UI raises a
  `role="alert"`. An item and its additions are one block and are never half-drawn.
- **Thai has no inter-word spaces.** `text.ts` uses `Intl.Segmenter('th', 'word')` for
  break opportunities and grapheme segmentation as fallback and last resort. Never split
  on code points — that detaches vowel/tone marks (U+0E31, U+0E34-0E3A, U+0E47-0E4E) from
  their base consonant.
- **Anything in `localStorage` may be stale or hand-edited.** `history.ts` normalises on
  read (bills saved before `additions` existed have no such field) and drops only what it
  cannot repair. Writes are wrapped in try/catch — private mode throws — and history is a
  convenience that must never block an export. Keys are versioned:
  `rice-menu.history.v1`, `rice-menu.shop.v1`.

### Things that will bite

- **`verify-slip.mjs` selects by Thai UI copy** — placeholders (`ชื่อร้านของคุณ`,
  `เช่น คุณสมชาย`), button names (`+ เพิ่มรายการ`, `บันทึกเป็น JPG`), aria-labels — plus
  the `data-item-input` / `data-addition-input` hooks. Changing user-facing strings or
  those attributes breaks verification; update the script in the same change.
- **Tailwind v4, CSS-first.** There is no `tailwind.config.js`; the theme lives in the
  `@theme` block of `src/routes/layout.css`, which `prettier.config.js` points at via
  `tailwindStylesheet`. Colour tokens (`ink`, `field`, `chili`, `line`, `muted`, `paper`)
  are used as Tailwind classes.
- **Canvas layout is hand-measured, not laid out.** `render.ts` advances a `y` cursor
  through fixed pixel constants at 300 DPI, so px values look enormous — 90 px padding,
  80 px shop name. Sizes measured for the mode row use bold (the wider state) so the row
  cannot reflow when the selection changes.
- **ESLint takes its ignores from `.gitignore`** (`includeIgnoreFile`), and `.npmrc` sets
  `engine-strict=true`.

## Deployment

Static site on Render, configured by `render.yaml` (`npm ci && npm run build`, publish
`./build`, one-year immutable cache on `/fonts/*`). Nothing runs server-side.
