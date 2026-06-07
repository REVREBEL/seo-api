---
title: PostgreSQL 17+ MVCC and VACUUM
description: Dead tuples, autovacuum tuning, bloat prevention, and anti-wraparound behavior.
tags: postgres, postgresql-17, vacuum, autovacuum, bloat, dead-tuples
---

# MVCC and VACUUM

Every `UPDATE` creates a new row version and marks the old version dead. `DELETE` marks tuples dead. VACUUM reclaims dead tuple space for reuse and freezes old transaction IDs.

## VACUUM vs VACUUM FULL

- `VACUUM`: online maintenance; marks dead space reusable.
- `VACUUM FULL`: rewrites the table and requires an exclusive lock. Use only as a last resort with an explicit maintenance window.

For online bloat reduction, use a validated online repack/squeeze approach if approved for the environment.

## Autovacuum tuning

Autovacuum triggers based on dead tuples and table size. For large or hot tables, tune per table instead of changing global defaults first.

Common per-table levers:

```sql
ALTER TABLE large_hot_table SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 5000,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 0,
  autovacuum_vacuum_cost_limit = 2000
);
```

Guidelines:

- Lower scale factors for large tables.
- Increase cost limit and reduce delay on fast storage after confirming I/O headroom.
- Use `autovacuum_work_mem` to avoid memory spikes from multiple autovacuum workers.
- Anti-wraparound vacuum should not be delayed by normal throttling assumptions.

## Monitoring queries

Dead tuples:

```sql
SELECT relname, n_dead_tup, last_autovacuum, last_vacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

XID age:

```sql
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;
```

Long transactions:

```sql
SELECT pid, state, now() - xact_start AS tx_age, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

## Best practices

- Keep transactions short.
- Set `idle_in_transaction_session_timeout`.
- Fix application transaction scope before tuning vacuum knobs.
- Never disable autovacuum globally.
- Treat `VACUUM FULL` as disruptive and require confirmation.
