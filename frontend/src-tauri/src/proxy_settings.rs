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
//! **Precedence for DISPLAY (env > stored > default), exactly one home
//! per fact:** `ENGINE_WS_URL` (an OS env var, power-user escape hatch —
//! the SAME name Docker's compose-level operator-facing upstream knob
//! already uses, per the commissioner's port-coherence ruling; NOT
//! `LENGYUE_PROXY_UPSTREAM`, an earlier ad-hoc name this delivery
//! retires) takes precedence over the stored setting below, which takes
//! precedence over [`DEFAULT_PROXY_UPSTREAM`]. [`resolve_with_stored`]
//! is the SOLE place this precedence is decided; [`resolve_effective_upstream`]
//! (the DISPLAY entry point) calls it directly.
//!
//! **Precedence for LAUNCH (env > stored > mDNS-if-exactly-one > default,
//! ledger row 944):** [`resolve_effective_upstream_for_launch`] extends
//! the display chain with ONE more step, inserted between "stored" and
//! "default" — a bounded mDNS/DNS-SD browse (`mdns_discovery.rs`) for a
//! relay advertising `_katago-ws._tcp.local.`, but ONLY when it would
//! actually matter (`should_attempt_mdns_discovery` — no env var and no
//! stored value, since either would already decide the outcome and the
//! browse would just cost up to `mdns_discovery::DEFAULT_TIMEOUT_MS` of
//! launch latency for nothing). Zero or multiple answers both fall
//! through to the default: ambiguity resolves only where a human can
//! choose (the contract's own words), so headless launch never silently
//! picks one of several candidates. [`resolve_launch_chain`] is the SOLE
//! place this order is decided, mirroring [`resolve_with_stored`]'s role
//! for the display chain — kept as a SEPARATE function rather than
//! folded into [`resolve_with_stored`] because the display path
//! (`get_proxy_upstream_setting`, called after the webview is already up)
//! has no reason to pay a bounded-browse latency cost just to report what
//! is already in effect; only the launch path's "nothing else decided it
//! yet" question needs mDNS's answer at all.
//!
//! **Two entry points, one failure posture apiece.**
//! [`resolve_effective_upstream`] is FALLIBLE — used by
//! `get_proxy_upstream_setting`, after the webview is up, where an `Err`
//! (e.g. a corrupted settings file) is a normal rejected `invoke` the SPA
//! already handles (`useProxyUpstreamSetting.ts`'s `load()` catches it).
//! [`resolve_effective_upstream_for_launch`] is INFALLIBLE — used by
//! `setup()` (`lib.rs`, before any window/webview exists) to compute the
//! string handed to the proxy sidecar's `UPSTREAM_URLS`. A corrupted
//! settings file must NEVER prevent the app from launching (ADR-0002
//! "loud, not fatal" — the commission's own words: a bad settings file
//! is a recoverable degrade, not a startup abort); this entry point logs
//! the read failure loudly to the desktop shell's log stream and
//! degrades to treating the stored value as absent, falling through to
//! `ENGINE_WS_URL` or [`DEFAULT_PROXY_UPSTREAM`] exactly as it would for
//! a fresh install with nothing saved yet. A prior revision of this
//! module had `setup()` call the fallible entry point with a bare `?`,
//! which turned a corrupted `proxy-settings.json` into a panic in
//! `.build().expect(...)` — the WHOLE APP failing to open a window over
//! a recoverable settings-file problem (fresh-context review finding,
//! blocker 1). Fixed by giving `setup()` its own non-panicking entry
//! point instead of reusing the display-path one.
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
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::mdns_discovery::{self, DiscoveredUpstream};

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

/// Parse the settings file's raw JSON text into the stored value. A pure
/// function (no filesystem, no `AppHandle`) so it — and the corrupted-
/// content failure mode specifically — is directly unit-testable without
/// standing up a Tauri app; see the `tests` module at the bottom of this
/// file.
fn parse_stored_upstream(raw: &str) -> Result<Option<String>, String> {
    let parsed: StoredProxySettings =
        serde_json::from_str(raw).map_err(|e| format!("proxy settings file is corrupt: {e}"))?;
    Ok(parsed.proxy_upstream)
}

/// Read the persisted upstream value from disk. `Ok(None)` means "no
/// file yet, or a file with no value set" — the expected first-run
/// state, not an error. A file that EXISTS but fails to parse as JSON
/// (a corrupted write, a hand-edit gone wrong) is a loud `Err` (ADR-0002):
/// silently treating corrupt state as "unset" would mask data loss the
/// user should know about. Callers choose separately whether that `Err`
/// is fatal to them — see the module doc comment's "two entry points"
/// section; this function itself never decides that.
fn read_stored_upstream(app: &AppHandle) -> Result<Option<String>, String> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("could not read {path:?}: {e}"))?;
    parse_stored_upstream(&raw).map_err(|e| format!("{path:?}: {e}"))
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

