import { ImageIcon, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KeyValue, KeyValueList, MaybeValue, StatusPill } from '@/components/common';
import { canViewCategory } from '@/stores/alertFilter';
import { formatPlate } from '@/lib/format';
import {
  useAlertStore,
  useBay,
  useBays,
  useConnStatus,
  useLiveStore,
  useSiteKpi,
  type Selection,
} from '@/stores';
import { InspectorFrame, ProgressRow, SectionTitle, type FrameActions } from './InspectorFrame';
import { resolveVisit, visitCount, visitProgress } from './model';
import { captainName } from './privacy';
import { bayConveyor, bayLabel, DEFAULT_SITE } from './siteInfo';
import { BELT_TONE, CONN_TONE, EVENT_STATUS_TONE, PHASE_TONE, SEV_TONE } from './tones';
import { useFmt } from './useFmt';
import { findActor, useRole, useStreamNow } from './useLiveModel';

interface BodyProps {
  actions: FrameActions;
}

/** Shown when the selected object is gone (e.g. a visit evicted, an event the role may not see). */
export function MissingBody({ selection, actions }: BodyProps & { selection: Selection }) {
  const { t } = useTranslation('live');
  return (
    <InspectorFrame
      testId="inspector-missing"
      typeLabel={t(`inspector.type.${selection.kind}`)}
      title={selection.id}
      actions={actions}
    >
      <p className="text-muted-foreground py-2">{t('inspector.missing')}</p>
    </InspectorFrame>
  );
}

export function SiteBody({ actions }: BodyProps) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const kpi = useSiteKpi();
  const conn = useConnStatus();
  const noData = t('kpi.noData');
  const sev = kpi?.openAlerts;
  return (
    <InspectorFrame
      testId="inspector-site"
      typeLabel={t('inspector.type.site')}
      title={DEFAULT_SITE.name[fmt.lang] || DEFAULT_SITE.name.en}
      subtitle={DEFAULT_SITE.org}
      pill={<StatusPill tone={CONN_TONE[conn]}>{t(`conn.${conn}`)}</StatusPill>}
      href="/analytics"
      actions={actions}
    >
      <ProgressRow
        label={t('inspector.site.baysRunning')}
        value={kpi && kpi.baysTotal > 0 ? (kpi.baysRunning / kpi.baysTotal) * 100 : null}
        caption={
          <MaybeValue value={kpi?.baysRunning} reason={noData}>
            {fmt.num(kpi?.baysRunning ?? 0)}/{fmt.num(kpi?.baysTotal ?? 0)}
          </MaybeValue>
        }
        tone="ok"
      />
      <KeyValueList>
        <KeyValue label={t('inspector.site.trucks')}>
          <MaybeValue value={kpi?.trucksOnSite} reason={noData}>
            {t('kpi.trucksSplit', {
              docked: fmt.num(kpi?.trucksDocked ?? 0),
              waiting: fmt.num(kpi?.trucksWaiting ?? 0),
            })}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.site.casesOut')}>
          <MaybeValue value={kpi?.casesOut} reason={noData}>
            {fmt.num(kpi?.casesOut ?? 0)}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.site.casesIn')}>
          <MaybeValue value={kpi?.casesIn} reason={noData}>
            {fmt.num(kpi?.casesIn ?? 0)}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.site.tat')}>
          <MaybeValue value={kpi?.avgTatMin} reason={t('kpi.noTat')}>
            {fmt.dur((kpi?.avgTatMin ?? 0) * 60)}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.site.compliance')}>
          <MaybeValue value={kpi?.complianceScore} reason={t('kpi.noCompliance')}>
            {fmt.pct(kpi?.complianceScore ?? 0)}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.site.alerts')}>
          <MaybeValue value={sev} reason={noData}>
            {t('inspector.site.alertsSplit', {
              critical: fmt.num(sev?.critical ?? 0),
              warn: fmt.num(sev?.warn ?? 0),
              info: fmt.num(sev?.info ?? 0),
            })}
          </MaybeValue>
        </KeyValue>
      </KeyValueList>
    </InspectorFrame>
  );
}

