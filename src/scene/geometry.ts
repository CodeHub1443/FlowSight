import { BoxGeometry, CylinderGeometry, PlaneGeometry } from 'three';

// Shared unit geometries; scale per mesh instead of allocating a geometry per box.
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const UNIT_CYL = new CylinderGeometry(1, 1, 1, 16);
export const UNIT_PLANE = new PlaneGeometry(1, 1);
