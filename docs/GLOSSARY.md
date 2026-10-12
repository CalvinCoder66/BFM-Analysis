# Glossary

Terms used in the dashboard, the code and the docs. Grouped by topic, alphabetical within each group.

## Fights and tactics

- **1-circle fight**: after the merge, the aircraft turn so they fly round roughly the same circle and meet nose-to-nose. A radius fight: the **tighter turn radius** wins. In the dashboard both pilots pull to the limiter (full pull).
- **2-circle fight**: after the merge, both aircraft turn towards each other, each flying their own circle, and chase nose-to-tail. A rate fight: the **higher sustained turn rate** wins in the long run. In the dashboard each pilot flies as set (smooth or yanking).
- **BFM (Basic Fighter Manoeuvres)**: close-range, within-visual-range manoeuvring to get a firing position after the merge.
- **Energy fighting**: managing speed and altitude (energy) rather than spending it all on turning. Contrast with **angles fighting**, which spends energy to point the nose now.
- **Merge**: the moment two aircraft pass each other head-on; the fight starts here. **Merge speed** is set in the sidebar as IAS.
- **Nose authority**: how quickly an aircraft can point its nose at a target, mostly limited by instantaneous turn rate.
- **Snap shot**: a quick, high-angle gun shot taken as the target passes through the nose, rather than a tracking shot.
- **Turn from the merge**: the dashboard's time simulation of a sustained hard turn from the merge speed, used by the turn timeline, turn circles and Energy view.

## Turn performance

- **Corner speed (corner velocity)**: the lowest speed at which the aircraft can pull its maximum G. Gives the best instantaneous turn rate and close to the smallest radius. Marked ◆ on the E-M diagram.
- **Instantaneous turn rate (ITR)**: the highest turn rate available right now, whatever the energy cost. Limited by lift at low speed and by the G limit at high speed.
- **Lift-limited / G-limited**: below corner speed the wing cannot make enough lift to reach the G limit (lift-limited); above it, the G limiter or structure is the cap (G-limited).
- **Sustained turn rate (STR)**: the highest turn rate the aircraft can hold without losing speed or altitude, where thrust equals drag (Ps = 0).
- **Turn plane**: the plane the turn is flown in, set per side from 0° (level turn) to 90° (vertical loop). The turn starts level at the bottom of the plane. Gravity slows the jet as it climbs and speeds it up in the dive, and helps the turn over the top and hurts it at the bottom. Point-performance charts report the circle average at constant speed, ω = g·√(n² − cos²θ) / V; the turn from the merge flies the loop with gravity, and the stats show the bottom and top rates and the speed over the top.
- **Flight path angle**: the angle of the velocity vector above or below the horizon. In this project it is modelled as the turn-plane inclination.
- **Turn radius**: the radius of the circle flown, r = V / ω. Smaller is tighter.
- **Turn rate (ω)**: how fast the heading changes, in degrees per second. In a level turn ω = g·√(n² − 1) / V.

## Energy

- **Bleed**: losing energy (speed) while turning, i.e. negative Ps.
- **Energy retention**: how much speed an aircraft keeps through a turn. The Energy view compares energy left after the turn from the merge, as the airspeed the jet would have at the merge height (plain airspeed in a level turn; height gained in an inclined turn counts too).
- **Ps (specific excess power)**: the rate an aircraft gains or loses energy, Ps = V·(T − D) / W, in m/s. Positive means it can accelerate or climb; negative means it is bleeding energy. **Ps at 1 g** is acceleration in level flight; **Ps at max G** is the bleed rate in a hard turn.
- **Ps contour**: a line on the E-M diagram joining points with the same Ps (e.g. −50 m/s).
- **Specific energy**: energy per unit weight, height plus V² / 2g. Ps is its rate of change.
- **Thrust-to-weight ratio (T/W)**: thrust divided by weight. The dashboard quotes sea-level static afterburner thrust at the current weight.

## G and limits