export function BayBody({
  bayId,
  kind,
  actions,
}: BodyProps & { bayId: string; kind: 'bay' | 'belt' }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const bay = useBay(bayId);
  const role = useRole();
  const now = useStreamNow();
  if (!bay) return <MissingBody selection={{ kind, id: bayId }} actions={actions} />;

  const { visit, belt, crew, staging, today, health } = bay;
  const cams = Object.values(health.cams);
  const camsOk = cams.filter((c) => c === 'OK').length;
  const name = captainName(bay, role);
  const captain = crew.captain;
  const plate = visit ? formatPlate(visit.plate) : null;
  const progress = visit ? visitProgress(visit) : null;
  const conveyor = bayConveyor(bayId);

  return (
    <InspectorFrame
      testId="inspector-bay"
      typeLabel={[t(`inspector.type.${kind}`), conveyor].filter(Boolean).join(' · ')}
      title={bayLabel(bayId, fmt.lang)}
      pill={
        <StatusPill tone={BELT_TONE[belt.status]}>{t(`belt.status.${belt.status}`)}</StatusPill>
      }
      href={`/bays/${bayId}`}
      actions={actions}
    >
      {visit && (
        <ProgressRow
          label={t(
            visit.phase === 'UNLOADING' ? 'inspector.bay.unloading' : 'inspector.bay.loading',
          )}
          value={progress}
          caption={`${fmt.num(visitCount(visit))} / ${visit.expected === null ? '—' : fmt.num(visit.expected)}`}
          tone={BELT_TONE[belt.status]}
        />
      )}
      <KeyValueList>
        <KeyValue label={t('inspector.bay.belt')}>
          {t(`belt.direction.${belt.direction}`)} ·{' '}
          {belt.rateCpm > 0 ? t('tray.rate', { n: fmt.num(belt.rateCpm, 1) }) : '—'}
        </KeyValue>
        <KeyValue label={t('inspector.bay.since')}>
          {fmt.clock(belt.since)} · {fmt.dur(Math.max(0, (now - Date.parse(belt.since)) / 1000))}
        </KeyValue>
        <KeyValue label={t('inspector.bay.truck')}>
          {plate ? (
            <span data-testid="inspector-plate">
              {plate.primary}
              {plate.secondary && (
                <span className="text-muted-foreground block text-[0.85rem] font-normal">
                  {plate.secondary}
                </span>
              )}
            </span>
          ) : (
            t('tray.noTruck')
          )}
        </KeyValue>
        {visit && (
          <KeyValue label={t('inspector.bay.phase')}>
            <StatusPill tone={PHASE_TONE[visit.phase]}>{t(`phase.${visit.phase}`)}</StatusPill>
          </KeyValue>
        )}
        <KeyValue label={t('inspector.bay.door')}>{t(`door.${bay.door.status}`)}</KeyValue>
      </KeyValueList>

      <SectionTitle>{t('inspector.bay.crewSection')}</SectionTitle>
      <KeyValueList>
        <KeyValue label={t('inspector.bay.crew')}>
          {t('inspector.bay.crewSplit', {
            total: fmt.num(crew.total),
            captains: fmt.num(crew.captains),
            workers: fmt.num(crew.workers),
            forklift: fmt.num(crew.forkliftOps),
          })}
        </KeyValue>
        {captain && (
          <KeyValue label={t('actorRole.CAPTAIN')}>
            <span data-testid="inspector-captain">
              {name ? name[fmt.lang] || name.en : t('inspector.bay.captainHidden')}
              <span className="text-muted-foreground block text-[0.85rem] font-normal">
                {captain.present ? t('tray.onFloor') : t('tray.notOnFloor')}
              </span>
            </span>
          </KeyValue>
        )}
        <KeyValue label={t('inspector.bay.ppeNow')}>{fmt.num(crew.ppeViolationsNow)}</KeyValue>
      </KeyValueList>

      <SectionTitle>{t('inspector.bay.stagingSection')}</SectionTitle>
      <ProgressRow
        label={t('inspector.bay.occupancy')}
        value={staging.occupancyPct}
        caption={fmt.pct(staging.occupancyPct)}
        tone={staging.oldestWaitSec > DEFAULT_SITE.thresholds.palletWaitSec ? 'warn' : 'info'}
      />
      <KeyValueList>
        <KeyValue label={t('inspector.bay.pallets')}>{fmt.num(staging.palletsWaiting)}</KeyValue>
        <KeyValue label={t('inspector.bay.oldestWait')}>{fmt.dur(staging.oldestWaitSec)}</KeyValue>
      </KeyValueList>

      <SectionTitle>{t('inspector.bay.todaySection')}</SectionTitle>
      <KeyValueList>
        <KeyValue label={t('inspector.bay.casesOut')}>{fmt.num(today.casesOut)}</KeyValue>
        <KeyValue label={t('inspector.bay.casesIn')}>{fmt.num(today.casesIn)}</KeyValue>
        <KeyValue label={t('inspector.bay.trucks')}>{fmt.num(today.trucks)}</KeyValue>
        <KeyValue label={t('inspector.bay.tat')}>
          <MaybeValue value={today.avgTatMin} reason={t('kpi.noTat')}>
            {fmt.dur((today.avgTatMin ?? 0) * 60)}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.bay.damage')}>{fmt.num(today.damage)}</KeyValue>
        <KeyValue label={t('inspector.bay.fallOff')}>{fmt.num(today.fallOff)}</KeyValue>
        <KeyValue label={t('inspector.bay.cameras')}>
          <span className={camsOk < cams.length ? 'text-status-critical' : undefined}>
            {t('inspector.bay.camsOk', { ok: fmt.num(camsOk), total: fmt.num(cams.length) })}
          </span>
        </KeyValue>
      </KeyValueList>
    </InspectorFrame>
  );
}

