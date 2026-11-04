// /analytics tabs (docs/01 section 3, with Performance first and default: docs/tasks/t20-spec.md section 4).
// `path` is relative to /analytics; Performance is the index route.

export const ANALYTICS_TABS = [
  { id: 'performance', path: '' },
  { id: 'throughput', path: 'throughput' },
  { id: 'dwell', path: 'dwell' },
  { id: 'productivity', path: 'productivity' },
  { id: 'compliance', path: 'compliance' },
  { id: 'hygiene', path: 'hygiene' },
  { id: 'sku', path: 'sku' },
  { id: 'equipment', path: 'equipment' },
] as const;

export type AnalyticsTabId = (typeof ANALYTICS_TABS)[number]['id'];

/** Tabs after Performance: placeholders until their tasks land. */
export const PLACEHOLDER_TABS = ANALYTICS_TABS.filter((t) => t.id !== 'performance');
