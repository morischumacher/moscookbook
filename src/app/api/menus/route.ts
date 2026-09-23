import { NextResponse } from 'next/server';
import { route } from '@/lib/route';
import { menuInputSchema } from '@/lib/menu';
import { createMenu } from '@/lib/menuDb';

/** A new menu. Admin only, like collections: menus are made by the host. */
export const POST = route({ access: 'admin', body: menuInputSchema, label: 'Creating a menu' }, async ({ body }) => {
    return NextResponse.json(await createMenu(body), { status: 201 });
});
