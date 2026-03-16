import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed script started...');

  // TODO: Add seed data when models are implemented.
  // Phase 1 will add: users, locations, categories, vendors, uoms, goods.
  // See /doc/demo_seed_guidelines.md for seeding rules.

  console.log('Seed script completed (no data seeded yet).');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
