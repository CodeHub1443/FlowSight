import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BRAND } from '@/brand';
import { UserMenu } from '@/app/shell/UserMenu';
import { renderWithProviders, resetStores, stubBrowserApis } from '@/features/live/testHarness';
import bn from '@/i18n/locales/bn/common.json';
import bnAbout from '@/i18n/locales/bn/about.json';
import en from '@/i18n/locales/en/common.json';
import enAbout from '@/i18n/locales/en/about.json';
import { OPEN_SOURCE_LIBRARIES } from './openSource';
import { ClientLogo, DevelopedBy, ProductLockup, ProductMark, ProductName } from './Brand';

beforeAll(stubBrowserApis);

describe.each([
  ['en', en],
  ['bn', bn],
] as const)('Brand components (%s)', (lang, strings) => {
  beforeEach(async () => {
    await resetStores('DC_MANAGER', lang);
  });

  it('ClientLogo shows the unmodified Unilever file with its alt text', () => {
    render(<ClientLogo height={44} />);
    const img = screen.getByRole('img', { name: strings.app.logoAlt });
    expect(img).toHaveAttribute('src', '/brand/unilever-logo.svg');
    expect(screen.getByTestId('client-logo')).toHaveAttribute('data-height', '44');
    expect(screen.getByTestId('client-logo').style.height).toBe('44px');
  });

  it('ClientLogo never goes below 32 px', () => {
    render(<ClientLogo height={20} />);
    expect(screen.getByTestId('client-logo')).toHaveAttribute('data-height', '32');
  });

  it('the DepotFlow artwork sits on a white tile in the dark theme', () => {
    render(
      <>
        <ProductMark />
        <ProductLockup />
      </>,
    );
    for (const id of ['product-mark', 'product-lockup']) {
      expect(screen.getByTestId(id).className).toContain('dark:bg-white');
    }
    expect(screen.getByRole('img', { name: BRAND.product })).toHaveAttribute(
      'src',
      '/brand/depotflow-lockup.svg',
    );
  });

  it('ProductName is the same text in both languages', () => {
    render(<ProductName />);
    expect(screen.getByTestId('product-name')).toHaveTextContent('DepotFlow');
    expect(strings.app.name).toBe('DepotFlow');
  });

  it('DevelopedBy fills the company from src/brand.ts and hides the decorative image', () => {
    const { container } = render(<DevelopedBy variant="footer" />);
    const expected = strings.app.developedBy.replace('{{company}}', BRAND.developer);
    expect(screen.getByTestId('developed-by')).toHaveTextContent(expected);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.querySelector('img')).toHaveAttribute('src', '/brand/tdi-mark.png');
  });

  it('a plain t("app.developedBy") (no variables) still gets the company', async () => {
    const i18n = (await import('@/i18n')).default;
    expect(i18n.t('app.developedBy')).toContain(BRAND.developer);
  });

  it('the print variant is the smaller one', () => {
    const { container } = render(<DevelopedBy variant="print" />);
    expect(container.querySelector('img')?.className).toContain('h-4');
  });
});

describe.each([
  ['en', en],
  ['bn', bn],
] as const)('About dialog from the user menu (%s)', (lang, strings) => {
  const about = lang === 'en' ? enAbout : bnAbout;
  beforeEach(async () => {
    await resetStores('DC_MANAGER', lang);
  });

  it('opens, shows the product, version, client, developer and the acknowledgements', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserMenu />);
    await user.click(screen.getByTestId('user-menu'));
    await user.click(await screen.findByTestId('about-menu-item'));
    const dialog = await screen.findByTestId('about-dialog');
    expect(within(dialog).getByRole('img', { name: 'DepotFlow' })).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: strings.app.logoAlt })).toBeInTheDocument();
    expect(within(dialog).getByText(about.preparedFor)).toBeInTheDocument();
    expect(within(dialog).getByText(about.description)).toBeInTheDocument();
    expect(within(dialog).getByTestId('about-version')).toHaveTextContent(
      about.version.replace('{{version}}', __APP_VERSION__),
    );
    expect(within(dialog).getByTestId('developed-by')).toHaveTextContent(BRAND.developer);
    const ack = within(dialog).getByTestId('about-acknowledgements');
    expect(within(ack).getByText(about.ack.models)).toBeInTheDocument();
    expect(within(ack).getByText(about.ack.fonts)).toBeInTheDocument();
    for (const lib of OPEN_SOURCE_LIBRARIES) {
      expect(within(ack).getByTestId('about-libraries')).toHaveTextContent(lib);
    }
  });
});
