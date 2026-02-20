import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();

        if (!email || !password || password.length < 6) {
            return NextResponse.json({ message: 'Invalid input data' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                admin: false // Default to standard user
            },
        });

        // Automatically log them in
        const res = NextResponse.json({ success: true });
        const session = await getIronSession<SessionData>(req, res, sessionOptions);

        session.user = {
            id: user.id,
            email: user.email,
            admin: user.admin,
        };

        await session.save();

        return res;
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
