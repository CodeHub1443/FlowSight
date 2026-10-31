import { iso, useFill } from './kit';
import { Edge, Face, GroundShadow, IsoBox } from './shared';

// The six drawings (docs/06 section 7.4), on the kit's 40 x 40 grid.

const BOX = iso(20, 5.5);

export function BoxDrawing() {
  const at = BOX;
  const s = 15;
  return (
    <>
      <GroundShadow cx={21} cy={32} rx={16.5} ry={6} />
      <IsoBox at={at} u={[0, s]} v={[0, s]} w={[-13.5, 0]} />
      {/* tape over the top and down the lit side */}
      <Face p={[at(6, 0, 0), at(9, 0, 0), at(9, s, 0), at(6, s, 0)]} fill="white" round={0.2} />
      <Face
        p={[at(6, s, 0), at(9, s, 0), at(9, s, -5.5), at(6, s, -5.5)]}
        fill="whiteSide"
        round={0.2}
      />
      {/* shipping label on the shaded side */}
      <Face
        p={[at(s, 9.5, -7.2), at(s, 4, -7.2), at(s, 4, -10.8), at(s, 9.5, -10.8)]}
        fill="whiteSide"
        round={0.5}
      />
      <Edge p={[at(0, s, 0), at(s, s, 0), at(s, 0, 0)]} />
    </>
  );
}

const TRUCK = iso(26, 18.5);

export function TruckDrawing() {
  const f = useFill();
  const at = TRUCK;
  const wheel = (v: number) => {
    const [x, y] = at(10, v, 2.7);
    const m = `matrix(-0.866 0.5 0 -1 ${x.toFixed(2)} ${y.toFixed(2)})`;
    return (
      <g transform={m}>
        <circle r={2.9} fill={f('dark')} />
        <circle r={1.25} fill={f('whiteDeep')} />
      </g>
    );
  };
  return (
    <>
      <GroundShadow cx={18} cy={32.5} rx={18} ry={6} />
      {/* chassis */}
      <IsoBox
        at={at}
        u={[0.4, 9.6]}
        v={[0, 23.5]}
        w={[2.4, 4.4]}
        top="dark"
        left="dark"
        right="dark"
      />
      {/* cargo box: white with a blue stripe */}
      <IsoBox
        at={at}
        u={[0, 10]}
        v={[0, 16.5]}
        w={[4.2, 15.5]}
        top="whiteSide"
        left="whiteDeep"
        right="whiteDeep"
      />
      <Face
        p={[at(10, 16.5, 7.4), at(10, 0, 7.4), at(10, 0, 4.2), at(10, 16.5, 4.2)]}
        fill="left"
        round={0.3}
      />
      <Face
        p={[at(10, 11.5, 13), at(10, 7.2, 13), at(10, 7.2, 9.2), at(10, 11.5, 9.2)]}
        fill="left"
        round={0.5}
      />
      <Edge p={[at(0, 16.5, 15.5), at(10, 16.5, 15.5), at(10, 0, 15.5)]} opacity={0.9} />
      {/* cab, with its sloped windscreen */}
      <IsoBox at={at} u={[0.3, 9.7]} v={[17, 23.5]} w={[3.6, 7.6]} />
      <Face p={[at(0.3, 17, 12), at(9.7, 17, 12), at(9.7, 21, 12), at(0.3, 21, 12)]} fill="top" />
      <Face
        p={[at(9.7, 17, 12), at(9.7, 21, 12), at(9.7, 23.5, 7.6), at(9.7, 17, 7.6)]}
        fill="right"
      />
      <Face
        p={[at(0.3, 21, 12), at(9.7, 21, 12), at(9.7, 23.5, 7.6), at(0.3, 23.5, 7.6)]}
        fill="left"
      />
      {/* windscreen and side window */}
      <Face
        p={[at(1.3, 21.3, 11.4), at(8.7, 21.3, 11.4), at(8.7, 23.2, 8), at(1.3, 23.2, 8)]}
        fill="white"
        round={0.5}
      />
      <Face
        p={[at(9.7, 18, 11.2), at(9.7, 20.6, 11.2), at(9.7, 22.2, 8.3), at(9.7, 18, 8.3)]}
        fill="whiteSide"
        round={0.4}
      />
      {/* headlights */}
      <Face
        p={[at(1.2, 23.5, 5.6), at(3, 23.5, 5.6), at(3, 23.5, 4.5), at(1.2, 23.5, 4.5)]}
        fill="white"
        round={0.3}
      />
      <Face
        p={[at(7, 23.5, 5.6), at(8.8, 23.5, 5.6), at(8.8, 23.5, 4.5), at(7, 23.5, 4.5)]}
        fill="white"
        round={0.3}
      />
      {wheel(3.6)}
      {wheel(20.2)}
    </>
  );
}

