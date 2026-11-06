import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { alertStore } from '@/stores';

/**
 * Shell-level live notifications (t22 spec section 3). Watches the alert store for events that arrived on the live
 * subject (`unreadIds`; the REST merge never sets it) and hands them to `notifyRuntime`, which holds the decision rules,
 * the toast card and sonner. That runtime is a separate chunk fetched on the first live event, so the /live entry carries
 * only this subscriber. Renders nothing.
 */
export function LiveNotifications() {
  const navigate = useNavigate();
  useEffect(() => {
    let seen = new Set(Object.keys(alertStore.getState().unreadIds));
    return alertStore.subscribe((s) => {
      const fresh = Object.keys(s.unreadIds).filter((id) => !seen.has(id));
      seen = new Set(Object.keys(s.unreadIds));
      const events = fresh.flatMap((id) => (s.events[id] ? [s.events[id]] : []));
      if (events.length > 0) void import('./notifyRuntime').then((m) => m.notify(events, navigate));
    });
  }, [navigate]);
  return null;
}
