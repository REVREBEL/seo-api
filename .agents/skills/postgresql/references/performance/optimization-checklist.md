---
title: PostgreSQL 17+ Optimization Checklist
description: Evidence-first checklist for PostgreSQL performance work.
tags: postgres, postgresql-17, optimization, checklist, indexes, partitioning, maintenance
---

# Optimization Checklist

Before changing configuration, collect:

- PostgreSQL major version.
- Query text and `EXPLAIN (ANALYZE, BUFFERS)`.
- Table and index sizes.
- Approximate row counts and data distribution.
- Existing indexes and constraints.
- Recent `ANALYZE` / autovacuum history.
- `pg_stat_statements` stats if available.
- Logs for slow queries, lock waits, checkpoints, temp files, and errors.
- Host metrics for CPU, memory, disk I/O, disk space, and network.

Review:

- Missing indexes on high-value predicates or foreign keys.
- Unused indexes with old enough stats windows.
- Duplicate or overlapping indexes.
- Invalid indexes from failed concurrent builds.
- Tables with high dead tuples or stale statistics.
- Audit/log tables that need retention or archiving.
- Tables >100 GB or time-series/log tables >50 GB for partitioning fit.
- Circular foreign key dependencies.
- UUIDv4 primary keys on high-write large tables.
- Connection pooling for OLTP workloads.
- Memory multiplication from `work_mem`, parallel workers, and connection count.
- Checkpoint pressure and WAL growth.

Always require human confirmation before removing indexes, dropping partitions, archiving tables, resetting statistics, terminating backends, or other destructive/disruptive actions.
