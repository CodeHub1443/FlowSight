import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="not-found-title">{t('notFound.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p>{t('notFound.body')}</p>
        <Link to="/live" className="text-primary underline">
          {t('notFound.back')}
        </Link>
      </CardContent>
    </Card>
  );
}