const BELT = iso(13, 10.5);

export function ConveyorDrawing() {
  const f = useFill();
  const at = BELT;
  const L = 26;
  const W = 9;
  const ticks = [3.5, 7, 17.5, 21, 24];
  return (
    <>
      <GroundShadow cx={22} cy={32} rx={17.5} ry={6.5} />
      {/* legs */}
      <IsoBox at={at} u={[3, 5]} v={[0.8, 2.8]} w={[-9, -2]} top="dark" left="dark" right="dark" />
      <IsoBox at={at} u={[3, 5]} v={[6.2, 8.2]} w={[-9, -2]} top="dark" left="left" right="dark" />
      <IsoBox
        at={at}
        u={[21, 23]}
        v={[0.8, 2.8]}
        w={[-9, -2]}
        top="dark"
        left="dark"
        right="dark"
      />
      <IsoBox
        at={at}
        u={[21, 23]}
        v={[6.2, 8.2]}
        w={[-9, -2]}
        top="dark"
        left="left"
        right="dark"
      />
      {/* frame */}
      <IsoBox at={at} u={[0, L]} v={[0, W]} w={[-3.4, 0]} />
      {/* belt inset in the frame's top */}
      <Face
        p={[at(0.9, 1.5, 0), at(L - 0.9, 1.5, 0), at(L - 0.9, W - 1.5, 0), at(0.9, W - 1.5, 0)]}
        fill="dark"
        round={0.4}
      />
      {ticks.map((u) => {
        const [x1, y1] = at(u, 1.5, 0);
        const [x2, y2] = at(u, W - 1.5, 0);
        return (
          <line
            key={u}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={f('top')}
            strokeWidth={0.6}
            strokeOpacity={0.45}
          />
        );
      })}
      {/* a carton riding the belt */}
      <IsoBox
        at={at}
        u={[9.2, 16.2]}
        v={[1.8, 7.2]}
        w={[0.2, 6.6]}
        top="whiteSide"
        left="whiteSide"
        right="whiteDeep"
      />
      <Face
        p={[at(11.9, 1.8, 6.6), at(13.5, 1.8, 6.6), at(13.5, 7.2, 6.6), at(11.9, 7.2, 6.6)]}
        fill="left"
        round={0.2}
      />
      <Face
        p={[at(11.9, 7.2, 6.6), at(13.5, 7.2, 6.6), at(13.5, 7.2, 3.6), at(11.9, 7.2, 3.6)]}
        fill="left"
        round={0.2}
      />
      <Edge p={[at(0, W, 0), at(L, W, 0), at(L, 0, 0)]} />
    </>
  );
}

