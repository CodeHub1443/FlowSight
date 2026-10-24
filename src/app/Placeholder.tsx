import { Outlet, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const params = useParams();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle data-testid="placeholder-title">{t(titleKey)}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-1">
          <p>{t('placeholder.body')}</p>
          <p>
            {t('placeholder.path')}: <code data-testid="placeholder-path">{pathname}</code>
            {Object.entries(params).map(([key, value]) => (
              <span key={key}>
                {' '}
                · {key}=<code>{value}</code>
              </span>
            ))}
          </p>
        </CardContent>
      </Card>
      <Outlet />
    </div>
  );
}
