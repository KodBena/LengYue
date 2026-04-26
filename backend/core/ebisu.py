# -*- coding: utf-8 -*-
"""
Ebisu: a library for public-domain spaced repetition algorithms.
Vendored and modified to support float-based success/total inputs for
discounted reward updates from Thick Clients.
"""

from functools import lru_cache
from math import isfinite

import numpy as np
from scipy.optimize import root_scalar
from scipy.special import betaln, logsumexp


def predict_recall(prior: tuple[float, float, float], t_now: float, exact: bool = True) -> float:
    """
    Expected recall probability now, given a prior distribution (alpha, beta, t).
    """
    a, b, t = prior
    dt = t_now / t
    ret = betaln(a + dt, b) - _cached_betaln(a, b)
    return np.exp(ret) if exact else ret


# Item 21d: bounded LRU cache replaces the previous unbounded module-level
# dict. The working set is the (alpha, beta) pairs of recently-active cards;
# 4096 entries is comfortable headroom (tens of KB of memory) for any
# reasonable deployment. lru_cache also exposes .cache_info() for free
# observability if a future metrics endpoint wants it.
@lru_cache(maxsize=4096)
def _cached_betaln(a: float, b: float) -> float:
    return betaln(a, b)


def binomln(n, k):
    return -betaln(1 + n - k, 1 + k) - np.log(n + 1)

def _mean_var_to_beta(mean, var):
    tmp = mean * (1 - mean) / var - 1
    alpha = mean * tmp
    beta = (1 - mean) * tmp
    return alpha, beta

def _find_bracket(f, init=1., growfactor=2.):
    factorhigh = growfactor
    factorlow = 1 / factorhigh
    blow = factorlow * init
    bhigh = factorhigh * init
    flow = f(blow)
    fhigh = f(bhigh)
    while flow > 0 and fhigh > 0:
        blow = bhigh
        flow = fhigh
        bhigh *= factorhigh
        fhigh = f(bhigh)
    while flow < 0 and fhigh < 0:
        bhigh = blow
        fhigh = flow
        blow *= factorlow
        flow = f(blow)
    return [blow, bhigh]

def update_recall_float(
    prior: tuple[float, float, float], 
    successes: float, 
    total: float, 
    t_now: float, 
    rebalance: bool = True,
    min_time_ratio: float = 0.05
) -> tuple[float, float, float]:
    """
    Pure math: Updates the Bayesian prior based on discounted float rewards.
    No I/O. No Side Effects.
    """
    alpha, beta, t = prior
    dt = t_now / t
    
    if dt < min_time_ratio:
        return prior

    # Item 9b: explicit input contract validation. The previous `assert` was
    # stripped under `python -O`, at which point invalid inputs flowed into
    # the Bayesian update unchecked and produced silently-wrong posteriors.
    if not (0 <= successes <= total and 1 <= total):
        raise ValueError(
            f"Invalid Ebisu update inputs: successes={successes!r}, "
            f"total={total!r}. Must satisfy 0 <= successes <= total and 1 <= total."
        )

    failures = total - successes
    is_int = abs(failures - round(failures)) < 1e-10
    
    if is_int:
        n_fail_int = int(round(failures))
        iter_range = range(n_fail_int + 1)
        binom_vals = [binomln(n_fail_int, i) for i in iter_range]
        total_signs = [(-1)**i for i in iter_range]
    else:
        max_iter = 25 
        iter_range = range(max_iter)
        binom_vals = []
        total_signs = []
        curr_val = 0.0
        curr_sign = 1.0 
        binom_vals.append(curr_val)
        total_signs.append(curr_sign) 
        for k in range(1, max_iter):
            factor = (failures - k + 1) / k
            if factor == 0:
                curr_val = -np.inf
            else:
                curr_val += np.log(abs(factor))
                if factor < 0:
                    curr_sign *= -1
            binom_vals.append(curr_val)
            total_signs.append(curr_sign * ((-1)**k))

    def unnormalized_log_moment(m, et):
        return logsumexp([
            binom_vals[i] + betaln(alpha + dt * (successes + i) + m * dt * et, beta)
            for i in iter_range
        ], b=total_signs)

    log_denominator = unnormalized_log_moment(0, et=0)

    if rebalance:
        target = np.log(0.5)
        rootfn = lambda et: (unnormalized_log_moment(1, et) - log_denominator) - target
        sol = root_scalar(rootfn, bracket=_find_bracket(rootfn, 1 / dt))
        t_back = sol.root * t_now
    else:
        t_back = t

    et = t_back / t_now
    log_mean = unnormalized_log_moment(1, et) - log_denominator
    mean = np.exp(log_mean)
    m2 = np.exp(unnormalized_log_moment(2, et) - log_denominator)

    var = m2 - (mean**2)
    new_alpha, new_beta = _mean_var_to_beta(mean, var)
    
    return (new_alpha, new_beta, t_back)

def model_to_halflife(model: tuple[float, float, float], percentile: float = 0.5) -> float:
    """Calculates when the model will decay to the target percentile."""
    alpha, beta, t0 = model
    log_bab = betaln(alpha, beta)
    log_percentile = np.log(percentile)

    def f(delta):
        return (betaln(alpha + delta, beta) - log_bab) - log_percentile

    b = _find_bracket(f, init=1., growfactor=2.)
    sol = root_scalar(f, bracket=b)
    return sol.root * t0
