const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('Connecting to Local SQLite DB...');
  const localPrisma = new PrismaClient({
    datasources: { db: { url: process.env.LOCAL_SQLITE_URL } }
  });
  
  const users = await localPrisma.user.findMany();
  const recipes = await localPrisma.recipe.findMany();
  const images = await localPrisma.image.findMany();
  const ratings = await localPrisma.rating.findMany();
  const favorites = await localPrisma.favorite.findMany();
  
  await localPrisma.$disconnect();
  console.log(`Extracted ${users.length} users, ${recipes.length} recipes, ${images.length} images, ${ratings.length} ratings, and ${favorites.length} favorites.`);

  console.log('Connecting to Remote Vercel Postgres...');
  const remotePrisma = new PrismaClient({
    datasources: { db: { url: process.env.POSTGRES_PRISMA_URL } }
  });

  for (const user of users) {
    try { await remotePrisma.user.create({ data: user }); } catch (e) { console.log('Skipped user', user.email); }
  }

  for (const recipe of recipes) {
    try { await remotePrisma.recipe.create({ data: recipe }); } catch (e) {
         console.log('Skipped recipe', recipe.slug); 
    }
  }

  for (const image of images) {
    try { await remotePrisma.image.create({ data: image }); } catch (e) { console.log('Skipped image', image.id); }
  }
  
  for (const rating of ratings) {
    try { await remotePrisma.rating.create({ data: rating }); } catch (e) { console.log('Skipped rating', rating.id); }
  }

  for (const fav of favorites) {
    try { await remotePrisma.favorite.create({ data: fav }); } catch (e) { console.log('Skipped favorite', fav.id); }
  }

  await remotePrisma.$disconnect();
  console.log('Migration Complete');
}

main().catch(console.error);
