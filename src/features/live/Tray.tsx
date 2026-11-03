import { ChevronRight, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  Num,
  StatusPill,
  ThinProgress,
  TONE_DOT,
  TONE_TEXT,
  TONE_TINT,
  useFlip,
  type Tone,
} from '@/components/common';
import type {
  BeltStatus,
  EventStatus,
  Severity,
  UiLang,
  VisitPhase,
  WhEventWithStatus,
} from '@/domain';
import { formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBays, useOpenAlerts, useUiStore, type Selection, type TrayTab } from '@/stores';
import { focusObject } from './focusObject';
import { alertGroupOf, matchesAlertGroup, type AlertGroupId } from './kpiDetail/selectors';
import { clearTrayAlertGroup, useTrayAlertGroup, useTrayOpenRequest } from './kpiDetail/trayFilter';
import { captainName } from './privacy';
import { bayLabel } from './siteInfo';
import { BELT_TONE, EVENT_STATUS_TONE, PHASE_TONE, SEV_TONE } from './tones';
import { useFmt } from './useFmt';
import { useActiveVisits, useRole, useStreamNow } from './useLiveModel';
import { onSiteCount, visitCount, visitProgress } from './model';

const TABS: readonly TrayTab[] = ['bays', 'trucks', 'alerts', 'captains'];

// Flicker rules (docs/06 §4): every list keeps a stable order and stable keys (ids); each row is memoised and gets
// primitives only, so a store flush that changes nothing a row shows does not render it; the right column has a
// fixed width, so a changing pill or number never moves the title column; FLIP animates rows that move.

/**
 * One 48 px tray row (docs/06 U6): status dot, bold id + sub-line, then a fixed-width right column (pill over mini
 * progress / value). Hover and selected backgrounds are `--row-hover` / `--row-selected`, 12 px radius.
 */
function Row({
  selected,
  onClick,
  testId,
  flipKey,
  tone,
  title,
  sub,
  pill,
  meta,
  alertGroup,
}: {
  selected: boolean;
  onClick: () => void;
  testId: string;
  flipKey: string;
  tone: Tone;
  title: ReactNode;
  sub: ReactNode;
  pill: ReactNode;
  meta?: ReactNode;
  /** Alerts tab: the row's alert group (spec 5A), for the group filter and tests. */
  alertGroup?: AlertGroupId;
}) {
  return (
    <li data-flip-key={flipKey}>
      <button
        type="button"
        data-testid={testId}
        data-alert-group={alertGroup}
        aria-current={selected ? 'true' : undefined}
        onClick={onClick}
        className={cn(
          'soft-transition focus-visible:ring-ring/50 grid h-[48px] w-full grid-cols-[8px_minmax(0,1fr)_8.5rem_14px] items-center gap-x-[10px] rounded-[12px] px-[10px] text-left focus-visible:ring-[3px] focus-visible:outline-none',
          selected ? 'bg-row-selected' : 'hover:bg-row-hover',
        )}
      >
        <span
          aria-hidden
          className={cn('soft-transition size-[8px] rounded-full', TONE_DOT[tone])}
        />
        <span className="min-w-0">
          <span className="text-ink-900 flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] font-bold">
            {title}
          </span>
          <span className="text-ink-400 block truncate text-[12px] leading-[14px]">{sub}</span>
        </span>
        <span className="flex min-w-0 flex-col items-end gap-0.5">
          {pill}
          {meta}
        </span>
        <ChevronRight
          className="text-ink-400 size-3.5 rtl:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
    </li>
  );
}

/** Right-column second line: a mini progress bar with its value, or a caption. Fixed height either way. */
function Meta({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="text-ink-400 flex h-4 max-w-full items-center justify-end gap-1.5 truncate text-[12px] leading-4 tabular-nums"
    >
      {children}
    </span>
  );
}

