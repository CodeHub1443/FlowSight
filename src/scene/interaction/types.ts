import type { BaySelection } from '../bay/Bay';

/** A truck (by visit id), a person or a forklift (by track id) in the scene: the ids the inspector bodies expect. */
export interface ActorSelection {
  kind: 'truck' | 'person' | 'forklift';
  id: string;
}

/** A click on a camera glyph; the host decides what that selects (LiveScene: the camera's newest open event). */
export interface CameraSelection {
  kind: 'camera';
  camId: string;
}

/** What the scene reports when something in it is clicked. The scene never writes to a store. */
export type SceneSelection = BaySelection | ActorSelection | CameraSelection;
