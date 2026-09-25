-- FRD 5.3 / 5.6 / 13.4: harvest inspections are recorded by the Procurement
-- Manager and the QA Manager. The Agriculture Expert (FRD 5.4) advises the
-- farmer and must not also grade that farmer's crop - audit finding M19.
-- The Branch Manager monitors procurement and quality (FRD 5.2), so may view.
--
-- Defaults in registry.ts only apply to roles seeded for the first time, so
-- already-configured databases are corrected here, once. A Super Admin can
-- still change any of this from Roles & Permissions afterwards.

DELETE FROM "role_permissions"
WHERE "role" = 'AGRICULTURE_EXPERT'
  AND "permission" IN ('harvestInspections.create', 'harvestInspections.edit', 'harvestInspections.delete');

INSERT INTO "role_permissions" ("id", "role", "permission", "createdAt")
SELECT gen_random_uuid()::text, 'BRANCH_MANAGER', 'harvestInspections.view', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "role_permission_state" WHERE "role" = 'BRANCH_MANAGER')
ON CONFLICT ("role", "permission") DO NOTHING;
