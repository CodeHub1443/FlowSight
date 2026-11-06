import '@/i18n/events';
import { useTranslation } from 'react-i18next';

/** Stub (Task 22.0). 22A replaces this body: list, filters, drawer. Serves /events and /events/:id. */
export function EventsPage() {
  const { t } = useTranslation('events');
  return (
    <div data-testid="events-page">
      <h1 className="text-xl font-semibold">{t('page.stub')}</h1>
    </div>
  );
}
