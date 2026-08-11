# Database Migration Runbook

## Scope and safety boundary

The platform production schema targets PostgreSQL and is defined with Drizzle.
PGlite is used only for fast migration compatibility tests; a PGlite pass is not
evidence of a production PostgreSQL deployment, production locking behavior,
backup readiness, operational performance, or provider configuration.

Never destructively reset a non-local database. Never place a database URL or
credential in source, a command transcript, test fixture, screenshot, or Git.
Supply `DATABASE_URL` through the protected process environment.

Schema changes are High risk under the SRS. A production apply requires the
authorized approval evidence, target-environment confirmation, a current
backup/PITR recovery point, and the environment-specific change window.

## Migration design

- Migration IDs are ordered and immutable after application.
- Identifiers are application-generated UUIDs. Schema migrations must not add
  database UUID generators as defaults to entity identifiers.
- Tenant-owned tables carry organization/project scope as applicable.
- `audit_events` is append-only. Database triggers reject `UPDATE`, `DELETE`,
  and `TRUNCATE`; a correction is a newly appended event.
- Migrations are forward-safe and include purpose, forward procedure, and
  recovery guidance in their SQL header.
- The runtime connection and driver are created lazily. Importing the package
  or migration module does not connect to PostgreSQL.

## Local validation

From the repository root, run the configured workspace checks. The focused
migration compatibility test is:

```powershell
npm test --workspace @platform/database
```

The test applies the Drizzle migration journal to an in-process PGlite database and verifies
the foundational tables, application-generated ID contract, tenant-consistent
project audit references, and audit mutation denial. Record it as PGlite
compatibility evidence only.

When a disposable PostgreSQL test endpoint is available, apply the migration
runner to that endpoint and execute the same catalog and mutation checks before
crediting live PostgreSQL migration evidence. Do not point this procedure at a
shared, staging, or production database merely to satisfy a test gate.

The opt-in live check requires both `DATABASE_MIGRATION_TEST_URL` and
`DATABASE_MIGRATION_TEST_ACKNOWLEDGE_DISPOSABLE=1` and runs with:

```powershell
npm run db:migrate:integration --workspace @platform/database
```

Without both values Vitest reports the live suite as skipped; that is not live
PostgreSQL migration evidence.

## Pre-apply checklist

1. Confirm the exact Git commit and review the immutable SQL files introduced
   since the target's last migration record.
2. Confirm the target host/database/environment without printing credentials.
3. Confirm the migration role is least-privileged but can create the required
   tables, constraints, indexes, PL/pgSQL trigger function, triggers, and
   Drizzle migration ledger objects.
4. Confirm the applicable formatter, lint, type, unit, integration, security,
   and migration compatibility checks passed for the exact commit.
5. For production, record approval, maintenance/change window, current
   backup/PITR recovery point, restore ownership, and application rollback
   reference.
6. Confirm no concurrent migration process is running against the same target.

## Forward apply

Build first so the executable and migrations correspond to reviewed source:

```powershell
npm run build --workspace @platform/database
npm run db:migrate --workspace @platform/database
```

The second command reads `DATABASE_URL` only at execution time. Drizzle records
applied migrations and skips an already-recorded migration. Do not log the URL
or pass it as a command-line argument.

After application, verify through a protected database session:

1. The Drizzle migration ledger contains `0001_m01_foundation`.
2. `users`, `organizations`, `memberships`, `projects`, and `audit_events`
   exist in the expected schema.
3. Foreign keys and tenant-consistency constraints are valid.
4. `audit_events_reject_update_or_delete` and
   `audit_events_reject_truncate` are enabled.
5. The application health check succeeds with the migrated schema.

Record the target environment, commit, migration ID, start/end timestamps,
operator/service identity, approval reference, and verification outcomes. Do
not record credentials or unrestricted database error payloads.

## Failure and recovery

The initial migration is additive and forward-only. There is no routine
production down migration.

- If migration execution fails, stop rollout. Preserve the protected error and
  migration-ledger evidence, determine whether the transaction committed, and
  do not repeatedly rerun until the cause is understood.
- If application rollout fails after a successful migration, roll back the
  application to its previous compatible commit and leave the additive schema
  in place.
- Correct a schema defect with a reviewed, approved forward migration.
- Use backup/PITR restoration only through an independently approved recovery
  action with an explicit recovery point, impact assessment, and restore
  verification. Code rollback alone is not database recovery.
- Only in a disposable local/test database that contains no retained evidence
  may an operator drop objects in reverse dependency order and recreate the
  database. This exception never applies to shared or non-local databases.

Audit events must not be altered to repair a mistake. Append a correction event
that references the original event and preserves attribution and correlation.
