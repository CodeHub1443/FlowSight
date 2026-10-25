/* global window, document */
// Test-only page for e2e/mock-browser.spec.ts. It starts the MSW service worker and the MockSource exactly as the app
// will after the main session wires them, and exposes counters on window.__mock. It is not part of the app build.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import i18n from '/src/i18n/index.ts';
import { MockControls, MockSource, getSimRuntime } from '/src/data/mock/index.ts';
import { startMockApi } from '/src/data/msw/index.ts';

const state = { ready: false, error: null, counts: {}, lifecycle: [] };
window.__mock = state;

try {
  await startMockApi({ apiBase: '/api' });
  await getSimRuntime().ensure({ scenario: 'peak', seed: 1, speed: 10 });
  const source = new MockSource({ mode: 'mock', siteId: 'dhk-depot', baseUrl: '' });
  const count = (kind) => () => {
    state.counts[kind] = (state.counts[kind] ?? 0) + 1;
  };
  source.onSiteState(count('siteState'));
  source.onBayState(count('bayState'));
  source.onActors(count('actors'));
  source.onCase(count('case'));
  source.onEvent(count('event'));
  source.onHealth(count('health'));
  source.onLifecycle((u) => {
    state.lifecycle.push(u);
    count('lifecycle')();
  });
  await source.connect();
  state.control = () => source.control.get();
  state.setLang = (lng) => i18n.changeLanguage(lng);
  state.workerLoaded = () =>
    performance.getEntriesByType('resource').some((e) => e.name.includes('simulator.worker'));
  createRoot(document.getElementById('root')).render(createElement(MockControls, { source }));
  state.ready = true;
} catch (e) {
  state.error = String(e instanceof Error ? e.stack : e);
}