/// The SOLE decision point for the `ENGINE_WS_URL` env var > stored
/// setting > [`DEFAULT_PROXY_UPSTREAM`] precedence, given an ALREADY-
/// RESOLVED `stored` value (the caller decides how — or whether — it
/// could be read; see the two entry points below). Pure (no I/O), so
/// directly unit-testable. Returns `(effective, stored, env_override_active)`.
fn resolve_with_stored(stored: Option<String>) -> (String, Option<String>, bool) {
    if let Ok(env_val) = std::env::var(ENGINE_WS_URL_ENV_VAR) {
        return (env_val, stored, true);
    }
    let effective = stored.clone().unwrap_or_else(|| DEFAULT_PROXY_UPSTREAM.to_string());
    (effective, stored, false)
}

/// Resolve the CURRENTLY-effective upstream and its provenance for
/// DISPLAY (the `get_proxy_upstream_setting` command, called after the
/// webview is up). FALLIBLE: a corrupted settings file is a loud `Err`
/// the SPA's `invoke` call rejects on — appropriate here because the
/// caller has a UI to show the failure in and a retry path (fix the
/// file, or just save a new value, which overwrites it).
pub fn resolve_effective_upstream(app: &AppHandle) -> Result<(String, Option<String>, bool), String> {
    let stored = read_stored_upstream(app)?;
    Ok(resolve_with_stored(stored))
}

/// Bounded mDNS browse window the launch-time chain uses when it decides
/// to browse at all (see [`should_attempt_mdns_discovery`]). Same value
/// as `mdns_discovery::DEFAULT_TIMEOUT_MS` — the `discover_upstreams`
/// command's own default — so a headless launch and an explicit
/// SPA-triggered discovery wait the same length unless a caller of the
/// command overrides it; a named constant here (rather than importing the
/// mdns_discovery one directly at the call site) keeps this module's own
/// "how long" decision visible in its own diff if the two are ever meant
/// to diverge.
const LAUNCH_MDNS_TIMEOUT_MS: u32 = mdns_discovery::DEFAULT_TIMEOUT_MS;

/// Whether the launch-time chain should bother running a bounded mDNS
/// browse before falling through to [`DEFAULT_PROXY_UPSTREAM`]. Pure
/// (aside from the same `std::env::var` read [`resolve_with_stored`]
/// already treats as in-bounds for a "pure" function in this module —
/// see that function's doc comment and its tests' `EnvVarGuard`).
/// Skipping the browse whenever `ENGINE_WS_URL` is set or a stored value
/// exists isn't just an optimization: [`resolve_launch_chain`] would
/// ignore the discovery result in either case anyway, so running it would
/// only cost launch latency (up to [`LAUNCH_MDNS_TIMEOUT_MS`]) for an
/// answer nothing downstream reads.
fn should_attempt_mdns_discovery(stored: &Option<String>) -> bool {
    std::env::var(ENGINE_WS_URL_ENV_VAR).is_err() && stored.is_none()
}

/// The SOLE decision point for the LAUNCH-time chain: `ENGINE_WS_URL` env
/// var > stored setting > mDNS-if-EXACTLY-ONE-found >
/// [`DEFAULT_PROXY_UPSTREAM`]. Pure given `discovered` — this function
/// never touches the network itself; the caller ([`resolve_effective_upstream_for_launch`])
/// already ran (or, per [`should_attempt_mdns_discovery`], chose not to
/// run) the bounded browse before calling in. Returns `(effective,
/// stored, env_override_active, mdns_instance_chosen)` — the fourth
/// element is `Some(instance_name)` only when the mDNS step is what
/// decided `effective`, so the launch log line (and any future UI) can
/// say WHICH discovered instance was chosen without re-deriving that fact
/// from `effective` alone.
///
/// Multiple mDNS answers is deliberately NOT "pick the first": ambiguity
/// resolves only where a human can choose (the contract's own words for
/// this delivery) — a headless launch with 2+ candidates and nothing else
/// configured falls through to the default exactly like zero candidates
/// would, same as it always has.
fn resolve_launch_chain(
    stored: Option<String>,
    discovered: &[DiscoveredUpstream],
) -> (String, Option<String>, bool, Option<String>) {
    if let Ok(env_val) = std::env::var(ENGINE_WS_URL_ENV_VAR) {
        return (env_val, stored, true, None);
    }
    if let Some(value) = stored.clone() {
        return (value, stored, false, None);
    }
    if let [only] = discovered {
        eprintln!(
            "[proxy-settings] mDNS found exactly one {:?} instance ({:?} at {:?}); using it \
             as this launch's upstream (no ENGINE_WS_URL and no stored setting took precedence)",
            mdns_discovery::SERVICE_TYPE,
            only.instance_name,
            only.url
        );
        return (only.url.clone(), stored, false, Some(only.instance_name.clone()));
    }
    if discovered.len() > 1 {
        eprintln!(
            "[proxy-settings] mDNS found {} {:?} instances; ambiguous choice, falling back to \
             the default ({DEFAULT_PROXY_UPSTREAM}) rather than silently picking one",
            discovered.len(),
            mdns_discovery::SERVICE_TYPE,
        );
    }
    (DEFAULT_PROXY_UPSTREAM.to_string(), stored, false, None)
}

