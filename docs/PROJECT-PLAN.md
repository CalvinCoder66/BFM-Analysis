# Project Plan: War Thunder 4th-Gen BFM & Turn Performance Comparator

## 1. Executive Summary

This project aims to build an interactive web-based dashboard that bridges the gap between raw War Thunder flight data and practical, real-time Basic Fighter Manoeuvres (BFM) decision-making post-merge. It translates complex Energy-Manoeuvrability (E-M) theory and turn performance across 1-circle (radius) and 2-circle (rate) fights into intuitive, slider-driven visual comparisons for 4th-generation aircraft.

## 2. Data Sourcing & Patch Management

War Thunder's flight models are updated frequently via minor and major patches. Managing data sustainability requires a tiered approach:

- **The Gold Standard (Datamining):** Use community-maintained repositories like wt-datamine (e.g. the GitHub community dumper by gszabi99) to track changes to engine thrust tables, empty/fuel weights, and aerodynamic coefficients (`.blk` file values).
- **The Pragmatic MVP Approach:** Do not attempt to run a real-time aerodynamic differential equation solver in the web app on day one. Instead:
  - Extract baseline performance markers: corner velocity, maximum Instantaneous Turn Rate (ITR), maximum Sustained Turn Rate (STR), weight, and thrust-to-weight ratio.
  - Store these in version-controlled JSON files.
  - Build a Python script or datamine parser utility to automate pulling updates when Gaijin tweaks a flight model.
- **Community Validation:** Cross-reference data with trusted community performance spreadsheets and data compilations standard in the WT realistic air battles community.

## 3. Architecture Strategy: UI-First vs. Backend-First

**Verdict: UI-first with mock data.**

- **Phase 1 (Mock UI):** Hardcode 2–3 iconic matchup profiles (e.g. F-16C vs. MiG-29) using estimated or realistic theoretical values. Build out the React/Tailwind dashboard layout, sliders, and charts first. This allows rapid iteration on user experience and visual clarity.
- **Phase 2 (Interpolation Engine):** Build the maths layer in TypeScript to handle user inputs (altitude, weight, G-limiters, pitch angle) and interpolate performance changes dynamically.
- **Phase 3 (Data Pipeline):** Connect the UI to a structured JSON data layer or an automated datamine ingestion script once the layout and interactions feel right.

## 4. UI & Feature Blueprint

### A. Setup & Scenario Panel (sidebar / top bar)

- **Aircraft selectors:** Attacker vs. Defender (e.g. F-15C vs. Su-27).
- **State sliders:**
  - Altitude: sea level to 12,000 m.
  - Fuel & loadout: internal fuel percentage (e.g. 20% vs. 100%) + weapon pylons (clean vs. heavy Fox-1/Fox-3 loadout, impacting wing loading).
  - Initial airspeed: Mach number or IAS (knots / km/h).

### B. Manoeuvre & Physics Sliders

- **G-limiter toggle:** Accounts for structural limits vs. manual override / instructor behaviour in War Thunder.
- **Flight path angle / turn vector slider:** Controls the vector orientation relative to the horizon (e.g. 0° for a flat horizontal turn vs. a vertical loop / climbing spiral).
- **Turn duration / energy bleed timeline:** Shows how energy state changes over time (seconds) into the merge.

### C. Core Comparison Dashboard

- **Card 1 — The 1-Circle (Radius) Verdict:** Who wins a nose-to-nose pitch fight? Highlights minimum turn radius, nose-authority speed, and point-blank snap-shot opportunity.
- **Card 2 — The 2-Circle (Rate) Verdict:** Who wins the sustained rate war? Compares STR and rate of turn over time without excessive speed loss.
- **Card 3 — Energy State & Ps (Specific Excess Power) Overlay:** Interactive scatter plot or chart showing turn rate vs. airspeed, clearly indicating where each aircraft bleeds or gains energy.

## 5. Phased Development Roadmap

### Phase 1: Foundation & Mock Data

- Set up React, Tailwind CSS, and Chart.js or Plotly.js.
- Create static JSON structures for two aircraft with mock E-M curves.

### Phase 2: Interactive Controls

- Implement sliders for altitude, speed, and loadout weight.
- Wire up the interpolation logic to dynamically shift curve outputs.

### Phase 3: 1-Circle vs. 2-Circle Visualiser

- Build comparative scorecard components and distinct turn-circle graphics.
- Add the vertical/flat turn angle and G-limiter modifiers.

### Phase 4: Real Data Integration

- Refine JSON datasets using accurate community datamine references.
- Polish the UI into a sleek, dark-mode aviation HUD aesthetic.
