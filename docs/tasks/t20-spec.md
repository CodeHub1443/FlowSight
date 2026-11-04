# Task 20 spec: Performance tab in /analytics (BINDING for all T20 sessions)

Baseline: master after task-19.9 (`6db047f` or later). Contract revision 1.2 is additive; payloads keep `v: 1`.
If a brief and this file disagree, stop and report.

## 0. Standing rules that apply here
- Metric admission rule (CLAUDE.md): every metric must answer a management question and support a decision (section 1).
- Privacy (docs/03 section 2, docs/01 section 4.1 item 3): no person-level data. Do not call `/analytics/people`. The only
  crew number is a bay-level crew size.
- Metrics are computed in the backend; the frontend renders them (docs/01 section 4). No hard-coded sample numbers anywhere.
- A value that is unknown shows "-" with a reason; a value that cannot be measured at this depot is hidden.
- Never rank bays by raw throughput. Bays are listed in bay order (B01 to B07) and are never sorted by a value.

## 1. Widgets and the management question behind each
| Widget | Management question | Decision it supports | Source |
|---|---|---|---|
| W1 Bay efficiency vs comparable trucks (index) | Which bay is slower than comparable work would be? | Where to investigate: crew, equipment, layout, supervision | `/analytics/bay-performance` rows.index |
| W2 Where the time goes (pre-op / loading|unloading / post-op per bay, site median line) | Is a bay's delay before loading, in the loading itself, or after? | Fix preparation, crew, or release process | bay-performance rows.mean + site medians |
| W3 Workload context (cartons per loading hour, OUT/IN cartons, trucks, average crew, cartons per crew-hour) | Is a bay slow because of its work mix or its staffing? | Rebalance crews and trucks | bay-performance rows |
| W4 Throughput through the period (cartons per hour, this period vs the previous one) | Are we ahead or behind a normal day, and when did we fall behind? | Add labour, investigate the dip | existing `/analytics/throughput`, called twice |
| W5 Trucks over the expected time (count and share per bay) | Which bays hold trucks too long? | Escalate with the bay supervisor or the transporter | bay-performance rows.detentions |
Not shipped on this tab: raw throughput ranking, SKU tables (later SKU tab), anything per worker.

## 2. Comparison method (fair comparison; defined in docs/03 rev 1.2, computed by the backend)
- Unit: a visit finished in the range, with startedAt and finishedAt, and cartons > 0 (casesOut for OUT, casesIn for IN).
  MIXED-direction visits count in `visits` but are excluded from the index.
- Cohort: direction (OUT/IN) x dominant pack (CASE/SACK/SHRINK by carton count from `sku[]`; `MIXED` when none dominates or
  sku is missing) x volume band (3 bands cut at the terciles of cartons within direction x pack, per range). A cohort with
  fewer than 6 visits merges its bands; if still fewer than 6, its visits are excluded from the index.
- Cohort speed: `medianMinPer100` = median over the cohort's visits of (active minutes / cartons x 100).
- Expected active minutes of a visit = cartons / 100 x its cohort's `medianMinPer100`.
- Bay index = 100 x (sum expected_b / sum actual_b) / (sum expected_all / sum actual_all), where `_b` sums the bay's included visits and
  `_all` sums every included visit of the site in the range. Null if a denominator is 0 or "all" has no included visits.
  100 = typical for this depot's comparable trucks; higher is faster; lower is slower. (Added in 20.0b: durations are right-skewed, so a
  median-based expected time sits below the mean actual time and an uncalibrated index reads under 100 for almost every bay. Dividing by the
  depot's own ratio centres it: the bay indices weighted by their actual active minutes average exactly 100.)
- Confidence: included >= `minIncluded` (default 8) = OK; 4 to `minIncluded - 1` = LOW (shown muted, "few trucks"); under 4 = NONE (index null,
  "Not enough comparable trucks").
