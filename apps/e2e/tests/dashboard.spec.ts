import { expect, type Page, test } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const chartArea = (page: Page) => page.getByRole('region', { name: 'Chart' });
const focusTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const statCell = (page: Page, label: string, column = 0) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .getByRole('cell')
    .nth(column);
const statNumber = async (page: Page, label: string, column = 0) =>
  Number.parseFloat((await statCell(page, label, column).textContent()) ?? '');
const openPilotAndLimits = (page: Page, side: 'Attacker' | 'Defender') =>
  page.getByRole('group', { name: side }).getByText('Pilot & limits').click();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
});

test('opens on a compact summary with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /bfm analysis/i })).toBeVisible();
  await expect(focusTab(page, /^Summary/)).toHaveAttribute('aria-selected', 'true');
  await expect(focusTab(page, /^1-circle/)).toContainText('tighter');
  await expect(focusTab(page, /^2-circle/)).toContainText('sustained');
  await expect(chartArea(page).getByText('Turn rate (°/s)')).toBeVisible();
  // The full stats table stays hidden until asked for.
  await expect(page.getByRole('rowheader', { name: 'Wing loading' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all stats' }).click();
  await expect(page.getByRole('rowheader', { name: 'Wing loading' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('fits the turn circles within the screen on an ultrawide', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1440 });
  await page.goto('/');
  await focusTab(page, /^2-circle/).click();
  const circles = chartArea(page).getByRole('img', { name: 'Turn circles, 2-circle fight' });
  await expect(circles.locator('polyline[data-track]')).toHaveCount(2);
  // The square drawing is capped by height, not stretched to the full page width.
  const box = await circles.boundingBox();
  expect(box?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(950);
  // Hotbar and chart fit above the fold.
  const chartBox = await chartArea(page).boundingBox();
  expect((chartBox?.y ?? 0) + (chartBox?.height ?? 0)).toBeLessThan(1440);
});

test('turns the 3D turn circles by dragging and shows them full screen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await focusTab(page, /^2-circle/).click();
  const circles = chartArea(page).getByRole('img', { name: 'Turn circles, 2-circle fight' });
  const track = circles.locator('polyline[data-track=attacker]');
  const before = await track.getAttribute('points');

  const box = await circles.boundingBox();
  if (!box) throw new Error('turn circles not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(track).not.toHaveAttribute('points', before ?? '');
  await expect(chartArea(page).getByLabel('3D')).not.toBeChecked();

  await chartArea(page).getByRole('button', { name: 'Full screen' }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.querySelector('svg')?.ariaLabel))
    .toBe('Turn circles, 2-circle fight');
  // Only the turn circles are full screen: the stats and hotbar are not part of it.
  expect(
    await page.evaluate(() => document.fullscreenElement?.textContent?.includes('Best STR')),
  ).toBe(false);
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(errors).toEqual([]);
});

test('drills into each fight with its own charts and stats', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const views = [
    [/^1-circle/, ['Turn circles', 'Turn radius'], 'Min radius'],
    [/^2-circle/, ['Turn circles', 'Turn timeline', 'Rate advantage'], 'Best STR'],
    [/^Energy/, ['Energy (Ps)', 'Turn timeline'], 'Airspeed left'],
  ] as const;
  for (const [tab, charts, stat] of views) {
    await focusTab(page, tab).click();
    await expect(page.getByRole('rowheader', { name: stat, exact: true })).toBeVisible();
    for (const chart of charts) {
      const picker = chartArea(page).getByRole('group', { name: 'Chart' });
      if ((await picker.count()) > 0) await picker.getByText(chart, { exact: true }).click();
      if (chart === 'Turn circles') {
        await expect(chartArea(page).locator('svg[role=img] polyline[data-track]')).toHaveCount(2);
      } else {
        expect(
          await chartArea(page).locator('.scatterlayer .trace').count(),
        ).toBeGreaterThanOrEqual(2);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('updates the comparison when the scenario changes', async ({ page }) => {
  await page.goto('/');
  await focusTab(page, /^2-circle/).click();
  const before = await statNumber(page, 'Best STR');

  await page.getByLabel('Altitude').fill('9000');
  await expect(page.getByText('9,000 m · 29,528 ft')).toBeVisible();
  await expect.poll(() => statNumber(page, 'Best STR')).toBeLessThan(before);

  await page.getByLabel('Defender aircraft').selectOption('su-27');
  await expect(page.getByRole('columnheader', { name: 'Su-27S' })).toBeVisible();
});

test('models the G limiter and pilot style', async ({ page }) => {
  await page.goto('/');
  await focusTab(page, /^Energy/).click();
  // The smooth 7 g F-16C pilot keeps more speed than when yanking to the limiter.
  const smoothSpeed = await statNumber(page, 'Airspeed left');

  await openPilotAndLimits(page, 'Attacker');
  await page.getByRole('group', { name: 'Attacker pilot' }).getByText('Yanks to limit').click();
  await expect(page.getByText(/Instructor 10\.0 g · yanks/)).toBeVisible();
  await expect.poll(() => statNumber(page, 'Airspeed left')).toBeLessThan(smoothSpeed);

  // MiG-29 has no fly-by-wire: turning the instructor off raises its G limit.
  await openPilotAndLimits(page, 'Defender');
  await page.getByRole('group', { name: 'Defender G limiter' }).getByText(/^Off/).click();
  await expect(page.getByText(/^Off 14\.\d g · yanks/)).toBeVisible();
});

test('shows top and bottom turn rates for an inclined turn plane', async ({ page }) => {
  await page.goto('/');
  await focusTab(page, /^2-circle/).click();
  await page.getByRole('button', { name: 'Show more stats' }).click();
  await expect(page.getByRole('rowheader', { name: 'Over the top of the plane' })).toHaveCount(0);
  await openPilotAndLimits(page, 'Attacker');
  await page.getByLabel('Attacker turn plane').fill('90');
  await expect(page.getByText('90° · vertical')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Over the top of the plane' })).toBeVisible();
});

test('switches the whole dashboard to knots', async ({ page }) => {
  await page.goto('/');
  await page.getByText('kts', { exact: true }).click();
  await expect(page.getByText(/432 kts merge/)).toBeVisible();
  await expect(chartArea(page).getByText('Indicated airspeed (kts)')).toBeVisible();
});
