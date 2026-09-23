import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { menuInputSchema } from '@/lib/menu';
import { updateMenu } from '@/lib/menuDb';
import { isPrismaError } from '@/lib/prismaErrors';

type Params = { id: string };

export const PUT = route<'admin', typeof menuInputSchema, Params>(
    { access: 'admin', body: menuInputSchema, label: 'Saving a menu' },
    async ({ params, body }) => {
        const id = idFrom(params.id, 'menu');
        try {
            return NextResponse.json(await updateMenu(id, body));
        } catch (error) {
            if (isPrismaError(error, 'P2025')) refuse(404, 'That menu is gone.');
            throw error;
        }
    }
);

export const DELETE = route<'admin', undefined, Params>({ access: 'admin', label: 'Deleting a menu' }, async ({ params }) => {
    const removed = await prisma.menu.deleteMany({ where: { id: idFrom(params.id, 'menu') } });
    return NextResponse.json({ removed: removed.count });
});
