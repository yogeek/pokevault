# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PokeVault is a French-language PWA for inventorying, organizing, and sharing a Pokémon TCG collection. The defining constraint shapes the entire architecture: **100% local, no account, no server, no telemetry.** All data lives in the browser (IndexedDB). There is no backend. Any "sharing" or "AI" feature must work without a server of our own.

UI copy is in French. Keep new user-facing strings in French.

## Commands

```bash
npm run dev              # Vite dev server → http://localhost:5173
npm run build            # copy-tesseract + tsc -b + vite build → /dist
npm run lint             # eslint, --max-warnings 0 (CI-strict)
npm test                 # vitest run (unit)
npm run test:watch       # vitest watch
npm run test:e2e         # playwright
npm run update-catalog   # rebuild public/catalog.json from TCGdex API
npm run gen-icons        # regenerate PWA PNG icons
```

Run a single test file: `npx vitest run src/test/share.test.ts`
Run tests matching a name: `npx vitest run -t "encode"`

There is no separate typecheck script; `tsc -b` runs as part of `npm run build`. `tsconfig` is strict with `noUnusedLocals`/`noUnusedParameters`, so dead bindings fail the build.

## Architecture

**Layering** (import direction flows downward, never up):
- `src/pages/` — route components, one per screen, wired in `src/App.tsx`
- `src/stores/` — Zustand stores (`catalog`, `share`) for cross-page state
- `src/db/` — Dexie (IndexedDB) repositories: `inventory`, `wishlist`, `sharing`, `settings`. Schema + bootstrap in `src/db/index.ts`.
- `src/lib/` — pure logic: `catalog`, `share`, `backup`, `ai-scan`. These are the units that have tests in `src/test/`.
- `src/types/index.ts` — single source of truth for all domain types. Read this first when touching any feature.

Path alias `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

**Two distinct data sources, do not conflate them:**
1. **Catalog** (`public/catalog.json`) — read-only static snapshot of the Pokémon TCG card database (cards + sets, EN + FR names), built from the TCGdex API by `scripts/update-catalog.mjs`. Loaded once at app start into the catalog Zustand store and cached. Cards are referenced everywhere by `cardId` (e.g. `"base-set-4"`).
2. **User collection** (IndexedDB via Dexie) — the user's owned cards, wishlist, decks, tags, shared views. Entries store only a `cardId` pointer into the catalog plus per-copy metadata (condition, language, variant, qty).

**Sharing is serverless** (`src/lib/share.ts`). A `ShareSnapshot` (deliberately terse keys `v/n/g/i/w` to keep it small) is JSON → pako deflate → base64url, then embedded in a URL fragment (`/view#<encoded>`) or QR code. The recipient decodes it client-side. `SHARE_WARN_THRESHOLD` / `QR_MAX_CARDS` guard against oversized payloads. The "check for a friend" flow (`CheckCardPage`, `checkCard`) scans a card against a decoded snapshot to return in-collection / in-wishlist / absent.

**AI card scanning is BYO-key** (`src/lib/ai-scan.ts`). The user supplies their own Anthropic API key (stored locally, encrypted), and the browser calls `api.anthropic.com` directly via `anthropic-dangerous-direct-browser-access`. There is also Tesseract.js OCR as a no-key fallback. Claude Vision returns `{name, number}`; `matchCandidates` + `computeScore` then heuristically rank catalog cards by name/number/total match. Single-card and full-binder-page (`recognizePageWithClaude`) variants exist. Model IDs live in `AI_MODELS`.

## PWA / deployment specifics

- `vite.config.ts` holds the PWA manifest and Workbox caching strategy. Catalog uses `StaleWhileRevalidate` (new catalog appears on next launch); card images and Tesseract assets are `CacheFirst`. `version.json` is never precached (fetched fresh to detect updates, handled by `useSwUpdate`).
- `base` is `/` locally but `/pokevault/` on GitHub Pages (set via `VITE_BASE`). **Always build share/asset URLs with `import.meta.env.BASE_URL`**, never hardcode `/` — getting this wrong causes 404s on Pages (see `getShareUrl`, `loadCatalog`).
- `copy-tesseract.mjs` runs before every build to vendor the Tesseract worker/WASM/lang-data into `public/tesseract/` (served locally, not from CDN).
- CI (`.github/workflows/deploy.yml`): tests gate the build; only `main` deploys to Pages. A scheduled monthly workflow (`update-catalog.yml`) regenerates the catalog, bumps the patch version, and triggers a redeploy.

## Conventions

- No em dashes in any output, comments, or docs (use comma/colon/parentheses).
- Files use section-divider comments (`// ─── Label ───`). Match that style.
- `lib/` functions are pure and tested; put new testable logic there rather than in page components.
- `PRD.md` is the product spec — consult it for intended feature behavior.
