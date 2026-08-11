-- Migration: 0002_m02_projects_rbac
-- Purpose: Add M02 policy references, lifecycle retention fields, membership
-- status, and separately scoped service identities and permissions.
--
-- Forward procedure:
--   1. Verify target, backup/PITR point, and that 0001 is applied.
--   2. Apply with the package migration runner.
--   3. Verify tenant foreign keys, permission checks, and lifecycle columns.
--
-- Recovery guidance:
--   Roll back the application while retaining this additive schema. Correct
--   defects with a reviewed forward migration. In a disposable local/test
--   database only, drop the new tables before removing added columns and
--   constraints. Production restoration requires the approved backup/PITR
--   procedure because audit history must not be deleted.

ALTER TABLE "memberships" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_status_check"
  CHECK ("status" IN ('active', 'suspended', 'revoked'));
--> statement-breakpoint
CREATE TABLE "policy_profiles" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "deletion_retention_days" integer DEFAULT 30 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "policy_profiles_organization_id_id_unique" UNIQUE ("organization_id", "id"),
  CONSTRAINT "policy_profiles_organization_id_name_unique" UNIQUE ("organization_id", "name"),
  CONSTRAINT "policy_profiles_retention_days_check" CHECK ("deletion_retention_days" BETWEEN 0 AND 3650),
  CONSTRAINT "policy_profiles_status_check" CHECK ("status" IN ('active', 'retired')),
  CONSTRAINT "policy_profiles_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deletion_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_policy_tenant_fk"
  FOREIGN KEY ("organization_id", "policy_id")
  REFERENCES "policy_profiles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
CREATE TABLE "service_identities" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_identities_organization_id_id_unique" UNIQUE ("organization_id", "id"),
  CONSTRAINT "service_identities_status_check" CHECK ("status" IN ('active', 'suspended', 'revoked')),
  CONSTRAINT "service_identities_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "service_identities_project_tenant_fk"
    FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "service_identity_permissions" (
  "organization_id" uuid NOT NULL,
  "service_identity_id" uuid NOT NULL,
  "permission" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_identity_permissions_pk"
    PRIMARY KEY ("organization_id", "service_identity_id", "permission"),
  CONSTRAINT "service_identity_permissions_identity_tenant_fk"
    FOREIGN KEY ("organization_id", "service_identity_id")
    REFERENCES "service_identities"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "service_identity_permissions_permission_check" CHECK ("permission" IN (
    'project:read', 'project:create', 'project:archive', 'project:restore', 'project:delete',
    'change:request', 'change:approve', 'git:merge', 'release:promote', 'secret:manage',
    'policy:modify', 'member:manage'
  ))
);
