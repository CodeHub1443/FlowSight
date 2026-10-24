/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE: 'mock' | 'live' | 'replay';
  readonly VITE_API_BASE: string;
  readonly VITE_NATS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
