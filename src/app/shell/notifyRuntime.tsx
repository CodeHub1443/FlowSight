import type { NavigateFunction } from 'react-router';
import { toast } from 'sonner';
import type { WhEventWithStatus } from '@/domain';
import { focusObject } from '@/features/live';
import { eventPath } from '@/features/events/urlState';
import { clockNow, liveStore, sessionStore } from '@/stores';
import { NotifyCard } from './NotifyCard';
import {
  applyDecision,
  decideNotification,
  emptyHistory,
  removeToast,
  toastDuration,
  type NotifyHistory,
} from './notifyDecision';

let history: NotifyHistory = emptyHistory();

/** Test hook: forget the toasts and the 60 s windows. */
export function resetNotifications(): void {
  history = emptyHistory();
}

/**
 * Decide and show the toast for each new live event (in arrival order). Loaded on the first live event, so the shell
 * entry carries only the subscriber in LiveNotifications.tsx.
 */
export function notify(events: readonly WhEventWithStatus[], navigate: NavigateFunction): void {
  for (const e of events) {
    const live = liveStore.getState();
    const now = clockNow();
    const d = decideNotification(
      e,
      {
        role: sessionStore.getState().role,
        live: live.sourceStatus === 'live',
        liveSince: live.sourceSince,
        now,
      },
      history,
    );
    if (d.kind === 'skip') continue;
    history = applyDecision(history, d, now);
    if (d.kind === 'show' && d.evict) toast.dismiss(d.evict);
    const tt = d.toast;
    const gone = () => {
      history = removeToast(history, tt.id);
    };
    toast.custom(
      (toastId) => (
        <NotifyCard
          id={String(toastId)}
          toast={tt}
          event={e}
          onShow={() => {
            focusObject({ kind: 'event', id: tt.eventId });
            void navigate('/live');
            toast.dismiss(tt.id);
          }}
          onOpen={() => {
            void navigate(eventPath(tt.eventId));
            toast.dismiss(tt.id);
          }}
        />
      ),
      {
        id: tt.id,
        duration: toastDuration(tt.sev),
        onDismiss: gone,
        onAutoClose: gone,
        // t22b.3: a live-event toast sits top-centre (docs/06 §7.10), set once here rather than read from
        // the current route, so it does not move or get rebuilt if the user navigates away while it is open.
        position: 'top-center',
      },
    );
  }
}
