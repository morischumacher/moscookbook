'use client';

import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function LogoutButton({ className }: { className?: string }) {
    const router = useRouter();
    const t = useTranslations('Navigation');

    const handleLogout = async () => {
        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) {
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Logout failure', error);
        }
    };

    return (
        <button onClick={handleLogout} className={className} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
            {t('logout', { defaultMessage: 'Logout' })}
        </button>
    );
}
