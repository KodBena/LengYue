# Distribution / Packaging — Options Memo

- **Status:** Open. Pre-decision options memo. Updated by the
  project author after considering each option's tradeoffs;
  retired (or split into a per-option implementation plan) once
  the chosen path is clear.
- **Genre:** Design note — distribution / packaging.
- **Date:** 2026-04-30 (release-scope close-out).

## What this is for

The release-scope items (1–7) closed on 2026-04-30; the application
runs cleanly when a developer has Node and Python toolchains
installed. The next undertaking is making the software installable
by users who don't know `npm` or `fastapi` — Go players, not
front-end engineers. This memo documents the options considered
and the constraints.

The project's existing posture (per `docs/release-scope.md`'s
"Specifically excluded" list and `docs/handoff-current.md`'s
"Where the project is going" section) is **local-install**: each
user's machine runs the SPA, the FastAPI backend, and the KataGo
proxy + engine together. Hosted-deployment shape is on the
post-release roadmap, not here.

## What needs to be packaged

Three runtime processes live together on the user's machine:

- **Frontend SPA** — Vue 3 + TypeScript, built to static
  HTML/CSS/JS via `npm run build`. Needs a webview or browser to
  load, and a static server (or `file://` access) to serve from.
- **Backend** — FastAPI + SQLAlchemy 2.0. Default port 8764.
  Stores cards in a SQLite file by default; the JWT-secret file
  lives in the install dir.
- **Proxy + KataGo** — `proxy/` (the KataProxy submodule) wraps
  the upstream KataGo binary. KataGo itself is the GPU-using
  analysis engine; the proxy adds caching, multiplexing, and the
  three-layer architecture documented in `proxy/ARCHITECTURE.md`.
  KataGo's network weights (50MB–1GB depending on which net) are
  required at runtime and not bundled with KataGo's own binary
  distribution.

A non-technical install needs: one place to click "install", one
place to click "run", and the three processes running together
without the user knowing they exist.

## Options considered

### (1) Desktop app via Tauri — preferred shape

Tauri bundles the SPA into a native window (using the OS's system
webview — WebKit on macOS, WebView2 on Windows, WebKitGTK on
Linux), and ships a small Rust binary that spawns child processes.
The project already builds the SPA to static files; Tauri wraps
that. The Rust side spawns the FastAPI backend (frozen via
PyInstaller) and the KataGo proxy as child processes; on app
quit, both children terminate.

Pros:
- One installer per OS. Double-click to run. The "three
  processes" plumbing is invisible to the user.
- System webview means binaries stay small (~10–20MB for the
  shell, plus whatever Python + KataGo + weights weigh).
- No Rust to *write* — Tauri's `tauri.conf.json` plus a small
  spawning shim is enough. Rust toolchain is needed for the
  build, not authoring.
- Cross-platform from a single codebase (one Tauri config produces
  Win / macOS / Linux installers).

Cons:
- Rust toolchain on the build side; CI complexity for cross-
  building the three OSes.
- Tauri 2.x is newer than Electron; smaller community, but
  stable enough for serious projects.
- Auto-update flow needs designing (Tauri has built-in support
  but the signing/serving pipeline is separate work).

### (2) Per-OS native installers + launcher — control-favoring shape

Each piece is packaged with native tooling for its language:
PyInstaller (or Nuitka) freezes the backend into a single
executable per OS; the proxy (Python) is treated similarly;
KataGo's own binary distribution slots in (the project already
pins it as a submodule, so the version is reproducible). The SPA
is a static-file folder; a small launcher (Go binary, or a tiny
native shell) starts the three processes and opens the user's
default browser at the SPA's local URL.

Pros:
- No webview vendor lock-in; the user runs the SPA in their own
  browser of choice.
- Each piece is a real native binary; debugging / log inspection
  is straightforward.
- Lightest at install (no Rust toolchain dependency on build
  side; no Tauri framework).

Cons:
- Per-OS packaging work each release (Win MSI, macOS .pkg, Linux
  .deb / .rpm / AppImage).
