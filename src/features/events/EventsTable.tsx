import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusPill, TONE_DOT } from '@/components/common';
import type { UiLang, WhEventWithStatus } from '@/domain';
import { bayLabel, SEV_TONE, useFmt } from '@/features/live';
import { EVENT_STATUS_TONE } from '@/features/live/tones';
import { useStreamNow } from '@/features/live/useLiveModel';
import { cn } from '@/lib/utils';
import { canAck, ROW_H, scrollToRow, windowRange, type TableRow } from './eventsModel';

// Semantic grid with fixed 48 px rows and hand-written windowing: only the rows in view (plus a few) are in the DOM.
// Keyboard: Up/Down move the cursor, Enter opens (or expands a truck group), A acknowledges, Esc closes the drawer.

const COLS =
  'grid grid-cols-[84px_88px_72px_minmax(0,1fr)_104px_120px_150px_72px] items-center gap-x-3 px-3';

export interface EventsTableProps {
  rows: readonly TableRow[];
  selectedId: string | null;
  /** Roles that may acknowledge a given event. */
  canAct: (e: WhEventWithStatus) => boolean;
  hasMore: boolean;
  fetchingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onAck: (id: string) => void;
  onToggleGroup: (visitId: string) => void;
  onEscape: () => void;
  /** True while the user has scrolled away from the top (new live rows are held back). */
  onScrolledAway: (away: boolean) => void;
  /** Bumps to scroll back to the top. */
  scrollTopSignal: number;
  /** Test hook: viewport height used before the first measurement. */
  initialViewportH?: number;
}

interface RowProps {
  row: TableRow;
  index: number;
  active: boolean;
  selected: boolean;
  lang: UiLang;
  ago: string;
  age: string;
  abs: string;
  onOpen: (id: string) => void;
  onToggleGroup: (visitId: string) => void;
}

const RowView = memo(function RowView({
  row,
  index,
  active,
  selected,
  lang,
  ago,
  age,
  abs,
  onOpen,
  onToggleGroup,
}: RowProps) {
  const { t } = useTranslation('events');
  const { t: tl } = useTranslation('live');
  const e = row.kind === 'group' ? row.head : row.event;
  const sev = row.kind === 'group' ? row.worst : e.sev;
  const title = e.title[lang] || e.title.en;
  const isGroup = row.kind === 'group';
  return (
    <div
      role="row"
      id={`events-row-${row.key}`}
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-testid={isGroup ? `events-group-row-${row.visitId}` : `events-row-${e.id}`}
      data-active={active || undefined}
      data-sev={sev}
      data-status={e.status}
      onClick={() => (isGroup ? onToggleGroup(row.visitId) : onOpen(e.id))}
      className={cn(
        COLS,
        'border-hairline h-[48px] cursor-pointer border-b text-[13px]',
        selected ? 'bg-row-selected' : 'hover:bg-row-hover',
        active && 'ring-ring/60 ring-2 ring-inset',
        row.kind === 'event' && row.child && 'ps-8',
      )}
    >
      <div role="gridcell" className="flex items-center gap-2">
        <span aria-hidden className={cn('size-2 rounded-full', TONE_DOT[SEV_TONE[sev]])} />
        <span className="text-ink-600 truncate text-[12px]">{tl(`sev.${sev}`)}</span>
      </div>
      <div role="gridcell" className="text-ink-600 tabular-nums" title={abs}>
        {ago}
      </div>
      <div role="gridcell" className="text-ink-900 font-medium">
        {e.bay ? bayLabel(e.bay, lang) : '—'}
      </div>
      <div role="gridcell" className="bn-leading min-w-0">
        <span className="text-ink-900 flex items-center gap-1.5 truncate font-semibold">
          {isGroup &&
            (row.expanded ? (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
            ))}
          <span className="truncate">{title}</span>
        </span>
        {isGroup && (
          <span className="text-ink-400 block truncate text-[12px] leading-4">
            {t('table.truckEvents', { n: row.count })}
          </span>
        )}
      </div>
      <div role="gridcell" className="text-ink-600 truncate">
        {tl(`category.${e.category}`)}
      </div>
      <div role="gridcell">
        <StatusPill tone={EVENT_STATUS_TONE[e.status]}>{tl(`eventStatus.${e.status}`)}</StatusPill>
      </div>
      <div role="gridcell" className="text-ink-600 truncate">
        {e.refs.plateEn ?? e.refs.sku ?? '—'}
      </div>
      <div role="gridcell" className="text-ink-600 text-end tabular-nums">
        {age}
      </div>
    </div>
  );
});

