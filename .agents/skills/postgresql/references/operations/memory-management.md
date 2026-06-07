---
title: PostgreSQL 17+ Memory Management
description: Shared/private memory, work_mem multiplication, page cache, and OOM prevention.
tags: postgres, postgresql-17, memory, work_mem, shared_buffers, oom
---

# Memory Management and OOM Prevention

## Memory areas

- `shared_buffers`: shared data cache; restart required to change.
- `work_mem`: private per operation, not per query.
- `maintenance_work_mem`: for maintenance operations such as VACUUM and CREATE INDEX.
- `autovacuum_work_mem`: caps autovacuum worker memory when set.
- `temp_buffers`: per-session temporary table buffers.
- `effective_cache_size`: planner hint only; it is not allocated memory.
- `hash_mem_multiplier`: lets hash operations use more than `work_mem`.

## Memory multiplication

Worst-case query memory can multiply as:

```text
work_mem × operations_per_query × (parallel_workers + leader) × active_connections
```

Hash operations can use up to `hash_mem_multiplier × work_mem`.

Operational implications:

- High `work_mem` plus high concurrency can cause OOM.
- Parallel workers multiply memory demand.
- Connection pooling is a memory-control tool, not just a connection-control tool.

## OS page cache

PostgreSQL relies on both `shared_buffers` and the OS page cache. Oversizing `shared_buffers` can reduce OS cache, increase checkpoint pressure, and slow restart/recovery. Tune based on workload evidence.

## OOM prevention

- Implement connection pooling.
- Keep global `work_mem` conservative; use per-session overrides for specific heavy jobs.
- Reduce `max_parallel_workers_per_gather` for high-concurrency systems.
- Set `statement_timeout` and `idle_in_transaction_session_timeout`.
- Monitor temp file usage and query spills.

Useful checks:

```sql
SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem', 'autovacuum_work_mem', 'hash_mem_multiplier');
```

```sql
SELECT query, calls, temp_blks_written
FROM pg_stat_statements
WHERE temp_blks_written > 0
ORDER BY temp_blks_written DESC
LIMIT 20;
```

Host checks are required for actual OOM evidence; inspect kernel logs for killed processes.
