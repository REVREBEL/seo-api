---
title: PostgreSQL 17+ Table Partitioning
description: Range/list partitioning, maintenance, retention, and safe partition operations.
tags: postgres, postgresql-17, partitioning, range, list, data-retention
---

# Table Partitioning

Partitioning helps most with maintenance, retention, vacuum scope, and index management. It is not automatically a query-speed feature unless queries filter on the partition key and pruning applies.

## When to partition

| Table type | Size threshold | Row threshold |
| --- | --- | --- |
| General large tables | >100 GB or larger than RAM | >20M rows |
| Time-series, logs, events, metrics, audit trails | >50 GB | >10M rows |

Use lower thresholds for append-heavy time-ordered data with retention requirements.

## Range partitioning

```sql
CREATE TABLE event_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE event_log_2026_01 PARTITION OF event_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

The partition key must be included in any primary key or unique constraint on a partitioned table.

## List partitioning

```sql
CREATE TABLE tenant_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  tenant_region TEXT NOT NULL,
  payload JSONB,
  PRIMARY KEY (id, tenant_region)
) PARTITION BY LIST (tenant_region);

CREATE TABLE tenant_event_us PARTITION OF tenant_event FOR VALUES IN ('us');
CREATE TABLE tenant_event_eu PARTITION OF tenant_event FOR VALUES IN ('eu');
CREATE TABLE tenant_event_default PARTITION OF tenant_event DEFAULT;
```

## Operational rules

- Create future partitions before writes need them.
- Put retention on partition operations, not row-by-row `DELETE`, when possible.
- Use `DETACH PARTITION ... CONCURRENTLY` for lower-lock detaches on supported PostgreSQL versions.
- Define indexes on the parent so partition indexes are created consistently.
- Ensure queries filter by partition key to enable partition pruning.
- Use a partition-management extension only if it is approved and available in the target environment.

## Destructive actions require confirmation

Detaching removes data from the partitioned table. Dropping permanently deletes it.

```sql
-- DESTRUCTIVE: require human confirmation first
ALTER TABLE event_log DETACH PARTITION event_log_2025_01 CONCURRENTLY;
DROP TABLE event_log_2025_01;
```
