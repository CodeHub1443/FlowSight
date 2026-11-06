// @vitest-environment node
import { describe, expect, it } from 'vitest';
import enScene from '../../i18n/locales/en/scene.json';
import bnScene from '../../i18n/locales/bn/scene.json';
import {
  forkliftLabel,
  personLabel,
  phaseCount,
  PILL_SEP,
  truckLabel,
  type ActorLabelStrings,
} from './actorLabel';

const strings = (lang: 'en' | 'bn', words: typeof enScene.actor): ActorLabelStrings => ({
  lang,
  captain: words.captain,
  worker: words.worker,
  person: words.person,
  forklift: words.forklift,
  phase: words.phase as ActorLabelStrings['phase'],
});
const EN = strings('en', enScene.actor);
const BN = strings('bn', bnScene.actor);
const plate = { bn: 'ঢাকা মেট্রো-ঢ ১১-২১৭১', en: 'DHAKA METRO-DA 11-2171' };

describe('selection pill text (B2)', () => {
  it('a truck reads bay, plate, phase and count', () => {
    expect(truckLabel('B04', plate, { phase: 'LOADING', casesOut: 412, casesIn: 0 }, EN)).toBe(
      `B04${PILL_SEP}DHAKA METRO-DA 11-2171${PILL_SEP}Loading 412`,
    );
  });

  it('in Bangla the plate is the Bangla one and the digits are Bangla', () => {
    const text = truckLabel('B04', plate, { phase: 'LOADING', casesOut: 412, casesIn: 0 }, BN);
    expect(text).toContain('ঢাকা মেট্রো-ঢ ১১-২১৭১');
    expect(text).toContain('৪১২');
    expect(text).not.toMatch(/[0-9]{3}/);
  });

  it('an unloading truck counts what came in; one waiting on the apron shows bay and plate only', () => {
    expect(truckLabel('B02', plate, { phase: 'UNLOADING', casesOut: 0, casesIn: 96 }, EN)).toMatch(
      /Unloading 96$/,
    );
    expect(truckLabel('B02', plate, null, EN)).toBe(`B02${PILL_SEP}DHAKA METRO-DA 11-2171`);
  });

  it('a phase without a count shows the word alone', () => {
    expect(truckLabel('B01', plate, { phase: 'DOCKED', casesOut: 0, casesIn: 0 }, EN)).toMatch(
      /Docked$/,
    );
    expect(phaseCount({ phase: 'ARRIVED', casesOut: 5, casesIn: 5 })).toBeNull();
    expect(phaseCount({ phase: 'FINISHED', casesOut: 0, casesIn: 0 })).toBeNull();
    expect(phaseCount({ phase: 'FINISHED', casesOut: 0, casesIn: 40 })).toBe(40);
    expect(phaseCount({ phase: 'FINISHED', casesOut: 400, casesIn: 40 })).toBe(400);
  });

  it('a person shows the role only: no name, no id', () => {
    expect(personLabel('CAPTAIN', EN)).toBe('Captain');
    expect(personLabel('WORKER', EN)).toBe('Worker');
    expect(personLabel('UNKNOWN', EN)).toBe('Person');
    expect(personLabel('FORKLIFT_OP', EN)).toBe('Person');
    expect(personLabel('CAPTAIN', BN)).toBe('ক্যাপ্টেন');
    expect(personLabel('WORKER', BN)).toBe('শ্রমিক');
  });

  it('a forklift reads Forklift and its bay', () => {
    expect(forkliftLabel('B04', EN)).toBe(`Forklift${PILL_SEP}B04`);
    expect(forkliftLabel('B04', BN)).toBe(`ফর্কলিফট${PILL_SEP}B04`);
  });

  it('has a Bangla word for every English one', () => {
    expect(Object.keys(bnScene.actor).sort()).toEqual(Object.keys(enScene.actor).sort());
    expect(Object.keys(bnScene.actor.phase).sort()).toEqual(
      Object.keys(enScene.actor.phase).sort(),
    );
  });
});
