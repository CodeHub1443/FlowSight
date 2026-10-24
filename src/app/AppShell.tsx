import { Link, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
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

export function AppShell() {
  const { t } = useTranslation();
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <header className="bg-card flex items-center gap-4 border-b px-6 py-3">
          <Link to="/live" className="flex items-center gap-3">
            <img src="/brand/unilever-logo.svg" alt={t('app.logoAlt')} className="h-8" />
            <span className="text-lg font-semibold">{t('app.name')}</span>
          </Link>
          <span data-testid="sample-string" className="text-muted-foreground">
            {t('app.sample')}
          </span>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <footer className="text-muted-foreground flex items-center gap-2 px-6 py-3 text-sm">
          <img src="/brand/tdi-logo.svg" alt="TDI" className="h-5" />
          <span>{t('app.developedBy')}</span>
        </footer>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
