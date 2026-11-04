import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import en from '@/i18n/locales/en/analytics.json';
import { WidgetBody } from './WidgetStates';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('WidgetBody', () => {
  it('loading: a busy skeleton with a screen-reader label', () => {
    render(<WidgetBody status="loading">data</WidgetBody>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(en.state.loading)).toBeInTheDocument();
    expect(screen.queryByText('data')).not.toBeInTheDocument();
  });

  it('error: message and a working retry', async () => {
    const retry = vi.fn();
    render(<WidgetBody status="error" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(en.state.error);
    await userEvent.setup().click(screen.getByRole('button', { name: en.state.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('empty and insufficient', () => {
    const { rerender } = render(<WidgetBody status="empty" />);
    expect(screen.getByTestId('widget-empty')).toHaveTextContent(en.state.empty);
    rerender(<WidgetBody status="insufficient" />);
    expect(screen.getByTestId('widget-insufficient')).toHaveTextContent(en.state.insufficient);
    rerender(<WidgetBody status="insufficient" insufficientText="custom" />);
    expect(screen.getByTestId('widget-insufficient')).toHaveTextContent('custom');
  });

  it('ready: the children', () => {
    render(<WidgetBody status="ready">data</WidgetBody>);
    expect(screen.getByText('data')).toBeInTheDocument();
  });
});
