import { ExternalLink, Pin, PinOff, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FloatingCard, IconTile, ThinProgress, type Tone } from '@/components/common';
import { cn } from '@/lib/utils';

export interface FrameActions {
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
}

const iconButton =
  'soft-transition border-card-border bg-card text-ink-600 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-[28px] place-items-center rounded-full border active:scale-95 focus-visible:ring-[3px] focus-visible:outline-none';

/**
 * Inspector card as in the reference: type icon tile, small blue type label, title and subtitle, round pin /
 * open-page / close buttons; then the status pill row and the scrolling body.
 */
export function InspectorFrame({
  testId,
  icon,
  iconTone = 'info',
  typeLabel,
  title,
  subtitle,
  pill,
  href,
  actions,
  children,
}: {
  testId: string;
  icon: LucideIcon;
  iconTone?: Tone;
  typeLabel: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  pill?: ReactNode;
  href?: string;
  actions: FrameActions;
  children: ReactNode;
}) {
  const { t } = useTranslation('live');
  const PinIcon = actions.pinned ? PinOff : Pin;
  return (
    <FloatingCard data-testid="inspector" className="flex max-h-full min-h-0 w-full flex-col">
      <header className="flex shrink-0 items-start gap-[12px] px-[16px] pt-[16px] pb-[12px]">
        <IconTile icon={icon} tone={iconTone} />
        <div className="min-w-0 flex-1">
          <p className="text-info truncate text-[12px] leading-4 font-medium">{typeLabel}</p>
          <h2
            className="text-ink-900 bn-leading line-clamp-2 text-[17px] leading-6 font-semibold break-words"
            data-testid="inspector-title"
          >
            {title}
          </h2>
          {subtitle && <p className="text-ink-400 truncate text-[12px] leading-4">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-[4px]">
          <button
            type="button"
            className={cn(iconButton, actions.pinned && 'bg-row-selected text-info')}
            aria-pressed={actions.pinned}
            aria-label={actions.pinned ? t('inspector.unpin') : t('inspector.pin')}
            onClick={actions.onPin}
            data-testid="inspector-pin"
          >
            <PinIcon className="size-3.5" strokeWidth={1.75} />
          </button>
          {href && (
            <Link to={href} className={iconButton} aria-label={t('inspector.openPage')}>
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </Link>
          )}
          <button
            type="button"
            className={iconButton}
            aria-label={t('inspector.close')}
            onClick={actions.onClose}
            data-testid="inspector-close"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </header>
      {pill && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-[16px] pb-[8px]">{pill}</div>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] pb-[12px]"
        data-testid={testId}
      >
        {children}
      </div>
    </FloatingCard>
  );
}

/** Progress row: caption left, value right, thin bar under. */
export function ProgressRow({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number | null;
  caption: ReactNode;
  tone: Tone;
}) {
  return (
    <div className="flex flex-col gap-1.5 pt-1 pb-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-5">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-900 font-medium tabular-nums">{caption}</span>
      </div>
      <ThinProgress value={value} tone={tone} label={label} />
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-ink-400 pt-3.5 pb-0.5 text-[12px] leading-4 font-medium">{children}</h3>
  );
}
