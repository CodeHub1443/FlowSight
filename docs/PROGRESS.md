# PROGRESS

## Steps

- [x] 0 Baseline brief and plan
- [x] 1 Scaffold
- [ ] 2 Domain types and schemas
- [ ] 3 Mock simulator
- [ ] 4 Stores and connection status
- [ ] 5 App shell (2D)
- [ ] 6 3D site (static)
- [ ] 7 3D interior and actors
- [ ] 8 Bind live data to the scene
- [ ] 9 Alerts and evidence centre
- [ ] 10 Analytics and leaderboard
- [ ] 11 Reports and exports
- [ ] 12 Auth, RBAC and admin
- [ ] 13 Live backend wiring
- [ ] 14 Video wall and performance
- [ ] 15 Replay (P2)
- [ ] 16 Packaging

## Resolved package pins (exact, `save-exact=true`)

Resolved 2026-10-24 with `pnpm view` and installed with pnpm 10.34.8 on Node 22.18.0. Transitive versions are in `pnpm-lock.yaml`.

| Package | Pin | Kind |
|---|---|---|
| @fontsource/inter | 5.3.0 | prod |
| @fontsource/noto-sans-bengali | 5.3.0 | prod |
| @nats-io/nats-core | 3.4.0 | prod |
| @react-three/drei | 10.7.9 | prod |
| @react-three/fiber | 9.8.2 | prod |
| @tanstack/react-query | 5.104.5 | prod |
| class-variance-authority | 0.7.1 | prod |
| clsx | 2.1.1 | prod |
| date-fns | 4.4.0 | prod |
| date-fns-tz | 3.2.0 | prod |
| echarts | 5.6.0 | prod |
| echarts-for-react | 3.0.6 | prod |
| i18next | 26.5.10 | prod |
| lucide-react | 1.61.0 | prod |
| radix-ui | 1.8.1 | prod |
| react | 19.3.1 | prod |
| react-dom | 19.3.1 | prod |
| react-i18next | 17.1.8 | prod |
| react-router | 7.18.4 | prod |
| sonner | 2.0.8 | prod |
| tailwind-merge | 3.7.0 | prod |
| three | 0.186.1 | prod |
| tw-animate-css | 1.4.0 | prod |
| zod | 4.6.7 | prod |
| zustand | 5.0.16 | prod |
| @eslint/js | 9.39.5 | dev |
| @playwright/test | 1.64.1 | dev |
| @tailwindcss/vite | 4.3.3 | dev |
| @testing-library/dom | 10.4.2 | dev |
| @testing-library/jest-dom | 7.0.1 | dev |
| @testing-library/react | 16.3.3 | dev |
| @testing-library/user-event | 14.6.8 | dev |
| @types/node | 22.20.5 | dev |
| @types/react | 19.3.0 | dev |
| @types/react-dom | 19.3.0 | dev |
| @types/three | 0.186.0 | dev |
| @vitejs/plugin-react | 5.2.0 | dev |
| eslint | 9.39.5 | dev |
| eslint-plugin-react-hooks | 7.1.1 | dev |
| eslint-plugin-react-refresh | 0.5.7 | dev |
| globals | 17.13.0 | dev |
| jsdom | 29.1.1 | dev |
| msw | 2.15.0 | dev |
| prettier | 3.9.10 | dev |
| shadcn | 4.22.1 | dev |
| tailwindcss | 4.3.3 | dev |
| typescript | 5.9.3 | dev |
| typescript-eslint | 8.72.0 | dev |
| vite | 7.3.7 | dev |
| vitest | 5.0.5 | dev |

Not installed yet: `@react-three/postprocessing` (ADR-10). `msw` is installed but not initialised (no `public/mockServiceWorker.js`, no handlers).

## Step 1 log

Baseline: `2310afe step-00b: doc pack extracted to repo root` (tree clean at start). Nothing committed.

Created: root config (`package.json`, `.npmrc`, `.nvmrc`, `.editorconfig`, Prettier, ESLint 9 flat, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `components.json`, `index.html`, `.env`, `.env.live`), `src/**` (router with placeholder pages for every docs/01 §3 route, AppShell with EN/বাং toggle, i18n, tokens in `src/index.css`, 16 shadcn components, folder-structure `index.ts` stubs), `scripts/i18n-check.mjs` + test + fixtures, `e2e/smoke.spec.ts`, placeholder logos in `public/brand/`, screenshots in `docs/screens/`.

### Deviations and notes

1. **pnpm via global npm install, not Corepack** (brief amendment overrides CLAUDE.md "Stack" and docs/05 Step 1). `packageManager: pnpm@10.34.8` kept as documentation only.
2. **`@vitejs/plugin-react` 5.2.0, not 6.x.** 6.x peers `vite ^8`; ADR-9 fixes Vite 7. 5.2.0 supports Vite 4–8.
3. **`jsdom` 29.1.1, not 30.x.** 30.x requires Node `^22.22.2`; the dev machine has 22.18.0 and `engine-strict=true`. 29.1.1 requires `^22.13.0`.
4. **`@testing-library/dom` 10.4.2** added explicitly (peer of `@testing-library/react`).
5. **`echarts-for-react` 3.0.6 installed.** Peers are `react >=16`, `echarts ^3–^6`; React 19 is not rejected, so the ADR-9 fallback wrapper is not needed.
6. **Newer majors available but not used (approved majors respected):** react-router 8.5.0, echarts 6.1.0. React is pinned at 19.3.1, the highest 19.x (R3F 9.8.2 peers `react >=19 <19.4`). `eslint@9.39.5` prints a pnpm deprecation notice (ESLint 9 line no longer supported); kept because ESLint 9 is the approved major.
7. **shadcn 4.22.1 CLI output patched:** generated files imported `cn` from the bare specifier `"cn"` and the CLI added an unrelated npm package `cn`; imports rewritten to `@/lib/utils` and the `cn` package removed. The sonner component pulled in `next-themes` (not in the stack); removed the dependency and the `useTheme` call, so the toaster uses sonner's default theme until a theme store exists (step 5).
8. **Lint/format ignore `src/components/ui`** (generated shadcn code).
9. **`typecheck` is two `tsc -p` runs** (app and Node-side configs) instead of project references, because `tsc -b` requires `composite`.
10. **Dark scene tokens:** docs/04 §1 gives only ground `#0E1424` and walls `#1A2238`. The other dark scene values (`yard #151C30`, `road #202941`, `grass #14261E`, `tree #2E6B4A`, `roof #232C47`) are my choices; confirm or replace in step 6.
11. **`/wall` and `/login` render outside the AppShell** (docs/01: kiosk has no chrome; login is public). All other routes and the 404 are inside it.
12. **Language choice is not persisted** (no `localStorage`); default is English.
13. **Extra screenshots** `step-01-*-bn.png` show the Bangla state.
14. **`dist/` host scan:** the built JS contains `http(s)://` strings, all inert: 26× `http://www.w3.org` (SVG/XML namespace identifiers), `react.dev/errors/`, `reactrouter.com`, `react.i18next.com` (text inside error/warning messages), `http://localhost` (base for `new URL`). No `index.html`/CSS references to external hosts, and no fetch, script or font loading from the internet.
15. **Generated Playwright artefacts** (`test-results/`, `playwright-report/`) are ignored by `.gitignore`.
