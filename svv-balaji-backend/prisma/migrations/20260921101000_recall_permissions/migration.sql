-- Grant the new recall permissions to roles that are already configured (A-14 workaround:
-- boot seeding only backfills roles that have never been configured).
INSERT INTO "role_permissions" ("id", "role", "permission")
SELECT gen_random_uuid()::text, s."role", p.perm
FROM "role_permission_state" s
CROSS JOIN (VALUES ('recall.view'), ('recall.manage')) AS p(perm)
WHERE s."role" IN ('BRANCH_MANAGER', 'QA_MANAGER')
ON CONFLICT ("role", "permission") DO NOTHING;
