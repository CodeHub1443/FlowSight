import { createHandlers, type MockApiOptions } from './handlers';

export { createHandlers } from './handlers';
export type { MockApiOptions } from './handlers';
export { createSession } from './session';

export interface MockApi {
  stop(): void;
}

/**
 * Starts the MSW service worker with handlers for every REST endpoint (docs/03 section 4). Call once before the app
 * renders in mock mode. Unhandled requests pass through; nothing leaves localhost.
 *
 *     await startMockApi({ apiBase: import.meta.env.VITE_API_BASE });
 */
export async function startMockApi(
  opts: MockApiOptions & { quiet?: boolean } = {},
): Promise<MockApi> {
  const { setupWorker } = await import('msw/browser');
  const worker = setupWorker(...createHandlers(opts));
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: opts.quiet ?? true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
  return { stop: () => worker.stop() };
}
