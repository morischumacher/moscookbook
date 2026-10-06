/**
 * What the phone check (scripts/mobile-check.mjs) needs in an empty database:
 * an admin, a member, a recipe with ingredients, and a shopping list with
 * lines on it. Run against the CI database after the migrations:
 *
 *   npx ts-node --transpile-only --project tests/tsconfig.json scripts/mobile-seed.ts
 *
 * Safe to run twice.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { newRecipeData } from '../src/lib/recipeRepo';
import { toStructuredIngredients } from '../src/lib/ingredientParts';

const prisma = new PrismaClient();
const PASSWORD = process.env.MOBILE_PASSWORD ?? 'mobile-check-123';

async function user(email: string, name: string, admin: boolean) {
    const password = await bcrypt.hash(PASSWORD, 10);
    const now = new Date();
    return prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, firstName: name, password, admin, emailVerifiedAt: now, avatarChosenAt: now },
        select: { id: true },
    });
}

async function main() {
    const admin = await user('admin@mobile.test', 'Ann', true);
    await user('member@mobile.test', 'Mia', false);

    const existing = await prisma.recipe.findUnique({ where: { slug: 'laab-gai' }, select: { id: true } });
    if (!existing) {
        // As every writer of a recipe: with its search columns (lib/recipeRepo).
        await prisma.recipe.create({
            data: newRecipeData({
                slug: 'laab-gai',
                title: 'Laab Gai',
                description: 'Ein scharfer, säuerlicher Hähnchensalat aus dem Nordosten Thailands.',
                category: 'Main',
                categories: ['Main', 'Salad'],
                nationality: 'Thai',
                cuisines: ['Thai'],
                language: 'de',
                isDraft: false,
                imageUrls: [],
                instructions: '1. Röste den Klebreis ohne Fett goldbraun und mahle ihn fein.\n\n2. Gare das Hähnchen in etwas Brühe.\n\n3. Mische alles mit Limettensaft, Fischsauce und Kräutern.',
                servings: 2,
                prepMinutes: 30,
                cookMinutes: 30,
                ingredients: toStructuredIngredients([
                    { amount: '800 g', item: 'Hähnchenoberschenkel, gehackt' },
                    { amount: '4', item: 'Frühlingszwiebeln, in Ringen' },
                    { amount: '1 Bund', item: 'Koriander' },
                    { amount: '8 EL', item: 'Fischsauce' },
                    { amount: '8 EL', item: 'Limettensaft' },
                    { amount: '4', item: 'Kaffirlimettenblätter (optional)' },
                ]),
            }),
        });
    }

    let list = await prisma.shoppingList.findFirst({ where: { userId: admin.id, name: null }, select: { id: true } });
    if (!list) list = await prisma.shoppingList.create({ data: { userId: admin.id }, select: { id: true } });
    if ((await prisma.shoppingItem.count({ where: { listId: list.id } })) === 0) {
        await prisma.shoppingItem.createMany({
            data: [
                { listId: list.id, name: 'Frühlingszwiebeln', key: 'fruehlingszwiebel', measure: 'count:', amount: 4, aisle: 'produce', sources: ['Laab Gai'] },
                { listId: list.id, name: 'fermentierte, gesalzene Garnelen mit der salzigen Lauge', key: 'garnele', measure: 'volume', amount: 60, aisle: 'special', sources: ['Napa cabbage kimchi'] },
                { listId: list.id, name: 'Hähnchenoberschenkel', key: 'haehnchenoberschenkel', measure: 'mass', amount: 800, aisle: 'meat', sources: ['Laab Gai'] },
                { listId: list.id, name: 'Zucker', key: 'zucker', measure: 'spoon', amount: 30, aisle: 'basics', sources: [] },
            ],
        });
    }
    console.log('mobile seed: ready');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
