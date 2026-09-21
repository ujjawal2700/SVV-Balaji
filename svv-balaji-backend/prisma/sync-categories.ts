import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up dummy/test categories...');
  
  // Delete dummy test categories matching patterns like Follows Default or No Loyalty
  const deleted = await prisma.category.deleteMany({
    where: {
      OR: [
        { name: { startsWith: 'Follows Default' } },
        { name: { startsWith: 'No Loyalty' } },
        { slug: { startsWith: 'follows-default' } },
        { slug: { startsWith: 'no-loyalty' } },
      ],
    },
  });
  console.log(`Deleted ${deleted.count} dummy test categories.`);

  // Default customer categories tree
  const tree = [
    {
      slug: 'atta-flour',
      name: 'Atta & Flour',
      imageUrl: '/images/cat_atta_flour.jpg',
      description: 'Fresh chakki atta, premium maida, pure besan and grain flours.',
      children: [
        { slug: 'chakki-atta', name: 'Chakki Atta', imageUrl: '/images/premium_atta.jpg', description: 'Fresh stone-ground chakki wheat atta.' },
        { slug: 'maida', name: 'Maida', imageUrl: '/images/cat_atta_flour.jpg', description: 'Refined wheat flour for baking and cooking.' },
        { slug: 'besan', name: 'Besan', imageUrl: '/images/cat_spices.jpg', description: 'Pure unadulterated gram flour.' },
      ],
    },
    {
      slug: 'namkeen',
      name: 'Namkeen',
      imageUrl: '/images/cat_namkeen.jpg',
      description: 'Crispy, savory traditional namkeens, bhujia, and sev.',
      children: [
        { slug: 'bhujia', name: 'Bhujia', imageUrl: '/images/aloo_bhujia.jpg', description: 'Spicy crispy Bikaneri and aloo bhujia.' },
        { slug: 'mixtures', name: 'Mixtures', imageUrl: '/images/classic_namkeen.jpg', description: 'Crunchy traditional mixed farsan.' },
        { slug: 'sev', name: 'Sev & Gathiya', imageUrl: '/images/cat_namkeen.jpg', description: 'Traditional Gujarati and Rajasthani sev & gathiya.' },
      ],
    },
    {
      slug: 'wafers',
      name: 'Wafers',
      imageUrl: '/images/cat_wafers.jpg',
      description: 'Light, crunchy potato, banana and tortilla chips.',
      children: [
        { slug: 'potato-chips', name: 'Potato Chips', imageUrl: '/images/cat_wafers.jpg', description: 'Crispy salted and masala potato chips.' },
        { slug: 'banana-chips', name: 'Banana Chips', imageUrl: '/images/cat_wafers.jpg', description: 'Kerala style crispy banana wafers in pure oil.' },
        { slug: 'tortilla', name: 'Tortilla Chips', imageUrl: '/images/tonys_chips.jpg', description: 'Corn tortilla chips for nachos and dips.' },
      ],
    },
    {
      slug: 'spices',
      name: 'Spices',
      imageUrl: '/images/cat_spices.jpg',
      description: 'Pure, aromatic whole spices, ground powders, and blended masalas.',
      children: [
        { slug: 'whole-spices', name: 'Whole Spices', imageUrl: '/images/cat_spices.jpg', description: 'Khada masala: black pepper, cardamom, cloves, cinnamon.' },
        { slug: 'powdered-spices', name: 'Powdered Spices', imageUrl: '/images/cat_spices.jpg', description: 'Turmeric, red chilli powder, coriander powder, cumin powder.' },
        { slug: 'blended-spices', name: 'Blended Masalas', imageUrl: '/images/cat_spices.jpg', description: 'Garam masala, kitchen king, chaat masala and special blends.' },
      ],
    },
  ];

  console.log('Seeding / syncing real categories to database...');
  for (const [index, parent] of tree.entries()) {
    const parentCat = await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {
        name: parent.name,
        imageUrl: parent.imageUrl,
        description: parent.description,
        displayOrder: index + 1,
        isActive: true,
      },
      create: {
        name: parent.name,
        slug: parent.slug,
        imageUrl: parent.imageUrl,
        description: parent.description,
        displayOrder: index + 1,
        isActive: true,
      },
    });

    for (const [childIndex, child] of parent.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: {
          name: child.name,
          imageUrl: child.imageUrl,
          description: child.description,
          parentId: parentCat.id,
          displayOrder: childIndex + 1,
          isActive: true,
        },
        create: {
          name: child.name,
          slug: child.slug,
          imageUrl: child.imageUrl,
          description: child.description,
          parentId: parentCat.id,
          displayOrder: childIndex + 1,
          isActive: true,
        },
      });
    }
  }

  const allMain = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: true },
  });

  console.log(`\nSuccessfully synchronized! Total Main Categories in DB: ${allMain.length}`);
  for (const m of allMain) {
    console.log(`- ${m.name} (${m.slug}) [${m.children.length} subcategories, Active: ${m.isActive}]`);
    for (const c of m.children) {
      console.log(`    ↳ ${c.name} (${c.slug})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
