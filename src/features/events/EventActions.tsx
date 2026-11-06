import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { WhEventWithStatus } from '@/domain';
import { NotPermittedError, useEventAction, type EventAction } from '@/data/api/eventQueries';
import { canActOnCategory } from '@/lib/rbac';
import { useSessionStore } from '@/stores';

/** Closing needs a real note (t22 spec section 3). */
export const MIN_CLOSE_NOTE = 3;

type Mode = 'close' | 'note';

/**
 * Acknowledge, Close (note of at least 3 characters) and Add note for one event, shared by the Events drawer and the
 * live inspector. Strings live in the `live` namespace (`inspector.eventActions.*`) because the inspector renders in the
 * entry chunk. Optimistic through `useEventAction`; on error the change is undone, the draft comes back and a toast says why.
 * Mount it with `key={event.id}`: drafts live in this component, so an incoming lifecycle message (a new `event` prop)
 * never clears what the user is typing. Read-only roles get a one-line explanation and no buttons.
 */
export function EventActions({ event }: { event: WhEventWithStatus }) {
  const { t } = useTranslation('live');
  const role = useSessionStore((s) => s.role);
  const action = useEventAction();
  const [mode, setMode] = useState<Mode | null>(null);
  const [drafts, setDrafts] = useState<Record<Mode, string>>({ close: '', note: '' });

  if (!canActOnCategory(role, event.category)) {
    return (
      <p data-testid="event-readonly" className="text-ink-600 text-[12px] leading-4">
        {t('inspector.eventActions.readOnly')}
      </p>
    );
  }

  const run = (a: EventAction, restore?: { mode: Mode; text: string }) => {
    action.mutate(a, {
      onError: (e) => {
        toast.error(
          e instanceof NotPermittedError
            ? t('inspector.eventActions.notPermitted')
            : t('inspector.eventActions.failed'),
        );
        if (restore) {
          setMode(restore.mode);
          setDrafts((d) => ({ ...d, [restore.mode]: restore.text }));
        }
      },
    });
  };

  const text = mode ? drafts[mode].trim() : '';
  const min = mode === 'close' ? MIN_CLOSE_NOTE : 1;
  const valid = text.length >= min;

  const submit = () => {
    if (!mode || !valid) return;
    const sent = { mode, text };
    setMode(null);
    setDrafts((d) => ({ ...d, [mode]: '' }));
    run(
      mode === 'close'
        ? { id: event.id, action: 'close', note: text }
        : { id: event.id, action: 'note', text },
      sent,
    );
  };

  return (
    <div data-testid="event-actions" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {event.status === 'OPEN' && (
          <Button
            type="button"
            size="sm"
            data-testid="event-ack"
            onClick={() => run({ id: event.id, action: 'ack' })}
          >
            {t('inspector.eventActions.ack')}
          </Button>
        )}
        {event.status !== 'CLOSED' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="event-close"
            aria-pressed={mode === 'close'}
            onClick={() => setMode(mode === 'close' ? null : 'close')}
          >
            {t('inspector.eventActions.close')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="event-note"
          aria-pressed={mode === 'note'}
          onClick={() => setMode(mode === 'note' ? null : 'note')}
        >
          {t('inspector.eventActions.note')}
        </Button>
      </div>
      {mode && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <label className="text-ink-600 text-[12px] leading-4" htmlFor={`event-draft-${event.id}`}>
            {mode === 'close'
              ? t('inspector.eventActions.closeLabel')
              : t('inspector.eventActions.note')}
          </label>
          <textarea
            id={`event-draft-${event.id}`}
            data-testid="event-draft"
            rows={3}
            maxLength={500}
            value={drafts[mode]}
            onChange={(ev) => setDrafts((d) => ({ ...d, [mode]: ev.target.value }))}
            className="border-input bg-card focus-visible:ring-ring/50 bn-leading w-full resize-y rounded-md border p-2 text-[13px] outline-none focus-visible:ring-[3px]"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!valid} data-testid="event-submit">
              {mode === 'close'
                ? t('inspector.eventActions.close')
                : t('inspector.eventActions.note')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t('inspector.eventActions.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
