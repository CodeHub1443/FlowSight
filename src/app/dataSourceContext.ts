import { createContext, useContext } from 'react';
import type { DataSource } from '@/data';

/** The active DataSource, or null when the configured mode could not be created (see DataSourceProvider). */
export const DataSourceContext = createContext<DataSource | null>(null);

export function useDataSource(): DataSource | null {
  return useContext(DataSourceContext);
}
