import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstrap data: one Super Admin and one branch.
 *
 * Safe to re-run. Previously this bailed out entirely the moment a Super Admin
 * existed, which meant changing SEED_SUPER_ADMIN_PASSWORD in .env and re-running
 * the seed appeared to succeed while silently changing nothing - the password
 * lives as a bcrypt hash in the database, not in .env, so the two just drifted
 * apart with no way to tell.
 *
 * Now it reports what it finds, and will reset the password on request.
 */
async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@svvbalaji.com';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const resetPassword = process.env.SEED_RESET_PASSWORD === 'true';

  if (!process.env.SEED_SUPER_ADMIN_EMAIL) {
    console.warn(
      'SEED_SUPER_ADMIN_EMAIL is not set - falling back to the default. If you edited .env ' +
        'and are seeing this, the file is not being loaded.',
    );
  }

  console.log(`Seeding against: ${email}`);

  await seedSuperAdmin(email, password, resetPassword);
  await seedDefaultBranch();
}

async function seedSuperAdmin(email: string, password: string, resetPassword: boolean) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
      },
    });
    console.log(`Created Super Admin: ${admin.email}`);
    console.log('   Sign in with the password from SEED_SUPER_ADMIN_PASSWORD. Change it soon.');
    return;
  }

  // The account is here. Make sure it can actually be signed into - a
  // suspended or demoted Super Admin locks everyone out of the panel, and
  // AuthService refuses any user who is not ACTIVE.
  if (existing.status !== 'ACTIVE' || existing.role !== UserRole.SUPER_ADMIN) {
    await prisma.user.update({
      where: { email },
      data: { status: 'ACTIVE', role: UserRole.SUPER_ADMIN },
    });
    console.log(`Reactivated ${email} as an ACTIVE Super Admin`);
  }

  const passwordMatches = await bcrypt.compare(password, existing.passwordHash);

  if (passwordMatches) {
    console.log(`Super Admin already exists and .env matches the stored password: ${email}`);
    return;
  }

  if (resetPassword) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // Any live session is now stale - force a fresh sign-in rather than
        // leaving a refresh token that outlives the password it was issued for.
        refreshTokenHash: null,
      },
    });
    console.log(`Password reset for ${email} from SEED_SUPER_ADMIN_PASSWORD.`);
    console.log('   Remove SEED_RESET_PASSWORD from .env now that it has been used.');
    return;
  }

  console.warn('');
  console.warn(`  ${email} exists, but SEED_SUPER_ADMIN_PASSWORD does NOT match the database.`);
  console.warn('');
  console.warn('  The password is stored as a bcrypt hash in the users table. Editing .env does');
  console.warn('  not change it - .env only supplies the value used when the account is first');
  console.warn('  created. That is why signing in with the new password fails.');
  console.warn('');
  console.warn('  To apply the .env password to the existing account, add this to .env:');
  console.warn('');
  console.warn('      SEED_RESET_PASSWORD="true"');
  console.warn('');
  console.warn('  then re-run `npm run prisma:seed` and remove the line afterwards.');
  console.warn('');
}

/**
 * Idempotent, and no longer tied to whether the admin was just created - a
 * database with an admin but no branch is a dead end, since farmers, users and
 * warehouses all need one to attach to.
 */
async function seedDefaultBranch() {
  const branchCount = await prisma.branch.count();
  if (branchCount > 0) {
    console.log(`Branches already present (${branchCount}) - leaving them alone`);
    return;
  }

  const branch = await prisma.branch.create({
    data: {
      name: 'Head Office',
      location: 'HQ',
      address: 'TBD',
    },
  });
  console.log(`Created default branch: ${branch.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
