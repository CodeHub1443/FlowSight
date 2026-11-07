import { BrowserRouter } from 'react-router';
import { DataSourceProvider } from './DataSourceProvider';
import { DebugReadout } from './DebugReadout';
import { AppRoutes } from './routes';
import { UiPreferenceSync } from './UiPreferenceSync';

// Task 22.10/22.11: react-router 7's `useTransitions?: boolean` (dom-export.d.ts on BrowserRouterProps) defaults to
// wrapping every router state update in `React.startTransition`. Measured on the busy /live scene (docs/progress/
// t22-10.md): that let the scene's own synchronous work (its 4 Hz store flushes, outside React's scheduler) starve
// the transition for a median of 7-22 s between the URL changing and the destination page committing. `false` here
// makes every navigation synchronous instead: median 7-300 ms, no change to how much work the scene itself does.
// A synchronous navigation into an unloaded lazy chunk suspends without the transition's fallback-masking, so every
// lazy route below needs its own Suspense `fallback` (routes.tsx) — that is the other half of this fix.
export function App() {
  return (
    <DataSourceProvider>
      <UiPreferenceSync />
      <BrowserRouter useTransitions={false}>
        <AppRoutes />
      </BrowserRouter>
      <DebugReadout />
    </DataSourceProvider>
  );
}
