//! src-tauri/src/lib.rs — LengYue desktop shell.
//!
//! Owns TWO sidecars' lifecycle: pick a free local port, spawn the frozen
//! executable (a PyInstaller build declared as a Tauri `externalBin`
//! sidecar — see `tauri.conf.json`'s `bundle.externalBin` and
//! `capabilities/default.json`'s shell-execute scope), wait for it to
//! become ready, hand the resolved port to the webview via an
//! `initialization_script` global, and kill the child process on app
//! exit so neither sidecar survives the window closing.
//!
//! **Backend** (`lengyue-backend`, the pre-existing sidecar): FastAPI
//! app. Readiness is an HTTP `GET /health` poll. Port surfaces to the
//! webview as `window.__LENGYUE_BACKEND_PORT__`, read by
//! `frontend/src/config/env.ts`'s `API_BASE_URL`.
//!
//! **Proxy** (`lengyue-proxy`, added for the KataProxy desktop-packaging
//! commission — ledger rows 820/822): a frozen build of KataProxy
//! (`fable-branch`; see `packaging/lengyue-proxy.spec` and
//! `scripts/build-proxy-sidecar.sh`), run in the `RELAY` role so it
//! forwards to a user-provided upstream analysis engine rather than
//! needing a local KataGo install (the docker+CUDA rationale documented
//! in the commission: the engine is machine-specific, and KataProxy
//! itself is designed to chain arbitrarily). Required defaults per the
//! commission: replay cache 8192 entries (`PROXY_HUB_CACHE_MAX`,
//! `proxy/sproxy_config.py`), transposition detector enabled (no config
//! knob for this — `transformers/transposition_enricher.py` auto-engages
//! whenever the native `go_transposition` extension is importable, so
//! bundling it via the freeze IS enabling it; see the spec file's note).
//! KataProxy is a raw WebSocket server with no HTTP surface, so readiness
//! is a bare TCP-connect poll rather than an HTTP health check. Port
//! surfaces to the webview as `window.__LENGYUE_PROXY_PORT__`, read by
//! `frontend/src/config/env.ts`'s `KATAGO_WS_URL` — this is what makes
//! the SPA's engine-URI setting default to the LOCAL bundled proxy
//! rather than the historical `ws://127.0.0.1:41948` (a user-run LEAF)
//! under the Tauri build specifically, per the commission's "SPA should
//! point at the local proxy by default" requirement.
//!
//! The proxy's own upstream (the actual analysis engine) is settable
//! IN-APP (ledger rows 860-862, `proxy_settings.rs`) — a desktop user
//! has no way to set an OS environment variable, so the wizard/Settings
//! field there is the primary path. Precedence: the `ENGINE_WS_URL` OS
//! env var (power-user override, same name Docker's compose-level
//! upstream knob already uses) beats the stored in-app setting, which
//! beats `proxy_settings::DEFAULT_PROXY_UPSTREAM`
//! (`ws://127.0.0.1:1242`, the websocket-leaf shim's own default port).
//! See `proxy_settings::resolve_effective_upstream`, the sole place this
//! order is decided — this `setup()` hook and the
//! `get_proxy_upstream_setting` command both call it rather than each
//! re-deriving the order. A change to the stored setting takes effect on
//! next launch only (see `proxy_settings::set_proxy_upstream_setting`'s
//! doc comment for the live-respawn alternative and why it was
//! rejected).
//!
//! Per-user data (the backend sidecar's `cards.db` and JWT signing-key
//! file) lives under Tauri's resolved app-data directory, which on Linux
//! follows XDG (`$XDG_DATA_HOME/lengyue`, falling back to
//! `~/.local/share/lengyue` — see `tauri.conf.json`'s `identifier`).
//! The repository's sample database is never bundled or copied here —
//! see the dispatch report's "Sample database" section for the
//! opt-in import path a user follows if they want it. The proxy sidecar
//! has no per-user persistent data of its own (its replay cache is
//! in-memory only, per `sproxy_config.py`).
//!
//! License: Public Domain (The Unlicense)

mod proxy_settings;

use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Holds a spawned sidecar's child-process handle so the app-exit
/// handler can kill it. `None` before spawn and after a successful kill
/// (or if spawn itself failed — see the `setup` hook's error handling).
/// Generic over a phantom marker so the backend and proxy handles are
/// distinct `tauri::State` entries rather than one shared slot two
/// unrelated lifecycles would have to coordinate over.
struct SidecarHandle(Mutex<Option<CommandChild>>);

/// Distinguishes the proxy sidecar's managed state from the backend's
/// (both are a bare `SidecarHandle`; Tauri's `state::<T>()` is keyed by
/// type, so two call-sites needing two independent handles need two
/// distinct types, not two instances of the same one).
struct ProxySidecarHandle(Mutex<Option<CommandChild>>);

