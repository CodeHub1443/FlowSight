import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  StatusPill,
  ThinProgress,
  TONE_DOT,
  type Tone,
} from '@/components/common';
import { formatPlate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBays, useOpenAlerts, useUiStore, type Selection, type TrayTab } from '@/stores';
import { focusObject } from './focusObject';
import { captainName } from './privacy';
import { bayLabel } from './siteInfo';
import { BELT_TONE, EVENT_STATUS_TONE, PHASE_TONE, SEV_TONE } from './tones';
import { useFmt, type Fmt } from './useFmt';
import { useActiveVisits, useRole, useStreamNow } from './useLiveModel';
import { visitCount, visitProgress } from './model';

const TABS: readonly TrayTab[] = ['bays', 'trucks', 'alerts', 'captains'];

function Row({
  selected,
  onClick,
  testId,
  lead,
  title,
  sub,
  pill,
  trailing,
  progress,
}: {
  selected: boolean;
  onClick: () => void;
  testId: string;
  lead?: ReactNode;
  title: ReactNode;
  sub: ReactNode;
  pill: ReactNode;
  trailing?: ReactNode;
  progress?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        aria-current={selected ? 'true' : undefined}
        onClick={onClick}
        className={cn(
          'hover:bg-accent focus-visible:ring-ring/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-lg px-2 py-1.5 text-left focus-visible:ring-[3px] focus-visible:outline-none',
          selected && 'bg-accent',
        )}
      >
        {lead}
        <span className={cn('min-w-0', !lead && 'col-start-1 col-end-3')}>
          <span className="block truncate leading-5 font-semibold">{title}</span>
          <span className="text-muted-foreground block truncate text-[0.85rem] leading-4">
            {sub}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          {pill}
          {progress}
        </span>
        <span className="text-muted-foreground flex items-center gap-1">
          {trailing}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </span>
      </button>
    </li>
  );
}

const Dot = ({ tone }: { tone: Tone }) => (
  <span aria-hidden className={cn('size-2.5 rounded-full', TONE_DOT[tone])} />
);

