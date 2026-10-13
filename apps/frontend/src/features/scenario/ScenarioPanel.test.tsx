import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { kmhToMs, knotsToMs } from '../../physics/units';
import type { SpeedUnit } from '../../shared/format';
import { sideConfig, testScenario } from '../../test/scenarios';
import type { Scenario } from '../comparison/matchup';
import { ScenarioPanel } from './ScenarioPanel';

const initial = testScenario({
  attacker: sideConfig('f-16c', { loadoutId: '2xfox2' }),
  defender: sideConfig('mig-29', { loadoutId: '2xfox2' }),
});
const group = (name: string) => screen.getByRole('group', { name });
/** The RB instructor G shown in a side's "Pilot & limits". */
const instructorG = (side: string) =>
  Number.parseFloat(
    screen.getByText(`${side} RB instructor`).parentElement?.textContent?.split('instructor')[1] ??
      '',
  );

/** Stateful harness so the panel behaves as it does inside the app. */
function renderPanel() {
  const changes: Scenario[] = [];
  function Harness() {
    const [scenario, setScenario] = useState(initial);
    const [unit, setUnit] = useState<SpeedUnit>('kmh');
    return (
      <ScenarioPanel
        scenario={scenario}
        unit={unit}
        onScenarioChange={(s) => {
          changes.push(s);
          setScenario(s);
        }}
        onUnitChange={setUnit}
      />
    );
  }
  render(<Harness />);
  return { last: () => changes.at(-1) as Scenario };
}