/// Resolve the upstream to hand the proxy sidecar at SPAWN time
/// (`setup()`, `lib.rs` — before any window/webview exists), per the
/// LAUNCH chain (env > stored > mDNS-if-exactly-one > default; see the
/// module doc comment). INFALLIBLE by construction: a settings-file
/// read/parse failure degrades to treating the stored value as absent
/// (logged loudly to the desktop shell's own log stream) rather than
/// propagating an `Err` a caller might `?`-abort launch with — see the
/// module doc comment's "two entry points" section for why this is a
/// SEPARATE function from [`resolve_effective_upstream`] rather than that
/// function reused with its `Err` swallowed at the call site (the failure
/// posture is a property of WHICH caller this is, not an afterthought at
/// the use site — a future second launch-time caller gets the safe
/// behavior by construction, not by remembering to handle the `Err`
/// correctly). The mDNS browse itself is likewise infallible by
/// construction — see `mdns_discovery::discover_upstreams_blocking`'s doc
/// comment — so this function has no new failure mode to degrade from;
/// mDNS being entirely unavailable on the host converges on the same
/// "treat discovery as empty" outcome as it finding nothing.
pub fn resolve_effective_upstream_for_launch(app: &AppHandle) -> (String, Option<String>, bool, Option<String>) {
    let stored = match read_stored_upstream(app) {
        Ok(stored) => stored,
        Err(e) => {
            eprintln!(
                "[proxy-settings] could not read the stored upstream setting ({e}); \
                 launching with it treated as unset (ENGINE_WS_URL env var, mDNS \
                 discovery, or the default still apply) rather than aborting startup"
            );
            None
        }
    };

    let discovered = if should_attempt_mdns_discovery(&stored) {
        mdns_discovery::discover_upstreams_blocking(Duration::from_millis(u64::from(LAUNCH_MDNS_TIMEOUT_MS)))
    } else {
        Vec::new()
    };

    resolve_launch_chain(stored, &discovered)
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

#[cfg(test)]
mod tests {
    //! Targets the pure logic (`parse_stored_upstream`, `resolve_with_stored`,
    //! and the launch-time degrade behavior) that does NOT need an
    //! `AppHandle` — the bug this file's `for_launch` split fixes (blocker
    //! 1 of the fresh-context review: a corrupted settings file panicking
    //! the whole app via `setup()`'s bare `?`) lives entirely in this
    //! layer, not in the filesystem/`AppHandle` plumbing `read_stored_upstream`
    //! and `settings_file_path` own. Exercising THIS layer directly is
    //! both the feasible and the targeted test — a full `AppHandle`-backed
    //! integration test would additionally require Tauri's mock-app test
    //! harness (a heavier, separate follow-up if the maintainer wants an
    //! end-to-end-through-the-filesystem regression guard too).
    //!
    //! `std::env::var` is PROCESS-GLOBAL state, so any test touching
    //! `ENGINE_WS_URL` must not run concurrently with another that does —
    //! `ENV_LOCK` below serializes exactly that subset; tests that never
    //! touch the env var don't need it.

    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// RAII guard: sets `ENGINE_WS_URL` for the test body, always removes
    /// it on drop (including on panic/assertion failure) so one test's
    /// env mutation can never leak into the next.
    struct EnvVarGuard<'a> {
        _lock: std::sync::MutexGuard<'a, ()>,
    }
    impl<'a> EnvVarGuard<'a> {
        fn set(value: &str) -> Self {
            let lock = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
            // SAFETY: serialized by ENV_LOCK above — no other test thread
            // observes or mutates ENGINE_WS_URL while this guard is alive.
            unsafe { std::env::set_var(ENGINE_WS_URL_ENV_VAR, value) };
            EnvVarGuard { _lock: lock }
        }
        fn unset() -> Self {
            let lock = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
            unsafe { std::env::remove_var(ENGINE_WS_URL_ENV_VAR) };
            EnvVarGuard { _lock: lock }
        }
    }
    impl Drop for EnvVarGuard<'_> {
        fn drop(&mut self) {
            unsafe { std::env::remove_var(ENGINE_WS_URL_ENV_VAR) };
        }
    }

    // ---- parse_stored_upstream: the corrupted-content case at the heart of blocker 1 ----

    #[test]
    fn parse_stored_upstream_rejects_corrupt_json_loudly() {
        let result = parse_stored_upstream("{ this is not valid json");
        assert!(result.is_err(), "corrupt JSON must be a loud Err, never silently treated as unset");
    }

    #[test]
    fn parse_stored_upstream_accepts_a_well_formed_file() {
        let result = parse_stored_upstream(r#"{"proxyUpstream":"ws://example.test:1242"}"#);
        assert_eq!(result, Ok(Some("ws://example.test:1242".to_string())));
    }

    #[test]
    fn parse_stored_upstream_accepts_an_empty_object_as_unset() {
        let result = parse_stored_upstream("{}");
        assert_eq!(result, Ok(None));
    }

    // ---- resolve_with_stored: the sole precedence decision point ----

    #[test]
    fn resolve_with_stored_prefers_env_var_over_stored() {
        let _guard = EnvVarGuard::set("ws://env-wins.test:1");
        let (effective, stored, env_active) = resolve_with_stored(Some("ws://stored.test:2".to_string()));
        assert_eq!(effective, "ws://env-wins.test:1");
        assert_eq!(stored, Some("ws://stored.test:2".to_string()));
        assert!(env_active);
    }

    #[test]
    fn resolve_with_stored_prefers_stored_over_default_when_env_unset() {
        let _guard = EnvVarGuard::unset();
        let (effective, stored, env_active) = resolve_with_stored(Some("ws://stored.test:2".to_string()));
        assert_eq!(effective, "ws://stored.test:2");
        assert_eq!(stored, Some("ws://stored.test:2".to_string()));
        assert!(!env_active);
    }

    #[test]
    fn resolve_with_stored_falls_back_to_default_when_neither_env_nor_stored() {
        let _guard = EnvVarGuard::unset();
        let (effective, stored, env_active) = resolve_with_stored(None);
        assert_eq!(effective, DEFAULT_PROXY_UPSTREAM);
        assert_eq!(stored, None);
        assert!(!env_active);
    }

    // ---- resolve_launch_chain / should_attempt_mdns_discovery: the launch-time chain (ledger row 944) ----

    fn discovered_one(url: &str, instance_name: &str) -> Vec<DiscoveredUpstream> {
        vec![DiscoveredUpstream {
            url: url.to_string(),
            instance_name: instance_name.to_string(),
        }]
    }

    #[test]
    fn resolve_launch_chain_prefers_env_over_everything() {
        let _guard = EnvVarGuard::set("ws://env-wins.test:1");
        let discovered = discovered_one("ws://mdns.test:2", "some-box");
        let (effective, stored, env_active, mdns_used) = resolve_launch_chain(
            Some("ws://stored.test:3".to_string()),
            &discovered,
        );
        assert_eq!(effective, "ws://env-wins.test:1");
        assert_eq!(stored, Some("ws://stored.test:3".to_string()));
        assert!(env_active);
        assert_eq!(mdns_used, None);
    }

    #[test]
    fn resolve_launch_chain_prefers_stored_over_mdns() {
        let _guard = EnvVarGuard::unset();
        let discovered = discovered_one("ws://mdns.test:2", "some-box");
        let (effective, stored, env_active, mdns_used) =
            resolve_launch_chain(Some("ws://stored.test:3".to_string()), &discovered);
        assert_eq!(effective, "ws://stored.test:3");
        assert_eq!(stored, Some("ws://stored.test:3".to_string()));
        assert!(!env_active);
        assert_eq!(mdns_used, None);
    }

    #[test]
    fn resolve_launch_chain_uses_the_single_mdns_answer_when_nothing_else_is_set() {
        let _guard = EnvVarGuard::unset();
        let discovered = discovered_one("ws://192.168.1.50:1242", "office-gpu-box");
        let (effective, stored, env_active, mdns_used) = resolve_launch_chain(None, &discovered);
        assert_eq!(effective, "ws://192.168.1.50:1242");
        assert_eq!(stored, None);
        assert!(!env_active);
        assert_eq!(mdns_used, Some("office-gpu-box".to_string()));
    }

    #[test]
    fn resolve_launch_chain_falls_back_to_default_on_zero_mdns_answers() {
        let _guard = EnvVarGuard::unset();
        let (effective, stored, env_active, mdns_used) = resolve_launch_chain(None, &[]);
        assert_eq!(effective, DEFAULT_PROXY_UPSTREAM);
        assert_eq!(stored, None);
        assert!(!env_active);
        assert_eq!(mdns_used, None);
    }

    #[test]
    fn resolve_launch_chain_falls_back_to_default_on_ambiguous_multiple_mdns_answers() {
        // Ambiguity resolves only where a human can choose (contract
        // point 2) — a headless launch must never silently pick one of
        // several candidates.
        let _guard = EnvVarGuard::unset();
        let discovered = vec![
            DiscoveredUpstream {
                url: "ws://box-a.test:1242".to_string(),
                instance_name: "box-a".to_string(),
            },
            DiscoveredUpstream {
                url: "ws://box-b.test:1242".to_string(),
                instance_name: "box-b".to_string(),
            },
        ];
        let (effective, stored, env_active, mdns_used) = resolve_launch_chain(None, &discovered);
        assert_eq!(effective, DEFAULT_PROXY_UPSTREAM);
        assert_eq!(stored, None);
        assert!(!env_active);
        assert_eq!(mdns_used, None);
    }

    #[test]
    fn should_attempt_mdns_discovery_is_false_when_env_is_set() {
        let _guard = EnvVarGuard::set("ws://env.test:1");
        assert!(!should_attempt_mdns_discovery(&None));
        assert!(!should_attempt_mdns_discovery(&Some("ws://stored.test:2".to_string())));
    }

    #[test]
    fn should_attempt_mdns_discovery_is_false_when_stored_is_present() {
        let _guard = EnvVarGuard::unset();
        assert!(!should_attempt_mdns_discovery(&Some("ws://stored.test:2".to_string())));
    }

    #[test]
    fn should_attempt_mdns_discovery_is_true_when_neither_env_nor_stored_present() {
        let _guard = EnvVarGuard::unset();
        assert!(should_attempt_mdns_discovery(&None));
    }

    // ---- The blocker-1 regression itself: launch-time degrade on a corrupted file ----

    #[test]
    fn launch_time_degrade_on_corrupt_read_falls_through_to_default() {
        // Simulates what `resolve_effective_upstream_for_launch` does on a
        // `read_stored_upstream` `Err` (a corrupted proxy-settings.json):
        // treat `stored` as absent rather than propagating the error —
        // this is the exact fallthrough path that used to be skipped
        // entirely because `setup()` `?`-aborted before reaching it.
        let _guard = EnvVarGuard::unset();
        let simulated_corrupt_read: Result<Option<String>, String> =
            Err("proxy settings file is corrupt: ...".to_string());
        let (effective, stored, env_active) = match simulated_corrupt_read {
            Ok(s) => resolve_with_stored(s),
            Err(_) => resolve_with_stored(None),
        };
        assert_eq!(effective, DEFAULT_PROXY_UPSTREAM, "must degrade to the default, never abort");
        assert_eq!(stored, None);
        assert!(!env_active);
    }

    #[test]
    fn launch_time_degrade_on_corrupt_read_still_honors_env_override() {
        let _guard = EnvVarGuard::set("ws://still-honored.test:9");
        let simulated_corrupt_read: Result<Option<String>, String> = Err("corrupt".to_string());
        let (effective, _stored, env_active) = match simulated_corrupt_read {
            Ok(s) => resolve_with_stored(s),
            Err(_) => resolve_with_stored(None),
        };
        assert_eq!(effective, "ws://still-honored.test:9");
        assert!(env_active);
    }

    // ---- validate_upstream ----

    #[test]
    fn validate_upstream_rejects_empty() {
        assert!(validate_upstream("").is_err());
        assert!(validate_upstream("   ").is_err());
    }

    #[test]
    fn validate_upstream_rejects_non_ws_scheme() {
        assert!(validate_upstream("http://example.test:1242").is_err());
    }

    #[test]
    fn validate_upstream_accepts_ws_and_wss() {
        assert!(validate_upstream("ws://example.test:1242").is_ok());
        assert!(validate_upstream("wss://example.test:1242").is_ok());
    }
}
