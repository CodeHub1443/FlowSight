import { BrowserRouter } from 'react-router';
import { DataSourceProvider } from './DataSourceProvider';
import { DebugReadout } from './DebugReadout';
import { AppRoutes } from './routes';
import { UiPreferenceSync } from './UiPreferenceSync';

export function App() {
  return (
    <DataSourceProvider>
      <UiPreferenceSync />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <DebugReadout />
    </DataSourceProvider>
  );
}
