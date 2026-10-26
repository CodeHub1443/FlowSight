import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { uiStore, useUiStore } from '@/stores';

/** Light <-> dark "control room" theme. The `dark` class itself is applied by UiPreferenceSync. */
export function ThemeToggle() {
  const { t } = useTranslation('live');
  const theme = useUiStore((s) => s.theme);
  const dark = theme === 'dark';
  const Icon = dark ? Sun : Moon;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label={dark ? t('topbar.themeLight') : t('topbar.themeDark')}
      aria-pressed={dark}
      onClick={() => uiStore.getState().setTheme(dark ? 'light' : 'dark')}
    >
      <Icon />
    </Button>
  );
}
