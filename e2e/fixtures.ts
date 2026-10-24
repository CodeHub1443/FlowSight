import { expect, test as base, type Page } from '@playwright/test';

// Offline-LAN guard (CLAUDE.md): the app may only talk to localhost / 127.0.0.1.
// Every test using this `test` fails if the page requests any other host; such requests are also blocked.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const NON_NETWORK_PROTOCOLS = new Set(['data:', 'blob:', 'about:']);

export function isLocalRequest(url: string): boolean {
  const u = new URL(url);
  return NON_NETWORK_PROTOCOLS.has(u.protocol) || LOCAL_HOSTS.has(u.hostname);
}

/** Block and record every non-local request made by `page`. Returns the live list of offending URLs. */
export async function installNetworkGuard(page: Page): Promise<string[]> {
  const offenders: string[] = [];
  page.on('request', (req) => {
    if (!isLocalRequest(req.url())) offenders.push(req.url());
  });
  await page.route('**/*', (route) =>
    isLocalRequest(route.request().url()) ? route.fallback() : route.abort('blockedbyclient'),
  );
  return offenders;
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    const offenders = await installNetworkGuard(page);
    await provide(page);
    expect(offenders, 'page requested a host other than localhost / 127.0.0.1').toEqual([]);
  },
});

export { expect };
