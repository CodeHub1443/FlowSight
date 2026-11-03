import { Suspense, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useTranslation } from 'react-i18next';

// KPI chip detail popover (Task 19 spec 5A). Radix Popover in modal mode: click or Enter opens it, Esc and an outside
// click close it, focus is trapped inside and returns to the chip. It is portalled and positioned (fixed), so opening
// it never moves the chip row. The body is a lazy chunk, fetched on the first hover/focus/open of any chip.

/** One chip + its popover. Put a <KpiPopoverTrigger> inside the chip and the <KpiPopoverPanel> beside it. */
export function KpiPopover({ children }: { children: ReactNode }) {
  return <Popover.Root modal>{children}</Popover.Root>;
}

/**
 * Transparent button covering the whole chip (the chip stays a <section>, so it never nests interactive content:
 * the "—" tooltip triggers inside the chip sit above it). Anchors the popover under the chip.
 */
export function KpiPopoverTrigger({
  id,
  label,
  onIntent,
}: {
  id: string;
  label: string;
  /** Called on hover or focus: start loading the popover chunk early. */
  onIntent?: () => void;
}) {
  const { t } = useTranslation('kpidetail');
  return (
    <Popover.Trigger
      data-testid={`kpi-open-${id}`}
      aria-label={t('open', { label })}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className="soft-transition hover:ring-ring/40 focus-visible:ring-ring/50 data-[state=open]:ring-ring/60 absolute inset-0 cursor-pointer rounded-[inherit] hover:ring-2 focus-visible:ring-[3px] focus-visible:outline-none data-[state=open]:ring-2"
    />
  );
}

/** Floating card under the chip (docs/06 §3): title, close button, then the lazily loaded body. */
export function KpiPopoverPanel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation('kpidetail');
  const titleId = useId();
  return (
    <Popover.Portal>
      <Popover.Content
        data-testid={`kpidetail-${id}`}
        aria-labelledby={titleId}
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="card-surface animate-in fade-in-0 slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-40 flex max-h-(--radix-popover-content-available-height) w-[min(320px,calc(100vw-32px))] origin-(--radix-popover-content-transform-origin) flex-col overflow-y-auto px-4 pt-3 pb-4 duration-200 outline-none"
      >
        <div className="flex items-center justify-between gap-2 pb-1">
          <h2
            id={titleId}
            className="text-ink-900 bn-leading min-w-0 truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <Popover.Close
            data-testid={`kpidetail-${id}-close`}
            aria-label={t('close')}
            className="soft-transition text-ink-400 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </Popover.Close>
        </div>
        <Suspense
          fallback={
            <p className="text-ink-400 py-6 text-center text-[13px]" role="status">
              {t('loading')}
            </p>
          }
        >
          {children}
        </Suspense>
      </Popover.Content>
    </Popover.Portal>
  );
}
