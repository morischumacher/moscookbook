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

export async function POST(req: NextRequest) {
    try {
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

        const recipe = await prisma.recipe.create({
            data: {
                title,
                slug,
                description,
                category,
                nationality,
                ingredients: JSON.stringify(ingredients),
                instructions,
                // Wait, my schema has Image[] relation. 
                // Implement plan said: 
                // model Recipe { ... images Image[] }
                // The mock data had imageUrl on the object.
                // I should probably add imageUrl to Recipe model for simplicity (thumbnail) or create an Image record.
                // For MVP, I'll add imageUrl to Recipe model if I can update schema, OR create an Image record.
                // Let's create an Image record.
                images: imageUrl ? {
                    create: {
                        url: imageUrl
                    }
                } : undefined
            }
        });

        return NextResponse.json(recipe, { status: 201 });
    } catch (error) {
        console.error('Create recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