- Display bands (constants in one file): index 90 to 110 = "comparable" (neutral); under 90 = "slower than comparable trucks" (attention tone; 20.0b: relative to this depot's typical);
  over 110 = "faster". Never red/green shouting; use the existing tone tokens.
- Pre-operation and post-operation delay are NOT volume-normalised (they do not depend on carton count); each bay's mean is
  compared with the site median of the same range.
- Crew size is context only (not part of the index): `avgCrew` = mean workers detected while loading; `cartonsPerCrewHour` = cartons / (avgCrew x active hours),
  bay level, labelled "per crew member present", never "per worker".

## 3. Contract revision 1.2 (docs/03 first, then zod, then mock, then MSW)
New endpoint `GET /analytics/bay-performance?site&from&to` (permitted for every role that may view analytics):
```ts
type BayPerfRow = {
  bay: string;                                   // B01..B07, one row per configured bay, even with no visits
  visits: number;                                // finished visits in range
  included: number;                              // visits used in the index
  cartonsOut: number; cartonsIn: number;
  cartonsPerLoadingHour: number | null;          // cartons / active hours
  minPer100Cartons: number | null;               // active minutes per 100 cartons
  avgCrew: number | null;
  cartonsPerCrewHour: number | null;
  mean: { occupancyMin: number | null; waitForDockMin: number | null; preOpMin: number | null;
          activeMin: number | null; postOpMin: number | null };
  detentions: number;                            // visits over the detention threshold
  index: number | null;
  confidence: 'OK' | 'LOW' | 'NONE';
};
type BayPerformance = {
  from: string; to: string; minIncluded: number;
  site: { visits: number; medianOccupancyMin: number | null; medianPreOpMin: number | null; medianPostOpMin: number | null };
  cohorts: { key: string; dir: 'OUT' | 'IN'; pack: 'CASE' | 'SACK' | 'SHRINK' | 'MIXED'; band: 1 | 2 | 3 | null;   // null = merged cohort, key ends ".all"
             n: number; medianMinPer100: number }[];
  rows: BayPerfRow[];
};
```
- Add it to the endpoint table, a valid JSON fixture, a changelog entry "rev 1.2" in docs/03, the zod schema, the DataSource
  client method, the MSW handler, and the simulator implementation computed from the simulator's own visits.
- Unit tests with hand-built visits where the expected index is known exactly (for example two bays, one taking 25 % longer for the same cohort
  and volume gives indices that match the arithmetic), the cohort merge rule, the confidence thresholds, MIXED exclusion, an empty range,
  a bay with no visits, a visit with null timestamps.
- The final report lists the exact diff for the backend developer (state-engine must compute the same definitions).

## 4. UI specification
- `/analytics` becomes a tabbed page with the tabs of docs/01 section 3 and Performance FIRST and default. Only Performance is built;
  the other tabs keep the existing placeholder. Tabs are nested routes (`/analytics`, `/analytics/<tab>`); roles as docs/01 (not KIOSK).
- One shared range selector: `shift` (current shift), `day` (today), `week` (last 7 business days); URL search param `range`, default `day`;
  from/to computed in Asia/Dhaka from the site's business-day and shift data. The previous period for W4 is the same length, immediately before.
  Data refetch every 60 s only for `shift` and `day`; no per-second updates; no per-frame work.
- Charts use ECharts (already a dependency, with echarts-for-react). Import tree-shaken (`echarts/core` + only the chart types and components needed
  + CanvasRenderer). The chart code is lazy-loaded for the analytics route and must NOT enter the /live entry chunk (verify with the build output
  and report chunk sizes before and after). One small `<Chart option>` wrapper owns theme tokens (light and dark from index.css tokens), font
  (Inter / Noto Sans Bengali), Bangla digits through formatter callbacks, resize handling, `prefers-reduced-motion`, and disposal on unmount.
- Every chart has a text alternative: an `aria-label` summary plus a visually hidden data table.
- Widgets: W1 seven rows in bay order, each with bay label, index number, a bar centred on 100 with the 90 to 110 band shaded, "n visits" and the
  confidence note; a short "How this is calculated" popover with one sentence ("compared with this depot's typical comparable trucks: same
  direction, pack type and similar volume"). W2 stacked horizontal bars (pre-op / work / post-op, tones from segmentTone.ts) with the occupancy value at the end and a
  vertical line for the site median occupancy. W3 a compact table in bay order (no sorting). W4 a line chart of cartons per hour for the period and the previous
  period, with an optional bay filter. W5 a strip with detentions and their share of trucks per bay.
- Every widget has all four states: loading skeleton, error with retry, empty ("No finished trucks in this range"), insufficient data.
  W1's insufficient state (no bay has an index) reads "n of <minIncluded> comparable trucks in this range" (n = the highest `included` of any
  bay) and carries a button "Show last 7 days" that sets the shared range to `week`; the button is hidden when the range is already `week`.
- In mock mode the page header carries the existing simulated-data marker; no new "illustrative" captions.
- All strings EN + BN, Bangla digits, lakh grouping. i18n namespaces: `analytics` (20.0: tab names, range labels, shared states), `perfindex` (20A), `perftrend` (20B).

## 5. Shared code (owned by 20.0; 20A and 20B import it and must not edit it)
Contract and schemas, mock implementation, DataSource method and hook (`useBayPerformance(range)`, `useThroughput(range, previous)`), range selector,
page shell with tabs, `<Chart>` wrapper and chart theme, pure selectors (`indexBand(index)`, `confidenceNote`, `siteMedianLine`, period helpers) with tests,
the three i18n namespaces registered with valid en/bn files, the bundle report.

## 6. Ownership for the parallel phase
| Session | Worktree / branch | May edit | Must not edit |
|---|---|---|---|
| 20.0 base | main worktree / master | contract, schemas, data layer, mock, shell, `<Chart>`, selectors, i18n index and the `analytics` namespace | widget components |
| 20A comparison | `Unilever_Depo-worktrees/t20a`, `t20a-compare` | `src/features/analytics/perf/index/**` (W1, W2, W3), `perfindex.json` en/bn, `e2e/t20a-compare.spec.ts`, `docs/progress/t20a.md` | the 20B column, shared files |
| 20B trend | `Unilever_Depo-worktrees/t20b`, `t20b-trend` | `src/features/analytics/perf/trend/**` (W4, W5), `perftrend.json` en/bn, `e2e/t20b-trend.spec.ts`, `docs/progress/t20b.md` | the 20A column, shared files |
| 20.9 integration | main worktree / master | merges, docs, seam fixes | scene |
Shared files nobody edits in the parallel phase: `src/domain/**`, `src/data/**`, `src/stores/**`, `src/i18n/index.ts`, `src/i18n/locales/*/{common,live,analytics}.json`,
the shell and chart wrapper, `docs/03`, `docs/PROGRESS.md`, `package.json`, the lockfile, `playwright.config.ts`, `e2e/fixtures.ts`.
The parallel phase runs NO browser, NO Playwright, NO screenshots: allowed are typecheck, lint, format:check, i18n:check, `pnpm test` (`--testTimeout=60000` if needed), build.

## 7. Global prohibitions
No scene, lighting, camera, quality, actor or asset changes. No new dependencies. No `/analytics/people`. No per-worker data. No hard-coded numbers.
No pushes. No destructive git operations. No full e2e suite.