- **Fly-by-wire (FBW) limiter**: a flight-control computer that caps G regardless of stick input. In War Thunder only the F-16 has one modelled (10 g); it applies with the instructor on or off.
- **Full pull**: pulling to the G limiter (or max lift) every time. Used for 1-circle results.
- **G / load factor (n)**: lift divided by weight. 1 g is level flight; 9 g means the lift is nine times the aircraft's weight.
- **G limiter**: in the dashboard, either the **instructor** (War Thunder's mouse-aim assistance, which holds about 85% of the wing-break G) or **off** (manual control up to wing-break or the fly-by-wire limit).
- **Instructor**: War Thunder's virtual co-pilot that turns mouse-aim input into control surface movement and keeps the aircraft below its limits.
- **Pilot style**: per side, either **yanks to limit** (always full pull) or **smooth** (holds a chosen G, default 7 g, to keep energy).
- **As flown**: performance at the G the pilot actually uses (their smooth G, or full pull if they yank). Used for 2-circle, energy and timeline results.
- **Wing-break G**: the load factor at which the wings fail. War Thunder models the limit as a force (`CritOverload`), so wing-break G falls as the aircraft gets heavier.

## Aerodynamics and the model

- **AoA (angle of attack)**: the angle between the wing and the oncoming air. More AoA means more lift, up to the stall.
- **CD0 (zero-lift drag coefficient)**: drag that exists even with no lift (skin friction, shape). Stores and pylons add to it.
- **CLmax**: the highest lift coefficient the wing can reach before stalling; sets the lift limit and stall speed. Varies with Mach.
- **Drag polar**: how drag grows with lift. The model uses CD = CD0 + k·CL².
- **Induced drag factor (k)**: how much extra drag lift creates; the k in the drag polar.
- **Placard limit**: the maximum allowed speed, as max IAS and max Mach, whichever is reached first.
- **Point-performance model**: computing performance at a single speed, altitude and weight from algebraic formulas, rather than simulating the aircraft's motion in time. The physics layer is one of these, plus a simple time simulation for the turn from the merge.
- **Stall speed**: the slowest speed at which the wing can hold 1 g.
- **Wing loading**: mass divided by wing area (kg/m²). Lower generally means a tighter turn.

## Speed and atmosphere

- **CAS / IAS (calibrated / indicated airspeed)**: airspeed as the pitot tube reads it, corrected for instrument errors. Aerodynamic forces depend on it, so it is what pilots fly by. War Thunder's IAS is treated as CAS here.
- **ISA (International Standard Atmosphere)**: the standard model of temperature, pressure and density with altitude used for all calculations.
- **Mach number**: true airspeed divided by the local speed of sound.
- **TAS (true airspeed)**: actual speed through the air. Higher than IAS at altitude; turn rate and radius depend on it.

## Charts and views

- **E-M diagram (energy-manoeuvrability diagram)**: turn rate against airspeed, showing the max-turn boundary, the sustained (Ps = 0) line, Ps contours and constant-radius lines. Also called a **doghouse plot** after its shape.
- **Hotbar**: the bar of four focus views (Summary, 1-circle, 2-circle, Energy). Each slot shows that view's winner.
- **Rate advantage chart**: attacker minus defender turn rate at each speed.
- **Turn circles**: a to-scale 3D drawing of both aircraft's flight paths from the merge, each in its own turn plane, inside a gridded box with distance scales (east, north and height above the merge, in metres). Drag to look around, right-drag to move, scroll to zoom; Top and Side give flat views.
- **Turn timeline**: heading turned and airspeed against time for the turn from the merge.

## Data

- **`.blk` / `.blkx`**: War Thunder's data file format. Datamines publish them as JSON (`.blkx`).
- **Datamine**: data extracted from War Thunder's game files, e.g. the community [War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine) repository.
- **Flight model (FM)**: an aircraft's set of aerodynamic, engine and mass data in the game files.
- **Fox-1 / Fox-2 / Fox-3**: NATO brevity codes for semi-active radar, infrared and active radar missiles. Used in loadout names.
- **Game patch**: the War Thunder version a dataset matches. Mock data has no patch (`gamePatch: null`).
- **Loadout**: the stores carried (missiles, pylons, tanks), adding mass and drag.
- **Mock data**: estimated values for building the UI, marked `source: "mock"`. Not War Thunder figures.
