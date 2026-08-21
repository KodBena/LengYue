<!-- docs/deploy/avahi/README.md — how to advertise a KataGo-compatible
     WebSocket endpoint for the desktop app's mDNS autodiscovery.
     License: Public Domain (The Unlicense). -->

# Advertising an engine endpoint for desktop autodiscovery

The LengYue desktop app (Tauri) browses mDNS/DNS-SD for the service type
`_katago-ws._tcp` at launch and offers discovered endpoints in its
engine-upstream precedence chain (stored setting → discovered → default;
see `frontend/src-tauri/src/mdns_discovery.rs`). Discovery only works if
the machine running the relay (KataProxy, or the WebSocket shim)
**advertises** that service — nothing advertises it automatically.

On a Linux relay host running avahi:

1. Copy `katago-ws.service` from this directory to
   `/etc/avahi/services/katago-ws.service`.
2. Edit the `<port>` to the relay's actual listening port
   (`PROXY_PORT`; the file ships with `1235`).
3. avahi picks the file up automatically (restart with
   `systemctl restart avahi-daemon` if in doubt).

Verify from any LAN machine:

```sh
avahi-browse -r _katago-ws._tcp
```

The desktop app on the same LAN will then list the endpoint without any
typed IP. Absence of mDNS anywhere in the chain is a fully supported
configuration — this is a convenience, never a requirement.
