/** Child routes of /admin (docs/01 §3). */
export const ADMIN_CHILDREN = [
  ['shifts', 'routes.shifts'],
  ['roster', 'routes.roster'],
  ['skus', 'routes.skus'],
  ['bays', 'routes.adminBays'],
  ['cameras', 'routes.cameras'],
  ['thresholds', 'routes.thresholds'],
  ['alert-rules', 'routes.alertRules'],
  ['users', 'routes.users'],
  ['telegram', 'routes.telegram'],
] as const;
