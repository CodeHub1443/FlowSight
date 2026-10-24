# Progress notes: convention for parallel sessions

Steps 3 (simulator), 5 (shell) and 6 (static 3D) run in parallel worktrees. To keep merges conflict-free:

## Progress files
- Each step writes its own notes to `docs/progress/step-NN.md` (what was done, what is stubbed, deviations, commands and results).
- **Only the main session edits `docs/PROGRESS.md`.** It ticks the step and links to the step file. Parallel sessions never touch it.

## i18n namespaces
Locale files are split per namespace: `src/i18n/locales/{en,bn}/{common,live,scene,mock,admin}.json`.
`pnpm i18n:check` validates every namespace pair: a key missing from either language, an empty Bangla value, or a file present in only one language fails the check.

| Namespace | Owner | Holds |
|---|---|---|
| `mock` | simulator session (step 3) | strings for mock-mode UI and simulator controls (speed, seed, scenario names) |
| `live` | shell session (step 5) | top bar, KPI chips, inspector, tray, visit tracker, alert bell |
| `scene` | 3D session (step 6 onward) | scene labels, pin text, camera and x-ray controls |
| `admin` | later (step 12) | admin screens |
| `common` | **main session only** | app name, language names, routes, placeholders, 404, debug readout, anything shared |

Rules:
- Use a key from your own namespace with `useTranslation('live')` (or `t('live:kpi.cases')`); the default namespace is `common`.
- Need a shared string? Ask the main session to add it to `common`. Do not edit `common.json` from a parallel session.
- Add every key to both `en` and `bn` in the same change, or `i18n:check` fails.

## Shared files that parallel sessions must not edit
`src/data/DataSource.ts`, `src/data/index.ts` (the main session edits it when the simulator lands), `src/stores/**`, `src/app/DataSourceProvider.tsx`, `src/i18n/index.ts`, `playwright.config.ts`, `e2e/fixtures.ts`.
If a change is needed there, report it instead of making it.

## Using the data layer
- Components read live data with the hooks in `@/stores` (`useBay`, `useBays`, `useSiteKpi`, `useOpenAlerts`, `useConnStatus`, `useBayStale`).
- 3D code uses the non-React accessors (`getBay`, `subscribeBay`, `getActors`, `subscribeActors`) and keeps values in refs.
- E2E tests import `test` and `expect` from `./fixtures` (not from `@playwright/test`) so the network guard applies.
