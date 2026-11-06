import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Shown instead of a page the session role may not open. Neutral on purpose: it does not say what the page holds. */
export function NotAvailable() {
  const { t } = useTranslation();
  return (
    <Card data-testid="not-available">
      <CardHeader>
        <CardTitle data-testid="not-available-title">{t('notAvailable.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p>{t('notAvailable.body')}</p>
        <Link to="/live" className="text-primary underline">
          {t('notAvailable.back')}
        </Link>
      </CardContent>
    </Card>
  );
}
