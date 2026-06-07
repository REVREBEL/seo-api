---
title: PostgreSQL 17+ Monitoring
description: Core monitoring views, logging, host metrics, and statistics-reset guardrails.
tags: postgres, postgresql-17, monitoring, pg_stat_statements, logs, pg_stat_checkpointer, pg_stat_io
---

# Monitoring

## Essential PostgreSQL 17+ views

- `pg_stat_activity`: active sessions, states, wait events, locks, blocking context.
- `pg_stat_statements`: query execution statistics; requires preload and extension creation.
- `pg_stat_database`: cache hits, temp files, deadlocks, connection counts by database.
- `pg_stat_user_tables`: seq scans, index scans, dead tuples, vacuum/analyze times.
- `pg_stat_user_indexes`: index usage.
- `pg_stat_checkpointer`: checkpoint counts and write/sync timing in PostgreSQL 17+.
- `pg_stat_io`: I/O by backend type, object, and context in modern PostgreSQL.
- `pg_stat_wal`: WAL activity.
- `pg_stat_archiver`: archive success/failure status when archiving is enabled.

## Slow queries

```sql
SELECT
  query,
  calls,
  mean_exec_time,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS cache_hit_pct
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Connections

```sql
SELECT state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state;
```

## Blocking

```sql
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  pg_blocking_pids(blocked.pid) AS blocking_pids
FROM pg_stat_activity blocked
WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

## Dead tuples

```sql
SELECT relname, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

`last_autovacuum IS NULL` means autovacuum has not run on that table since stats began.

## Logging

Check PostgreSQL logs first during incidents. Useful settings:

- `log_min_duration_statement`: workload-specific threshold.
- `log_checkpoints = on`.
- `log_lock_waits = on`.
- `log_temp_files = 0` for spill investigation, or a threshold for routine production logging.
- `log_connections` and `log_disconnections` when diagnosing connection churn.

Use structured log collection or a log-analysis tool for recurring review.

## Host metrics PostgreSQL cannot fully report

Monitor outside PostgreSQL:

- CPU saturation and steal time.
- Memory pressure and swap.
- Disk latency, queueing, utilization, and free space.
- Inode usage.
- Network packet loss and retransmits.

Disk space is critical: above 80% is risk, above 90% is urgent. WAL growth, failed archiving, or replication slot lag can fill disks.

## Statistics reset guardrail

Do not reset statistics casually. It destroys baselines for query tuning and index-usage decisions.

Require human confirmation before:

```sql
SELECT pg_stat_statements_reset();
SELECT pg_stat_reset();
```
