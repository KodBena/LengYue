"""
qeubo/runtime/_compat.py

Module-import-time compatibility shims that bridge the vendored qEUBO
(unmaintained since 2023-03-24, last commit 21cd661e) to modern botorch
and torch.

The shims target third-party APIs (botorch, torch), not the vendored
qEUBO source. They are import-time side effects: importing this module
applies the shims globally for the lifetime of the Python process. The
qEUBO package's `__init__.py` imports this module BEFORE the runtime
service / storage modules so the shims are in place before any vendor
code instantiates a sampler or creates a tensor.

Two shims, both observed against the April-2026 ecosystem
(botorch 0.17.x, gpytorch 1.15.x, torch 2.11.x):

1. `MCSampler.__init__` accepts `int` for `sample_shape`
   ----------------------------------------------------
   Vendored qEUBO calls `SobolQMCNormalSampler(sample_shape=512)`. From
   botorch >=0.9 the constructor enforces `sample_shape` to be a
   `torch.Size` and rejects bare `int` with `InputDataError`. We coerce
   `int → torch.Size([int])` at the base-class entry point so every
   `MCSampler` subclass benefits, including any new sampler types the
   vendored library or future updates may use. The coercion is one-way
   and never narrows behavior — a `torch.Size` argument flows through
   the original constructor unchanged.

2. `torch.set_default_dtype(torch.float64)`
   ---------------------------------------
   Vendored qEUBO assumes torch's older float64 default — its tensors,
   GP parameters, and inducing-point storage all expect double
   precision. Modern torch defaults to float32, which surfaces inside
   gpytorch's variational strategy as `RuntimeError: expected m1 and m2
   to have the same dtype, but got: double != float`. Setting the
   default dtype to float64 at import time matches the runtime's
   precision expectation.

   Note: this is a global torch state mutation. It affects every
   tensor created in this Python process after the qEUBO package is
   imported, not just qEUBO-internal tensors. In LengYue's backend this
   is unproblematic — qEUBO is the only torch consumer, and the package
   only imports when `QEUBO_ENABLED=True`. If a future module in this
   process needed float32-default tensors, it would need to construct
   them with explicit `dtype=torch.float32` rather than relying on the
   default.

When upstream qEUBO publishes a botorch-compatible release (or when
this project chooses to fork-vendor with the patches inlined), this
module becomes redundant and can be deleted; the package `__init__.py`
import line is the single point of removal.

License: MIT — see ../LICENSE
"""
import torch
import botorch.sampling.base as _bs_base


def _wrap_mcsampler_sample_shape() -> None:
    """Coerce `int` → `torch.Size` on `MCSampler.__init__`."""
    original = _bs_base.MCSampler.__init__

    def patched(self, sample_shape=None, *args, **kwargs):
        if isinstance(sample_shape, int):
            sample_shape = torch.Size([sample_shape])
        return original(self, sample_shape, *args, **kwargs)

    _bs_base.MCSampler.__init__ = patched


_wrap_mcsampler_sample_shape()
torch.set_default_dtype(torch.float64)
