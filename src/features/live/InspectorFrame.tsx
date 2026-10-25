import { ExternalLink, Pin, PinOff, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FloatingCard, SmallCaps, ThinProgress, type Tone } from '@/components/common';
import { cn } from '@/lib/utils';

export interface FrameActions {
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
}

const iconButton =
  'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 grid size-7 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none';

/** Generic inspector frame: type label, title, status pill, pin, open-full-page link, close; body below. */
export function InspectorFrame({
  testId,
  typeLabel,
  title,
  subtitle,
  pill,
  href,
  actions,
  children,
}: {
  testId: string;
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
      <header className="flex shrink-0 items-start gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <SmallCaps className="block truncate">{typeLabel}</SmallCaps>
          <h2 className="truncate text-[1.15rem] leading-6 font-bold" data-testid="inspector-title">
            {title}
          </h2>
          {subtitle && <p className="text-muted-foreground truncate leading-5">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={cn(iconButton, actions.pinned && 'bg-accent text-foreground')}
            aria-pressed={actions.pinned}
            aria-label={actions.pinned ? t('inspector.unpin') : t('inspector.pin')}
            onClick={actions.onPin}
            data-testid="inspector-pin"
          >
            <PinIcon className="size-4" />
          </button>
          {href && (
            <Link to={href} className={iconButton} aria-label={t('inspector.openPage')}>
              <ExternalLink className="size-4" />
            </Link>
          )}
          <button
            type="button"
            className={iconButton}
            aria-label={t('inspector.close')}
            onClick={actions.onClose}
            data-testid="inspector-close"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>
      {pill && <div className="shrink-0 px-4 pb-2">{pill}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" data-testid={testId}>
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
    <div className="flex flex-col gap-1 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{caption}</span>
      </div>
      <ThinProgress value={value} tone={tone} label={label} />
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="pt-2 pb-0.5">
      <SmallCaps>{children}</SmallCaps>
    </div>
  );
}
