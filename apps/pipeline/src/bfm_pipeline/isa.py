"""International Standard Atmosphere (troposphere and lower stratosphere, up to 20 km)."""

import math

G0 = 9.80665  # m/s²
R_AIR = 287.05287  # J/(kg·K)
GAMMA = 1.4
T0 = 288.15  # K
P0 = 101_325.0  # Pa
RHO0 = 1.225  # kg/m³
LAPSE = 0.0065  # K/m
TROPOPAUSE_M = 11_000.0
T_TROPOPAUSE = T0 - LAPSE * TROPOPAUSE_M  # 216.65 K


def temperature(h: float) -> float:
    return T0 - LAPSE * min(h, TROPOPAUSE_M)


def pressure(h: float) -> float:
    if h <= TROPOPAUSE_M:
        return P0 * (temperature(h) / T0) ** (G0 / (LAPSE * R_AIR))
    p11 = P0 * (T_TROPOPAUSE / T0) ** (G0 / (LAPSE * R_AIR))
    return p11 * math.exp(-G0 * (h - TROPOPAUSE_M) / (R_AIR * T_TROPOPAUSE))


def density(h: float) -> float:
    return pressure(h) / (R_AIR * temperature(h))


def speed_of_sound(h: float) -> float:
    return math.sqrt(GAMMA * R_AIR * temperature(h))
