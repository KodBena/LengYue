//! src-tauri/src/proxy_settings.rs — the persisted proxy-upstream setting.
//!
//! Desktop users cannot set OS environment variables from inside the app,
//! so the upstream analysis-engine WebSocket location the bundled
//! KataProxy sidecar (`RELAY` role — see `lib.rs`'s module docs) forwards
//! to must also be settable IN-APP (ledger rows 860-862, repairing an
//! unratified deferral of commission row 820's own words: "Before setup,
//! the user will be instructed to provide a websocket location for
//! that."). This module owns the persisted home for that setting and the
//! two Tauri commands (`get_proxy_upstream_setting` /
//! `set_proxy_upstream_setting`) the SPA reads/writes it through.
//!
//! **Precedence (env > stored > default), exactly one home per fact:**
//! `ENGINE_WS_URL` (an OS env var, power-user escape hatch — the SAME
//! name Docker's compose-level operator-facing upstream knob already
//! uses, per the commissioner's port-coherence ruling; NOT
//! `LENGYUE_PROXY_UPSTREAM`, an earlier ad-hoc name this delivery
//! retires) takes precedence over the stored setting below, which takes
//! precedence over [`DEFAULT_PROXY_UPSTREAM`]. `resolve_effective_upstream`
//! is the SOLE place this precedence is decided; both the `setup()` spawn
//! path (`lib.rs`, before any webview exists) and
//! `get_proxy_upstream_setting` (for display, after the webview is up)
//! call it rather than each re-deriving the order.
//!
//! **Where the value lives on disk.** A plain JSON file
//! (`proxy-settings.json`) in Tauri's resolved app-data directory — the
//! SAME directory the backend sidecar's `cards.db` and `.jwt_secret`
//! already live in (`lib.rs`'s `setup()`). Chosen over
//! `tauri-plugin-store` (a real dependency, a permission-capability
//! surface of its own, and machinery this one string does not need) and
//! over reusing the backend's SQLite database (would couple the desktop
//! shell to the backend's schema for a value the backend has no reason
//! to know about, and the backend sidecar is not guaranteed to be up
//! when this is read at spawn time — the two sidecars are peers with no
//! ordering contract between them). A hand-rolled JSON file matches the
//! "plain JSON in the app config dir" shape the commission itself named
//! as the natural home, with zero new dependencies.
//!
//! License: Public Domain (The Unlicense)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Default upstream analysis-engine WebSocket URL when neither
/// `ENGINE_WS_URL` nor a stored setting is present — `1242` is the
/// websocket-leaf shim's own default port
/// (`backend/scripts/katago_ws_shim.py`'s `DEFAULT_PORT`), now the one
/// canonical user-facing port across the Tauri and Docker packagings
/// (commissioner port-coherence ruling, ledger row 864). A user who runs
/// the shim exactly as documented needs to change nothing.
pub const DEFAULT_PROXY_UPSTREAM: &str = "ws://127.0.0.1:1242";

/// The OS environment variable a power user can set to override the
/// upstream without touching the in-app setting. Named identically to
/// Docker's compose-level operator-facing knob (`docker-compose.yml`'s
/// `ENGINE_WS_URL`, feeding the proxy's own `UPSTREAM_URLS`) so the two
/// packagings share one vocabulary for "where's the engine" rather than
/// each minting its own name for the same fact.
const ENGINE_WS_URL_ENV_VAR: &str = "ENGINE_WS_URL";

const SETTINGS_FILE_NAME: &str = "proxy-settings.json";

#[derive(Deserialize, Serialize, Default)]
struct StoredProxySettings {
    /// `None` on a fresh install / before the user has ever saved a
    /// value from the wizard or Settings — distinct from "explicitly
    /// set to a value", so `resolve_effective_upstream` can fall through
    /// to the default rather than persisting it prematurely.
    #[serde(rename = "proxyUpstream", skip_serializing_if = "Option::is_none")]
    proxy_upstream: Option<String>,
}

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    Ok(dir.join(SETTINGS_FILE_NAME))
}

/// Read the persisted upstream value from disk. `Ok(None)` means "no
/// file yet, or a file with no value set" — the expected first-run
/// state, not an error. A file that EXISTS but fails to parse as JSON
/// (a corrupted write, a hand-edit gone wrong) is a loud `Err` (ADR-0002):
/// silently treating corrupt state as "unset" would mask data loss the
/// user should know about.
fn read_stored_upstream(app: &AppHandle) -> Result<Option<String>, String> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("could not read {path:?}: {e}"))?;
    let parsed: StoredProxySettings = serde_json::from_str(&raw)
        .map_err(|e| format!("proxy settings file {path:?} is corrupt: {e}"))?;
    Ok(parsed.proxy_upstream)
}

