import type { ActorAct } from '@/domain';

// The five animations of a person, as limb angles at a moment. Pure and three-free. A positive pitch swings a limb
// forward from its hip or shoulder. `act` is an animation hint only (docs/03 section 3.3): STATIONARY is a neutral stand,
// and there is no phone or idle pose of any kind (CLAUDE.md, docs/04 section 4).

export interface PersonPose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  /** Forward lean of the upper body. */
  lean: number;
  /** Vertical bob of the whole figure, metres. */
  bob: number;
  /** A carton held in front of the body. */
  carrying: boolean;
}

const WALK_HZ = 1.7;
const TAU = Math.PI * 2;

const STAND: PersonPose = {
  legL: 0,
  legR: 0,
  armL: 0.06,
  armR: 0.06,
  lean: 0,
  bob: 0,
  carrying: false,
};

/** `t` seconds, `seed` offsets the cycle per person. */
export function personPose(act: ActorAct, t: number, seed: number): PersonPose {
  const phase = ((seed % 1000) / 1000) * TAU;
  const walk = Math.sin(t * WALK_HZ * TAU + phase);
  const stride = Math.abs(Math.cos(t * WALK_HZ * TAU + phase));
  switch (act) {
    case 'WALKING':
      return {
        ...STAND,
        legL: walk * 0.5,
        legR: -walk * 0.5,
        armL: -walk * 0.42,
        armR: walk * 0.42,
        bob: stride * 0.03,
      };
    case 'CARRYING':
      return {
        ...STAND,
        legL: walk * 0.34,
        legR: -walk * 0.34,
        armL: 1.2,
        armR: 1.2,
        lean: -0.05,
        bob: stride * 0.02,
        carrying: true,
      };
    case 'HANDLING': {
      const pump = Math.sin(t * 2.3 * TAU * 0.5 + phase);
      return { ...STAND, armL: 0.95 + pump * 0.45, armR: 0.95 - pump * 0.45, lean: 0.16 };
    }
    case 'SCANNING': {
      const sway = Math.sin(t * 0.9 * TAU * 0.5 + phase);
      return { ...STAND, armR: 1.28 + sway * 0.12, armL: 0.32, lean: 0.03 };
    }
    // STATIONARY, DRIVING (seated: the forklift draws its operator) and UNKNOWN
    default:
      return STAND;
  }
}