export function StopwatchDrawing() {
  const f = useFill();
  return (
    <>
      <GroundShadow cx={21.5} cy={34.5} rx={14} ry={4.5} />
      {/* crown and side button */}
      <rect x={18.7} y={5.4} width={2.8} height={4} fill={f('right')} />
      <rect x={16.5} y={2.6} width={7.2} height={3.4} rx={1.5} fill={f('body')} />
      <rect
        x={29.3}
        y={7.2}
        width={3.8}
        height={3.2}
        rx={1}
        fill={f('right')}
        transform="rotate(42 31.2 8.8)"
      />
      {/* case: the depth behind, the front ring, the face */}
      <circle cx={21.9} cy={23} r={13.1} fill={f('right')} />
      <circle cx={20.2} cy={21.8} r={13.1} fill={f('body')} />
      <circle cx={20.2} cy={21.8} r={9.7} fill={f('right')} />
      <circle cx={20.5} cy={22.1} r={9.2} fill={f('white')} />
      {/* quarter marks */}
      {[0, 90, 180, 270].map((a) => (
        <rect
          key={a}
          x={19.8}
          y={14.4}
          width={1.4}
          height={2.1}
          rx={0.7}
          fill={f('body')}
          transform={`rotate(${a} 20.5 22.1)`}
        />
      ))}
      {/* hands */}
      <path
        d="M20.5 22.1 V16.9 M20.5 22.1 L24.6 24.5"
        fill="none"
        stroke={f('right')}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <circle cx={20.5} cy={22.1} r={1.6} fill={f('right')} />
      {/* highlight on the ring */}
      <path
        d="M8.9 19.4 A11.7 11.7 0 0 1 15.4 11"
        fill="none"
        style={{ stroke: 'var(--i3-white)' }}
        strokeOpacity={0.75}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </>
  );
}

export function BellDrawing() {
  const f = useFill();
  return (
    <>
      <GroundShadow cx={20.5} cy={35} rx={14} ry={4} />
      <g transform="rotate(-9 20 20)">
        {/* clapper, behind the rim */}
        <circle cx={20} cy={32.6} r={3.6} fill={f('right')} />
        {/* top knob */}
        <circle cx={20} cy={5.6} r={2.7} fill={f('body')} />
        {/* the shell */}
        <path
          d="M20 6.6 C13.6 6.6 10.8 11.4 10.8 17.6 C10.8 22.8 9.2 25.6 6.8 28.2 C5.8 29.4 6.6 31 8.2 31 H31.8 C33.4 31 34.2 29.4 33.2 28.2 C30.8 25.6 29.2 22.8 29.2 17.6 C29.2 11.4 26.4 6.6 20 6.6 Z"
          fill={f('body')}
        />
        {/* the lip, lit from above */}
        <path
          d="M6.8 28.2 C5.8 29.4 6.6 31 8.2 31 H31.8 C33.4 31 34.2 29.4 33.2 28.2 C32.8 29 31.8 29.2 31 29.2 H9 C8.2 29.2 7.2 29 6.8 28.2 Z"
          fill={f('right')}
        />
        {/* highlight down the lit shoulder */}
        <path
          d="M15.6 10.6 C13.6 12.6 13.2 15.6 13.2 18.6"
          fill="none"
          style={{ stroke: 'var(--i3-white)' }}
          strokeOpacity={0.8}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

const SHIELD_PATH =
  'M20 4.4 L31.4 8.3 C32.3 8.6 32.9 9.4 32.9 10.4 V18.8 C32.9 26.2 27.8 31.8 20 35 C12.2 31.8 7.1 26.2 7.1 18.8 V10.4 C7.1 9.4 7.7 8.6 8.6 8.3 Z';

export function ShieldDrawing() {
  const f = useFill();
  return (
    <>
      <GroundShadow cx={21} cy={35} rx={13.5} ry={3.8} />
      {/* depth behind the plate */}
      <path d={SHIELD_PATH} fill={f('right')} transform="translate(1.7 1.3)" />
      <path d={SHIELD_PATH} fill={f('body')} />
      {/* white inset plate */}
      <path
        d={SHIELD_PATH}
        fill={f('white')}
        transform="translate(20 19.7) scale(0.72) translate(-20 -19.7)"
      />
      {/* check mark with its own shadow */}
      <path
        d="M14.6 19.9 L18.6 23.9 L25.8 15.9"
        fill="none"
        stroke={f('whiteDeep')}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0.5 0.7)"
      />
      <path
        d="M14.6 19.9 L18.6 23.9 L25.8 15.9"
        fill="none"
        stroke={f('body')}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* highlight along the lit edge */}
      <path
        d="M9.2 18.4 V11.2 C9.2 10.6 9.5 10.2 10 10 L17 7.6"
        fill="none"
        style={{ stroke: 'var(--i3-white)' }}
        strokeOpacity={0.75}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}