const BayRow = memo(function BayRow({
  id,
  status,
  rateCpm,
  plate,
  progress,
  alertsOpen,
  alertSev,
  selected,
  lang,
}: {
  id: string;
  status: BeltStatus;
  rateCpm: number;
  plate: string | null;
  progress: number | null;
  alertsOpen: number;
  alertSev: Severity | null;
  selected: boolean;
  lang: UiLang;
}) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const tone = BELT_TONE[status];
  return (
    <Row
      flipKey={id}
      testId={`tray-bay-${id}`}
      selected={selected}
      onClick={() => focusObject({ kind: 'bay', id })}
      tone={tone}
      title={
        <>
          <span className="truncate">{bayLabel(id, lang)}</span>
          {alertsOpen > 0 && alertSev && (
            <span
              data-testid={`tray-bay-alerts-${id}`}
              title={t('tray.alertsCount', { n: fmt.num(alertsOpen) })}
              className={cn(
                'soft-transition inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums',
                TONE_TINT[SEV_TONE[alertSev]],
                TONE_TEXT[SEV_TONE[alertSev]],
              )}
            >
              {fmt.num(alertsOpen)}
            </span>
          )}
        </>
      }
      sub={plate ?? t('tray.noTruck')}
      pill={<StatusPill tone={tone}>{t(`belt.status.${status}`)}</StatusPill>}
      meta={
        progress !== null ? (
          <Meta>
            <ThinProgress
              value={progress}
              tone={tone}
              label={t('tray.progress')}
              className="h-[4px] w-[36px]"
            />
            <Num value={Math.round(progress)} format={fmt.pctInt} minCh={4} className="text-end" />
          </Meta>
        ) : (
          <Meta>{rateCpm > 0 ? t('tray.rate', { n: fmt.num(rateCpm, 1) }) : '—'}</Meta>
        )
      }
    />
  );
});

function BaysList({ lang }: { lang: UiLang }) {
  const bays = useBays();
  const selection = useUiStore((s) => (s.selection?.kind === 'bay' ? s.selection.id : null));
  return (
    <FlipList>
      {bays.map((b) => (
        <BayRow
          key={b.bay}
          id={b.bay}
          status={b.belt.status}
          rateCpm={b.belt.rateCpm}
          plate={b.visit ? formatPlate(b.visit.plate).primary : null}
          progress={b.visit ? visitProgress(b.visit) : null}
          alertsOpen={b.alerts.open}
          alertSev={b.alerts.maxSev}
          selected={selection === b.bay}
          lang={lang}
        />
      ))}
    </FlipList>
  );
}

const TruckRow = memo(function TruckRow({
  visitId,
  bay,
  platePrimary,
  plateSecondary,
  phase,
  waiting,
  slot,
  count,
  expected,
  progress,
  selected,
  lang,
}: {
  visitId: string;
  bay: string;
  platePrimary: string;
  plateSecondary: string | null;
  phase: VisitPhase;
  waiting: boolean;
  slot: number | null;
  count: number;
  expected: number | null;
  progress: number | null;
  selected: boolean;
  lang: UiLang;
}) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const tone: Tone = waiting ? 'neutral' : PHASE_TONE[phase];
  return (
    <Row
      flipKey={visitId}
      testId={`tray-truck-${visitId}`}
      selected={selected}
      onClick={() => focusObject({ kind: 'truck', id: visitId })}
      tone={tone}
      title={<span className="truncate">{platePrimary}</span>}
      sub={[plateSecondary, bayLabel(bay, lang)].filter(Boolean).join(' · ')}
      pill={
        <StatusPill tone={tone}>{waiting ? t('queue.waiting') : t(`phase.${phase}`)}</StatusPill>
      }
      meta={
        waiting ? (
          <Meta testId={`tray-truck-slot-${visitId}`}>
            {slot === null ? t('queue.noSlot') : t('queue.slot', { n: fmt.num(slot) })}
          </Meta>
        ) : (
          <Meta>
            {progress !== null && (
              <ThinProgress
                value={progress}
                tone={tone}
                label={t('tray.progress')}
                className="h-[4px] w-[36px]"
              />
            )}
            <span>
              <Num value={count} format={fmt.int} minCh={5} className="text-end" />/
              {expected === null ? '—' : fmt.num(expected)}
            </span>
          </Meta>
        )
      }
    />
  );
});

function TrucksList({ lang }: { lang: UiLang }) {
  const visits = useActiveVisits();
  const selection = useUiStore((s) => (s.selection?.kind === 'truck' ? s.selection.id : null));
  return (
    <FlipList>
      {visits.map(({ bay, visit, waiting }) => {
        const plate = formatPlate(visit.plate);
        return (
          <TruckRow
            key={visit.visitId}
            visitId={visit.visitId}
            bay={bay}
            platePrimary={plate.primary}
            plateSecondary={plate.secondary}
            phase={visit.phase}
            waiting={waiting !== null}
            slot={waiting?.slot ?? null}
            count={visitCount(visit)}
            expected={visit.expected}
            progress={visitProgress(visit)}
            selected={selection === visit.visitId}
            lang={lang}
          />
        );
      })}
    </FlipList>
  );
}

