import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import prisma from '@/lib/prisma';

interface SessionData {
    user?: {
        id: number;
        email: string;
        admin: boolean;
    };
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> } // In Next.js App Router, dynamic route params are Promises
) {
    try {
        const { id } = await context.params;
        const recipeId = parseInt(id, 10);

        if (isNaN(recipeId)) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        const res = new NextResponse();
        const serverSession = await getIronSession<SessionData>(req, res, sessionOptions);

        if (!serverSession.user?.admin) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { title, slug, description, category, nationality, ingredients, instructions, imageUrl } = body;

        // Basic validation
        if (!title || !slug || !instructions) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        // First, handle the image link. If the user provided an image, we can either update the existing one or create it.
        // For simplicity, we can delete the existing relations and create the new one, or just update the first image.

        // Let's delete existing images attached to this recipe
        await prisma.image.deleteMany({
            where: { recipeId }
        });

        // Now update the main recipe record
        const updatedRecipe = await prisma.recipe.update({
            where: { id: recipeId },
            data: {
                title,
                slug,
                description,
                category,
                nationality,
                ingredients: JSON.stringify(ingredients),
                instructions,
                images: imageUrl ? {
                    create: {
                        url: imageUrl
                    }
                } : undefined
            }
        });

        return NextResponse.json(updatedRecipe, { status: 200 });
    } catch (error) {
        console.error('Update recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const recipeId = parseInt(id, 10);

        if (isNaN(recipeId)) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        const res = new NextResponse();
        const serverSession = await getIronSession<SessionData>(req, res, sessionOptions);

        if (!serverSession.user?.admin) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Delete relations first to avoid foreign key constraints if cascade wasn't enabled natively
        await prisma.image.deleteMany({ where: { recipeId } });
        await prisma.rating.deleteMany({ where: { recipeId } });
        await prisma.favorite.deleteMany({ where: { recipeId } });

        // Finally, delete the actual recipe
        await prisma.recipe.delete({ where: { id: recipeId } });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Delete recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
