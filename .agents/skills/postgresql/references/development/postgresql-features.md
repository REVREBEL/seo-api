---
title: PostgreSQL 17+ Development Features
description: JSONB, arrays, full-text search, ranges, window functions, CTEs, and advanced SQL patterns.
tags: postgres, postgresql-17, jsonb, arrays, full-text-search, ranges, window-functions, cte
---

# PostgreSQL Development Features

Use PostgreSQL-specific features when they improve correctness, performance, or maintainability. Do not use features only because they are available.

## JSONB

Use JSONB for flexible attributes, event payloads, and semi-structured data. Add validation and indexes for critical access paths.

```sql
CREATE TABLE event_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_has_type CHECK (data ? 'type')
);

CREATE INDEX event_log_data_gin_idx ON event_log USING GIN (data);

SELECT *
FROM event_log
WHERE data @> '{"type": "login"}';
```

Avoid `data::text LIKE ...` for JSON search.

## Arrays

Use arrays for naturally multi-valued attributes with bounded complexity. For high-cardinality relationships, use join tables.

```sql
CREATE TABLE article (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tags TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX article_tags_gin_idx ON article USING GIN (tags);

SELECT * FROM article WHERE tags @> ARRAY['postgresql'];
```

## Full-text search

```sql
CREATE TABLE document (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED
);

CREATE INDEX document_search_vector_gin_idx ON document USING GIN (search_vector);

SELECT id, title,
       ts_rank(search_vector, plainto_tsquery('english', 'postgresql database')) AS rank
FROM document
WHERE search_vector @@ plainto_tsquery('english', 'postgresql database')
ORDER BY rank DESC;
```

## Range types and exclusion constraints

```sql
CREATE TABLE reservation (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id BIGINT NOT NULL,
  reservation_period tstzrange NOT NULL,
  EXCLUDE USING gist (room_id WITH =, reservation_period WITH &&)
);
```

Use range types when overlap, containment, and time-window logic are central.

## Window functions

```sql
SELECT
  product_id,
  sale_date,
  amount,
  sum(amount) OVER (PARTITION BY product_id ORDER BY sale_date) AS running_total,
  lag(amount) OVER (PARTITION BY product_id ORDER BY sale_date) AS previous_amount
FROM sales;
```

## Recursive CTEs

```sql
WITH RECURSIVE category_tree AS (
  SELECT id, name, parent_id, 1 AS depth
  FROM category
  WHERE parent_id IS NULL

  UNION ALL

  SELECT c.id, c.name, c.parent_id, ct.depth + 1
  FROM category c
  JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree
ORDER BY depth, name;
```

Use recursive CTEs for hierarchy traversal, but validate performance with realistic depth and row counts.
