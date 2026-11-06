import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/brand';
import { cn } from '@/lib/utils';

// Branding components (docs/06 section 7.9). The Unilever logo is used exactly as supplied: no recolouring, cropping, stretching,
// shadow or opacity. The DepotFlow artwork is interim and white-background only, so in the dark theme it sits on a white tile.
// The box keeps the same size in both themes: in the dark theme the image shrinks inside the tile instead of the box growing.

/** Smallest height the client logo is allowed (spec: minimum 32 px). */
export const CLIENT_LOGO_MIN_HEIGHT = 32;

const TILE = 'dark:box-border dark:rounded-[10px] dark:bg-white dark:p-1';
const IMG = 'block h-[var(--brand-h)] w-auto max-w-none dark:h-[calc(var(--brand-h)-8px)]';

function boxStyle(height: number): CSSProperties {
  return { height, ['--brand-h' as string]: `${height}px` };
}

/** The Unilever logo (`public/brand/unilever-logo.svg`, single fill #0F0E9A). `height` in px, at least 32. */
export function ClientLogo({ height = 44, className }: { height?: number; className?: string }) {
  const { t } = useTranslation();
  const h = Math.max(CLIENT_LOGO_MIN_HEIGHT, height);
  return (
    <span
      data-testid="client-logo"
      data-height={h}
      className={cn('inline-flex shrink-0 items-center', TILE, className)}
      style={boxStyle(h)}
    >
      <img
        src="/brand/unilever-logo.svg"
        alt={t('app.logoAlt')}
        className={IMG}
        draggable={false}
      />
    </span>
  );
}

/** The DepotFlow mark (interim crop, white background). Decorative: the product name is shown beside it. */
export function ProductMark({ height = 36, className }: { height?: number; className?: string }) {
  return (
    <span
      data-testid="product-mark"
      data-height={height}
      className={cn('inline-flex shrink-0 items-center', TILE, className)}
      style={boxStyle(height)}
    >
      <img src="/brand/depotflow-mark.svg" alt="" className={IMG} draggable={false} />
    </span>
  );
}

/** The DepotFlow mark and wordmark (interim crop, white background). The alt text is the product name. */
export function ProductLockup({ height = 56, className }: { height?: number; className?: string }) {
  return (
    <span
      data-testid="product-lockup"
      data-height={height}
      className={cn('inline-flex shrink-0 items-center', TILE, className)}
      style={boxStyle(height)}
    >
      <img
        src="/brand/depotflow-lockup.svg"
        alt={BRAND.product}
        className={IMG}
        draggable={false}
      />
    </span>
  );
}

/** The product name as text: "DepotFlow" in both languages, never translated. */
export function ProductName({ className }: { className?: string }) {
  return (
    <span data-testid="product-name" className={cn('text-ink-900 font-semibold', className)}>
      {BRAND.product}
    </span>
  );
}

/** "Developed by TDI Pvt. Limited" with the TDI mark. The image is decorative: the text carries the meaning. */
export function DevelopedBy({
  variant = 'footer',
  className,
}: {
  variant?: 'footer' | 'print';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      data-testid="developed-by"
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-2',
        variant === 'footer' ? 'text-muted-foreground text-sm' : 'text-ink-600 text-[11px]',
        className,
      )}
    >
      <img
        src="/brand/tdi-mark.png"
        alt=""
        className={cn('w-auto', variant === 'footer' ? 'h-5' : 'h-4')}
        draggable={false}
      />
      <span>{t('app.developedBy', { company: BRAND.developer })}</span>
    </span>
  );
}
