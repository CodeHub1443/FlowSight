import { useEffect, useState, type ReactNode } from 'react';
import { createDataSource, type DataSource, type DataSourceOptions } from '@/data';
import { alertStore, liveStore, wireDataSource } from '@/stores';
import { DataSourceContext } from './dataSourceContext';

const SITE_ID = 'dhk-depot';

function defaultOptions(): DataSourceOptions {
  return { mode: import.meta.env.VITE_DATA_MODE, siteId: SITE_ID, baseUrl: '' };
}

/** Create the source, or capture why not (a mode whose source is not built yet must not blank the app). */
function tryCreate(create: (opts: DataSourceOptions) => DataSource): {
  source: DataSource | null;
  error: Error | null;
} {
  try {
    return { source: create(defaultOptions()), error: null };
  } catch (e) {
    return { source: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Owns the DataSource lifecycle and feeds the stores. UI never touches the source: it reads the stores.
 * `create` is injectable for tests.
 */
export function DataSourceProvider({
  children,
  create = createDataSource,
}: {
  children: ReactNode;
  create?: (opts: DataSourceOptions) => DataSource;
}) {
  const [{ source, error }] = useState(() => tryCreate(create));

  useEffect(() => {
    if (!source) {
      liveStore.getState().setSourceStatus('offline');
      return;
    }
    const unwire = wireDataSource(source, { live: liveStore, alerts: alertStore });
    void source.connect();
    return () => {
      unwire();
      void source.disconnect();
      liveStore.getState().setSourceStatus('offline');
    };
  }, [source]);

  useEffect(() => {
    if (error) console.error(error.message);
  }, [error]);

  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>;
}
