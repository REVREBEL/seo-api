---
title: PostgreSQL 17+ MVCC Transactions
description: Isolation levels, long transactions, XID wraparound, and serialization retry rules.
tags: postgres, postgresql-17, mvcc, transactions, isolation, xid, concurrency
---

# MVCC Transactions and Concurrency

## Isolation levels

- `READ UNCOMMITTED`: accepted but treated as `READ COMMITTED`; PostgreSQL does not allow dirty reads.
- `READ COMMITTED`: default; each statement gets a fresh snapshot.
- `REPEATABLE READ`: first query establishes the transaction snapshot; write conflicts can raise serialization failures.
- `SERIALIZABLE`: strongest isolation; application retry logic is required.

Readers do not block writers and writers do not block readers under MVCC. Writer-writer conflicts still occur on the same rows. PostgreSQL does not escalate row locks to table locks.

## Serialization errors

Applications using `REPEATABLE READ` or `SERIALIZABLE` must retry transactions that fail with serialization errors. Keep transactions short to reduce conflicts.

## Long transaction impact

Long transactions hold old snapshots and prevent VACUUM from removing dead tuples. A single `idle in transaction` session can cause bloat, disk growth, cache pollution, and slower queries.

Find old transactions:

```sql
SELECT pid, usename, state, now() - xact_start AS tx_age, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

Set:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
```

Use tighter values for OLTP applications where safe.

## XID wraparound

Transaction IDs are finite and must be frozen by VACUUM. PostgreSQL protects itself with anti-wraparound vacuum and eventual shutdown behavior, but wraparound risk must be prevented long before emergency thresholds.

Monitor:

```sql
SELECT datname, age(datfrozenxid),
  round(100.0 * age(datfrozenxid) / 2147483648, 2) AS pct_to_wraparound
FROM pg_database
ORDER BY age(datfrozenxid) DESC;
```

Operational rules:

- Never disable autovacuum globally.
- Alert around 40–50% of wraparound age.
- Resolve long transactions before tuning vacuum cost settings.
