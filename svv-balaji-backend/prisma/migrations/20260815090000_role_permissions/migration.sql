-- Role-based access control: grants move from code to data.
--
-- Nothing here changes who can do what. The application seeds these tables from
-- src/auth/permissions/registry.ts on first boot, and every default in that
-- file was read off the @Roles() decorator that used to guard the route. After
-- this migration the same people can do the same things - the difference is
-- that a Super Admin can now change it without a deploy.

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission_state" (
    "role" "UserRole" NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "role_permission_state_pkey" PRIMARY KEY ("role")
);

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_key" ON "role_permissions"("role", "permission");
