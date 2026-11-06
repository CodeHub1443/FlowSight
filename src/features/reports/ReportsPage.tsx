import { useTranslation } from 'react-i18next';

/** Stub (Task 22.0). 22C replaces this body: shift and daily report. */
export function ReportsPage() {
  const { t } = useTranslation('reports');
  return (
    <div data-testid="reports-page">
      <h1 className="text-xl font-semibold">{t('page.stub')}</h1>
    </div>
  );
}
