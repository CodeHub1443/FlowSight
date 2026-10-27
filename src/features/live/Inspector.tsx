import { useState } from 'react';
import { uiStore, useUiStore, type Selection } from '@/stores';
import {
  BayBody,
  EventBody,
  ForkliftBody,
  PersonBody,
  SiteBody,
  StagingBody,
  TruckBody,
} from './InspectorBodies';
import type { FrameActions } from './InspectorFrame';

function Body({ selection, actions }: { selection: Selection; actions: FrameActions }) {
  switch (selection.kind) {
    case 'site':
      return <SiteBody actions={actions} />;
    case 'bay':
    case 'belt':
      return <BayBody bayId={selection.id} kind={selection.kind} actions={actions} />;
    case 'staging':
      return <StagingBody bayId={selection.id} actions={actions} />;
    case 'truck':
      return <TruckBody visitId={selection.id} actions={actions} />;
    case 'event':
      return <EventBody eventId={selection.id} actions={actions} />;
    case 'person':
      return <PersonBody actorId={selection.id} actions={actions} />;
    case 'forklift':
      return <ForkliftBody actorId={selection.id} actions={actions} />;
  }
}

/**
 * Right-hand inspector. Opens on uiStore.selection; renders nothing without one.
 * Pinned: stays open on the last object when the selection is cleared (e.g. a click on empty floor).
 */
export function Inspector() {
  const selection = useUiStore((s) => s.selection);
  const [pinned, setPinned] = useState(false);
  const [last, setLast] = useState<Selection | null>(null);
  if (selection && selection !== last) setLast(selection);

  const shown = selection ?? (pinned ? last : null);
  if (!shown) return null;

  const actions: FrameActions = {
    pinned,
    onPin: () => setPinned((v) => !v),
    onClose: () => {
      setPinned(false);
      setLast(null);
      uiStore.getState().select(null);
    },
  };
  // The wrapper stays mounted while anything is shown, so it slides and fades in once on open (200 ms); switching
  // between objects only swaps the body.
  return (
    <div className="animate-in fade-in-0 slide-in-from-right-3 flex max-h-full min-h-0 flex-col duration-200">
      <Body selection={shown} actions={actions} />
    </div>
  );
}