export function EventsTable(props: EventsTableProps) {
  const {
    rows,
    selectedId,
    canAct,
    hasMore,
    fetchingMore,
    onLoadMore,
    onOpen,
    onAck,
    onToggleGroup,
    onEscape,
    onScrolledAway,
    scrollTopSignal,
    initialViewportH = 480,
  } = props;
  const { t } = useTranslation('events');
  const { t: tl } = useTranslation('live');
  const fmt = useFmt();
  const now = Math.floor(useStreamNow() / 10_000) * 10_000;
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(initialViewportH);
  const [cursor, setCursor] = useState(0);
  const last = rows.length - 1;
  const cur = Math.min(cursor, Math.max(0, last));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.clientHeight > 0 && setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollTopSignal > 0 && ref.current) {
      ref.current.scrollTop = 0;
      setScrollTop(0);
      setCursor(0);
    }
  }, [scrollTopSignal]);

  const win = windowRange(rows.length, scrollTop, viewportH);

  // Cursor paging: ask for the next page when the end is near.
  useEffect(() => {
    if (hasMore && !fetchingMore && win.end >= rows.length - 10) onLoadMore();
  }, [hasMore, fetchingMore, win.end, rows.length, onLoadMore]);

  const move = useCallback(
    (to: number) => {
      const i = Math.max(0, Math.min(last, to));
      setCursor(i);
      const el = ref.current;
      if (el) {
        const next = scrollToRow(i, el.scrollTop, el.clientHeight || viewportH);
        if (next !== el.scrollTop) el.scrollTop = next;
      }
    },
    [last, viewportH],
  );

  const onKeyDown = (ev: React.KeyboardEvent) => {
    const row = rows[cur];
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        return move(cur + 1);
      case 'ArrowUp':
        ev.preventDefault();
        return move(cur - 1);
      case 'Home':
        ev.preventDefault();
        return move(0);
      case 'End':
        ev.preventDefault();
        return move(last);
      case 'PageDown':
        ev.preventDefault();
        return move(cur + Math.floor(viewportH / ROW_H));
      case 'PageUp':
        ev.preventDefault();
        return move(cur - Math.floor(viewportH / ROW_H));
      case 'Enter':
        if (!row) return;
        ev.preventDefault();
        return row.kind === 'group' ? onToggleGroup(row.visitId) : onOpen(row.event.id);
      case 'Escape':
        return onEscape();
      case 'a':
      case 'A':
        if (ev.ctrlKey || ev.metaKey || ev.altKey || !row || row.kind !== 'event') return;
        if (canAck(row.event) && canAct(row.event)) {
          ev.preventDefault();
          onAck(row.event.id);
        }
        return;
      default:
    }
  };

  const slice = rows.slice(win.start, win.end);
  const activeRow = rows[cur];
  return (
    <div className="border-card-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div
          role="grid"
          aria-label={t('table.label')}
          aria-rowcount={rows.length + 1}
          className="flex h-full min-w-[960px] flex-col"
        >
          <div
            role="row"
            aria-rowindex={1}
            className={cn(
              COLS,
              'border-hairline text-ink-400 h-9 shrink-0 border-b text-[12px] font-medium',
            )}
          >
            <div role="columnheader">{t('table.sev')}</div>
            <div role="columnheader">{t('table.time')}</div>
            <div role="columnheader">{tl('inspector.event.bay')}</div>
            <div role="columnheader">{t('table.title')}</div>
            <div role="columnheader">{t('table.category')}</div>
            <div role="columnheader">{t('table.status')}</div>
            <div role="columnheader">{t('table.ref')}</div>
            <div role="columnheader" className="text-end">
              {t('table.age')}
            </div>
          </div>
          <div
            ref={ref}
            tabIndex={0}
            data-testid="events-scroller"
            aria-activedescendant={activeRow ? `events-row-${activeRow.key}` : undefined}
            aria-label={t('table.keys')}
            onKeyDown={onKeyDown}
            onScroll={(ev) => {
              const top = ev.currentTarget.scrollTop;
              setScrollTop(top);
              onScrolledAway(top > ROW_H / 2);
            }}
            className="focus-visible:ring-ring/50 min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <div style={{ height: win.padTop }} aria-hidden />
            {slice.map((row, i) => {
              const e = row.kind === 'group' ? row.head : row.event;
              const end = e.closed ? Date.parse(e.closed.at) : now;
              return (
                <RowView
                  key={row.key}
                  row={row}
                  index={win.start + i}
                  active={win.start + i === cur}
                  selected={row.kind === 'event' && row.event.id === selectedId}
                  lang={fmt.lang}
                  ago={tl('tray.ago', {
                    dur: fmt.dur(Math.max(0, (now - Date.parse(e.ts)) / 1000)),
                  })}
                  age={fmt.dur(Math.max(0, (end - Date.parse(e.ts)) / 1000))}
                  abs={fmt.clock(e.ts, true)}
                  onOpen={onOpen}
                  onToggleGroup={onToggleGroup}
                />
              );
            })}
            <div style={{ height: win.padBottom }} aria-hidden />
            {fetchingMore && (
              <p role="status" className="text-ink-400 py-3 text-center text-[12px]">
                {t('table.loadingMore')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