export function StagingBody({ bayId, actions }: BodyProps & { bayId: string }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const bay = useBay(bayId);
  if (!bay) return <MissingBody selection={{ kind: 'staging', id: bayId }} actions={actions} />;
  const { staging } = bay;
  const late = staging.oldestWaitSec > DEFAULT_SITE.thresholds.palletWaitSec;
  return (
    <InspectorFrame
      testId="inspector-staging"
      typeLabel={t('inspector.type.staging')}
      title={bayLabel(bayId, fmt.lang)}
      pill={
        <StatusPill tone={late ? 'warn' : 'ok'}>
          {t(late ? 'inspector.staging.waiting' : 'inspector.staging.ok')}
        </StatusPill>
      }
      actions={actions}
    >
      <ProgressRow
        label={t('inspector.bay.occupancy')}
        value={staging.occupancyPct}
        caption={fmt.pct(staging.occupancyPct)}
        tone={late ? 'warn' : 'info'}
      />
      <KeyValueList>
        <KeyValue label={t('inspector.bay.pallets')}>{fmt.num(staging.palletsWaiting)}</KeyValue>
        <KeyValue label={t('inspector.bay.oldestWait')}>{fmt.dur(staging.oldestWaitSec)}</KeyValue>
      </KeyValueList>
    </InspectorFrame>
  );
}

