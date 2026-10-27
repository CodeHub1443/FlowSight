import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import { cn } from '@/lib/utils';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="bg-muted flex items-center gap-0.5 rounded-full p-0.5"
    >
      {LANGUAGES.map((lng) => {
        const active = i18n.resolvedLanguage === lng;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(lng)}
            className={cn(
              'soft-transition focus-visible:ring-ring/50 h-7 min-w-9 rounded-full px-2.5 text-[12.5px] font-medium focus-visible:ring-[3px] focus-visible:outline-none',
              active ? 'bg-card text-ink-900 shadow-raised' : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
