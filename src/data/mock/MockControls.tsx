import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageKind } from '@/domain';
import type { DataSource } from '../DataSource';
import { formatNumber } from '@/lib/format';
import { formatClock } from '@/lib/time';
import { MockSource, SPEEDS, TRIGGER_CATEGORIES, type MockControlState } from './MockSource';

const KINDS: readonly MessageKind[] = [
  'siteState',
  'bayState',
  'actors',
  'case',
  'event',
  'lifecycle',
  'health',
];

const btn =
  'rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent disabled:opacity-50 data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground';

/**
 * Dev-only panel for the mock simulator: speed, seed, pause, start scenario, "trigger event" per category and live
 * message rates. Renders nothing unless `source` is a MockSource. Not mounted by default.
 */
export function MockControls({ source, className }: { source: DataSource; className?: string }) {
  if (!(source instanceof MockSource)) return null;
  return <Panel source={source} className={className} />;
}

function Panel({ source, className }: { source: MockSource; className: string | undefined }) {
  const { t, i18n } = useTranslation('mock');
  const lang = i18n.language === 'bn' ? 'bn' : 'en';
  const digits = lang === 'bn' ? 'bangla' : 'latin';
  const state: MockControlState = useSyncExternalStore(
    (cb) => source.control.subscribe(cb),
    () => source.control.get(),
  );
  const [seedText, setSeedText] = useState(String(state.seed));
  const num = (n: number, fractionDigits = 0) => formatNumber(n, { lang, digits, fractionDigits });
  const seed = Number.parseInt(seedText, 10);

  return (
    <section
      aria-label={t('title')}
      className={`w-80 space-y-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg ${className ?? ''}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">{t('title')}</h2>
        <span className="text-xs text-muted-foreground">
          {state.ready ? t('ready', { ms: num(state.historyMs) }) : t('loading')}
        </span>
      </header>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t('simTime')}</span>
        <span className="font-mono">
          {state.simNow > 0 ? formatClock(state.simNow, { seconds: true, digits }) : '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">{t('speed')}</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={btn}
            data-active={state.speed === s}
            onClick={() => source.setSpeed(s)}
          >
            {t('speedValue', { n: num(s) })}
          </button>
        ))}
        <button type="button" className={btn} onClick={() => source.setPaused(!state.paused)}>
          {state.paused ? t('resume') : t('pause')}
        </button>
      </div>

      <div className="flex items-center gap-1">
        <label htmlFor="mock-seed" className="text-xs text-muted-foreground">
          {t('seed')}
        </label>
        <input
          id="mock-seed"
          inputMode="numeric"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value.replace(/\D/g, ''))}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          className={btn}
          disabled={!Number.isFinite(seed) || !state.ready}
          onClick={() => void source.setSeed(seed)}
        >
          {t('apply')}
        </button>
      </div>

      <div className="flex items-center gap-1">
        <label htmlFor="mock-scenario" className="text-xs text-muted-foreground">
          {t('scenario')}
        </label>
        <select
          id="mock-scenario"
          value={state.scenario}
          disabled={!state.ready}
          onChange={(e) => void source.setScenario(e.target.value === 'peak' ? 'peak' : 'now')}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="now">{t('scenarioNow')}</option>
          <option value="peak">{t('scenarioPeak')}</option>
        </select>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">{t('trigger')}</div>
        <div className="flex flex-wrap gap-1">
          {TRIGGER_CATEGORIES.map((c) => (
            <button key={c} type="button" className={btn} onClick={() => source.trigger(c)}>
              {t(`categories.${c}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">{t('rates')}</div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          {KINDS.map((k) => (
            <div key={k} className="flex justify-between">
              <dt>{t(`kinds.${k}`)}</dt>
              <dd className="font-mono">{num(state.rates[k])}</dd>
            </div>
          ))}
          <div className="col-span-2 flex justify-between">
            <dt>{t('dropped')}</dt>
            <dd className="font-mono">{num(state.dropped)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
