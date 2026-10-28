import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-500.css';
import '@fontsource/noto-sans-bengali/bengali-600.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import './index.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

/** Mock mode only: the MSW service worker answers the REST API. Live builds drop this branch (and the msw chunk). */
async function startMockApi(): Promise<void> {
  if (import.meta.env.VITE_DATA_MODE !== 'mock') return;
  try {
    const msw = await import('@/data/msw');
    await msw.startMockApi({ apiBase: import.meta.env.VITE_API_BASE });
  } catch (e) {
    // e.g. no service workers outside a secure context (plain http on a LAN host): live channels still run.
    console.error('[mock api] not started', e);
  }
}

void startMockApi().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
