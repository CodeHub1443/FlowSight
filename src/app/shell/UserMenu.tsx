import { ChevronDown, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RoleSchema } from '@/domain';
import { sessionStore, useSessionStore } from '@/stores';

/** Mock auth: shows the session user's role, with a dev role switcher outside live mode (step 12 replaces it with real sign-in). */
export function UserMenu() {
  const { t } = useTranslation('live');
  const role = useSessionStore((s) => s.role);
  const showSwitcher = import.meta.env.VITE_DATA_MODE !== 'live';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 px-2.5" data-testid="user-menu">
          <UserRound aria-hidden />
          <span className="hidden max-w-[9rem] truncate xl:inline" data-testid="user-role">
            {t(`roles.${role}`)}
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block text-[1rem]">{t(`roles.${role}`)}</span>
          <span className="text-muted-foreground block text-[0.85rem] font-normal">
            {t('user.mockSession')}
          </span>
        </DropdownMenuLabel>
        {showSwitcher && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-[0.8rem]">
              {t('user.switchRole')}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={role}
              onValueChange={(v) => {
                const next = RoleSchema.safeParse(v);
                if (next.success) sessionStore.getState().setMockRole(next.data);
              }}
            >
              {RoleSchema.options.map((r) => (
                <DropdownMenuRadioItem key={r} value={r} className="text-[1rem]">
                  {t(`roles.${r}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
