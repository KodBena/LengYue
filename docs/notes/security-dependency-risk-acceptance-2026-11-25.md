# Linux desktop: bounded residual-risk acceptance for RUSTSEC-2024-0429

**Disposition:** Accepted — bounded residual risk, not remediation.  
**Effective date:** 2026-11-25.  
**Owner:** The person accountable for the Linux desktop target.  
**Review deadline:** 2027-05-25, or earlier at the qualifying Tauri-major trigger below.

## Affected dependency path

The Linux desktop resolution in `frontend/src-tauri/Cargo.lock` includes:

```text
tauri 2.11.5
├── gtk 0.18.2 ────────────────┐
└── webkit2gtk 2.0.2 ──────────┤
                               └── glib 0.18.5

tauri-runtime-wry 2.11.4
└── wry 0.55.1
    ├── gtk 0.18.2 ────────────┐
    └── webkit2gtk 2.0.2 ──────┤
                               └── glib 0.18.5
```

This is the Linux desktop target's GTK3 / WebKitGTK dependency edge; it is not a direct application dependency.

## Technical basis

The unsoundness in `glib 0.18.5` is real. `VariantStrIter::impl_get` passes an immutable raw-pointer binding as a C out-parameter (`&p`); the C callee writes through that pointer, and optimized Rust may elide the write, leaving a null pointer for subsequent C-string access. The affected public iterator operations are `last`, `next`, `next_back`, `nth`, and `nth_back`. RustSec records `glib >=0.15.0, <0.20.0` as affected and `>=0.20.0` as patched: [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).

The correct upstream repair is to make the pointer binding mutable and pass `&mut p`; it was merged in [gtk-rs-core PR #1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343). The 0.18 branch has no supported release carrying the fix:
- [PR #1991](https://github.com/gtk-rs/gtk-rs-core/pull/1991) and [PR #2009](https://github.com/gtk-rs/gtk-rs-core/pull/2009) proposed the narrow 0.18 backport and were closed unmerged.
- In the 0.18 backport discussion, maintainers stated that 0.18 is long EOL and that no further releases would be made.
- [Issue #2010](https://github.com/gtk-rs/gtk-rs-core/issues/2010), requesting a fixed `glib 0.18.6`, was closed without such a release.
- The gtk3-rs line is archived/unmaintained. There is no supported fixed `glib 0.18.x` release.

Application-source inspection at this revision found no application-owned call sites or references to `VariantStrIter` / `array_iter_str`. The affected API is present transitively through the Linux GUI dependency graph. This is a bounded reachability assessment, not proof that no transitive dependency can call the API.

Stable Tauri 2.x (including [2.12.7](https://docs.rs/crate/tauri/2.12.7)) continues to depend on GTK3 / GLib 0.18 on Linux. The GTK4 + WebKitGTK 6 migration is targeted at Tauri 3 and has not shipped in a stable release; the available Tauri 3 prerelease is not an approved production migration. Therefore a routine Tauri 2 update does not remove this dependency edge.

## Why this residual-risk disposition is proportionate

- The private vendor/backport route would transfer ongoing maintenance of an EOL crate to this project for a low-probability, currently unobserved application reachability path. It would also leave version-based RustSec reporting in place.
- Forcing a Linux desktop architecture migration solely to remove this transitive edge would expand this dependency remediation into a platform/runtime rewrite before a supported upstream path exists.
- Falsifying the GLib version or adding an unrelated direct `glib 0.20` dependency would not repair the code in the resolved 0.18 crate.
- The UB remains genuine; this acceptance does not suppress the advisory, claim remediation, or assert zero risk. The practical attack surface for this specific iterator defect is assessed as low because application-owned code does not call the affected API.

## Bound, trigger, and review

This acceptance applies only to transitive `glib 0.18.5` on the Linux desktop target.

Re-evaluate immediately on the first of:
1. A Tauri major release with a supported Linux runtime that removes the GTK3 / `glib 0.18` dependency edge; or
2. Demonstrated reachability of an affected `VariantStrIter` operation from application execution, or a demonstrated exploit.

The Linux desktop target owner must also review this acceptance no later than **2027-05-25** (six months from acceptance), even if neither event has occurred. At review, either remove the edge through a supported runtime migration or record a new explicit ratification; this acceptance does not renew automatically.
