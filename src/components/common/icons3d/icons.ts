import { createElement, type JSX } from 'react';
import type { Tone } from '../tone';
import {
  BellDrawing,
  BoxDrawing,
  ConveyorDrawing,
  ShieldDrawing,
  StopwatchDrawing,
  TruckDrawing,
} from './drawings';
import { IconFrame } from './shared';

export interface Icon3dProps {
  tone?: Tone;
  className?: string;
}

/** Marks a component as a 3D icon, so IconTile draws it as is instead of as a lucide line glyph. */
export interface Icon3d {
  (props: Icon3dProps): JSX.Element;
  is3d: true;
}

const icon3d = (drawing: () => JSX.Element, name: string): Icon3d => {
  const Icon = ({ tone, className }: Icon3dProps) =>
    createElement(IconFrame, { tone, className, children: createElement(drawing) });
  Icon.displayName = name;
  Icon.is3d = true as const;
  return Icon;
};

/** Cases today, staging. */
export const Box3d = icon3d(BoxDrawing, 'Box3d');
/** Trucks on site, truck inspector, visit tracker. */
export const Truck3d = icon3d(TruckDrawing, 'Truck3d');
/** Bays running, bay and belt inspectors. */
export const Conveyor3d = icon3d(ConveyorDrawing, 'Conveyor3d');
/** Average turnaround. */
export const Stopwatch3d = icon3d(StopwatchDrawing, 'Stopwatch3d');
/** Open alerts, event inspector. */
export const Bell3d = icon3d(BellDrawing, 'Bell3d');
/** Compliance. */
export const Shield3d = icon3d(ShieldDrawing, 'Shield3d');

export const ICONS_3D = { Box3d, Truck3d, Conveyor3d, Stopwatch3d, Bell3d, Shield3d } as const;
