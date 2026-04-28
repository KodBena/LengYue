# Local Redis resource

A local Redis instance is provisioned on this development machine
to back the qEUBO integration's persistent-cache requirement.
Configured to mirror the user's home KeyDB environment closely
enough that the backend tests do not need reconfiguration.

## Endpoints

- **TCP:** `127.0.0.1:8192`
- **Unix socket:** `/tmp/keydb.sock` (perm 0700)

The port and socket path are preserved verbatim from the user's
`~/keydb.conf`. The socket name is intentionally `keydb.sock`,
not `redis.sock` — code that already targets the home KeyDB
connects without changes.

## Files

- `~/redis.conf` — the running configuration. Ported from
  `~/keydb.conf` with KeyDB-specific directives stripped
  (`server-threads`, `replica-weighting-factor`,
  `active-client-balancing`, `proc-title-template`), the
  `*-ziplist-*` directives renamed to `*-listpack-*` (Redis 7+
  canonical), and `maxmemory` cleared with policy switched to
  `noeviction` to honour the persistent-cache-without-eviction
  intent stated by the user.
- `~/redis/redis.pid` — pidfile.
- `~/redis/redis.log` — log (loglevel `verbose`).
- `~/redis/dump.rdb` — RDB snapshot. Save rules are 900s/1,
  300s/10, 60s/10000 (inherited from the source config).

The original `~/keydb.conf` references `/mnt/n4/home/bork/KeyDB/`
for runtime state, which does not exist on this box; runtime
files were relocated to `~/redis/` accordingly.

## Restarting after a reboot or crash

If `redis-cli -p 8192 ping` does not return `PONG`, restart with:

```bash
/sbin/redis-server ~/redis.conf
```

On OpenSUSE, `redis-server` lives in `/sbin/` and is not on the
default user PATH; the absolute path is required. The config
declares `daemonize yes`, so the command returns immediately.

Verify:

```bash
redis-cli -p 8192 ping              # PONG
redis-cli -s /tmp/keydb.sock ping   # PONG
```

## Stopping

```bash
redis-cli -p 8192 shutdown
```

The `save` rules cause an RDB write on graceful shutdown so cached
state survives. As a fallback: `kill $(cat ~/redis/redis.pid)`.

## Posture

This resource is local to the development machine. It is not
checked into the repo and not part of the deployment topology;
production qEUBO infrastructure is the qEUBO integration's
concern, not this note's. Update this file if the config drifts
or the resource moves.
