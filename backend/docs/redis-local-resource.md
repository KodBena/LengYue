# Local Redis resource

Two local Redis 8.6.2 daemons are provisioned on this development
machine to back the qEUBO integration's persistent-cache
requirement. Two were needed because Redis does not support
multiple TCP listeners on a single instance: the qEUBO
documentation references `127.0.0.1:6379` as its cache resource,
while the user's home environment connects to `127.0.0.1:8192` +
`/tmp/keydb.sock` (a KeyDB-compatible target preserved verbatim
from `~/keydb.conf` to avoid client reconfiguration).

## Endpoints

| Instance | TCP | Unix socket | Config | Data dir |
|---|---|---|---|---|
| qEUBO | `127.0.0.1:6379` | — | `~/redis-qeubo.conf` | `~/redis-qeubo/` |
| KeyDB-compat | `127.0.0.1:8192` | `/tmp/keydb.sock` (perm 0700) | `~/redis.conf` | `~/redis/` |

Both daemons run as `bork`, persist via RDB (save rules 900s/1,
300s/10, 60s/10000), and use `noeviction` (no `maxmemory` cap).
Each instance keeps its own RDB; the two caches do not share
state.

## Config provenance

`~/redis.conf` was ported from `~/keydb.conf` with KeyDB-specific
directives stripped (`server-threads`, `replica-weighting-factor`,
`active-client-balancing`, `proc-title-template`), the
`*-ziplist-*` directives renamed to `*-listpack-*` (Redis 7+
canonical), and the `maxmemory 4gb` + `allkeys-lru` policy
replaced with no cap + `noeviction` to honour the
persistent-cache-without-eviction intent. The original
`~/keydb.conf` references `/mnt/n4/home/bork/KeyDB/` for runtime
state; that path does not exist on this box, so runtime files
were relocated to `~/redis/`.

`~/redis-qeubo.conf` is a sibling derived from `~/redis.conf` with
three deltas: port `8192` → `6379`, the `unixsocket` /
`unixsocketperm` directives dropped (the KeyDB-compat instance
owns `/tmp/keydb.sock`), and pidfile / logfile / dir relocated
under `~/redis-qeubo/`.

## Restarting after a reboot or crash

Each instance is started independently. If
`redis-cli -p 6379 ping` does not return `PONG`:

```bash
/sbin/redis-server ~/redis-qeubo.conf
```

If `redis-cli -p 8192 ping` does not return `PONG`:

```bash
/sbin/redis-server ~/redis.conf
```

On OpenSUSE, `redis-server` lives in `/sbin/` and is not on the
default user PATH; the absolute path is required. Both configs
declare `daemonize yes`, so each command returns immediately.

Verify:

```bash
redis-cli -p 6379 ping              # PONG  (qEUBO)
redis-cli -p 8192 ping              # PONG  (KeyDB-compat)
redis-cli -s /tmp/keydb.sock ping   # PONG  (KeyDB-compat socket)
```

## Stopping

```bash
redis-cli -p 6379 shutdown    # qEUBO
redis-cli -p 8192 shutdown    # KeyDB-compat
```

The `save` rules cause an RDB write on graceful shutdown so
cached state survives. As a fallback:
`kill $(cat ~/redis-qeubo/redis.pid)` or
`kill $(cat ~/redis/redis.pid)`.

## Posture

These resources are local to the development machine. They are
not checked into the repo and not part of the deployment
topology; production qEUBO infrastructure is the qEUBO
integration's concern, not this note's. Update this file if a
config drifts or a resource moves.
