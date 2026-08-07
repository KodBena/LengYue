//! src-tauri/src/lib.rs — LengYue desktop shell.
//!
//! Owns the backend-sidecar lifecycle: pick a free local port, spawn the
//! frozen FastAPI backend (a PyInstaller executable declared as a Tauri
//! `externalBin` sidecar — see `tauri.conf.json`'s `bundle.externalBin`
//! and `capabilities/default.json`'s shell-execute scope), poll its
//! `/health` endpoint with backoff until it answers, hand the resolved
//! port to the webview via an `initialization_script` global
//! (`window.__LENGYUE_BACKEND_PORT__`, read once at import time by
//! `frontend/src/config/env.ts`), and kill the child process on app
//! exit so no backend process survives the window closing.
//!
//! Per-user data (the sidecar's `cards.db` and JWT signing-key file)
//! lives under Tauri's resolved app-data directory, which on Linux
//! follows XDG (`$XDG_DATA_HOME/lengyue`, falling back to
//! `~/.local/share/lengyue` — see `tauri.conf.json`'s `identifier`).
//! The repository's sample database is never bundled or copied here —
//! see the dispatch report's "Sample database" section for the
//! opt-in import path a user follows if they want it.
//!
//! License: Public Domain (The Unlicense)

use std::net::TcpListener;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Holds the spawned sidecar's child-process handle so the app-exit
/// handler can kill it. `None` before spawn and after a successful kill
/// (or if spawn itself failed — see the `setup` hook's error handling).
struct SidecarHandle(Mutex<Option<CommandChild>>);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(Mutex::new(None)))
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

            // The port is injected as a global BEFORE any frontend script
            // runs (Tauri guarantees initialization scripts execute prior
            // to page scripts on every navigation), so
            // `frontend/src/config/env.ts` can read it synchronously at
            // module-evaluation time. This is why the window is built
            // programmatically here rather than declared statically in
            // `tauri.conf.json`'s `app.windows` — the port is only known
            // once the sidecar has actually bound it.
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title("LengYue")
                .inner_size(1280.0, 860.0)
                .initialization_script(&format!(
                    "window.__LENGYUE_BACKEND_PORT__ = {port};"
                ))
                .build()
                .map_err(|e| format!("failed to build main window: {e}"))?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the LengYue tauri application")
        .run(|app_handle, event| {
            // Kill the sidecar on app exit so no orphan backend process
            // survives the window closing. `RunEvent::Exit` fires once,
            // after every window has closed and the event loop is about
            // to end — the correct single place to tear the child down
            // (as opposed to per-window `CloseRequested`, which would
            // fire once per window and race a multi-window future).
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<SidecarHandle>().0.lock().unwrap().take() {
                    if let Err(e) = child.kill() {
                        eprintln!("[backend] failed to kill sidecar on exit: {e}");
                    } else {
                        println!("[backend] sidecar killed on exit");
                    }
                }
            }
        });
}
