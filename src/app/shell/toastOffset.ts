import { SCENE_SAFE_AREA } from '@/scene/camera/view';

/** Used only when the /live KPI row is not mounted (other pages); the top-centre group is not shown there anyway. */
export const TOAST_OFFSET_TOP_FALLBACK = SCENE_SAFE_AREA.top + 16;

/** 12 px clearance below the KPI row's measured bottom edge (docs/06 §7.10, t22b.4). */
export const TOAST_GAP_BELOW_KPI = 12;

/** Top offset (px) for the top-centre toast stack: just below the KPI row, or the fallback when it is unmounted. */
export function computeToastOffsetTop(kpiRowBottom: number | null): number {
  return kpiRowBottom === null ? TOAST_OFFSET_TOP_FALLBACK : kpiRowBottom + TOAST_GAP_BELOW_KPI;
}
