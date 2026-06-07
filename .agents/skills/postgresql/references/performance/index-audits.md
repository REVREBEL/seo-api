---
title: PostgreSQL 17+ Index Audit Queries
description: Queries for unused, duplicate, invalid, bloated, and write-heavy index review.
tags: postgres, postgresql-17, indexes, unused-indexes, duplicate-indexes, invalid-indexes, bloat, hot-updates
---

# Index Audit Queries

Check `pg_stat_reset` and server restart time before acting on usage statistics. Low or zero scans may only mean the stats window is too short.

## Unused indexes

```sql
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size
FROM pg_catalog.pg_stat_user_indexes s
JOIN pg_catalog.pg_index i ON s.indexrelid = i.indexrelid
WHERE s.idx_scan = 0
  AND 0 <> ALL (i.indkey)
  AND NOT i.indisunique
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conindid = s.indexrelid
  )
ORDER BY pg_relation_size(s.indexrelid) DESC;
```

Do not drop automatically. Confirm workload coverage, constraint use, and maintenance windows.

## Duplicate indexes

```sql
SELECT
  schemaname || '.' || tablename AS table_name,
  array_agg(indexname ORDER BY indexname) AS duplicate_indexes,
  pg_size_pretty(sum(pg_relation_size((quote_ident(schemaname) || '.' || quote_ident(indexname))::regclass))) AS total_size
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname, tablename,
  regexp_replace(indexdef, 'INDEX \S+ ON ', 'INDEX ON ')
HAVING count(*) > 1;
```

Human review is required because operator classes, collations, predicates, sort order, and workload semantics can make similar indexes non-equivalent.

## Invalid indexes

Failed concurrent index builds can leave invalid indexes that are maintained on writes but unused for reads.

```sql
SELECT s.schemaname, s.relname AS table_name, s.indexrelname AS index_name
FROM pg_stat_user_indexes s
JOIN pg_index i ON s.indexrelid = i.indexrelid
WHERE NOT i.indisvalid;
```

Drop/rebuild only after confirmation:

```sql
-- Require human confirmation first
DROP INDEX CONCURRENTLY index_name;
```

## Index count by table

```sql
SELECT relname AS table_name, count(*) AS index_count
FROM pg_stat_user_indexes
GROUP BY relname
ORDER BY count(*) DESC;
```

| Index count | Recommendation |
| --- | --- |
| <5 | Usually normal |
| 5–10 | Review for overlap and write overhead |
| >10 | Audit required |

## Index bloat

VACUUM removes dead tuples but does not compact empty index pages. Use `REINDEX CONCURRENTLY` for index-only bloat or an approved online repack tool for table+index bloat.

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT avg_leaf_density FROM pgstatindex('my_index');
```

Below 70% leaf density usually indicates significant bloat; 80–90%+ is healthier.

## HOT update ratio

```sql
SELECT
  relname,
  round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY n_tup_upd DESC;
```

For frequently updated tables, investigate low HOT percentages by checking indexed updated columns and fillfactor.