export function TruckBody({ visitId, actions }: BodyProps & { visitId: string }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const bays = useBays();
  const visits = useLiveStore((s) => s.visits);
  const now = useStreamNow();
  const found = resolveVisit({ kind: 'truck', id: visitId }, bays, visits);
  if (!found) return <MissingBody selection={{ kind: 'truck', id: visitId }} actions={actions} />;
  const { bay, visit } = found;
  const plate = formatPlate(visit.plate);
  const progress = visitProgress(visit);
  const dwellEnd = visit.departedAt ? Date.parse(visit.departedAt) : now;
  return (
    <InspectorFrame
      testId="inspector-truck"
      typeLabel={t('inspector.type.truck')}
      title={plate.primary}
      subtitle={plate.secondary}
      pill={<StatusPill tone={PHASE_TONE[visit.phase]}>{t(`phase.${visit.phase}`)}</StatusPill>}
      href="/trucks"
      actions={actions}
    >
      <ProgressRow
        label={t(visit.phase === 'UNLOADING' ? 'inspector.bay.unloading' : 'inspector.bay.loading')}
        value={progress}
        caption={`${fmt.num(visitCount(visit))} / ${visit.expected === null ? '—' : fmt.num(visit.expected)}`}
        tone={PHASE_TONE[visit.phase]}
      />
      <KeyValueList>
        <KeyValue label={t('inspector.truck.agency')}>
          {visit.agency ? visit.agency[fmt.lang] || visit.agency.en : '—'}
        </KeyValue>
        <KeyValue label={t('inspector.truck.bay')}>{bayLabel(bay, fmt.lang)}</KeyValue>
        <KeyValue label={t('inspector.truck.arrived')}>{fmt.clock(visit.arrivedAt)}</KeyValue>
        <KeyValue label={t('inspector.truck.dwell')}>
          {fmt.dur(Math.max(0, (dwellEnd - Date.parse(visit.arrivedAt)) / 1000))}
        </KeyValue>
        <KeyValue label={t('inspector.truck.eta')}>
          <MaybeValue value={visit.etaMin} reason={t('tracker.etaUnknown')}>
            {t('tracker.etaLeft', { n: fmt.num(visit.etaMin ?? 0) })}
          </MaybeValue>
        </KeyValue>
        <KeyValue label={t('inspector.truck.plateConf')}>
          {fmt.pct(visit.plate.conf * 100)}
        </KeyValue>
      </KeyValueList>
      <SectionTitle>{t('inspector.truck.quality')}</SectionTitle>
      <KeyValueList>
        <KeyValue label={t('inspector.truck.damage')}>{fmt.num(visit.damage)}</KeyValue>
        <KeyValue label={t('inspector.truck.openTape')}>{fmt.num(visit.openTape)}</KeyValue>
        <KeyValue label={t('inspector.truck.tornSack')}>{fmt.num(visit.tornSack)}</KeyValue>
        <KeyValue label={t('inspector.truck.fallOff')}>{fmt.num(visit.fallOff)}</KeyValue>
      </KeyValueList>
      <SectionTitle>{t('inspector.truck.skus')}</SectionTitle>
      <KeyValueList>
        {visit.skuTop.length === 0 && <KeyValue label="—">—</KeyValue>}
        {visit.skuTop.map((s) => (
          <KeyValue key={s.sku} label={s.sku}>
            {fmt.num(s.count)}
          </KeyValue>
        ))}
      </KeyValueList>
    </InspectorFrame>
  );
}

export function EventBody({ eventId, actions }: BodyProps & { eventId: string }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const role = useRole();
  const event = useAlertStore((s) => s.events[eventId]);
  if (!event || !canViewCategory(role, event.category)) {
    return <MissingBody selection={{ kind: 'event', id: eventId }} actions={actions} />;
  }
  const media = event.media;
  const box = media
    ? {
        left: `${((event.media?.bbox[0] ?? 0) / media.frameW) * 100}%`,
        top: `${((event.media?.bbox[1] ?? 0) / media.frameH) * 100}%`,
        width: `${((event.media?.bbox[2] ?? 0) / media.frameW) * 100}%`,
        height: `${((event.media?.bbox[3] ?? 0) / media.frameH) * 100}%`,
      }
    : null;
  return (
    <InspectorFrame
      testId="inspector-event"
      typeLabel={`${t('inspector.type.event')} · ${t(`category.${event.category}`)}`}
      title={event.title[fmt.lang] || event.title.en}
      subtitle={`${event.category}.${event.type}`}
      pill={
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={SEV_TONE[event.sev]}>{t(`sev.${event.sev}`)}</StatusPill>
          <StatusPill tone={EVENT_STATUS_TONE[event.status]}>
            {t(`eventStatus.${event.status}`)}
          </StatusPill>
        </div>
      }
      href={`/events/${event.id}`}
      actions={actions}
    >
      <div
        data-testid="evidence-thumb"
        className="bg-muted text-muted-foreground relative mb-2 grid aspect-video place-items-center overflow-hidden rounded-lg border border-dashed"
      >
        {media ? (
          <>
            <span className="flex flex-col items-center gap-1 text-[0.85rem]">
              <ImageIcon className="size-6" aria-hidden />
              {t('inspector.event.snapshot')}
            </span>
            {box && (
              <span
                aria-hidden
                className="border-status-critical absolute rounded-sm border-2"
                style={box}
              />
            )}
            {media.clipKey && (
              <span className="bg-card/90 text-foreground absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.8rem]">
                <Film className="size-3.5" aria-hidden />
                {t('inspector.event.clip')}
              </span>
            )}
          </>
        ) : (
          <span className="text-[0.85rem]">{t('inspector.event.noMedia')}</span>
        )}
      </div>
      <KeyValueList>
        <KeyValue label={t('inspector.event.time')}>{fmt.clock(event.ts, true)}</KeyValue>
        <KeyValue label={t('inspector.event.bay')}>
          {event.bay ? bayLabel(event.bay, fmt.lang) : '—'}
        </KeyValue>
        <KeyValue label={t('inspector.event.camera')}>{event.src.cam ?? '—'}</KeyValue>
        <KeyValue label={t('inspector.event.confidence')}>
          <MaybeValue value={event.src.conf} reason={t('inspector.event.noConfidence')}>
            {fmt.pct((event.src.conf ?? 0) * 100)}
          </MaybeValue>
        </KeyValue>
        {event.refs.plateEn && (
          <KeyValue label={t('inspector.event.plate')}>{event.refs.plateEn}</KeyValue>
        )}
        {event.refs.sku && <KeyValue label={t('inspector.event.sku')}>{event.refs.sku}</KeyValue>}
        {event.ack && (
          <KeyValue label={t('inspector.event.ackBy')}>
            {event.ack.by} · {fmt.clock(event.ack.at)}
          </KeyValue>
        )}
      </KeyValueList>
    </InspectorFrame>
  );
}

