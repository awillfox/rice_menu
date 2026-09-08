# ใบสั่งอาหาร — rice_menu

Web app for writing a food order slip and saving it as a JPG at exactly
**100 × 150 mm (1181 × 1772 px, 300 DPI)**.

A slip carries the shop name, the customer name, a `ทานที่ร้าน` / `กลับบ้าน`
checkbox pair, and the ordered items with quantities. No prices — it is a
kitchen ticket, not a receipt.

Everything runs in the browser. There is no backend and no order data leaves
the device; saved slips live in `localStorage`.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in build/
npm run preview    # serve the built output on :4173
```

## How the JPG is produced

The slip is drawn with the Canvas 2D API in `src/lib/bill/render.ts`, not by
screenshotting DOM. The on-screen preview is that same canvas scaled down with
CSS, so the preview and the exported file are one bitmap and cannot drift apart.

Two consequences worth knowing:

- **Sarabun is self-hosted** in `static/fonts/`. `fillText` renders with
  whatever font is already resident and will not wait for a webfont, so Thai
  would come out as tofu boxes on any machine without a Thai system font —
  which includes most Linux servers and CI images. `ensureFontsReady()` must be
  awaited before any render.
- **The item list shrinks to fit.** Item text steps down through 46→26 px until
  the list fits the paper. If it still does not fit, whole items are dropped
  and the UI says how many, rather than silently truncating.

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
reload, that overflow is reported, and that the layout does not scroll
sideways at 390 px. Screenshots and the exported slip land in `verify-out/`.

It needs a Chromium binary; it looks in the Playwright cache by default, or set
`CHROMIUM_PATH`.

## Deployment

Static site on Render, configured by `render.yaml`. `npm run build` emits to
`build/`; nothing runs server-side.
