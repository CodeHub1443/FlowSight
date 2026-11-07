import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { uiStore } from '@/stores';
import { renderWithProviders, resetStores, stubBrowserApis } from '@/features/live/testHarness';
import { MapControls } from './MapControls';

beforeEach(async () => {
  stubBrowserApis();
  await resetStores();
  uiStore.setState({ xray: false });
});

describe('MapControls X-ray toggle', () => {
  it('is off by default', () => {
    renderWithProviders(<MapControls />);
    expect(screen.getByTestId('map-xray')).toHaveAttribute('aria-pressed', 'false');
  });

  it('turns the store flag on and off, and reflects it in aria-pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MapControls />);
    const button = screen.getByTestId('map-xray');

    await user.click(button);
    expect(uiStore.getState().xray).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(uiStore.getState().xray).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('has an accessible label (also the tooltip text)', () => {
    renderWithProviders(<MapControls />);
    expect(screen.getByTestId('map-xray')).toHaveAttribute('aria-label', 'Camera X-ray');
  });
});
