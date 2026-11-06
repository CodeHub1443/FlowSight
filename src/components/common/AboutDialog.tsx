import { useTranslation } from 'react-i18next';
import { BRAND } from '@/brand';
import '@/i18n/about';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClientLogo, DevelopedBy, ProductLockup } from './Brand';
import { OPEN_SOURCE_LIBRARIES } from './openSource';

/**
 * About dialog (product, version, client, developer, acknowledgements). Lazy-loaded from the user menu, so it never
 * enters the /live entry chunk: import it only through `React.lazy`.
 */
export default function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('about');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="about-dialog">
        <DialogHeader className="items-start gap-3">
          <ProductLockup height={56} />
          <DialogTitle>{t('title', { product: BRAND.product })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm" data-testid="about-version">
          {t('version', { version: __APP_VERSION__ })}
        </p>
        <div className="flex items-center gap-3">
          <ClientLogo height={40} />
          <span className="text-sm">{t('preparedFor')}</span>
        </div>
        <DevelopedBy variant="footer" />
        <details className="text-sm" data-testid="about-acknowledgements">
          <summary className="cursor-pointer font-medium">{t('ack.title')}</summary>
          <ul className="text-muted-foreground mt-2 list-disc space-y-2 ps-5">
            <li>{t('ack.models')}</li>
            <li>{t('ack.fonts')}</li>
            <li>
              {t('ack.software')}{' '}
              <span data-testid="about-libraries">{OPEN_SOURCE_LIBRARIES.join(', ')}</span>
            </li>
          </ul>
        </details>
      </DialogContent>
    </Dialog>
  );
}