- Three independent freeze pipelines (PyInstaller for backend,
  PyInstaller for proxy, KataGo's existing distribution).
- The launcher is bespoke per OS; common ground is `electron-
  builder` style metadata, but without Electron itself.
- "Open browser" UX is jarring vs. a desktop-app feel; users
  see their normal browser chrome around the app.

### (3) Docker Compose — REJECTED

Considered and explicitly rejected by the project author on
2026-04-30 with the rationale: **Docker is itself a barrier for
non-technical users.** The target audience (Go players who don't
know `npm`) won't typically install Docker either; even if they
did, KataGo GPU passthrough requires NVIDIA Container Toolkit on
Linux and is non-trivial on Windows / macOS. Docker remains
useful for the project's own CI and for technical developers who
clone the repo, but isn't the answer to the "make this accessible
to non-techies" question.

(Recording the rejection here per ADR-0005 Rule 6 — keep the
considered-and-rejected option visible so the same conversation
doesn't repeat.)

## Cross-cutting concerns (apply regardless of option)

### KataGo network weights

The neural-network weights file is the largest artifact (50MB to
1GB depending on which net) and the most awkward distribution
piece. KataGo's own releases don't bundle a default net; users
download from the KataGo Networks page or from open source
training projects. Three options:

- **Bundle a small net** with the installer (the 15-block 192-
  channel net at ~50MB is reasonable for end-user analysis).
  Adds size to the installer but eliminates the first-run choice.
- **First-run download** UI: on first launch, prompt the user to
  download a net. Smaller installer, but adds a network
  dependency to first-run.
- **Bring-your-own-net**: ask the user to download separately
  and point at the file. Most flexible, least friendly.

The Tauri shape can do any of the three. The native-installer
shape can too. Bundle-a-small-net is the most non-techie-friendly.

### Engine hardware variation

KataGo runs on CUDA, ROCm, OpenCL, Metal, or CPU. The right
backend depends on the user's hardware. Three options:

- **One-binary-per-backend** distribution (separate Win-CUDA,
  Win-OpenCL, Linux-CPU, macOS-Metal installers). Simple per
  install, complex to publish.
- **Universal installer** that detects hardware on first run
  and downloads the right KataGo binary. More complex install
  flow, simpler download page.
- **CPU-only default**, with an "advanced" path to swap in a
  GPU-capable KataGo. Slowest but lowest-friction; works
  everywhere.

A first-launch UI prompt — "we detected an NVIDIA GPU, want to
use the CUDA backend?" — reasonably handles this for both shape
(1) and shape (2).

### Auto-update

Both viable shapes need an update story. Tauri has built-in
update support (downloads + signature verification + restart).
Native installers can use OS-native update channels (Windows
Update for MSI? Mac App Store? Hand-rolled?) or a simple
"check on startup" flow.

The proxy is pinned to a specific tag (the current pin is recorded
in the umbrella `CLAUDE.md`); updates that advance the proxy version
need coordinated frontend / backend updates. The auto-update flow
should treat the three pieces as one bundle, not independently
versioned.

### First-run friction

Whatever the shape, the first run needs:
- Engine backend choice (or auto-detect).
- Network weights (bundle, download, or BYO).
- A privacy/data-collection statement (one-time consent or none —
  project is public-domain, no telemetry currently planned).

A single-pane first-run UI in the SPA itself, gated behind a
"first-launch" flag, can do all three regardless of underlying
shape.

## Recommendation

The author's read at memo time: **(1) Tauri** if a single
small-installer-per-OS UX is the priority and the Rust toolchain
on the build side is acceptable. **(2) Native installers** if
per-OS control and "user runs SPA in their browser of choice"
is the priority.

The two are not mutually exclusive long-term — Tauri can be the
mainline distribution and native binaries can be the
power-user / "I want to run the proxy on a different machine"
fallback. The first commitment is which one ships first.

## Decision

*To be filled in by the project author after consideration.*

## When this memo retires

Either:
- A choice is made → split into an implementation plan named
  e.g. `docs/notes/distribution-tauri-plan.md` (or whichever
  shape was picked), and this memo is deleted with a brief
  reference in `docs/handoff-current.md` to the implementation
  plan.
- The local-install shape is abandoned in favor of hosted
  deployment → record the pivot in `docs/handoff-current.md`,
  delete this memo (the considered-and-rejected list still
  notes Docker, which is good context for the hosted scenario
  too).
