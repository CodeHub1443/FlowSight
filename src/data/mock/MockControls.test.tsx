import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureSource } from '../fixture/FixtureSource';
import i18n from '@/i18n';
import bn from '@/i18n/locales/bn/mock.json';
import en from '@/i18n/locales/en/mock.json';
import { MockControls } from './MockControls';
import { MockSource } from './MockSource';
import { PEAK } from './core/testing';
import { InlineHost, SimRuntime } from './runtime';

const OPTS = { mode: 'mock', siteId: 'dhk-depot', baseUrl: '' } as const;

describe('MockControls', () => {
  let runtime: SimRuntime;
  let source: MockSource;

  beforeEach(async () => {
    // one day of history: these tests exercise the controls, not the 7-day backfill
    runtime = new SimRuntime(new InlineHost({ autoTick: false, now: () => PEAK }), {
      historyDays: 1,
    });
    source = new MockSource(OPTS, runtime);
    await runtime.ensure({ seed: 1, scenario: 'peak', speed: 1, startMs: PEAK });
    await act(async () => {
      await source.connect();
    });
  }, 60_000);

  afterEach(async () => {
    await source.disconnect();
    runtime.dispose();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', en, 'Evening peak'],
    ['bn', bn, 'সন্ধ্যার ব্যস্ত সময়'],
  ] as const)('renders in %s with every control labelled', async (lng, strings, peak) => {
    await i18n.changeLanguage(lng);
    render(<MockControls source={source} />);
    expect(screen.getByRole('region', { name: strings.title })).toBeInTheDocument();
    expect(screen.getByText(strings.simTime)).toBeInTheDocument();
    expect(screen.getByLabelText(strings.seed)).toHaveValue('1');
    expect(screen.getByRole('option', { name: peak })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.apply })).toBeEnabled();
    expect(screen.getByRole('button', { name: strings.pause })).toBeInTheDocument();
    expect(screen.getByText(strings.rates)).toBeInTheDocument();
    for (const c of Object.values(strings.categories))
      expect(screen.getByRole('button', { name: c })).toBeInTheDocument();
    for (const k of Object.values(strings.kinds)) expect(screen.getByText(k)).toBeInTheDocument();
    // numbers follow the language: Bangla digits in bn
    const ten = lng === 'bn' ? '১০×' : '10×';
    expect(screen.getByRole('button', { name: ten })).toBeInTheDocument();
  });

  it('changes speed, pauses, triggers events and restarts with a new seed', async () => {
    const user = userEvent.setup();
    const events: string[] = [];
    source.onEvent((e) => events.push(`${e.category}.${e.type}`));
    render(<MockControls source={source} />);

    await user.click(screen.getByRole('button', { name: '60×' }));
    expect(source.control.get().speed).toBe(60);
    expect(screen.getByRole('button', { name: '60×' })).toHaveAttribute('data-active', 'true');

    await user.click(screen.getByRole('button', { name: en.pause }));
    expect(source.control.get().paused).toBe(true);
    expect(screen.getByRole('button', { name: en.resume })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.resume }));
    expect(source.control.get().paused).toBe(false);

    await user.click(screen.getByRole('button', { name: en.categories.hygiene }));
    expect(events.at(-1)).toMatch(/^hygiene\./);
    await user.click(screen.getByRole('button', { name: en.categories.system }));
    expect(events.at(-1)).toMatch(/^system\./);

    const seed = screen.getByLabelText(en.seed);
    await user.clear(seed);
    await user.type(seed, '4242');
    await user.click(screen.getByRole('button', { name: en.apply }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(source.control.get().seed).toBe(4242);
  });

  it('renders nothing for a source that is not the mock simulator', () => {
    const fixture = new FixtureSource(OPTS);
    const { container } = render(<MockControls source={fixture} />);
    expect(container).toBeEmptyDOMElement();
  });
});
