import { test, expect } from '@playwright/test';

test('home page renders with its styles', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/LatentSpace/);
  await expect(page.getByRole('heading', { name: 'Welcome to LatentSpace' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search any topic' })).toBeVisible();

  // The paper background comes from the --paper variable (#f6f3ec in light mode).
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 243, 236)');
});
