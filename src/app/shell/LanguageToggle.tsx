import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LANGUAGES } from '@/i18n';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('language.label')} className="flex gap-1">
      {LANGUAGES.map((lng) => (
        <Button
          key={lng}
          size="sm"
          variant={i18n.resolvedLanguage === lng ? 'default' : 'outline'}
          aria-pressed={i18n.resolvedLanguage === lng}
          onClick={() => void i18n.changeLanguage(lng)}
        >
          {t(`language.${lng}`)}
        </Button>
      ))}
    </div>
  );
}
