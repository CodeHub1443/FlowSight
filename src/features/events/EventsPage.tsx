import { ShieldCheck } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WhEventWithStatus } from '@/domain';
import {
  useEventAction,
  useEventsInfinite,
  type EventsServerFilters,
} from '@/data/api/eventQueries';
import { selectAlertGroups } from '@/features/live/kpiDetail/selectors';
import { canActOnCategory } from '@/lib/rbac';
import { alertStore, useAlertStore, useOpenAlerts, useSessionStore } from '@/stores';
import { toast } from 'sonner';
import { EventDrawer } from './EventDrawer';
import { effectiveFilters, groupRows, isDefaultFilters, mergeRows } from './eventsModel';
import { EventsFilterBar } from './EventsFilterBar';
import { EventsTable } from './EventsTable';
import {
  eventPath,
  eventsPath,
  parseEventFilters,
  serializeEventFilters,
  type EventFilters,
} from './urlState';

const EMPTY: ReadonlySet<string> = new Set();

const serverPart = (f: EventFilters): EventsServerFilters => ({
  status: f.status,
  sev: f.sev,
  category: f.category,
  bay: f.bay,
  q: f.q,
  from: f.from,
  to: f.to,
});

function Skeleton() {
  const { t } = useTranslation('events');
  return (
    <div
      role="status"
      aria-label={t('state.loading')}
      data-testid="events-loading"
      className="border-card-border bg-card flex flex-col gap-px overflow-hidden rounded-[16px] border"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="bg-muted/60 m-1.5 h-9 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

/** /events and /events/:id: alerts and evidence centre (t22 spec section 3). */
export function EventsPage() {
  const { t } = useTranslation('events');
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const role = useSessionStore((s) => s.role);
  const action = useEventAction();

  const key = params.toString();
  const filters = useMemo(() => parseEventFilters(new URLSearchParams(key), role), [key, role]);
  const effective = useMemo(() => effectiveFilters(filters), [filters]);
  const server = useMemo(() => serverPart(effective), [effective]);

  const setFilters = useCallback(
    (patch: Partial<EventFilters>) => {
      setParams(new URLSearchParams(serializeEventFilters({ ...filters, ...patch })), {
        replace: true,
      });
    },
    [filters, setParams],
  );
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const query = useEventsInfinite(server);
  const fetched = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  // Live open events (alert store) merged by id; the ones that arrive while the user is scrolled wait behind "N new".
  const storeEvents = useAlertStore((s) => s.events);
  const live = useMemo(() => Object.values(storeEvents), [storeEvents]);
  const listKey = JSON.stringify(server);
  const baseline = useMemo(
    () => (query.isSuccess ? new Set(Object.keys(alertStore.getState().events)) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-baseline per query, not per store change
    [listKey, query.isSuccess],
  );
  const [away, setAway] = useState(false);
  const [applied, setApplied] = useState<ReadonlySet<string>>(EMPTY);
  const [topSignal, setTopSignal] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY);

  const merged = useMemo(
    () =>
      mergeRows(
        fetched,
        live,
        filters,
        role,
        away ? applied : new Set(live.map((e) => e.id)),
        baseline,
      ),
    [fetched, live, filters, role, away, applied, baseline],
  );
  const rows = useMemo(
    () => groupRows(merged.rows, filters.groupBy === 'visit', expanded),
    [merged.rows, filters.groupBy, expanded],
  );

  const openAlerts = useOpenAlerts();
  const groups = useMemo(() => selectAlertGroups(openAlerts, { includeEmpty: true }), [openAlerts]);

  const open = useCallback(
    (eid: string) => void navigate(eventPath(eid, filters)),
    [navigate, filters],
  );
  const closeDrawer = useCallback(() => void navigate(eventsPath(filters)), [navigate, filters]);
  const canAct = useCallback((e: WhEventWithStatus) => canActOnCategory(role, e.category), [role]);
  const ack = useCallback(
    (eid: string) =>
      action.mutate(
        { id: eid, action: 'ack' },
        { onError: () => toast.error(t('state.ackFailed')) },
      ),
    [action, t],
  );
  const toggleGroup = useCallback(
    (v: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(v)) next.add(v);
        return next;
      }),
    [],
  );
  const onAway = useCallback(
    (a: boolean) => {
      setAway((prev) => {
        if (a && !prev) setApplied(new Set(live.map((e) => e.id)));
        return a;
      });
    },
    [live],
  );
  const showNew = () => {
    setApplied(new Set(live.map((e) => e.id)));
    setTopSignal((n) => n + 1);
  };

  const drawerInitial = id ? merged.rows.find((e) => e.id === id) : undefined;
  const isDefault = isDefaultFilters(filters);

  let body;
  if (query.isPending) body = <Skeleton />;
  else if (query.isError) {
    body = (
      <div
        role="alert"
        data-testid="events-error"
        className="border-card-border bg-card flex flex-col items-start gap-2 rounded-[16px] border p-6"
      >
        <p className="text-ink-900 text-[14px] font-medium">{t('state.error')}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
          {t('state.retry')}
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = isDefault ? (
      <div
        data-testid="events-none-open"
        className="border-card-border bg-card flex flex-col items-center gap-2 rounded-[16px] border p-10 text-center"
      >
        <ShieldCheck className="text-status-ok size-8" aria-hidden />
        <p className="text-ink-900 text-[15px] font-semibold">{t('state.noOpen')}</p>
        <p className="text-ink-600 text-[13px]">{t('state.noOpenHint')}</p>
      </div>
    ) : (
      <div
        data-testid="events-empty"
        className="border-card-border bg-card flex flex-col items-center gap-3 rounded-[16px] border p-10 text-center"
      >
        <p className="text-ink-900 text-[15px] font-semibold">{t('state.empty')}</p>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          {t('filters.clear')}
        </Button>
      </div>
    );
  } else {
    body = (
      <EventsTable
        rows={rows}
        selectedId={id ?? null}
        canAct={canAct}
        hasMore={query.hasNextPage}
        fetchingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        onOpen={open}
        onAck={ack}
        onToggleGroup={toggleGroup}
        onEscape={closeDrawer}
        onScrolledAway={onAway}
        scrollTopSignal={topSignal}
      />
    );
  }

  return (
    <div
      data-testid="events-page"
      className="flex h-[calc(100dvh-9.5rem)] min-h-[560px] min-w-0 flex-col gap-3"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-ink-900 text-xl leading-7 font-semibold">{t('page.title')}</h1>
        {import.meta.env.VITE_DATA_MODE === 'mock' && <SimulatedMarker />}
      </header>
      <EventsFilterBar
        filters={filters}
        effective={effective}
        role={role}
        groups={groups}
        onChange={setFilters}
        onClear={clear}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {merged.pending.length > 0 && (
          <button
            type="button"
            data-testid="events-new-pill"
            onClick={showNew}
            className="bg-primary text-primary-foreground absolute start-1/2 top-12 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-[13px] font-semibold shadow-lg rtl:translate-x-1/2"
          >
            {t('page.newEvents', { n: merged.pending.length })}
          </button>
        )}
        {body}
      </div>
      <EventDrawer id={id ?? null} initial={drawerInitial} onClose={closeDrawer} />
    </div>
  );
}

/** Same marker as the analytics page, with its strings. */
function SimulatedMarker() {
  const { t } = useTranslation('analytics');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="events-simulated" className="rounded-full">
          <StatusPill tone="neutral">{t('simulated')}</StatusPill>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t('simulatedHint')}</TooltipContent>
    </Tooltip>
  );
}
