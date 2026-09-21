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
        // The chrome is stripped with classes rather than an inline style, so
        // the caller's className can still change alignment. As an inline style
        // it could not: `padding: 0` and a stretched button in a flex column
        // are what centred "Logout" in the middle of a left-aligned menu.
        <button
            type="button"
            onClick={handleLogout}
            className={`cursor-pointer border-none bg-transparent font-[inherit] ${className ?? ''}`}
        >
            {t('logout')}
        </button>
    );
}
