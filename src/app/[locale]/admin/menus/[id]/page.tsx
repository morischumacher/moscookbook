import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { coursesOf } from '@/lib/menu';
import { menuBy } from '@/lib/menuQuery';
import MenuForm from '@/components/menu/MenuForm';
import PageHeader from '@/components/admin/PageHeader';
import { pageContainer } from '@/lib/ui';

export default async function EditMenuPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: raw } = await params;
    const id = Number.parseInt(raw, 10);
    if (!Number.isInteger(id)) notFound();

    const [t, menu, recipes] = await Promise.all([
        getTranslations('Menus'),
        menuBy({ id }),
        prisma.recipe.findMany({ where: { isDraft: false }, orderBy: { title: 'asc' }, select: { id: true, title: true } }),
    ]);
    if (!menu) notFound();

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('editTitle')} />
            <MenuForm
                recipes={recipes}
                initial={{
                    id: menu.id,
                    title: menu.title,
                    occasion: menu.occasion ?? '',
                    date: menu.date ? menu.date.toISOString().slice(0, 10) : '',
                    guests: menu.guests,
                    style: menu.style,
                    intro: menu.intro ?? '',
                    courses: coursesOf(menu.items).map((course) => ({
                        name: course.name,
                        dishes: course.dishes.map((dish) => ({
                            recipeId: dish.recipeId,
                            title: dish.title,
                            description: dish.description ?? '',
                        })),
                    })),
                }}
            />
        </main>
    );
}
