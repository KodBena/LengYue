//! src-tauri/src/mdns_discovery.rs — bounded mDNS browse for the analysis
//! engine relay (ledger row 944).
//!
//! Desktop users who run the KataProxy-compatible relay on another box on
//! the same LAN (rather than on `127.0.0.1`) currently have no way to find
//! it without typing an IP by hand. This module adds a bounded mDNS/DNS-SD
//! browse for `SERVICE_TYPE` and feeds its result into
//! `proxy_settings.rs`'s launch-time precedence chain as the step between
//! "stored setting" and "hardcoded default" — see that module's
//! `resolve_launch_chain` for the actual precedence decision, which is
//! pure and lives separately from this module's network I/O.
//!
//! **Absence is never an error.** A host with no mDNS at all (no
//! `avahi-daemon`, no Bonjour, a locked-down network that drops multicast)
//! is a normal, fully-supported configuration, not a degraded one — mDNS
//! is a convenience, never a requirement, so every failure mode in
//! [`discover_upstreams_blocking`] (daemon creation failing, the browse
//! call failing, the window elapsing with zero answers) converges on the
//! same `Vec::new()`, never a `Result::Err` or a panic (ADR-0002, "fail
//! loudly" for a REAL problem — an absent optional convenience is not
//! one).
//!
//! License: Public Domain (The Unlicense)

use std::net::IpAddr;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;

/// The mDNS/DNS-SD service type the relay advertises itself under. Chosen
/// to name the protocol it speaks (a KataGo-analysis-engine-compatible
/// WebSocket), not any particular implementation, so a future
/// non-KataProxy relay that speaks the same protocol can advertise under
/// the same type without this crate needing to change.
pub const SERVICE_TYPE: &str = "_katago-ws._tcp.local.";

/// Default bounded browse window (contract: `discover_upstreams(timeout_ms:
/// Option<u32>)`, "a bounded window (default 2000ms)"). Also the window
/// `proxy_settings::resolve_effective_upstream_for_launch` uses for its own
/// browse, so a headless launch and an explicit SPA-triggered discovery
/// wait the same length by default unless a caller overrides it.
pub const DEFAULT_TIMEOUT_MS: u32 = 2000;

/// One resolved mDNS answer, reduced to what a caller of this module
/// needs: a ready-to-dial `ws://` URL and the human-readable instance name
/// (the left-hand label of the service's fullname, e.g. `"office-gpu-box"`
/// out of `"office-gpu-box._katago-ws._tcp.local."`) so a launch-time log
/// line — or a future picker UI — can say WHICH box answered, not just
/// that one did.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredUpstream {
    pub url: String,
    pub instance_name: String,
}