fn write_stored_upstream(app: &AppHandle, value: &str) -> Result<(), String> {
    let path = settings_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("could not create {parent:?}: {e}"))?;
    }
    let payload = StoredProxySettings {
        proxy_upstream: Some(value.to_string()),
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("could not serialize proxy settings: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("could not write {path:?}: {e}"))
}

/// Validate a candidate upstream URI: must be non-empty and start with
/// `ws://` or `wss://`. Mirrors the SPA's own `validateEngineUri`
/// (`frontend/src/lib/ws-url.ts`) rule-for-rule — defense in depth for
/// the one path that bypasses the SPA's own pre-invoke validation (a
/// hand-edited settings file read back, or a future second writer of
/// this command); the SPA is expected to reject invalid input before
/// ever invoking `set_proxy_upstream_setting`, so this should never fire
/// in the normal flow.
fn validate_upstream(raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("proxy upstream URI cannot be empty".to_string());
    }
    if !(trimmed.starts_with("ws://") || trimmed.starts_with("wss://")) {
        return Err(format!(
            "proxy upstream URI must start with ws:// or wss:// (got {trimmed:?})"
        ));
    }
    Ok(())
}

/// Resolve the CURRENTLY-effective upstream and its provenance, per the
/// documented precedence: `ENGINE_WS_URL` env var > stored setting >
/// [`DEFAULT_PROXY_UPSTREAM`]. The SOLE decision point for this order —
/// see the module doc comment.
///
/// Returns `(effective, stored, env_override_active)`.
pub fn resolve_effective_upstream(app: &AppHandle) -> Result<(String, Option<String>, bool), String> {
    let stored = read_stored_upstream(app)?;
    if let Ok(env_val) = std::env::var(ENGINE_WS_URL_ENV_VAR) {
        return Ok((env_val, stored, true));
    }
    let effective = stored.clone().unwrap_or_else(|| DEFAULT_PROXY_UPSTREAM.to_string());
    Ok((effective, stored, false))
}

/// Wire shape returned to the SPA — camelCase to match the rest of the
/// frontend's JSON surfaces (matches `ProxyUpstreamInfo` in
/// `frontend/src/composables/useProxyUpstreamSetting.ts`; keep the two
/// in sync by hand, same as any other invoke command's implicit wire
/// contract in this codebase — there is no shared-schema codegen for
/// Tauri commands the way `gen:api` provides for the backend).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyUpstreamInfo {
    /// What is ACTUALLY in effect right now, per precedence.
    pub effective: String,
    /// What the user has persisted via Settings/the wizard, if anything
    /// (independent of whether the env override is currently shadowing
    /// it — the UI shows both so a user with `ENGINE_WS_URL` set
    /// understands why their in-app save isn't taking visible effect).
    pub stored: Option<String>,
    /// True when `ENGINE_WS_URL` is set and is the reason `effective`
    /// isn't simply `stored ?? default`.
    pub env_override_active: bool,
    /// The zero-config fallback, surfaced so the UI can say "matches
    /// the shim's default — you don't need to change this" when it
    /// applies.
    pub default_upstream: String,
}

/// Tauri command: read the current upstream setting and its provenance.
/// Read-only — takes effect on NEXT APP LAUNCH only (see
/// `set_proxy_upstream_setting`'s doc comment for why this delivery does
/// not respawn the sidecar live); this command reports what's on disk,
/// not necessarily what the currently-running proxy sidecar was spawned
/// with if the file changed since launch.
#[tauri::command]
pub fn get_proxy_upstream_setting(app: AppHandle) -> Result<ProxyUpstreamInfo, String> {
    let (effective, stored, env_override_active) = resolve_effective_upstream(&app)?;
    Ok(ProxyUpstreamInfo {
        effective,
        stored,
        env_override_active,
        default_upstream: DEFAULT_PROXY_UPSTREAM.to_string(),
    })
}

/// Tauri command: persist a new upstream setting to disk.
///
/// **Takes effect on next launch, not live** (design decision, ledger
/// rows 860-862). Rejected alternative: a live-respawn command that
/// kills the running `ProxySidecarHandle` and re-spawns with the new
/// `UPSTREAM_URLS`. Rejected because (1) the sidecar's kill path is
/// shared with the `RunEvent::Exit` teardown handler over the SAME
/// `Mutex<Option<CommandChild>>` — a respawn racing app shutdown would
/// need its own synchronization the existing teardown path was never
/// built for, and getting that race wrong risks the exact double-proxy/
/// orphan outcome this delivery was told not to worsen; (2) even a
/// clean respawn does not, by itself, reconnect the SPA's live
/// WebSocket to the (possibly restarted) local proxy — that reconnect
/// dance already exists for the engine-URI-cell case
/// (`useEngineUriEditor.ts`'s disconnect/connect cycle) but wiring an
/// analogous cycle for a change one layer beneath the SPA's own cell
/// (an env value Rust resolved BEFORE the SPA ever saw a URI) is new
/// surface the commission does not ask for. "Restart the app" is the
/// simpler, more honest mechanism (ADR-0019 C6/C7): the UI states this
/// plainly rather than silently implying the change is already live.
#[tauri::command]
pub fn set_proxy_upstream_setting(app: AppHandle, value: String) -> Result<(), String> {
    validate_upstream(&value)?;
    write_stored_upstream(&app, value.trim())
}
