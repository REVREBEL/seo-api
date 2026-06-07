---
title: PostgreSQL 17+ SQL Query Patterns
description: Common query anti-patterns and safer PostgreSQL rewrites.
tags: postgres, postgresql-17, query-optimization, sql, n-plus-one, pagination, sargable
---

# SQL Query Patterns

## Select only needed columns

```sql
-- Avoid
SELECT * FROM user_account WHERE status = 'active';

-- Prefer
SELECT id, email, created_at FROM user_account WHERE status = 'active';
```

This reduces I/O and can enable covering index plans.

## Keep predicates SARGable

Do not wrap indexed columns in functions unless a matching expression index exists.

```sql
-- Avoid: prevents normal index usage
SELECT * FROM user_account
WHERE date_trunc('day', created_at) = '2026-01-01';

-- Prefer
SELECT * FROM user_account
WHERE created_at >= '2026-01-01'
  AND created_at <  '2026-01-02';
```

## Replace row-by-row correlated work

```sql
-- Avoid repeated subquery work per row
SELECT u.id,
  (SELECT count(*) FROM orders o WHERE o.customer_id = u.id) AS order_count
FROM user_account u;

-- Prefer set-based join
SELECT u.id, count(o.id) AS order_count
FROM user_account u
LEFT JOIN orders o ON o.customer_id = u.id
GROUP BY u.id;
```

## Detect and fix N+1 queries

Batch IDs instead of running a query inside a loop:

```python
# Avoid
for user_id in user_ids:
    cursor.execute("SELECT id, email FROM user_account WHERE id = %s", (user_id,))

# Prefer
cursor.execute("SELECT id, email FROM user_account WHERE id = ANY(%s)", (list(user_ids),))
```

For ORMs, use eager loading for relationships that will be traversed.

## Prefer `UNION ALL` when deduplication is not required

`UNION` sorts or hashes to remove duplicates. `UNION ALL` avoids that work.

## Use `EXISTS` for existence checks

```sql
SELECT id, email
FROM user_account u
WHERE EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.customer_id = u.id
    AND o.total > 100
);
```

## Prefer cursor pagination at depth

```sql
-- Avoid deep OFFSET on large ordered sets
SELECT id, title
FROM article
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 10000;

-- Prefer cursor pagination with a matching index
SELECT id, title
FROM article
WHERE (created_at, id) < ('2026-06-01T12:00:00Z', 987654)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Supporting index:

```sql
CREATE INDEX article_created_at_id_desc_idx
ON article (created_at DESC, id DESC);
```

## Always bound exploratory queries

Use `LIMIT` for admin/debug queries unless the result set must be complete.
