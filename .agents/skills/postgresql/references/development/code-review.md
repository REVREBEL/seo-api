---
title: PostgreSQL 17+ Code Review Checklist
description: PostgreSQL-specific review prompts for schema, SQL, functions, indexes, JSONB, arrays, and operational safety.
tags: postgres, postgresql-17, code-review, schema-review, sql-review
---

# Code Review Checklist

## Schema design

Check for:

- Appropriate primary key type and generation strategy.
- `TIMESTAMPTZ` for timestamps that represent real-world time.
- `NOT NULL` constraints where the domain requires values.
- `CHECK` constraints for bounded values.
- Explicit `ON DELETE` behavior on foreign keys.
- Indexes on foreign key columns.
- Avoidance of circular foreign keys unless justified.
- Avoidance of random UUIDv4 primary keys on high-write large tables.

## Query quality

Check for:

- `SELECT *` on wide or TOAST-heavy tables.
- Functions wrapped around indexed columns in predicates.
- Deep `OFFSET` pagination.
- N+1 application query loops.
- Unbounded admin/debug queries.
- `UNION` where `UNION ALL` is correct.
- Missing `EXPLAIN (ANALYZE, BUFFERS)` for performance-sensitive changes.

## Index strategy

Check for:

- B-tree indexes for equality/range/sort paths.
- Composite indexes ordered by equality, then range/sort.
- GIN indexes for JSONB, arrays, and full-text search when queried with matching operators.
- GiST indexes for ranges/exclusion constraints.
- BRIN indexes for large physically ordered time-series tables.
- Over-indexing on write-heavy tables.
- Indexes on frequently updated columns that reduce HOT update rates.

## JSONB and arrays

Check for:

- JSONB containment operators instead of text search.
- JSONB constraints for required keys or valid states.
- GIN indexes for frequent JSONB/array containment queries.
- Join tables instead of arrays for unbounded many-to-many relationships.

## Functions and triggers

Check for:

- Trigger functions that fire only when needed.
- Avoidance of row-by-row loops when set-based SQL is possible.
- Clear exception handling in PL/pgSQL.
- Stable/immutable/volatile function classification when creating expression indexes or generated columns.

Example update trigger:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = current_timestamp;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_trigger
BEFORE UPDATE ON table_name
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION set_updated_at();
```

## Operational safety

Check for:

- `CREATE INDEX CONCURRENTLY` for large production tables.
- Migration rollback notes.
- Lock impact of DDL changes.
- Batch size for large updates/deletes.
- No destructive actions without confirmation.
- No disabling `fsync` or autovacuum globally.