describe('ScenarioPanel', () => {
  it('updates altitude and shows it in metres and feet', () => {
    const { last } = renderPanel();
    fireEvent.change(screen.getByLabelText('Altitude'), { target: { value: '6000' } });
    expect(last().altitude_m).toBe(6000);
    expect(screen.getByText('6,000 m · 19,685 ft')).toBeInTheDocument();
  });

  it('switches the merge speed slider between km/h and knots', async () => {
    const { last } = renderPanel();
    expect(screen.getByText('800 km/h')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('kts'));
    const slider = screen.getByLabelText('Merge speed (IAS)');
    expect(slider).toHaveValue('432'); // 800 km/h ≈ 432 kts
    fireEvent.change(slider, { target: { value: '400' } });
    expect(last().mergeCas).toBeCloseTo(knotsToMs(400), 6);
    expect(screen.getByText('400 kts')).toBeInTheDocument();
  });

  it('lets one jet fly its own merge speed over the scenario one', async () => {
    const { last } = renderPanel();
    const own = screen.getByLabelText(/Attacker Own merge speed/);
    expect(screen.queryByLabelText('Attacker merge speed')).toBeNull();

    // Ticking starts from the scenario speed, then only this jet's speed moves.
    await userEvent.click(own);
    expect(last().attacker.mergeCas).toBeCloseTo(kmhToMs(800), 6);
    expect(screen.getByText('The attacker flies its own merge speed.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Attacker merge speed'), { target: { value: '1000' } });
    expect(last().attacker.mergeCas).toBeCloseTo(kmhToMs(1_000), 6);

    fireEvent.change(screen.getByLabelText('Merge speed (IAS)'), { target: { value: '600' } });
    expect(last().mergeCas).toBeCloseTo(kmhToMs(600), 6);
    expect(last().attacker.mergeCas).toBeCloseTo(kmhToMs(1_000), 6);
    expect(last().defender.mergeCas).toBeNull();
    expect(screen.getByText(/using 600 km\/h/)).toBeInTheDocument();

    await userEvent.click(own);
    expect(last().attacker.mergeCas).toBeNull();
    expect(screen.queryByLabelText('Attacker merge speed')).toBeNull();
  });

  it('resets the loadout to one the new aircraft has when the aircraft changes', async () => {
    const { last } = renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'su-27');
    expect(last().defender).toMatchObject({ aircraftId: 'su-27', loadoutId: 'clean' });

    const loadouts = within(screen.getByLabelText('Defender loadout')).getAllByRole('option');
    expect(loadouts.map((o) => o.textContent)).toContain('2× R-73 + 6× R-27ER (+2,500 kg)');
  });

  it('changes fuel as a fraction and shows the fuel mass', () => {
    const { last } = renderPanel();
    fireEvent.change(screen.getByLabelText('Attacker fuel'), { target: { value: '20' } });
    expect(last().attacker.fuelFraction).toBeCloseTo(0.2, 9);
    // F-16C mock internal fuel is 3 175 kg.
    expect(screen.getByText('20% · 635 kg')).toBeInTheDocument();
  });

  it('shows the RB instructor G limit, with no instructor-off option', () => {
    renderPanel();
    // F-16C: the fly-by-wire limit caps the instructor at 10 g.
    expect(instructorG('Attacker')).toBe(10);
    expect(screen.getByText(/Fly-by-wire caps it at 10 g/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Attacker G limiter' })).toBeNull();
  });

  it('lowers the G limit as the jet gets heavier', () => {
    renderPanel();
    const light = instructorG('Defender');
    fireEvent.change(screen.getByLabelText('Defender fuel'), { target: { value: '100' } });
    expect(instructorG('Defender')).toBeLessThan(light);
  });

  it('searches the aircraft list, grouped by battle rating', async () => {
    renderPanel();
    const picker = screen.getByLabelText('Defender aircraft');
    expect(
      within(picker)
        .getAllByRole('group')
        .map((g) => g.getAttribute('label')),
    ).toEqual(expect.arrayContaining(['BR 13.7', 'BR 13.0']));
    // Variant names are searchable; the selected MiG-29 stays listed.
    await userEvent.type(screen.getByLabelText('Search defender aircraft'), 'vf-11');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['F-14D Super Tomcat · USA', 'MiG-29 (9-12) · USSR']);
    await userEvent.selectOptions(picker, 'f-14d');
    expect(screen.getByText(/Also flown as F-14D \(VF-11\) Super Tomcat/)).toBeInTheDocument();
  });

  it("builds a custom load slot by slot, within the game's rules", async () => {
    const { last } = renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'f-14d');
    const front = screen.getByLabelText('Defender front fuselage');

    // GBU-12s need the LANTIRN, so it comes along on the right glove.
    await userEvent.selectOptions(front, 'gbu_12_x2_fuse');
    expect(last().defender.stores).toEqual({ 4: 'gbu_12_x2_fuse', 7: 'lantirn' });
    expect(screen.getByLabelText('Defender loadout')).toHaveValue('__custom');
    expect(screen.getByText('A2G')).toBeInTheDocument();
    expect(screen.getByText('2× GBU-12, 1× LANTIRN · 790 kg')).toBeInTheDocument();

    // Two Sparrows up front rule out two Phoenixes behind them.
    await userEvent.selectOptions(front, 'aim_7m_x2_fuse');
    const phoenixes = within(screen.getByLabelText('Defender rear fuselage')).getByRole('option', {
      name: /^AIM-54C ×2/,
    });
    expect(phoenixes).toBeDisabled();
    expect(phoenixes).toHaveTextContent(
      'AIM-7M ×2 on front fuselage rules out AIM-54C ×2 on rear fuselage',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Back to the quick pick' }));
    expect(last().defender.stores).toBeNull();
  });

  it('hides air-to-ground choices with "A2A only"', async () => {
    renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'f-14d');
    const quickPicks = () =>
      within(screen.getByLabelText('Defender loadout'))
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(quickPicks().some((name) => name?.startsWith('Strike'))).toBe(true);
    await userEvent.click(screen.getByLabelText('Defender A2A only'));
    expect(quickPicks().some((name) => name?.startsWith('Strike'))).toBe(false);
    const front = within(screen.getByLabelText('Defender front fuselage'));
    expect(front.queryByRole('option', { name: /GBU-12/ })).toBeNull();
    expect(front.getByRole('option', { name: 'AIM-54C ×2' })).toBeInTheDocument();
  });

  it('switches between a yanking and a smooth pilot with a 7 g default', async () => {
    const { last } = renderPanel();
    expect(screen.queryByLabelText('Attacker pilot G')).not.toBeInTheDocument();

    await userEvent.click(within(group('Attacker pilot')).getByLabelText('Smooth'));
    expect(last().attacker.pilotG).toBe(7);
    fireEvent.change(screen.getByLabelText('Attacker pilot G'), { target: { value: '5.5' } });
    expect(last().attacker.pilotG).toBe(5.5);
    expect(screen.getByText('5.5 g')).toBeInTheDocument();

    await userEvent.click(within(group('Attacker pilot')).getByLabelText('Yanks to limit'));
    expect(last().attacker.pilotG).toBeNull();
  });

  it('sets the turn plane and the turn duration', () => {
    const { last } = renderPanel();
    fireEvent.change(screen.getByLabelText('Defender turn plane'), { target: { value: '90' } });
    expect(last().defender.turnPlane_deg).toBe(90);
    expect(screen.getByText('90° · vertical')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Turn duration'), { target: { value: '45' } });
    expect(last().turnDuration_s).toBe(45);
  });
});
