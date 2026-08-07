import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@svvbalaji.com';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe@123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log(`Created Super Admin: ${admin.email} (password: ${password} - change this immediately)`);

  // Seed one branch so Farmer/Warehouse masters have somewhere to attach to
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
