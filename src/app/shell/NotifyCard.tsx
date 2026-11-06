import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TONE_DOT } from '@/components/common';
import type { UiLang, WhEventWithStatus } from '@/domain';
import { bayLabel, SEV_TONE } from '@/features/live';
import { cn } from '@/lib/utils';
import type { ActiveToast } from './notifyDecision';

interface CardProps {
  id: string;
  toast: ActiveToast;
  event: WhEventWithStatus;
  onShow: () => void;
  onOpen: () => void;
}

const BTN =
  'soft-transition focus-visible:ring-ring/50 rounded-full px-2.5 py-1 text-[12px] font-semibold focus-visible:ring-[3px] focus-visible:outline-none';

/** The toast body: severity dot, text (a count when events collapsed), "Show on map", "Open", dismiss. */
export function NotifyCard({ id, toast: tt, event, onShow, onOpen }: CardProps) {
  const { t, i18n } = useTranslation('live');
  const lang: UiLang = i18n.resolvedLanguage === 'bn' ? 'bn' : 'en';
  const bay = tt.bay ? bayLabel(tt.bay, lang) : null;
  const text =
    tt.count > 1
      ? [t('notify.productIssues', { n: tt.count }), bay].filter(Boolean).join(', ')
      : event.title[lang] || event.title.en;
  return (
    <div
      role={tt.sev === 'critical' ? 'alert' : 'status'}
      data-testid="live-toast"
      data-sev={tt.sev}
      data-count={tt.count}
      className="bg-popover text-popover-foreground border-hairline bn-leading flex w-[356px] max-w-full items-start gap-2.5 rounded-[12px] border p-3 shadow-lg"
    >
      <span
        aria-hidden
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[SEV_TONE[tt.sev]])}
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-ink-900 text-[13px] leading-5 font-semibold"
          data-testid="live-toast-text"
        >
          {text}
        </p>
        {tt.count === 1 && bay && <p className="text-ink-400 text-[12px] leading-4">{bay}</p>}
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className={cn(BTN, 'bg-primary text-primary-foreground')}
            onClick={onShow}
          >
            {t('notify.showOnMap')}
          </button>
          <button type="button" className={cn(BTN, 'border-card-border border')} onClick={onOpen}>
            {t('notify.open')}
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t('inspector.close')}
        className="text-ink-400 hover:text-ink-900 grid size-6 place-items-center rounded-full"
        onClick={() => toast.dismiss(id)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
