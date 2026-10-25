import { uiStore, type Selection } from '@/stores';

/** Select the object and ask the 3D camera to fly to it (the scene listens to uiStore.cameraTarget). */
export function focusObject(selection: Selection): void {
  const ui = uiStore.getState();
  ui.select(selection);
  ui.flyTo(selection.kind, selection.id);
}