/// Browse [`SERVICE_TYPE`] for `timeout` and return every resolved answer.
/// The sole imperative shell in this module — everything that decides
/// what to DO with the result (precedence against env/stored, "exactly
/// one" ambiguity handling) lives in `proxy_settings.rs` as a pure
/// function taking this Vec as a plain input, per this codebase's
/// existing pure-logic/imperative-shell split (see that module's doc
/// comment).
///
/// `mdns_sd::ServiceDaemon` spawns and owns its own background thread and
/// hands back a plain `flume::Receiver`, so this function blocks the
/// calling thread for up to `timeout` — callers on a thread that must not
/// block (e.g. a UI/event-loop thread) are expected to run this via
/// `spawn_blocking` or an equivalent, the same posture `lib.rs` already
/// uses for `wait_for_health`/`wait_for_tcp_accept`.
pub fn discover_upstreams_blocking(timeout: Duration) -> Vec<DiscoveredUpstream> {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[mdns] service daemon unavailable, treating as no discovery: {e}");
            return Vec::new();
        }
    };

    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[mdns] browse failed to start, treating as no discovery: {e}");
            let _ = daemon.shutdown();
            return Vec::new();
        }
    };

    let deadline = Instant::now() + timeout;
    let mut found = Vec::new();

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        match receiver.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(resolved)) => {
                // Prefer an IPv4 address (matches this codebase's
                // `127.0.0.1`-first posture elsewhere — `pick_free_port`,
                // the sidecar hosts — over any IPv6 literal), falling back
                // to whichever address answered if only IPv6 is present.
                let addr = resolved
                    .get_addresses_v4()
                    .into_iter()
                    .next()
                    .map(IpAddr::V4)
                    .or_else(|| resolved.get_addresses().iter().next().map(|a| a.to_ip_addr()));
                let Some(addr) = addr else {
                    // is_valid() (checked implicitly by ServiceResolved
                    // ever being emitted) guarantees at least one address
                    // in practice, but degrade rather than assume.
                    continue;
                };
                let url = format!("ws://{}:{}", format_addr(addr), resolved.get_port());
                let instance_name = resolved
                    .get_fullname()
                    .strip_suffix(&format!(".{SERVICE_TYPE}"))
                    .unwrap_or(resolved.get_fullname())
                    .to_string();
                found.push(DiscoveredUpstream { url, instance_name });
            }
            Ok(_other_event) => {
                // SearchStarted / ServiceFound / ServiceRemoved / etc —
                // not a resolved answer; keep waiting out the remaining
                // window.
            }
            Err(_timeout_or_closed) => break,
        }
    }

    // Best-effort: the browse already ran and `found` already holds every
    // answer collected within the window regardless of whether shutdown
    // itself succeeds; a failure here doesn't change what's returned.
    let _ = daemon.shutdown();

    found
}

fn format_addr(addr: IpAddr) -> String {
    match addr {
        IpAddr::V4(v4) => v4.to_string(),
        // Bracket IPv6 literals per RFC 3986 host syntax, same as any
        // other `ws://[::1]:1242`-shaped URL.
        IpAddr::V6(v6) => format!("[{v6}]"),
    }
}

/// Tauri command: browse for `timeout_ms` (default [`DEFAULT_TIMEOUT_MS`])
/// and return every resolved upstream. Callable — and expected to return
/// `[]`, never reject — on every platform and every host, mDNS-equipped or
/// not (contract point 1). A plain (non-`async fn`) command: Tauri v2
/// dispatches synchronous command handlers on its own blocking thread
/// pool, so the bounded blocking wait here never stalls the webview's
/// event loop.
#[tauri::command]
pub fn discover_upstreams(timeout_ms: Option<u32>) -> Vec<DiscoveredUpstream> {
    let timeout = Duration::from_millis(u64::from(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)));
    discover_upstreams_blocking(timeout)
}

#[cfg(test)]
mod tests {
    //! Witnesses the actual serialized wire shape (ADR-0021: witness the
    //! property, not a proxy for it) — `#[serde(rename_all = "camelCase")]`
    //! on `DiscoveredUpstream` is structural evidence that casing SHOULD
    //! come out right, not an observation that it DOES; this test asks
    //! `serde_json` to actually serialize a value and inspects the
    //! resulting keys directly.

    use super::*;

    #[test]
    fn discovered_upstream_serializes_instance_name_as_camel_case_on_the_wire() {
        let value = DiscoveredUpstream {
            url: "ws://192.168.1.50:1242".to_string(),
            instance_name: "office-gpu-box".to_string(),
        };
        let json = serde_json::to_value(&value).expect("DiscoveredUpstream must serialize");
        let obj = json.as_object().expect("must serialize to a JSON object");

        assert!(
            obj.contains_key("instanceName"),
            "wire shape must use camelCase \"instanceName\", got keys: {:?}",
            obj.keys().collect::<Vec<_>>()
        );
        assert!(
            !obj.contains_key("instance_name"),
            "wire shape must NOT leak the Rust field name \"instance_name\", got keys: {:?}",
            obj.keys().collect::<Vec<_>>()
        );
        assert!(obj.contains_key("url"), "expected an unchanged \"url\" key");
    }
}
