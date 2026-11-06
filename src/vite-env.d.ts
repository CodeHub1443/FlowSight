/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE: 'mock' | 'live' | 'replay';
  readonly VITE_API_BASE: string;
  readonly VITE_NATS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json version, injected by vite.config.ts `define`. */
declare const __APP_VERSION__: string;
