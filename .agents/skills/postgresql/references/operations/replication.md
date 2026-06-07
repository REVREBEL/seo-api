---
title: PostgreSQL 17+ Replication
description: Physical streaming replication, slots, sync commit levels, failover, and monitoring.
tags: postgres, postgresql-17, replication, streaming, slots, synchronous, failover
---

# Replication

## Physical streaming replication

Physical streaming replication sends WAL from a primary to read-only standbys. Use it for high availability, read replicas, and backup offload.

Rules:

- Keep primary and standby on compatible PostgreSQL major versions for physical replication.
- Use replication slots or sufficient WAL retention to prevent standbys from falling behind unrecoverably.
- Monitor lag and disk usage continuously.

## Replication slots

Slots retain WAL until a consumer confirms receipt. They prevent data loss for a standby but can fill `pg_wal/` if the standby is offline.

Slot lag:

```sql
SELECT
  slot_name,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots
WHERE restart_lsn IS NOT NULL;
```

PostgreSQL 17+ includes <code>replication_slot_inactive_timeout</code> for invalidating idle slots when configured. Use <code>max_slot_wal_keep_size</code> to cap retained WAL per slot.

Dropping a slot can break downstream replication. Require human confirmation:

```sql
-- Require human confirmation first
SELECT pg_drop_replication_slot('slot_name');
```

## Synchronous commit levels

| Level | Behavior | Use case |
| --- | --- | --- |
| `off` | Return without waiting for local WAL flush | Non-critical writes only; can lose recent commits on crash. |
| `local` | Wait for local WAL flush | Local durability only. |
| `remote_write` | Wait for standby OS write | Lower latency, weaker standby crash durability. |
| `on` | Wait for standby WAL flush when synchronous standbys are configured | Common HA default. |
| `remote_apply` | Wait for standby replay | Strongest read-your-writes behavior on standby. |

Use `synchronous_standby_names` with quorum (`ANY N`) or priority (`FIRST N`). If required standbys are unavailable, commits can wait until timeout or standby recovery.

## Failover

Promote a standby:

```sql
SELECT pg_promote();
```

After promotion:

1. Redirect application traffic.
2. Prevent split-brain.
3. Rebuild or rewind the old primary before rejoining.
4. Reconfigure remaining standbys to follow the new primary.

`pg_rewind` requires prerequisites such as `wal_log_hints=on` or data checksums and enough WAL history.

## Monitoring

Primary-side lag:

```sql
SELECT
  application_name,
  state,
  sync_state,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS replay_lag
FROM pg_stat_replication;
```

Standby receiver status:

```sql
SELECT status, receive_start_lsn, written_lsn, flushed_lsn, latest_end_lsn
FROM pg_stat_wal_receiver;
```

Local replay gap on standby:

```sql
SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS receive_replay_gap_bytes;
```
