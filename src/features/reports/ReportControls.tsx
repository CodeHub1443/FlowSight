import { ChevronDown, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ReportKind } from '@/data/api/endpoints';
import type { ReportPeriod } from '@/data/api/reportQueries';
import { cn } from '@/lib/utils';
import { REPORT_KINDS, type ReportChip } from './period';
import { useReportFmt } from './reportFmt';

export interface ShiftChoice {
  id: string;
  start: string;
  end: string;
  /** The shift has not started on the chosen day. */
  future: boolean;
}

export interface ReportControlsProps {
  kind: ReportKind;
  period: ReportPeriod;
  chip: ReportChip;
  /** The date or shift picker is open. */
  picking: boolean;
  /** Latest selectable business day. */
  today: string;
  shifts: ShiftChoice[];
  canExport: boolean;
  printReady: boolean;
  /** The previous-shift / yesterday chip has a period to point at. */
  hasPrevious: boolean;
  onKind: (k: ReportKind) => void;
  onChip: (c: ReportChip) => void;
  onDate: (date: string) => void;
  onShift: (id: string) => void;
  onPrint: () => void;
  onCsv: (which: 'bays' | 'trucks') => void;
}

const SEG =
  'soft-transition focus-visible:ring-ring/50 flex h-8 items-center rounded-full px-3 text-sm leading-4 font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none';
const FIELD =
  'border-card-border bg-card text-ink-900 focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none';

/** Report type, period chips with the date and shift picker, CSV menu and the print button. Hidden when printing. */
export function ReportControls(p: ReportControlsProps) {
  const { t } = useTranslation('reports');
  const fmt = useReportFmt();
  const chips: { id: ReportChip; label: string; disabled?: boolean }[] = [
    { id: 'current', label: t(p.kind === 'shift' ? 'controls.currentShift' : 'controls.today') },
    {
      id: 'previous',
      label: t(p.kind === 'shift' ? 'controls.previousShift' : 'controls.yesterday'),
      disabled: !p.hasPrevious,
    },
    { id: 'pick', label: t(p.kind === 'shift' ? 'controls.pickShift' : 'controls.pickDay') },
  ];
  const pickOpen = p.picking || p.chip === 'pick';
  return (
    <div data-testid="report-controls" className="flex flex-wrap items-center gap-3 print:hidden">
      <div
        role="radiogroup"
        aria-label={t('controls.kindLabel')}
        data-testid="report-kind"
        className="bg-segment-track flex w-fit items-center gap-0.5 rounded-full p-[3px]"
      >
        {REPORT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={p.kind === k}
            data-kind={k}
            onClick={() => p.onKind(k)}
            className={cn(
              SEG,
              p.kind === k
                ? 'bg-card text-ink-900 shadow-raised'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {t(`controls.kind.${k}`)}
          </button>
        ))}
      </div>

      <div
        role="radiogroup"
        aria-label={t('controls.periodLabel')}
        data-testid="report-chips"
        className="bg-segment-track flex w-fit items-center gap-0.5 rounded-full p-[3px]"
      >
        {chips.map((c) => {
          const selected = c.id === 'pick' ? pickOpen : !pickOpen && p.chip === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={c.disabled}
              data-chip={c.id}
              onClick={() => p.onChip(c.id)}
              className={cn(
                SEG,
                'disabled:opacity-50',
                selected ? 'bg-card text-ink-900 shadow-raised' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {pickOpen && (
        <div data-testid="report-picker" className="flex items-center gap-2">
          <label className="text-ink-600 flex items-center gap-1.5 text-sm">
            {t('controls.date')}
            <input
              type="date"
              value={p.period.date}
              max={p.today}
              onChange={(e) => e.target.value && p.onDate(e.target.value)}
              className={FIELD}
              data-testid="report-date"
            />
          </label>
          {p.kind === 'shift' && (
            <label className="text-ink-600 flex items-center gap-1.5 text-sm">
              {t('controls.shift')}
              <select
                value={p.period.shift ?? ''}
                onChange={(e) => p.onShift(e.target.value)}
                className={FIELD}
                data-testid="report-shift"
              >
                {p.shifts.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.future}>
                    {t('controls.shiftOption', {
                      id: s.id,
                      start: fmt.hhmm(s.start),
                      end: fmt.hhmm(s.end),
                    })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="ms-auto flex items-center gap-2">
        {p.canExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="report-csv">
                {t('controls.csv')}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="report-csv-bays" onSelect={() => p.onCsv('bays')}>
                {t('controls.csvBays')}
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="report-csv-trucks" onSelect={() => p.onCsv('trucks')}>
                {t('controls.csvTruckLog')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="sm" data-testid="report-print" disabled={!p.printReady} onClick={p.onPrint}>
          <Printer aria-hidden />
          {p.printReady ? t('controls.print') : t('controls.printPreparing')}
        </Button>
      </div>
    </div>
  );
}
