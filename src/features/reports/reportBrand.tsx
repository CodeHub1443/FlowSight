import { useTranslation } from 'react-i18next';
import { REPORT_BRAND } from './brandConst';

// STOPGAP (Task 22C). The branch has no `src/brand.ts` or `src/components/common/Brand.tsx` (Task 22.0b, the branding block of
// the t22 spec section 2, is not in this base). These three pieces are local stand-ins so the report has a header and a footer.
// 22.9: delete this file and use `ClientLogo`, `ProductName` and `DevelopedBy variant="print"` from Brand.tsx instead.

/**
 * The supplied Unilever logo, unmodified (no recolour, crop, stretch, shadow or opacity). It is one dark blue, so it always
 * sits on a white tile with a quarter of its height as clear space; minimum height 32 px.
 */
export function ReportClientLogo() {
  const { t } = useTranslation('reports');
  return (
    <span className="rp-logo-tile inline-flex shrink-0 items-center rounded-[10px] bg-white p-2">
      <img
        src="/brand/unilever-logo.svg"
        alt={t('doc.clientLogoAlt')}
        className="block h-8 w-auto"
        style={{ minHeight: 32 }}
        draggable={false}
      />
    </span>
  );
}

export function ReportProductName() {
  return (
    <span data-testid="report-product" className="text-ink-900 text-[15px] leading-5 font-semibold">
      {REPORT_BRAND.product}
    </span>
  );
}

/** "Developed by TDI Pvt. Limited". */
export function ReportDevelopedBy({ className }: { className?: string }) {
  const { t } = useTranslation('reports');
  return (
    <span data-testid="report-developed-by" className={className}>
      {t('footer.developedBy', { company: REPORT_BRAND.developer })}
    </span>
  );
}
