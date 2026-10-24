import { expect, test } from '@playwright/test';
import { installNetworkGuard, isLocalRequest } from './fixtures';

// Proves the guard itself works. The external request is aborted before it leaves the machine.
test('guard records and blocks a request to a non-local host', async ({ page }) => {
  const offenders = await installNetworkGuard(page);
  await page.setContent('<img src="https://example.com/should-not-load.png">');
  await expect.poll(() => offenders.length).toBeGreaterThan(0);
  expect(offenders[0]).toContain('example.com');
});

test('local hosts and non-network URLs are allowed', () => {
  expect(isLocalRequest('http://localhost:4173/assets/x.js')).toBe(true);
  expect(isLocalRequest('http://127.0.0.1:4173/')).toBe(true);
  expect(isLocalRequest('data:image/png;base64,AAAA')).toBe(true);
  expect(isLocalRequest('http://192.168.1.10/')).toBe(false);
  expect(isLocalRequest('https://fonts.googleapis.com/css')).toBe(false);
});
