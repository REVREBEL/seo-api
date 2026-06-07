---
title: PostgreSQL 17+ WAL and Checkpoints
description: WAL durability, checkpoint tuning, pg_stat_checkpointer, pg_stat_io, and disk management.
tags: postgres, postgresql-17, wal, checkpoints, durability, pg_stat_checkpointer, pg_stat_io
---

# WAL and Checkpoints

## WAL fundamentals

Write-ahead logging records changes in `pg_wal/` before data files are modified. On commit, PostgreSQL flushes WAL according to durability settings and later writes dirty data pages to table/index files.

Never disable `fsync` in production. Power loss without `fsync` can cause unrecoverable corruption or data loss.

`wal_level`:

- `minimal`: crash recovery only; not for replication/archiving.
- `replica`: physical replication and WAL archiving.
- `logical`: logical decoding/replication support.

## Checkpoints

A checkpoint flushes dirty pages and records a recovery point in WAL. Recovery replays WAL from the last checkpoint.

Key settings:

- `checkpoint_timeout` default is commonly 5 minutes.
- `max_wal_size` is a soft target; WAL can exceed it under load.
- `checkpoint_completion_target = 0.9` spreads checkpoint I/O.

Tune for mostly time-based checkpoints. Frequent requested checkpoints mean `max_wal_size` is likely too low for the write workload.

PostgreSQL 17+ checkpointer stats:

```sql
SELECT num_timed, num_requested, write_time, sync_time, buffers_written
FROM pg_stat_checkpointer;
```

Requested checkpoint ratio:

```sql
SELECT
  num_requested,
  num_timed,
  round(100.0 * num_requested / nullif(num_requested + num_timed, 0), 2) AS requested_pct
FROM pg_stat_checkpointer;
```

If requested checkpoints exceed roughly 10%, evaluate increasing `max_wal_size` after checking disk capacity and recovery-time requirements.

## Backend writes in PostgreSQL 17+

Use `pg_stat_io` for I/O visibility:

```sql
SELECT backend_type, object, context, writes, write_time
FROM pg_stat_io
WHERE object = 'relation'
ORDER BY writes DESC;
```

## WAL disk management

WAL can grow because of:

- Heavy write load.
- Replication slots retaining WAL.
- Archiving failures.
- Large transactions.
- Checkpoint settings that allow more WAL between checkpoints.

WAL size:

```sql
SELECT count(*) AS files, pg_size_pretty(sum(size)) AS total
FROM pg_ls_waldir();
```

Slot lag:

```sql
SELECT slot_name,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots
WHERE restart_lsn IS NOT NULL;
```

## Crash recovery trade-off

Longer intervals between checkpoints reduce checkpoint I/O but increase WAL replay time after a crash. Tune with both steady-state performance and recovery objectives in mind.
