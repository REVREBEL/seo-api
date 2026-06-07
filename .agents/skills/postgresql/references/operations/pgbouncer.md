---
title: PgBouncer for PostgreSQL 17+
description: Provider-neutral PgBouncer pool sizing, connection limits, and monitoring.
tags: postgres, postgresql-17, pgbouncer, connection-pooling, configuration
---

# PgBouncer Configuration

Use PgBouncer or another approved pooler for high-concurrency OLTP systems. Pooling reduces backend process count, memory pressure, and connection churn.

## Pool sizing

`default_pool_size` is the number of server connections per database/user pair. The default is commonly 20.

Multiplication matters:

```text
active database/user pairs × default_pool_size = possible server connections
```

Example: 2 users × 3 databases × pool size 45 = 270 backend connections.

Recommended starting ranges:

| Workload | `default_pool_size` |
| --- | --- |
| One/few active database-user pairs | 25–50 |
| Many active database-user pairs | 10–25 |

## PostgreSQL `max_connections`

`max_connections` requires restart and should include pooler connections, direct admin connections, maintenance jobs, replication connections, and a buffer.

Formula:

```text
max_connections >= all pooler server connections + steady direct connections + 20% buffer
```

Leave emergency access capacity through reserved superuser connections.

## User limits

Use per-user connection limits to prevent one role from exhausting all server connections.

A common target is 70–85% of PostgreSQL `max_connections`, leaving headroom for admin and maintenance access.

## Monitoring

PostgreSQL-side backend count:

```sql
SELECT datname, usename, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY datname, usename
ORDER BY count(*) DESC;
```

Pooler-side commands depend on the pooler deployment, but usually include active clients, waiting clients, server connections, and pool saturation.

## Guardrails

- Implement pooling before raising `max_connections` for application concurrency.
- Use transaction pooling only after verifying application compatibility with session state, prepared statements, advisory locks, temporary tables, and `LISTEN/NOTIFY` patterns.
- Keep a direct administrative connection path for emergencies.
