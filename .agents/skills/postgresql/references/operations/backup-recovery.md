---
title: PostgreSQL 17+ Backup and Recovery
description: Logical backups, physical backups, PITR, WAL archiving, restore testing, and RPO/RTO.
tags: postgres, postgresql-17, backup, recovery, pitr, pg_dump, pg_basebackup, wal-archiving
---

# Backup and Recovery

Fundamental rule: backups are useless until recovery has been successfully tested.

## Logical backups

Use `pg_dump` for portability, small databases, object-level restores, migrations, and selective recovery.

Formats:

- `-Fp`: plain SQL.
- `-Fc`: custom compressed format; supports selective restore.
- `-Fd`: directory format; supports parallel dump/restore with `-j`.
- `-Ft`: tar; usually less flexible.

Examples:

```bash
pg_dump -Fd -j 4 -f backup_dir dbname
pg_restore -d dbname -j 4 backup_dir
pg_restore -d dbname -t table_name backup.dump
```

Logical-only RPO equals backup frequency.

## Physical backups

Use `pg_basebackup` or a proven backup tool for cluster-level physical backups.

```bash
pg_basebackup -Ft -z -P -D /backups/base.tar.gz
```

Physical backups require compatible PostgreSQL versions and architectures for restore. They are faster for large clusters and are the foundation for PITR.

## Point-in-time recovery

PITR requires:

1. A base backup.
2. Continuous WAL archiving.
3. A restore target: timestamp, LSN, transaction ID, or restore point.

With PITR, RPO can be minutes; without PITR, RPO is the last backup time.

## WAL archiving

Example:

```conf
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
wal_level = replica
```

Rules:

- `archive_command` must return 0 only after the WAL file is safely stored.
- Test as the PostgreSQL operating-system user, not root.
- Monitor `pg_stat_archiver` for failures.
- Archive failures can prevent WAL recycling and fill disk.

```sql
SELECT archived_count, failed_count, last_archived_wal, last_archived_time, last_failed_wal, last_failed_time
FROM pg_stat_archiver;
```

## Backup tools

Provider-neutral tool categories:

| Tool type | Use case |
| --- | --- |
| `pg_dump` / `pg_restore` | Small databases, migrations, object-level restore. |
| `pg_basebackup` | Built-in physical backup and simple PITR base. |
| Managed physical backup tooling | Production backup orchestration, retention, encryption, remote storage, incremental backups. |
| WAL archiving tooling | PITR and off-host WAL durability. |

Prefer tools that support encryption, retention policies, restore validation, incremental backups, and clear failure alerts.

## RPO/RTO patterns

| Strategy | Typical RPO | Typical RTO |
| --- | --- | --- |
| Logical backups only | Hours to 24h | Hours |
| Physical backup + PITR | Minutes | Hours |
| Replication + tested failover | 0 to minutes depending sync mode | Seconds to minutes |

## Operational rules

- Run periodic restore tests.
- Verify physical backups with `pg_verifybackup` where applicable.
- Store backups off-host and protect them from accidental deletion.
- Back up from a standby when appropriate to reduce primary load.
- Monitor backup age, archive age, and restore-test age.
- Keep retention explicit, such as daily/weekly/monthly tiers.