const AlertRow = memo(function AlertRow({
  id,
  group,
  title,
  bay,
  sev,
  status,
  ago,
  selected,
  lang,
}: {
  id: string;
  group: AlertGroupId;
  title: string;
  bay: string | null;
  sev: Severity;
  status: EventStatus;
  /** Pre-formatted age, so the row only renders when the text changes. */
  ago: string;
  selected: boolean;
  lang: UiLang;
}) {
  const { t } = useTranslation('live');
  return (
    <Row
      flipKey={id}
      testId={`tray-alert-${id}`}
      alertGroup={group}
      selected={selected}
      onClick={() => focusObject({ kind: 'event', id })}
      tone={SEV_TONE[sev]}
      title={<span className="truncate">{title}</span>}
      sub={[bay ? bayLabel(bay, lang) : null, ago].filter(Boolean).join(' · ')}
      pill={<StatusPill tone={EVENT_STATUS_TONE[status]}>{t(`eventStatus.${status}`)}</StatusPill>}
      meta={<Meta>{t(`sev.${sev}`)}</Meta>}
    />
  );
});

/** Newest first; a new alert slides the rows below it down (FLIP) instead of making them jump. */
function AlertsList({ lang, alerts }: { lang: UiLang; alerts: WhEventWithStatus[] }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const selection = useUiStore((s) => (s.selection?.kind === 'event' ? s.selection.id : null));
  const now = useStreamNow();
  return (
    <FlipList>
      {alerts.map((e) => (
        <AlertRow
          key={e.id}
          id={e.id}
          group={alertGroupOf(e.category, e.type)}
          title={e.title[lang] || e.title.en}
          bay={e.bay}
          sev={e.sev}
          status={e.status}
          ago={t('tray.ago', { dur: fmt.dur(Math.max(0, (now - Date.parse(e.ts)) / 1000)) })}
          selected={selection === e.id}
          lang={lang}
        />
      ))}
    </FlipList>
  );
}

const CaptainRow = memo(function CaptainRow({
  bay,
  name,
  present,
  trackId,
  selected,
  lang,
}: {
  bay: string;
  /** Null when absent or the role may not see captain names. */
  name: string | null;
  present: boolean;
  trackId: string | null;
  selected: boolean;
  lang: UiLang;
}) {
  const { t } = useTranslation('live');
  const tone: Tone = present ? 'ok' : 'warn';
  return (
    <Row
      flipKey={bay}
      testId={`tray-captain-${bay}`}
      selected={selected}
      onClick={() =>
        focusObject(trackId ? { kind: 'person', id: trackId } : { kind: 'bay', id: bay })
      }
      tone={tone}
      title={<span className="truncate">{name ?? t('actorRole.CAPTAIN')}</span>}
      sub={bayLabel(bay, lang)}
      pill={
        <StatusPill tone={tone}>{present ? t('tray.onFloor') : t('tray.notOnFloor')}</StatusPill>
      }
    />
  );
});

function CaptainsList({ lang }: { lang: UiLang }) {
  const bays = useBays();
  const role = useRole();
  const selection = useUiStore((s) => s.selection);
  return (
    <FlipList>
      {bays.map((b) => {
        const c = b.crew.captain;
        if (!c) return null;
        const name = captainName(b, role);
        const target: Selection = c.trackId
          ? { kind: 'person', id: c.trackId }
          : { kind: 'bay', id: b.bay };
        return (
          <CaptainRow
            key={b.bay}
            bay={b.bay}
            name={name ? name[lang] || name.en : null}
            present={c.present}
            trackId={c.trackId}
            selected={selection?.kind === target.kind && selection.id === target.id}
            lang={lang}
          />
        );
      })}
    </FlipList>
  );
}

function FlipList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref);
  return (
    <ul ref={ref} className="relative flex flex-col gap-0.5">
      {children}
    </ul>
  );
}

