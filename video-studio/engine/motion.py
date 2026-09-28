"""Easing and interpolation."""
from __future__ import annotations

import math


def clamp01(t: float) -> float:
    return 0.0 if t < 0 else 1.0 if t > 1 else t


def linear(t: float) -> float:
    return clamp01(t)


def in_cubic(t: float) -> float:
    t = clamp01(t)
    return t * t * t


def out_cubic(t: float) -> float:
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def in_out_quart(t: float) -> float:
    t = clamp01(t)
    if t < 0.5:
        return 8 * t * t * t * t
    return 1 - (-2 * t + 2) ** 4 / 2


def out_back(t: float, overshoot: float = 1.70158) -> float:
    t = clamp01(t)
    c1 = overshoot
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def out_elastic(t: float) -> float:
    t = clamp01(t)
    if t == 0 or t == 1:
        return t
    return 2 ** (-10 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi) / 3) + 1


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def ease(name: str, t: float) -> float:
    return {
        "linear": linear,
        "inCubic": in_cubic,
        "outCubic": out_cubic,
        "inOutQuart": in_out_quart,
        "outBack": out_back,
        "outElastic": out_elastic,
    }.get(name, in_out_quart)(t)
