import { ReactNode } from 'react';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions } from '@/lib/session';

interface SessionData {
    user?: {
        id: number;
        email: string;
        admin: boolean;
    };
}

export default async function AdminLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.user?.admin) {
        redirect(`/${locale}/login`);
    }

    return <>{children}</>;
}
