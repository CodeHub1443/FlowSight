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
        <Button
          variant="ghost"
          className="h-10 gap-2 rounded-full ps-1 pe-2.5"
          data-testid="user-menu"
        >
          <span className="bg-brand-50 text-brand-500 grid size-8 place-items-center rounded-full">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span
            className="text-ink-900 hidden max-w-[9rem] truncate text-[13px] xl:inline"
            data-testid="user-role"
          >
            {t(`roles.${role}`)}
          </span>
          <ChevronDown className="text-ink-400" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="text-ink-900 block text-[13px] font-semibold">{t(`roles.${role}`)}</span>
          <span className="text-ink-400 block text-[12px] font-normal">
            {t('user.mockSession')}
          </span>
        </DropdownMenuLabel>
        {showSwitcher && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-ink-400 text-[12px] font-medium">
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
                <DropdownMenuRadioItem key={r} value={r} className="text-[13px]">
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
