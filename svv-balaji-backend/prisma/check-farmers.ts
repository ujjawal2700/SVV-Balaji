import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFarmers() {
  const count = await prisma.farmer.count();
  const farmers = await prisma.farmer.findMany({
    select: { id: true, fullName: true, mobile: true, status: true, farmerCode: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  console.log(`Total Farmers in DB: ${count}`);
  console.log('Most recent 20 farmers:');
  for (const f of farmers) {
    console.log(`- ${f.fullName} (${f.farmerCode ?? 'NO_CODE'}) | Status: ${f.status} | Mobile: ${f.mobile}`);
  }
}

checkFarmers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
