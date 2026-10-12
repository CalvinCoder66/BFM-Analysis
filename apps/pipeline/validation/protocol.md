# In-game validation protocol

How to fly the test cards that check the pipeline's numbers against War Thunder. The goal is
evidence anyone can rerun: raw telemetry, fixed conditions, three runs per card, and a scripted
analysis. HUD readings and eyeballed numbers don't count.

## Before you fly

1. **Mode.** Realistic difficulty with **mouse aim (instructor on)**, the RB default. Use a custom
   battle set to Realistic. The first time, also fly card A once in test flight and compare, to
   find out whether test flight uses exactly the RB flight model.
2. **Aircraft state.** Fully upgraded (spaded), **clean**: no pylons, no external tanks. Set the
   fuel to the amount the card says and note it.
3. **Map.** Use the same map for every run of a card. Air temperature affects density, and the
   analysis uses the altitude and speed the game reports.
4. **Telemetry.** War Thunder serves it on `http://localhost:8111` while you are in a flight.
   Recording runs on the same PC as the game.
5. **Start the recorder** after spawning, before the manoeuvre:

   ```bash
   mise run data:record -- --aircraft f_16c_block_50 --card A --run 1 --start-fuel-kg 3200 --map "Denmark"
   ```

   Press Ctrl+C when the card is done (or pass `--duration 90`). The log goes to
   `apps/pipeline/validation/flights/<game version>/<aircraft>/<card>-<run>.jsonl.gz`, with a
   `.meta.json` alongside. Commit both.

Fly each card **three times** (`--run 1`, `2`, `3`). Then analyse them together:

```bash
mise run data:analyse -- apps/pipeline/validation/flights/2.59.0.65/f_16c_block_50/A-*.jsonl.gz
```

The analysis writes a `.summary.json` per run and prints the spread across runs.

## Test cards

Fly smoothly and keep the wings level unless the card says otherwise. Each card lists what to hold
steady; the analysis finds the steady parts itself, so small wobbles are fine.

### A. Level acceleration (Ps at 1 g)

- **Start:** 1,000 m, about 400 km/h IAS, throttle idle, wings level.
- **Fly:** full afterburner, then hold 1,000 m (±50 m) with the wings level until speed stops
  rising.
- **Gives:** Ps against speed at 1 g, which checks thrust minus drag at low lift.

### B. Top speed at height

- **Start:** 1,000 m, then repeat at 6,000 m, as separate runs (`--notes "6000 m"`).
- **Fly:** full afterburner, level, until speed has been steady for **20 s**.
- **Gives:** top speed at each height, which checks thrust and drag at high Mach.

### C. Sustained turns

- **Start:** 1,000 m, 30% fuel.
- **Fly:** a level turn holding a constant speed and height for **at least 10 s**, at
  600, 800 and 1,000 km/h IAS. Adjust pull, not throttle (full afterburner throughout).
- **Gives:** the sustained load factor and the measured turn rate at each speed.

### D. Instantaneous pulls

- **Start:** 3,000 m, 30% fuel, level at a set speed: 500, 700, 900 and 1,100 km/h IAS.
- **Fly:** full stick back for **3 s**, then release. With mouse aim, put the cursor straight up.
- **Gives:** peak load factor, angle of attack and turn rate. Below corner speed this checks the
  lift limit; above it, the instructor's steady and peak G.

### E. Bleed under load

- **Start:** 3,000 m, 900 km/h IAS, full afterburner.
- **Fly:** hold maximum pull, level, for **10 s**.
- **Gives:** Ps at maximum G against speed: how fast the jet bleeds energy.

## Troubleshooting

**`Connection refused` on `localhost:8111`.** Nothing is serving telemetry where the recorder is
looking.

1. Make sure War Thunder is running **and you have spawned into a flight**, then check from the
   same terminal: `curl http://localhost:8111/state`. You should get JSON with `"valid": true`.
2. **WSL with the game on Windows:** inside WSL 2, `localhost` is the Linux VM, not Windows, and
   the game only listens on Windows' own `localhost`. Either:
   - turn on mirrored networking: add the lines below to `%UserProfile%\.wslconfig` on Windows,
     then run `wsl --shutdown` in PowerShell and reopen the WSL terminal:

     ```ini
     [wsl2]
     networkingMode=mirrored
     ```

   - or run the recorder from Windows itself: install [uv](https://docs.astral.sh/uv/) in
     PowerShell, clone the repo there and run the same `uv run --project apps/pipeline ...`
     command. Commit the logs from either side.
3. **Game on Linux (native or Proton):** the address should be `localhost`. Check that no firewall
   blocks port 8111. If the game runs on another machine, pass `--url http://<that-machine>:8111`.

## What counts as agreement

For each figure, the model has to land within the larger of **3%** or **twice the run-to-run
spread**. A model figure outside that band is a finding to investigate, not something to tune
away silently.
