import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatInTimeZone } from 'date-fns-tz';
import { calendarOf, dataNow } from '@/data/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TONE_TEXT, TONE_TINT } from '@/components/common';
import type { EventStatus, Role, Severity } from '@/domain';
import { bayLabel, DEFAULT_SITE, SEV_TONE, useFmt } from '@/features/live';
import { ALERT_GROUPS, type AlertGroupRow } from '@/features/live/kpiDetail/selectors';
import { periodWindow, type PerfRange } from '@/lib/period';
import { visibleCategories } from '@/lib/rbac';
import { SITE_TZ } from '@/lib/time';
import { cn } from '@/lib/utils';
import { SEVERITY_ORDER, STATUS_ORDER, type EventFilters } from './urlState';
import { isDefaultFilters } from './eventsModel';

const chip =
  'soft-transition focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium focus-visible:ring-[3px] focus-visible:outline-none';
const on = 'border-transparent bg-row-selected text-info-ink';
const off = 'border-card-border text-ink-600 hover:bg-row-hover';

const BAYS = DEFAULT_SITE.dockFaces.flatMap((f) => f.bays.map((b) => b.id)).sort();
const PRESETS: readonly PerfRange[] = ['shift', 'day', 'week'];

const dayOf = (ms: number) => formatInTimeZone(new Date(ms), SITE_TZ, 'yyyy-MM-dd');

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Multi-select as a native disclosure with checkboxes (no shared menu component: keeps the /live entry small). */
function MultiMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  testId: string;
}) {
  const fmt = useFmt();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (ev: Event) => {
      const el = ref.current;
      if (el?.open && !(ev.target instanceof Node && el.contains(ev.target))) el.open = false;
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <details ref={ref} className="relative" data-testid={testId}>
      <summary
        data-testid={`${testId}-toggle`}
        className={cn(chip, 'cursor-pointer list-none', value.length ? on : off)}
      >
        {label}
        {value.length > 0 && <span className="tabular-nums">{fmt.num(value.length)}</span>}
        <ChevronDown className="size-3.5" aria-hidden />
      </summary>
      <div className="bg-popover border-card-border absolute start-0 top-full z-20 mt-1 max-h-80 min-w-44 overflow-auto rounded-md border p-1 shadow-md">
        {options.map((o) => (
          <label
            key={o.id}
            className="hover:bg-row-hover flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px]"
          >
            <input
              type="checkbox"
              data-testid={`${testId}-${o.id}`}
              checked={value.includes(o.id)}
              onChange={() => onChange(toggle(value, o.id))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}

export interface EventsFilterBarProps {
  filters: EventFilters;
  /** The range actually queried (default: today when CLOSED is included). */
  effective: EventFilters;
  role: Role;
  /** Open (OPEN + ACK) counts per group, the same selector as the KPI popover. */
  groups: readonly AlertGroupRow[];
  onChange: (patch: Partial<EventFilters>) => void;
  onClear: () => void;
}

export function EventsFilterBar({
  filters,
  effective,
  role,
  groups,
  onChange,
  onClear,
}: EventsFilterBarProps) {
  const { t } = useTranslation('events');
  const { t: tl } = useTranslation('live');
  const { t: tk } = useTranslation('kpidetail');
  const fmt = useFmt();
  const [q, setQ] = useState(filters.q);
  // "Clear filters" (or a link) empties the URL text: empty the box too. Typing never goes through here.
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (filters.q === '') setQ('');
  }
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const id = setTimeout(() => onChange({ q: q.trim() }), 300);
    return () => clearTimeout(id);
  }, [q, filters.q, onChange]);

  const counts = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const categories = useMemo(
    () => visibleCategories(role).map((c) => ({ id: c, label: tl(`category.${c}`) })),
    [role, tl],
  );
  const bays = BAYS.map((id) => ({ id, label: bayLabel(id, fmt.lang) }));
  const win = (r: PerfRange) => periodWindow(r, dataNow(), calendarOf(DEFAULT_SITE));
  const activePreset =
    effective.from === null
      ? null
      : (PRESETS.find((r) => {
          const w = win(r);
          return w.start === effective.from && w.end === effective.to;
        }) ?? null);

  return (
    <section
      aria-label={t('filters.label')}
      className="flex flex-col gap-3"
      data-testid="events-filters"
    >
      <ul className="flex flex-wrap gap-2" data-testid="events-groups">
        {ALERT_GROUPS.map((g) => {
          const row = counts.get(g.id);
          const n = row?.total ?? 0;
          if (g.id === 'other' && n === 0 && filters.group !== 'other') return null;
          const active = filters.group === g.id;
          const worst: Severity | null = !row
            ? null
            : row.critical > 0
              ? 'critical'
              : row.warn > 0
                ? 'warn'
                : n > 0
                  ? 'info'
                  : null;
          return (
            <li key={g.id}>
              <button
                type="button"
                data-testid={`events-group-${g.id}`}
                data-total={n}
                aria-pressed={active}
                onClick={() => onChange({ group: active ? null : g.id })}
                className={cn(chip, active ? on : off)}
              >
                {tk(`groups.${g.id}`)}
                <span
                  className={cn(
                    'inline-grid h-[20px] min-w-[24px] place-items-center rounded-full px-1.5 text-[12px] leading-none font-semibold tabular-nums',
                    worst
                      ? [TONE_TINT[SEV_TONE[worst]], TONE_TEXT[SEV_TONE[worst]]]
                      : 'text-ink-400',
                  )}
                >
                  {fmt.num(n)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('filters.status')} className="flex gap-1.5">
          {STATUS_ORDER.map((s: EventStatus) => {
            const active = filters.status.includes(s);
            return (
              <button
                key={s}
                type="button"
                data-testid={`events-status-${s}`}
                aria-pressed={active}
                className={cn(chip, active ? on : off)}
                onClick={() => {
                  const next = toggle(filters.status, s);
                  if (next.length > 0)
                    onChange({ status: STATUS_ORDER.filter((x) => next.includes(x)) });
                }}
              >
                {tl(`eventStatus.${s}`)}
              </button>
            );
          })}
        </div>
        <MultiMenu
          testId="events-sev"
          label={t('filters.severity')}
          options={SEVERITY_ORDER.map((s) => ({ id: s, label: tl(`sev.${s}`) }))}
          value={filters.sev}
          onChange={(sev) => onChange({ sev })}
        />
        <MultiMenu
          testId="events-category"
          label={t('filters.category')}
          options={categories}
          value={filters.category}
          onChange={(category) => onChange({ category })}
        />
        <MultiMenu
          testId="events-bay"
          label={t('filters.bay')}
          options={bays}
          value={filters.bay}
          onChange={(bay) => onChange({ bay })}
        />
        <div role="group" aria-label={t('filters.range')} className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="events-range-any"
            aria-pressed={effective.from === null && effective.to === null}
            className={cn(chip, effective.from === null && effective.to === null ? on : off)}
            onClick={() => onChange({ from: null, to: null })}
          >
            {t('range.any')}
          </button>
          {PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`events-range-${r}`}
              aria-pressed={activePreset === r}
              className={cn(chip, activePreset === r ? on : off)}
              onClick={() => {
                const w = win(r);
                onChange({ from: w.start, to: w.end });
              }}
            >
              {t(`range.${r}`)}
            </button>
          ))}
          <Input
            type="date"
            aria-label={t('range.from')}
            data-testid="events-from"
            className="h-8 w-[9.5rem]"
            value={effective.from === null ? '' : dayOf(effective.from)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ from: v ? Date.parse(`${v}T00:00:00+06:00`) : null });
            }}
          />
          <Input
            type="date"
            aria-label={t('range.to')}
            data-testid="events-to"
            className="h-8 w-[9.5rem]"
            value={effective.to === null ? '' : dayOf(effective.to - 1)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ to: v ? Date.parse(`${v}T00:00:00+06:00`) + 86_400_000 : null });
            }}
          />
        </div>
        <Input
          type="search"
          aria-label={t('filters.search')}
          placeholder={t('filters.search')}
          data-testid="events-search"
          className="h-8 w-56"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="text-ink-600 flex items-center gap-2 text-[13px]">
          <Switch
            data-testid="events-groupby"
            checked={filters.groupBy === 'visit'}
            onCheckedChange={(c) => onChange({ groupBy: c ? 'visit' : null })}
          />
          {t('filters.groupByTruck')}
        </label>
        {!isDefaultFilters(filters) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="events-clear"
            onClick={onClear}
          >
            {t('filters.clear')}
          </Button>
        )}
      </div>
    </section>
  );
}