/** "Showing: PPE (3)" above the alert rows, with a button that drops the filter. */
function AlertGroupFilterBar({ group, count }: { group: AlertGroupId; count: number }) {
  const { t } = useTranslation('kpidetail');
  const fmt = useFmt();
  return (
    <div
      data-testid="tray-filter"
      data-group={group}
      className="bg-row-selected bn-leading mx-1 mb-1 flex min-h-8 items-center gap-2 rounded-[12px] ps-3 pe-1 text-[12.5px] leading-4"
    >
      <span className="text-ink-900 min-w-0 flex-1 truncate font-medium">
        {t('tray.filter', { group: t(`groups.${group}`) })}
      </span>
      <span className="text-info-ink shrink-0 tabular-nums">{fmt.num(count)}</span>
      <button
        type="button"
        data-testid="tray-filter-clear"
        aria-label={t('tray.clear')}
        title={t('tray.clear')}
        onClick={clearTrayAlertGroup}
        className="soft-transition text-ink-400 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-6 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <X className="size-3.5" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Bottom-right tray: Bays n/7 · Trucks n · Alerts n · Captains n (docs/01 §3.1). Rows select the object and fly the
 * camera to it. Order is stable: bays by id, trucks at a bay then queued by arrival, alerts newest first.
 */
export function Tray() {
  const { t } = useTranslation('live');
  const { t: td } = useTranslation('kpidetail');
  const fmt = useFmt();
  const bays = useBays();
  const trucks = useActiveVisits();
  const alerts = useOpenAlerts();
  const tab = useUiStore((s) => s.trayTab);
  const setTab = useUiStore((s) => s.setTrayTab);
  // Alert-group filter, set from the "Needs attention" popover (Task 19 spec 5A). It narrows the same role-filtered
  // open list and lasts while the Alerts tab is showing.
  const group = useTrayAlertGroup();
  const openRequest = useTrayOpenRequest();
  const shownAlerts = useMemo(
    () => (group === null ? alerts : alerts.filter((e) => matchesAlertGroup(e, group))),
    [alerts, group],
  );
  useEffect(() => {
    if (tab !== 'alerts') clearTrayAlertGroup();
  }, [tab]);

  const running = bays.filter((b) => b.belt.status === 'RUNNING_LOADED').length;
  const captains = bays.filter((b) => b.crew.captain?.present).length;
  const counts: Record<TrayTab, string> = {
    bays: `${fmt.num(running)}/${fmt.num(bays.length)}`,
    trucks: fmt.num(onSiteCount(trucks)),
    alerts: fmt.num(alerts.length),
    captains: fmt.num(captains),
  };

  return (
    <CollapsiblePanel
      // a new "open for a group" request re-creates the panel, so a collapsed tray opens (CollapsiblePanel is
      // uncontrolled); the key is constant otherwise, so live updates never remount it
      key={openRequest}
      testId="tray"
      className="max-h-[46%] w-full shrink-0"
      headerClassName="ps-[12px] pe-[10px] pt-[12px] pb-[8px]"
      bodyClassName="scroll-fade overflow-y-auto overscroll-contain px-[6px] pb-[14px]"
      collapseLabel={t('panel.collapse')}
      expandLabel={t('panel.expand')}
      header={
        <div
          role="tablist"
          aria-label={t('tray.label')}
          className="bg-segment-track flex min-w-0 items-center gap-0.5 rounded-full p-[3px]"
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tray-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="tray-panel"
              onClick={() => setTab(id)}
              className={cn(
                'soft-transition focus-visible:ring-ring/50 flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] leading-4 font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none',
                tab === id
                  ? 'bg-card text-ink-900 shadow-raised'
                  : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {t(`tray.tabs.${id}`)}
              <span className={cn('tabular-nums', tab === id ? 'text-info-ink' : 'text-ink-400')}>
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
      }
    >
      <div id="tray-panel" role="tabpanel" aria-labelledby={`tray-tab-${tab}`}>
        {tab === 'bays' && <BaysList lang={fmt.lang} />}
        {tab === 'trucks' && <TrucksList lang={fmt.lang} />}
        {tab === 'alerts' && group !== null && (
          <AlertGroupFilterBar group={group} count={shownAlerts.length} />
        )}
        {tab === 'alerts' && <AlertsList lang={fmt.lang} alerts={shownAlerts} />}
        {tab === 'captains' && <CaptainsList lang={fmt.lang} />}
        {tab === 'alerts' && alerts.length === 0 && (
          <p className="text-ink-400 px-2 py-4 text-center text-[13px]">{t('tray.noAlerts')}</p>
        )}
        {tab === 'alerts' && alerts.length > 0 && shownAlerts.length === 0 && (
          <p className="text-ink-400 px-2 py-4 text-center text-[13px]">{td('tray.empty')}</p>
        )}
      </div>
    </CollapsiblePanel>
  );
}
