# ใบสั่งอาหาร — rice_menu

Web app for writing a food order slip and saving it as a JPG at exactly
**100 × 150 mm (1181 × 1772 px, 300 DPI)** — the common thermal-label and
photo-print size, so a slip can be printed as-is or sent to the kitchen as an image.

A slip carries the shop name, the customer name, a `ทานที่ร้าน` / `กลับบ้าน`
checkbox pair, and the ordered items with quantities and per-item notes
(`เพิ่มไข่ดาว`, `ไม่ใส่ผัก`). No prices — it is a kitchen ticket, not a receipt.

Everything runs in the browser. There is no backend and no order data leaves
the device; saved slips live in `localStorage`.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in build/
npm run preview    # serve the built output on :4173
```

`npm run check` type-checks, `npm run lint` checks formatting and lint rules,
`npm run format` rewrites.

## Using it

Type the shop name once — it is remembered. Then the customer name, dine-in or
takeaway, and the items. `Enter` on the last item row adds another; `+ เพิ่มเติม`
adds a note line under an item. The preview on the right is the actual slip, live.
`บันทึกเป็น JPG` downloads it as `bill-<customer>-<YYYYMMDD>-<HHMM>.jpg` and files it
under `ใบที่บันทึกไว้`, where the last 50 slips can be reopened as the basis for a new one.

## How the JPG is produced

The slip is drawn with the Canvas 2D API in `src/lib/bill/render.ts`, not by
screenshotting DOM. The on-screen preview is that same canvas scaled down with
CSS, so the preview and the exported file are one bitmap and cannot drift apart.

Three consequences worth knowing:

- **Sarabun is self-hosted** in `static/fonts/`. `fillText` renders with
  whatever font is already resident and will not wait for a webfont, so Thai
  would come out as tofu boxes on any machine without a Thai system font —
  which includes most Linux servers and CI images. `ensureFontsReady()` must be
  awaited before any render.
- **The item list shrinks to fit.** Item text steps down through 72→26 px until
  the list fits the paper. If it still does not fit, whole items are dropped
  and the UI says how many, rather than silently truncating.
- **Thai is wrapped by word, not by character.** Thai is written without spaces,
  so a whitespace-splitting wrapper produces one unbreakable blob.
  `src/lib/bill/text.ts` uses `Intl.Segmenter` for real break opportunities and
  falls back to grapheme clusters, which keeps vowel and tone marks attached to
  their base consonant.

## Layout

```
src/lib/bill/        the whole domain: geometry, fonts, text wrapping,
                     canvas renderer, JPEG export, localStorage history
src/routes/          +page.svelte — the single screen; layout.css — Tailwind v4 theme
static/fonts/        Sarabun 400/700, Thai + Latin subsets
scripts/             verify-slip.mjs — the end-to-end check
```

Stack: SvelteKit 2 + Svelte 5 (runes), Tailwind CSS v4, TypeScript, Vite,
`adapter-static`. No UI framework beyond that, no state library, no test framework.

## Verifying a change

`npm run check` and `npm run lint` cover types and style. The slip itself is
checked end to end against a real browser:

```sh
npm run build
npm run preview &          # must be restarted after every build
node scripts/verify-slip.mjs
```

It drives Chromium through a real order, exports the JPEG, and asserts the
things that are easy to claim and hard to know: that Sarabun is actually
resident, that the file is exactly 1181 × 1772 px (read from the JPEG's own SOF
marker), that the paper is white rather than black, that history survives a
reload, that overflow is reported, that the layout does not scroll sideways at
390 px, and that the slip carries no timestamp — by rendering the same order
under two very different clocks and comparing the bitmaps. Screenshots and the
exported slip land in `verify-out/`.

It needs a Chromium binary; it looks in the Playwright cache by default, or set
`CHROMIUM_PATH`.

Note that the script drives the UI by its Thai labels and by the
`data-item-input` / `data-addition-input` attributes, so changing user-facing
copy means updating the script in the same commit.

## Deployment

Static site on Render, configured by `render.yaml`. `npm run build` emits to
`build/`; nothing runs server-side.