function BaysList({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation('live');
  const bays = useBays();
  const selection = useUiStore((s) => s.selection);
  return (
    <ul className="flex flex-col">
      {bays.map((b) => {
        const progress = b.visit ? visitProgress(b.visit) : null;
        const plate = b.visit ? formatPlate(b.visit.plate).primary : t('tray.noTruck');
        return (
          <Row
            key={b.bay}
            testId={`tray-bay-${b.bay}`}
            selected={selection?.kind === 'bay' && selection.id === b.bay}
            onClick={() => focusObject({ kind: 'bay', id: b.bay })}
            lead={<Dot tone={BELT_TONE[b.belt.status]} />}
            title={
              <>
                {bayLabel(b.bay, fmt.lang)}
                {b.alerts.open > 0 && b.alerts.maxSev && (
                  <span
                    data-testid={`tray-bay-alerts-${b.bay}`}
                    title={t('tray.alertsCount', { n: fmt.num(b.alerts.open) })}
                    className={cn(
                      'ms-2 inline-grid min-w-5 place-items-center rounded-full px-1 align-middle text-[0.72rem] leading-5 font-bold text-white tabular-nums',
                      TONE_DOT[SEV_TONE[b.alerts.maxSev]],
                    )}
                  >
                    {fmt.num(b.alerts.open)}
                  </span>
                )}
              </>
            }
            sub={plate}
            pill={
              <StatusPill tone={BELT_TONE[b.belt.status]}>
                {t(`belt.status.${b.belt.status}`)}
              </StatusPill>
            }
            progress={
              progress === null ? (
                <span className="text-muted-foreground text-[0.85rem] tabular-nums">
                  {b.belt.rateCpm > 0 ? t('tray.rate', { n: fmt.num(b.belt.rateCpm, 1) }) : '—'}
                </span>
              ) : (
                <ThinProgress
                  value={progress}
                  tone={BELT_TONE[b.belt.status]}
                  label={t('tray.progress')}
                  className="w-20"
                />
              )
            }
          />
        );
      })}
    </ul>
  );
}

function TrucksList({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation('live');
  const visits = useActiveVisits();
  const selection = useUiStore((s) => s.selection);
  return (
    <ul className="flex flex-col">
      {visits.map(({ bay, visit }) => {
        const plate = formatPlate(visit.plate);
        const progress = visitProgress(visit);
        return (
          <Row
            key={visit.visitId}
            testId={`tray-truck-${visit.visitId}`}
            selected={selection?.kind === 'truck' && selection.id === visit.visitId}
            onClick={() => focusObject({ kind: 'truck', id: visit.visitId })}
            title={plate.primary}
            sub={[plate.secondary, bayLabel(bay, fmt.lang)].filter(Boolean).join(' · ')}
            pill={
              <StatusPill tone={PHASE_TONE[visit.phase]}>{t(`phase.${visit.phase}`)}</StatusPill>
            }
            progress={
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-[0.85rem] tabular-nums">
                  {fmt.num(visitCount(visit))}/
                  {visit.expected === null ? '—' : fmt.num(visit.expected)}
                </span>
                {progress !== null && (
                  <ThinProgress
                    value={progress}
                    tone={PHASE_TONE[visit.phase]}
                    label={t('tray.progress')}
                    className="w-14"
                  />
                )}
              </span>
            }
          />
        );
      })}
    </ul>
  );
}

function AlertsList({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation('live');
  const alerts = useOpenAlerts();
  const selection = useUiStore((s) => s.selection);
  const now = useStreamNow();
  return (
    <ul className="flex flex-col">
      {alerts.map((e) => (
        <Row
          key={e.id}
          testId={`tray-alert-${e.id}`}
          selected={selection?.kind === 'event' && selection.id === e.id}
          onClick={() => focusObject({ kind: 'event', id: e.id })}
          lead={<Dot tone={SEV_TONE[e.sev]} />}
          title={e.title[fmt.lang] || e.title.en}
          sub={[
            e.bay ? bayLabel(e.bay, fmt.lang) : null,
            t('tray.ago', { dur: fmt.dur(Math.max(0, (now - Date.parse(e.ts)) / 1000)) }),
          ]
            .filter(Boolean)
            .join(' · ')}
          pill={
            <StatusPill tone={EVENT_STATUS_TONE[e.status]}>
              {t(`eventStatus.${e.status}`)}
            </StatusPill>
          }
        />
      ))}
    </ul>
  );
}

function CaptainsList({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation('live');
  const bays = useBays();
  const role = useRole();
  const selection = useUiStore((s) => s.selection);
  const rows = bays.filter((b) => b.crew.captain !== null);
  return (
    <ul className="flex flex-col">
      {rows.map((b) => {
        const c = b.crew.captain;
        if (!c) return null;
        const name = captainName(b, role);
        const target: Selection = c.trackId
          ? { kind: 'person', id: c.trackId }
          : { kind: 'bay', id: b.bay };
        return (
          <Row
            key={b.bay}
            testId={`tray-captain-${b.bay}`}
            selected={selection?.kind === target.kind && selection.id === target.id}
            onClick={() => focusObject(target)}
            lead={<Dot tone={c.present ? 'ok' : 'warn'} />}
            title={name ? name[fmt.lang] || name.en : t('actorRole.CAPTAIN')}
            sub={bayLabel(b.bay, fmt.lang)}
            pill={
              <StatusPill tone={c.present ? 'ok' : 'warn'}>
                {c.present ? t('tray.onFloor') : t('tray.notOnFloor')}
              </StatusPill>
            }
          />
        );
      })}
    </ul>
  );
}

/** Bottom-right tray: Bays n/7 · Trucks n · Alerts n · Captains n. Rows select the object and fly the camera to it. */
export function Tray() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const bays = useBays();
  const trucks = useActiveVisits();
  const alerts = useOpenAlerts();
  const tab = useUiStore((s) => s.trayTab);
  const setTab = useUiStore((s) => s.setTrayTab);

  const running = bays.filter((b) => b.belt.status === 'RUNNING_LOADED').length;
  const captains = bays.filter((b) => b.crew.captain?.present).length;
  const counts: Record<TrayTab, string> = {
    bays: `${fmt.num(running)}/${fmt.num(bays.length)}`,
    trucks: fmt.num(trucks.length),
    alerts: fmt.num(alerts.length),
    captains: fmt.num(captains),
  };

  return (
    <CollapsiblePanel
      testId="tray"
      className="max-h-[42%] w-full shrink-0"
      bodyClassName="overflow-y-auto px-1.5 pb-1.5"
      collapseLabel={t('panel.collapse')}
      expandLabel={t('panel.expand')}
      header={
        <div
          role="tablist"
          aria-label={t('tray.label')}
          className="flex flex-wrap gap-x-1 gap-y-0.5"
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
                'focus-visible:ring-ring/50 rounded-md px-1.5 py-1 text-[0.95rem] font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none',
                tab === id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`tray.tabs.${id}`)} <span className="text-primary tabular-nums">{counts[id]}</span>
            </button>
          ))}
        </div>
      }
    >
      <div id="tray-panel" role="tabpanel" aria-labelledby={`tray-tab-${tab}`}>
        {tab === 'bays' && <BaysList fmt={fmt} />}
        {tab === 'trucks' && <TrucksList fmt={fmt} />}
        {tab === 'alerts' && <AlertsList fmt={fmt} />}
        {tab === 'captains' && <CaptainsList fmt={fmt} />}
        {tab === 'alerts' && counts.alerts === fmt.num(0) && (
          <p className="text-muted-foreground px-2 py-4 text-center">{t('tray.noAlerts')}</p>
        )}
      </div>
    </CollapsiblePanel>
  );
}
