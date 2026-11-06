import { MapPin, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { WhEventWithStatus } from '@/domain';
import { useEvent, useMediaUrl } from '@/data/api/eventQueries';
import { bayLabel, focusObject, SEV_TONE, useFmt } from '@/features/live';
import { EVENT_STATUS_TONE } from '@/features/live/tones';
import type { Fmt } from '@/features/live/useFmt';
import { canViewCategory } from '@/lib/rbac';
import { useAlertStore, useSessionStore, type Selection } from '@/stores';
import { EventActions } from './EventActions';
import { detailRows, type DetailRow } from './eventDetails';
import { newer } from './eventsModel';
import { EvidenceImage } from './EvidenceImage';

// Right sheet (full width under 1024 px) with the evidence and history of one event. The event comes from the list row,
// the detail query and the live alert store; the most advanced copy wins, so an incoming lifecycle message shows at once.

const ENUM_PATH: Record<string, string> = {
  dir: 'belt.direction',
  phase: 'phase',
  from: 'belt.status',
  to: 'belt.status',
  role: 'actorRole',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-ink-400 text-[12px] leading-4 font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
      <dt className="text-ink-600">{label}</dt>
      <dd className="text-ink-900 min-w-0 text-end font-medium break-words tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function detailText(
  r: DetailRow,
  fmt: Fmt,
  tl: (k: string, o?: { defaultValue: string }) => string,
): string {
  const v = r.value;
  switch (r.kind) {
    case 'int':
      return fmt.num(Number(v));
    case 'num1':
      return fmt.num(Number(v), 1);
    case 'min':
      return fmt.durHM(Number(v));
    case 'sec':
      return fmt.dur(Number(v));
    case 'metres':
      return `${fmt.num(Number(v), 1)} m`;
    case 'pct':
      return fmt.pct(Number(v) * 100);
    case 'time':
      return fmt.clock(String(v), true);
    case 'list':
      return (v as readonly string[]).join(', ');
    case 'enum': {
      const path = ENUM_PATH[r.key];
      return path ? tl(`${path}.${String(v)}`, { defaultValue: String(v) }) : String(v);
    }
    default:
      return String(v);
  }
}

function Clip({ event }: { event: WhEventWithStatus }) {
  const { t } = useTranslation('events');
  const media = event.media;
  const clip = useMediaUrl(media?.clipKey);
  const poster = useMediaUrl(media?.snapshotKey);
  if (!media?.clipKey) return null;
  return (
    <Section title={t('drawer.clip')}>
      {clip.isError ? (
        <p role="alert" className="text-ink-600 text-[12px]">
          {t('drawer.clipError')}
        </p>
      ) : (
        <video
          data-testid="event-clip"
          controls
          preload="none"
          poster={poster.data?.url}
          src={clip.data?.url}
          aria-label={t('drawer.clip')}
          className="bg-muted w-full rounded-[12px]"
          style={{ aspectRatio: `${media.frameW} / ${media.frameH}` }}
        />
      )}
    </Section>
  );
}

export interface EventDrawerProps {
  /** Event id from the route; null = closed. */
  id: string | null;
  /** The row the user clicked, shown while the detail loads. */
  initial?: WhEventWithStatus;
  onClose: () => void;
}

export function EventDrawer({ id, initial, onClose }: EventDrawerProps) {
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="event-drawer"
        className="w-full gap-0 overflow-y-auto sm:max-w-none lg:w-[520px]"
      >
        {id !== null && <DrawerBody key={id} id={id} initial={initial} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  id,
  initial,
  onClose,
}: {
  id: string;
  initial?: WhEventWithStatus;
  onClose: () => void;
}) {
  const { t } = useTranslation('events');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const navigate = useNavigate();
  const role = useSessionStore((s) => s.role);
  const query = useEvent(id);
  const stored = useAlertStore((s) => s.events[id]);
  const [full, setFull] = useState(false);

  const event = useMemo(() => {
    const copies = [initial, query.data, stored].filter((e): e is WhEventWithStatus => !!e);
    return copies.reduce<WhEventWithStatus | undefined>((a, b) => (a ? newer(a, b) : b), undefined);
  }, [initial, query.data, stored]);

  const close = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t('drawer.close')}
      onClick={onClose}
      data-testid="event-drawer-close"
    >
      <X />
    </Button>
  );

  // One neutral state for: unknown id, request failed with not-found, or a category this role may not view.
  const hidden = event !== undefined && !canViewCategory(role, event.category);
  if (hidden || (!event && query.isError)) {
    return (
      <div className="flex flex-col gap-3 p-4" data-testid="event-notfound">
        <div className="flex items-start justify-between gap-2">
          <SheetTitle className="text-[16px]">{t('drawer.notFound')}</SheetTitle>
          {close}
        </div>
        <SheetDescription>{t('drawer.notFoundHint')}</SheetDescription>
        {!hidden && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => void query.refetch()}
          >
            {t('state.retry')}
          </Button>
        )}
      </div>
    );
  }
  if (!event) {
    return (
      <div
        className="flex flex-col gap-3 p-4"
        role="status"
        aria-label={t('state.loading')}
        data-testid="event-loading"
      >
        <SheetTitle className="sr-only">{t('state.loading')}</SheetTitle>
        <div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
        <div className="bg-muted aspect-video w-full animate-pulse rounded-[12px]" />
        <div className="bg-muted h-24 w-full animate-pulse rounded" />
      </div>
    );
  }

  const title = event.title[fmt.lang] || event.title.en;
  const showOnMap = (sel: Selection) => {
    focusObject(sel);
    void navigate('/live');
  };
  const rows = detailRows(event);
  const history: { key: string; text: string }[] = [
    { key: 'raised', text: t('history.raised', { at: fmt.clock(event.ts, true) }) },
    ...(event.ack
      ? [
          {
            key: 'ack',
            text: t('history.ack', { by: event.ack.by, at: fmt.clock(event.ack.at, true) }),
          },
        ]
      : []),
    ...(event.closed
      ? [
          {
            key: 'closed',
            text: t('history.closed', {
              by: event.closed.by,
              at: fmt.clock(event.closed.at, true),
            }),
          },
        ]
      : []),
  ];

  return (
    <div
      className="flex flex-col gap-4 p-4"
      data-testid="event-detail"
      data-event-id={event.id}
      data-status={event.status}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SheetTitle className="bn-leading text-[18px] leading-6 font-bold break-words">
            {title}
          </SheetTitle>
          <SheetDescription className="sr-only">{t('drawer.description')}</SheetDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill tone={SEV_TONE[event.sev]}>{tl(`sev.${event.sev}`)}</StatusPill>
            <StatusPill tone={EVENT_STATUS_TONE[event.status]}>
              {tl(`eventStatus.${event.status}`)}
            </StatusPill>
          </div>
        </div>
        {close}
      </header>

      <dl className="flex flex-col gap-0.5">
        <Pair label={t('drawer.time')}>{fmt.clock(event.ts, true)}</Pair>
        <Pair label={tl('inspector.event.bay')}>
          {event.bay ? bayLabel(event.bay, fmt.lang) : '—'}
        </Pair>
        <Pair label={tl('inspector.event.camera')}>{event.src.cam ?? '—'}</Pair>
        <Pair label={tl('inspector.event.confidence')}>
          {event.src.conf === null ? '—' : fmt.pct(event.src.conf * 100)}
        </Pair>
      </dl>

      <Section title={t('drawer.snapshot')}>
        <button
          type="button"
          disabled={!event.media}
          onClick={() => setFull(true)}
          aria-label={t('drawer.fullSize')}
          data-testid="event-snapshot-open"
          className="focus-visible:ring-ring/50 block w-full rounded-[12px] focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <EvidenceImage media={event.media} testId="event-snapshot" />
        </button>
      </Section>
      {event.media && (
        <Dialog open={full} onOpenChange={setFull}>
          <DialogContent className="max-w-[min(96vw,1280px)] gap-2 p-3 sm:max-w-[min(96vw,1280px)]">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{t('drawer.fullSize')}</DialogDescription>
            <EvidenceImage media={event.media} testId="event-snapshot-full" />
          </DialogContent>
        </Dialog>
      )}
      <Clip event={event} />

      {(event.refs.plateEn || event.refs.sku || event.refs.visitId || event.bay) && (
        <Section title={t('drawer.refs')}>
          <dl className="flex flex-col gap-0.5">
            {event.refs.plateEn && (
              <Pair label={tl('inspector.event.plate')}>{event.refs.plateEn}</Pair>
            )}
            {event.refs.sku && <Pair label={tl('inspector.event.sku')}>{event.refs.sku}</Pair>}
            {event.refs.visitId && <Pair label={t('drawer.visit')}>{event.refs.visitId}</Pair>}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            {event.refs.visitId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="event-show-truck"
                onClick={() =>
                  event.refs.visitId && showOnMap({ kind: 'truck', id: event.refs.visitId })
                }
              >
                <MapPin /> {t('drawer.showTruck')}
              </Button>
            )}
            {event.bay && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="event-show-bay"
                onClick={() => event.bay && showOnMap({ kind: 'bay', id: event.bay })}
              >
                <MapPin /> {t('drawer.showBay')}
              </Button>
            )}
          </div>
        </Section>
      )}

      {rows.length > 0 && (
        <Section title={t('drawer.details')}>
          <dl className="flex flex-col gap-0.5" data-testid="event-details">
            {rows.map((r) => (
              <Pair key={r.key} label={t(`details.${r.key}`)}>
                {detailText(r, fmt, (k, o) => tl(k, o))}
              </Pair>
            ))}
          </dl>
        </Section>
      )}

      <Section title={t('drawer.history')}>
        <ol className="flex flex-col gap-1 text-[13px] leading-5" data-testid="event-history">
          {history.map((h) => (
            <li key={h.key} data-step={h.key} className="text-ink-900">
              {h.text}
              {h.key === 'closed' && event.closed?.note && (
                <span className="text-ink-600 block">{event.closed.note}</span>
              )}
            </li>
          ))}
          {event.notes.map((n, i) => (
            <li key={`${n.at}-${i}`} data-step="note" className="text-ink-900">
              {t('history.note', { by: n.by, at: fmt.clock(n.at, true) })}
              <span className="text-ink-600 block">{n.text}</span>
            </li>
          ))}
        </ol>
      </Section>

      <EventActions key={event.id} event={event} />
    </div>
  );
}
