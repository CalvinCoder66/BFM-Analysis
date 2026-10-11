import { expect, type Page, test } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const chart = (page: Page) => page.getByRole('tabpanel');
const mergeRow = (page: Page, label: string) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
});

test('renders the default matchup with an E-M diagram and no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /bfm analysis/i })).toBeVisible();
  await expect(page.getByRole('article', { name: '1-circle · radius fight' })).toBeVisible();

  const plot = chart(page).getByRole('img', { name: 'E-M diagram chart' });
  await expect(plot.locator('.main-svg').first()).toBeVisible();
  await expect(plot.getByText('Turn rate (°/s)')).toBeVisible();
  await expect(plot.getByText('F-16C Block 50 · max turn')).toBeVisible();
  await expect(plot.getByText('MiG-29 (9-12) · max turn')).toBeVisible();
  // One plotted line per visible trace: at least max turn + sustained for both jets.
  expect(await plot.locator('.scatterlayer .trace').count()).toBeGreaterThanOrEqual(4);

  expect(errors).toEqual([]);
});

test('switches chart views', async ({ page }) => {
  await page.goto('/');
  for (const [tab, axis] of [
    ['Advantage', 'Turn-rate advantage (°/s)'],
    ['Turn radius', 'Turn radius (m)'],
    ['Energy (Ps)', 'Specific excess power Ps (m/s)'],
    ['E-M diagram', 'Turn rate (°/s)'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(chart(page).getByText(axis)).toBeVisible();
  }
});

test('updates the comparison when the scenario changes', async ({ page }) => {
  await page.goto('/');
  const str = mergeRow(page, 'Sustained turn rate').getByRole('cell').first();
  const before = Number.parseFloat((await str.textContent()) ?? '');

  await page.getByLabel('Altitude').fill('9000');
  await expect(page.getByText('9,000 m · 29,528 ft')).toBeVisible();
  await expect
    .poll(async () => Number.parseFloat((await str.textContent()) ?? ''))
    .toBeLessThan(before);

  await page.getByLabel('Defender aircraft').selectOption('su-27');
  await expect(page.getByRole('columnheader', { name: 'Su-27S' })).toBeVisible();
  await expect(chart(page).getByText('Su-27S · max turn')).toBeVisible();
});

test('switches the whole dashboard to knots', async ({ page }) => {
  await page.goto('/');
  await page.getByText('kts', { exact: true }).click();
  await expect(chart(page).getByText('Indicated airspeed (kts)')).toBeVisible();
  await expect(page.getByText(/At merge · 432 kts/)).toBeVisible();
});
