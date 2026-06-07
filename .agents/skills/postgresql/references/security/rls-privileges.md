---
title: PostgreSQL 17+ Security Review
description: Row Level Security, least privilege, safe SQL, and audit-oriented schema guidance.
tags: postgres, postgresql-17, security, rls, privileges, sql-injection, audit
---

# Security Review

## Parameterized SQL

Use parameterized queries exclusively for application input. Never build SQL by concatenating user-provided values.

## Least privilege

Avoid broad grants:

```sql
-- Avoid
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
```

Prefer scoped grants:

```sql
GRANT SELECT, INSERT, UPDATE ON specific_table TO app_user;
GRANT USAGE ON SEQUENCE specific_table_id_seq TO app_user;
```

Use separate roles for migrations, application runtime, read-only analytics, and maintenance.

## Row Level Security

Use RLS when authorization must be enforced in the database layer.

```sql
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY sensitive_data_user_policy
ON sensitive_data
FOR ALL
TO application_role
USING (user_id = current_setting('app.current_user_id')::bigint)
WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);
```

Rules:

- Set trusted session variables only after authentication.
- Test policies for read and write paths.
- Include `WITH CHECK` for insert/update constraints.
- Verify owner/bypass roles cannot accidentally skip policy intent.

## Sensitive data

- Store only what is needed.
- Apply column-level privileges where appropriate.
- Use application-level encryption or approved cryptographic extensions for sensitive fields when required.
- Keep audit trails for sensitive access and privilege changes.

## Extension review

Before enabling an extension, verify:

- It is available on the target PostgreSQL version and environment.
- It is approved by security/operations.
- It has a clear use case.
- Backup/restore and replication implications are understood.
