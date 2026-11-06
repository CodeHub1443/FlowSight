import { Link } from 'react-router';
import { ClientLogo, ProductMark, ProductName } from '@/components/common';
import { AlertBell } from './AlertBell';
import { GlobalSearch } from './GlobalSearch';
import { LanguageToggle } from './LanguageToggle';
import { ConnDot, ModeBadge } from './ModeBadge';
import { SiteSwitcher } from './SiteSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

/** Top bar: brand, global search, site switcher, mode badge + Dhaka clock, connection dot, bell, language, theme, user. */
export function TopBar() {
  return (
    <header
      data-testid="top-bar"
      className="bg-topbar print:hidden border-hairline shadow-topbar relative z-30 flex h-14 shrink-0 items-center gap-4 border-b px-6 backdrop-blur-[var(--topbar-blur)]"
    >
      <Link to="/live" className="flex shrink-0 items-center gap-2.5">
        <ClientLogo height={44} />
        <span aria-hidden className="bg-hairline h-8 w-px" />
        <ProductMark height={36} />
        <ProductName className="hidden text-[17px] whitespace-nowrap lg:inline" />
      </Link>
      <GlobalSearch />
      <div className="ms-auto flex shrink-0 items-center gap-2">
        <SiteSwitcher />
        <ModeBadge />
        <ConnDot />
        <AlertBell />
        <LanguageToggle />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
