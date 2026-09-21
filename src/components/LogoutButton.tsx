'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export default function LogoutButton({ className }: { className?: string }) {
    const t = useTranslations('Navigation');
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) {
                // refresh() discards the cached server render, so the navigation
                // and every page below it are rebuilt without the session.
                router.push('/');
                router.refresh();
            }
        } catch (error) {
            console.error('Logout failure', error);
        }
    };

    return (
        <button onClick={handleLogout} className={className} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
            {t('logout')}
        </button>
    );
}