/// Bind an ephemeral TCP listener on 127.0.0.1 to let the OS assign a
/// free port, read it back, then drop the listener so the sidecar can
/// bind it in turn.
///
/// This has an inherent (documented, accepted) TOCTOU race: another
/// process could claim the port in the gap between `drop(listener)` and
/// the sidecar's own `bind()`. This is the standard "ask the OS for a
/// free port" idiom and the race window is a handful of milliseconds;
/// a hard collision here is rare enough that v1 accepts it rather than
/// adding a port-negotiation protocol. If it is ever observed in
/// practice, the fix is a bounded retry around the whole spawn+poll
/// sequence, not a different port-selection mechanism.
fn pick_free_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

/// Poll `http://127.0.0.1:{port}/health` until it answers 2xx or the
/// attempt budget is exhausted. Condition-based backoff (bounded
/// exponential, capped) — never a fixed sleep before assuming
/// readiness, per the charter's "no fixed sleeps" instruction. Runs on
/// a blocking thread (via `spawn_blocking` at the call site) since
/// `ureq` is a synchronous HTTP client.
fn wait_for_health(port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}/health");
    let mut delay = Duration::from_millis(50);
    let max_delay = Duration::from_millis(800);
    let deadline = std::time::Instant::now() + Duration::from_secs(20);

    loop {
        match ureq::get(&url).timeout(Duration::from_secs(2)).call() {
            Ok(resp) if resp.status() == 200 => return Ok(()),
            _ => {
                if std::time::Instant::now() >= deadline {
                    return Err(format!(
                        "sidecar backend did not become healthy at {url} within the boot deadline"
                    ));
                }
                std::thread::sleep(delay);
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}

/// Poll a bare TCP connect to `127.0.0.1:{port}` until it succeeds or the
/// attempt budget is exhausted. The proxy sidecar (KataProxy) speaks raw
/// WebSocket only — no HTTP `/health` surface to poll the way
/// `wait_for_health` does for the backend — so "the OS-level listen
/// socket accepts a connection" is the readiness signal: it proves the
/// process bound the port and `asyncio`'s event loop is running the
/// `websockets.serve` accept loop, without the desktop shell needing to
/// speak the KataGo analysis protocol itself just to check liveness.
/// Same bounded-exponential-backoff shape as `wait_for_health` — no
/// fixed sleep.
fn wait_for_tcp_accept(port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{port}");
    let mut delay = Duration::from_millis(50);
    let max_delay = Duration::from_millis(800);
    let deadline = std::time::Instant::now() + Duration::from_secs(20);

    loop {
        match TcpStream::connect(&addr) {
            Ok(_stream) => return Ok(()),
            Err(_) => {
                if std::time::Instant::now() >= deadline {
                    return Err(format!(
                        "proxy sidecar did not accept a TCP connection at {addr} within the boot deadline"
                    ));
                }
                std::thread::sleep(delay);
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .manage(ProxySidecarHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            proxy_settings::get_proxy_upstream_setting,
            proxy_settings::set_proxy_upstream_setting,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Per-user XDG data dir (see module docs). Created eagerly so
            // both the secret-key file and the sqlite file's parent exist
            // before the sidecar tries to write them.
            let data_dir = handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("could not resolve app data dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("could not create app data dir {data_dir:?}: {e}"))?;

            let db_path = data_dir.join("cards.db");
            let secret_key_path = data_dir.join(".jwt_secret");
            let database_uri = format!("sqlite+aiosqlite:///{}", db_path.display());

            let port = pick_free_port().map_err(|e| format!("could not pick a free port: {e}"))?;

            let (mut rx, child) = handle
                .shell()
                .sidecar("lengyue-backend")
                .map_err(|e| format!("sidecar binary not found/declared: {e}"))?
                .env("DATABASE_URI", &database_uri)
                .env("SECRET_KEY_FILE", secret_key_path.display().to_string())
                .env("HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .spawn()
                .map_err(|e| format!("failed to spawn backend sidecar: {e}"))?;

            *app.state::<SidecarHandle>().0.lock().unwrap() = Some(child);

            // Forward sidecar stdout/stderr into the desktop shell's own
            // log stream so a boot failure is visible without attaching a
            // debugger to the child process (ADR-0002, fail loudly).
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[backend] sidecar error: {err}");
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[backend] sidecar exited: {payload:?}");
                        }
                        _ => {}
                    }
                }
            });

            // Block the setup hook (on a blocking thread — setup itself
            // is sync) until the sidecar answers /health, so the window
            // we build below never navigates to a SPA that would race the
            // backend on its first request.
            tauri::async_runtime::block_on(async move {
                tauri::async_runtime::spawn_blocking(move || wait_for_health(port))
                    .await
                    .map_err(|e| format!("readiness poll task panicked: {e}"))?
            })?;

            // --- Proxy sidecar (KataProxy, RELAY role) ---
            //
            // The upstream analysis engine's WebSocket URL. Resolved via
            // `proxy_settings::resolve_effective_upstream` — precedence
            // `ENGINE_WS_URL` env var > the in-app-settable stored value
            // (`proxy_settings.rs`'s JSON file in the app-data dir) >
            // `proxy_settings::DEFAULT_PROXY_UPSTREAM`. The stored value
            // is read directly from disk here rather than via IPC/invoke
            // because the `setup` hook runs BEFORE any window or webview
            // exists — there is no round-trip available yet to ask the
            // SPA; reading the same JSON file `get_proxy_upstream_setting`
            // reads later keeps this a single source of truth rather than
            // two. Read-only here: a setting saved mid-session via
            // `set_proxy_upstream_setting` takes effect on the NEXT
            // launch, not this one (see that command's doc comment for
            // why a live respawn was rejected).
            let (proxy_upstream, _stored, _env_override_active) =
                proxy_settings::resolve_effective_upstream(&handle)?;

            let proxy_port =
                pick_free_port().map_err(|e| format!("could not pick a free port for the proxy sidecar: {e}"))?;

            let (mut proxy_rx, proxy_child) = handle
                .shell()
                .sidecar("lengyue-proxy")
                .map_err(|e| format!("proxy sidecar binary not found/declared: {e}"))?
                .env("PROXY_ROLE", "RELAY")
                .env("PROXY_HOST", "127.0.0.1")
                .env("PROXY_PORT", proxy_port.to_string())
                .env("UPSTREAM_URLS", &proxy_upstream)
                // Commission-required default (ledger rows 820/822):
                // 8192-entry replay cache. KataProxy's own hard default
                // (`proxy/sproxy_config.py`) is 1024; this env var is the
                // only way to raise it, per that module's documented
                // env-var precedence.
                .env("PROXY_HUB_CACHE_MAX", "8192")
                // Not required for transposition to be enabled (that's
                // purely "is go_transposition importable", decided at
                // freeze time — see packaging/lengyue-proxy.spec) but
                // advertising capabilities costs nothing and lets a
                // capability-aware SPA feature-detect instead of
                // assuming.
                .env("PROXY_ADVERTISE_CAPABILITIES", "true")
                .spawn()
                .map_err(|e| format!("failed to spawn proxy sidecar: {e}"))?;

            *app.state::<ProxySidecarHandle>().0.lock().unwrap() = Some(proxy_child);

            // Same forwarding posture as the backend sidecar (ADR-0002,
            // fail loudly): a `[proxy]`-prefixed line per event, so a
            // startup or upstream-connect failure (e.g. the log line
            // KataProxy emits when the resolved upstream points nowhere
            // reachable) is visible without attaching a debugger.
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = proxy_rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[proxy] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[proxy] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[proxy] sidecar error: {err}");
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[proxy] sidecar exited: {payload:?}");
                        }
                        _ => {}
                    }
                }
            });

            // See `wait_for_tcp_accept`'s doc comment for why this is a
            // bare TCP-connect poll rather than an HTTP health check.
            tauri::async_runtime::block_on(async move {
                tauri::async_runtime::spawn_blocking(move || wait_for_tcp_accept(proxy_port))
                    .await
                    .map_err(|e| format!("proxy readiness poll task panicked: {e}"))?
            })?;

            // The ports are injected as globals BEFORE any frontend script
            // runs (Tauri guarantees initialization scripts execute prior
            // to page scripts on every navigation), so
            // `frontend/src/config/env.ts` can read them synchronously at
            // module-evaluation time. This is why the window is built
            // programmatically here rather than declared statically in
            // `tauri.conf.json`'s `app.windows` — the ports are only known
            // once each sidecar has actually bound its own.
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title("LengYue")
                .inner_size(1280.0, 860.0)
                .initialization_script(&format!(
                    "window.__LENGYUE_BACKEND_PORT__ = {port}; window.__LENGYUE_PROXY_PORT__ = {proxy_port};"
                ))
                .build()
                .map_err(|e| format!("failed to build main window: {e}"))?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the LengYue tauri application")
        .run(|app_handle, event| {
            // Kill both sidecars on app exit so neither survives the
            // window closing. `RunEvent::Exit` fires once, after every
            // window has closed and the event loop is about to end — the
            // correct single place to tear both children down (as opposed
            // to per-window `CloseRequested`, which would fire once per
            // window and race a multi-window future).
            //
            // Orphan-process caveat — same as the backend sidecar,
            // documented rather than fixed (parity, not a regression):
            // this handles every normal exit (window closed, app quit).
            // It does NOT protect against the parent process itself being
            // `SIGKILL`ed (e.g. `kill -9`, an OOM-kill of the desktop
            // shell) — in that case BOTH child sidecars would survive as
            // orphans, same as any parent/child process pair on any
            // platform. No process-group / `prctl(PR_SET_PDEATHSIG)`-style
            // hardening was added for either sidecar.
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<SidecarHandle>().0.lock().unwrap().take() {
                    if let Err(e) = child.kill() {
                        eprintln!("[backend] failed to kill sidecar on exit: {e}");
                    } else {
                        println!("[backend] sidecar killed on exit");
                    }
                }
                if let Some(child) = app_handle
                    .state::<ProxySidecarHandle>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    if let Err(e) = child.kill() {
                        eprintln!("[proxy] failed to kill sidecar on exit: {e}");
                    } else {
                        println!("[proxy] sidecar killed on exit");
                    }
                }
            }
        });
}
