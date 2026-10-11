# BFM-Analysis
This project aims to build an interactive web-based dashboard that bridges the gap between raw War Thunder flight data and practical, real-time Basic Fighter Manoeuvres (BFM) decision-making post-merge. It translates complex Energy-Maneuverability theory and turn performance across 1-circle (radius) and 2-circle (rate) fights into intuitive, slider-driven visual comparisons for 4th-generation aircraft.

There would be ways to configure aircraft states on both sides. Parameters such as
- Merge speed
- Altitude
- Fuel and loadout
- Flight Path Angle relative to horizontal plane (vertical loop vs flat horizontal turn)
- Turn duration
- G-limiter Toggles

## Justification for development

1. As far as I'm aware, no such tooling exists. Dogfighting is a nerd's game, with physics and matchups being an integral part of understanding required to win. Being a nerd that plays War Thunder, I'd like to know more about the various matchups in different scenarios.
2. The charts that are used to represent data such as sustained turn rates and radius at various airspeeds are extremely difficult to understand for the average person. Not only this, but the data isn't all that useful in isolation. So the proposed solution would give an analysis of 1-circle and 2-circle performance, and how much of a gap a pilot would have against their opponent if they were to choose a 1-circle or 2-circle fight. 


## UI - The Core Comparison DashboardCard 
1: The 1-Circle (Radius) Verdict: Who wins a nose-to-nose pitch fight? Highlights minimum turn radius, nose-authority speed, and point-blank snap shot opportunity.Card 
2: The 2-Circle (Rate) Verdict: Who wins the sustained rate war? Compares Sustained Turn Rate ($STR$) and rate of turn over time without excessive speed loss.Card
3: Energy State & $P_s$ (Specific Excess Power) Overlay: Interactive scatter plot or chart showing turn rate vs. airspeed, clearly indicating where each aircraft bleeds or gains energy.

