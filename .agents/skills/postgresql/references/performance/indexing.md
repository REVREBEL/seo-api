---
title: PostgreSQL 17+ Indexing Best Practices
description: Index selection, composite/partial/covering indexes, and index type guidance.
tags: postgres, postgresql-17, indexes, btree, gin, gist, brin, composite, partial, covering
---

# Indexing Best Practices

## Core rules

1. Index foreign key columns; PostgreSQL does not auto-create them.
2. Index columns used repeatedly in selective `WHERE`, `JOIN`, and `ORDER BY` clauses.
3. Avoid over-indexing; every index adds write, WAL, vacuum, and storage overhead.
4. Verify index value with `EXPLAIN (ANALYZE, BUFFERS)` on representative data.
5. Confirm with a human before dropping any index, even when stats show zero scans.

## Composite indexes

Put equality columns first, then range and sort columns:

```sql
CREATE INDEX orders_status_created_at_idx
ON orders (status, created_at);
```

A B-tree index on `(a, b)` supports predicates on `a` and on `a, b`, but not a standalone predicate on `b`.

## Partial indexes

Use partial indexes for common filtered subsets when the full index is too large or too write-heavy:

```sql
CREATE INDEX orders_active_customer_id_idx
ON orders (customer_id)
WHERE status = 'active';
```

The query predicate must imply the partial-index predicate for the planner to use it.

## Covering indexes

Use `INCLUDE` for hot read paths that return a small set of columns and can benefit from index-only scans:

```sql
CREATE INDEX orders_customer_status_idx
ON orders (customer_id, status)
INCLUDE (total, created_at);
```

Do not include wide or frequently updated columns unless the read benefit is proven.

## Index types

| Type | Best use | Example |
| --- | --- | --- |
| B-tree | Equality, range, sort, uniqueness | IDs, dates, status filters |
| GIN | JSONB, arrays, full-text search | `payload @> ...`, `tags @> ...` |
| GiST | Ranges, geometric data, exclusion constraints | date ranges, no-overlap constraints |
| BRIN | Very large physically ordered tables | append-only time-series by timestamp |

Examples:

```sql
CREATE INDEX event_payload_gin_idx ON event_log USING GIN (payload);
CREATE INDEX event_created_at_brin_idx ON event_log USING BRIN (created_at);
```

## HOT update friendliness

HOT updates avoid index maintenance when no indexed column changes and there is free space on the page. For write-heavy tables:

- Avoid indexing frequently updated columns unless query-critical.
- Consider `fillfactor = 70–80` for update-heavy tables.
- Use partial indexes to reduce the indexed row set.
