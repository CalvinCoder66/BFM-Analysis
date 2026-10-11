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
const metricCell = (page: Page, label: string, column = 0) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .getByRole('cell')
    .nth(column);
const numberIn = async (page: Page, label: string, column = 0) =>
  Number.parseFloat((await metricCell(page, label, column).textContent()) ?? '');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
});

test('renders the default matchup with turn circles and no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /bfm analysis/i })).toBeVisible();
  await expect(page.getByRole('article', { name: '1-circle · radius fight' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Turn from merge · 20 s' })).toBeVisible();

  const circles = chart(page).getByRole('img', { name: 'Turn circles, 2-circle fight' });
  await expect(circles).toBeVisible();
  await expect(circles.locator('polyline')).toHaveCount(2);

  await page.getByText('1-circle · full pull').click();
  await expect(
    chart(page).getByRole('img', { name: 'Turn circles, 1-circle fight' }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});

test('renders every Plotly view', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  for (const [tab, axis] of [
    ['E-M diagram', 'Turn rate (°/s)'],
    ['Turn timeline', 'Heading turned (°)'],
    ['Advantage', 'Turn-rate advantage (°/s)'],
    ['Turn radius', 'Turn radius (m)'],
    ['Energy (Ps)', 'Specific excess power Ps (m/s)'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(chart(page).getByText(axis)).toBeVisible();
    expect(await chart(page).locator('.scatterlayer .trace').count()).toBeGreaterThanOrEqual(4);
  }
  await page.getByRole('tab', { name: 'E-M diagram' }).click();
  await expect(chart(page).getByText('F-16C Block 50 · pilot 7.0 g')).toBeVisible();
  expect(errors).toEqual([]);
});

test('updates the comparison when the scenario changes', async ({ page }) => {
  await page.goto('/');
  const before = await numberIn(page, 'Sustained turn rate');

  await page.getByLabel('Altitude').fill('9000');
  await expect(page.getByText('9,000 m · 29,528 ft')).toBeVisible();
  await expect.poll(() => numberIn(page, 'Sustained turn rate')).toBeLessThan(before);

  await page.getByLabel('Defender aircraft').selectOption('su-27');
  await expect(page.getByRole('columnheader', { name: 'Su-27S' })).toBeVisible();
});

test('models the G limiter and pilot style', async ({ page }) => {
  await page.goto('/');
  // The smooth 7 g F-16C pilot keeps more speed than when yanking to the limiter.
  const smoothSpeed = await numberIn(page, 'Airspeed left');
  await expect(metricCell(page, 'Pilot G (as flown)')).toHaveText('7.0 g');

  const attackerPilot = page.getByRole('group', { name: 'Attacker pilot' });
  await attackerPilot.getByText('Yanks to limit').click();
  await expect(metricCell(page, 'Pilot G (as flown)')).toHaveText('10.0 g');
  await expect.poll(() => numberIn(page, 'Airspeed left')).toBeLessThan(smoothSpeed);

  // MiG-29 has no fly-by-wire: turning the instructor off raises its G limit.
  const instructorG = await numberIn(page, 'G limit in use', 1);
  await page.getByRole('group', { name: 'Defender G limiter' }).getByText(/^Off/).click();
  await expect.poll(() => numberIn(page, 'G limit in use', 1)).toBeGreaterThan(instructorG);
});

test('shows top and bottom turn rates for an inclined turn plane', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('rowheader', { name: 'Over the top of the plane' })).toHaveCount(0);
  await page.getByLabel('Attacker turn plane').fill('90');
  await expect(page.getByText('90° · vertical')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Over the top of the plane' })).toBeVisible();
});

test('switches the whole dashboard to knots', async ({ page }) => {
  await page.goto('/');
  await page.getByText('kts', { exact: true }).click();
  await expect(page.getByText(/At merge · 432 kts/)).toBeVisible();
  await page.getByRole('tab', { name: 'E-M diagram' }).click();
  await expect(chart(page).getByText('Indicated airspeed (kts)')).toBeVisible();
});
