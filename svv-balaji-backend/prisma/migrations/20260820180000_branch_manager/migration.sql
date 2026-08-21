-- FRD 6.2 - Branch Manager Assignment.
--
-- The relationship existed only backwards: to find who ran a branch you looked
-- for users whose branchId matched and whose role happened to be
-- BRANCH_MANAGER. That answers "who works here", not "who is accountable", and
-- it gives no answer at all when a branch has two managers or none.
--
-- Nullable, because a branch legitimately sits without a manager between
-- appointments and forcing a value would mean inventing one.

ALTER TABLE "branches" ADD COLUMN "managerId" TEXT;

-- One manager, one branch. A user carries a single branchId, so managing a
-- second branch would mean being accountable somewhere they do not work.
CREATE UNIQUE INDEX "branches_managerId_key" ON "branches"("managerId");

-- SET NULL rather than RESTRICT: deleting a user should not be blocked by an
-- assignment, it should vacate it. The branch survives; the post is empty.
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
