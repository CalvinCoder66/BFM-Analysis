import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { kmhToMs, knotsToMs } from '../../physics/units';
import type { SpeedUnit } from '../../shared/format';
import type { Scenario } from '../comparison/matchup';
import { ScenarioPanel } from './ScenarioPanel';

const initial: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: '2xfox2' },
  defender: { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: '2xfox2' },
};

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

  it('resets the loadout to one the new aircraft has when the aircraft changes', async () => {
    const { last } = renderPanel();
    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'su-27');
    expect(last().defender).toEqual({ aircraftId: 'su-27', fuelFraction: 0.5, loadoutId: 'clean' });

    const loadouts = within(screen.getByLabelText('Defender loadout')).getAllByRole('option');
    expect(loadouts.map((o) => o.textContent)).toContain('2× R-73 + 6× R-27ER (+2500 kg)');
  });

  it('changes fuel as a fraction and shows the fuel mass', () => {
    const { last } = renderPanel();
    fireEvent.change(screen.getByLabelText('Attacker fuel'), { target: { value: '20' } });
    expect(last().attacker.fuelFraction).toBeCloseTo(0.2, 9);
    // F-16C mock internal fuel is 3 175 kg.
    expect(screen.getByText('20% · 635 kg')).toBeInTheDocument();
  });
});