/** Person: role and PPE state only. No names, no phone/idle behaviour (privacy rule). The captain's name only when permitted. */
export function PersonBody({ actorId, actions }: BodyProps & { actorId: string }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const role = useRole();
  const actors = useLiveStore((s) => s.actors);
  const bays = useBays();
  const found = findActor(actors, actorId);
  if (!found) return <MissingBody selection={{ kind: 'person', id: actorId }} actions={actions} />;
  const { bay: bayId, actor } = found;
  const bay = bays.find((b) => b.bay === bayId);
  const captain =
    actor.role === 'CAPTAIN' && bay?.crew.captain?.trackId === actor.id ? bay.crew.captain : null;
  const name = bay && captain ? captainName(bay, role) : null;
  const ppeTone = actor.ppeOk === null ? 'neutral' : actor.ppeOk ? 'ok' : 'critical';
  return (
    <InspectorFrame
      testId="inspector-person"
      typeLabel={`${t('inspector.type.person')} · ${bayLabel(bayId, fmt.lang)}`}
      title={name ? name[fmt.lang] || name.en : t(`actorRole.${actor.role}`)}
      subtitle={name ? t(`actorRole.${actor.role}`) : undefined}
      pill={
        <StatusPill tone={ppeTone}>
          {t(
            actor.ppeOk === null
              ? 'inspector.person.ppeUnknown'
              : actor.ppeOk
                ? 'inspector.person.ppeOk'
                : 'inspector.person.ppeMissing',
          )}
        </StatusPill>
      }
      actions={actions}
    >
      <KeyValueList>
        <KeyValue label={t('inspector.person.role')}>{t(`actorRole.${actor.role}`)}</KeyValue>
        <KeyValue label={t('inspector.person.bay')}>{bayLabel(bayId, fmt.lang)}</KeyValue>
        {captain && (
          <KeyValue label={t('inspector.person.idSource')}>
            {t(`idSource.${captain.idSource}`)}
          </KeyValue>
        )}
      </KeyValueList>
    </InspectorFrame>
  );
}

export function ForkliftBody({ actorId, actions }: BodyProps & { actorId: string }) {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const actors = useLiveStore((s) => s.actors);
  const found = findActor(actors, actorId);
  if (!found)
    return <MissingBody selection={{ kind: 'forklift', id: actorId }} actions={actions} />;
  const { bay, actor } = found;
  const act = actor.act === 'CARRYING' || actor.act === 'DRIVING' ? actor.act : 'STATIONARY';
  return (
    <InspectorFrame
      testId="inspector-forklift"
      typeLabel={`${t('inspector.type.forklift')} · ${bayLabel(bay, fmt.lang)}`}
      title={actor.id.toUpperCase()}
      pill={
        <StatusPill tone={act === 'STATIONARY' ? 'neutral' : 'ok'}>
          {t(`forkliftAct.${act}`)}
        </StatusPill>
      }
      actions={actions}
    >
      <KeyValueList>
        <KeyValue label={t('inspector.person.bay')}>{bayLabel(bay, fmt.lang)}</KeyValue>
        <KeyValue label={t('inspector.forklift.state')}>{t(`forkliftAct.${act}`)}</KeyValue>
      </KeyValueList>
    </InspectorFrame>
  );
}
