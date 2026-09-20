import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

// The middleware also guards /admin, but this server-side check is the one
// that actually protects the data: it runs no matter how the route was reached.
export default async function AdminLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const user = await getCurrentUser();

    if (!user?.admin) {
        redirect(`/${locale}/login`);
    }

    return <>{children}</>;
}
