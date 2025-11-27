import { test, expect } from '@playwright/test';

test('has styles', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Check if the header has the correct background color (bg-white -> rgb(255, 255, 255))
  const header = page.locator('header');
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  // Check if the body has the correct background color (bg-gray-100 -> rgb(243, 244, 246))
  const body = page.locator('body');
  await expect(body).toHaveCSS('background-color', 'rgb(243, 244, 246)');
  
  // Check if the title is correct
  await expect(page).toHaveTitle(/LatentSpace Search Engine/);
});
