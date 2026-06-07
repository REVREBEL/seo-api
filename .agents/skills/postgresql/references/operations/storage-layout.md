---
title: PostgreSQL 17+ Storage Layout
description: PGDATA, TOAST, visibility/free-space maps, fillfactor, tablespaces, and disk checks.
tags: postgres, postgresql-17, storage, pgdata, toast, fillfactor, tablespaces
---

# Storage Layout

## PGDATA structure

- `base/`: per-database relation files.
- `global/`: cluster-wide catalogs.
- `pg_wal/`: write-ahead log files.
- `pg_xact/`: transaction commit status.
- `pg_tblspc/`: symbolic links to custom tablespaces.

In PostgreSQL, a cluster means one database instance/data directory, not necessarily a high-availability cluster.

Each table and index is stored in one or more files split into 1 GB segments.

## Free space map and visibility map

- `_fsm`: tracks free space per page.
- `_vm`: tracks all-visible/all-frozen heap pages and enables VACUUM skipping and index-only scans.
- Indexes have free-space maps; heap tables have both free-space and visibility maps.

## TOAST

Large row values are compressed and/or moved out of line into TOAST tables when rows exceed the in-page threshold. TOAST is common for large `TEXT`, `BYTEA`, `JSONB`, and array values.

Rules:

- Avoid `SELECT *` when rows contain large TOASTed columns.
- Move large rarely accessed columns to side tables when they slow common paths.
- Remember TOAST tables can bloat and need VACUUM too.
- Use storage strategies only with a clear reason: default extended storage is usually right.

## Fillfactor

`fillfactor` controls how full pages are packed.

- Use 100 for insert-only or read-mostly tables.
- Consider 70–80 for update-heavy tables to improve HOT update opportunity.

```sql
ALTER TABLE orders SET (fillfactor = 80);
```

Changing fillfactor affects future writes; use a rewrite/repack strategy if existing pages must be reorganized.

## Tablespaces

Custom tablespaces can separate hot data, indexes, or archives across storage devices. Moving relations requires locks and operational planning. Prefer storage simplicity unless there is a proven I/O or lifecycle reason.

## Disk size checks

```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

If `pg_wal/` grows suddenly, check replication slots and archive failures first.
