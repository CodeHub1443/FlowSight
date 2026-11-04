import { CircleHelp, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useTranslation } from 'react-i18next';

/**
 * "How this is calculated": an icon button beside a widget title that opens one sentence in a small popover
 * (Radix: click or Enter opens it, Esc and an outside click close it). Portalled, so the card layout never moves.
 */
export function HowCalculated({ text, testId }: { text: string; testId?: string }) {
  const { t } = useTranslation('perfindex');
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t('how.open')}
        data-testid={testId}
        className="soft-transition text-ink-400 hover:text-ink-900 hover:bg-row-hover focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <CircleHelp className="size-4" strokeWidth={1.75} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          aria-label={t('how.open')}
          data-testid={testId ? `${testId}-content` : undefined}
          className="card-surface animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-40 flex w-[min(320px,calc(100vw-32px))] items-start gap-2 px-3.5 py-3 duration-200 outline-none"
        >
          <p className="text-ink-900 bn-leading min-w-0 flex-1 text-sm leading-5">{text}</p>
          <Popover.Close
            aria-label={t('how.close')}
            className="soft-transition text-ink-400 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 -me-1.5 -mt-1 grid size-7 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
