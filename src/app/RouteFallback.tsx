// Task 22.11: shown while a lazy route's chunk loads. Previously masked by the router's transition (the old page
// stayed on screen until the new one was ready); task 22.10 found that masking cost several seconds on a busy /live
// scene, so navigation no longer runs inside a transition (src/app/App.tsx). Suspending without transitions renders
// this instead of nothing. Text-free by design (no bilingual strings to maintain here) and pulses only without
// `prefers-reduced-motion` (`motion-safe:`), matching the one skeleton primitive already in the app
// (`src/features/analytics/perf/shared/WidgetStates.tsx`'s `Skeleton`, not imported here since that module is itself
// a lazy chunk).

function Bar({ className }: { className: string }) {
  return (
    <div aria-hidden className={`bg-muted rounded-lg motion-safe:animate-pulse ${className}`} />
  );
}

/** Fills a lazy route's content area (inside AppShell/PageLayout, which stay mounted and visible underneath). */
export function RouteFallback() {
  return (
    <div data-testid="route-fallback" className="flex flex-col gap-3 py-1">
      <Bar className="h-7 w-48" />
      <Bar className="h-32 w-full" />
      <Bar className="h-32 w-full" />
    </div>
  );
}
