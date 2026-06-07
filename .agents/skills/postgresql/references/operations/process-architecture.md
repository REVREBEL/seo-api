---
title: PostgreSQL 17+ Process Architecture
description: Multi-process model, backend connections, auxiliary processes, and pooling rules.
tags: postgres, postgresql-17, process-architecture, connections, pooling
---

# Process Architecture

PostgreSQL uses a multi-process model. The postmaster process starts auxiliary processes and one backend process per client connection. Each backend has private memory in addition to shared memory.

## Auxiliary processes in PostgreSQL 17+

Common processes include:

- WAL writer
- Background writer
- Checkpointer
- Autovacuum launcher and workers
- Archiver, when archiving is enabled
- WAL summarizer in PostgreSQL 17+ environments that use WAL summaries

## Connection pressure

Every connection consumes a process, file descriptors, base memory, and potential query memory. High connection counts create context switching and memory risk.

Use connection pooling before raising `max_connections` reactively.

```sql
SELECT state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state;
```

Connection slot usage:

```sql
SELECT
  count(*) AS used,
  max(max_conn) - count(*) AS free
FROM pg_stat_activity,
     (SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections') s
WHERE backend_type = 'client backend';
```

## Alerts

- Warning at 80% connection usage.
- Critical at 95% connection usage.
- Investigate `idle in transaction` immediately; it can hold locks and prevent VACUUM cleanup.

## Backend cancellation and termination

Prefer cancel before terminate:

```sql
SELECT pg_cancel_backend(pid);
-- If cancellation fails and human confirmation has been obtained:
SELECT pg_terminate_backend(pid);
```

Terminating a backend can abort in-flight work and affect the application. Require human confirmation.
