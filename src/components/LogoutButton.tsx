'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAction } from '@/components/ui/useAction';

export default function LogoutButton({ className }: { className?: string }) {
    const t = useTranslations('Navigation');
    const router = useRouter();
    const [run, dialog] = useAction();

    const handleLogout = async () => {
        /*
         * This used to be a try/catch around a bare `if (res.ok)`, so a failed
         * sign-out logged a line nobody reads and left the button looking like
         * it had done nothing — while the session was still live. Of the seven
         * silent failures the interaction map found, this was the one with
         * consequences: somebody who believes they are signed out and is not.
         */
        if (!(await run(() => fetch('/api/auth/logout', { method: 'POST' }), t('logoutFailed')))) return;

        // refresh() discards the cached server render, so the navigation
        // and every page below it are rebuilt without the session.
        router.push('/');
        router.refresh();
    };

    return (
        <>
            {dialog}
            {/* The chrome is stripped with classes rather than an inline style,
                so the caller's className can still change alignment. As an
                inline style it could not: `padding: 0` and a stretched button
                in a flex column are what centred the label in the middle of a
                left-aligned menu. */}
            <button
                type="button"
                onClick={handleLogout}
                className={`cursor-pointer border-none bg-transparent font-[inherit] ${className ?? ''}`}
            >
                {t('logout')}
            </button>
        </>
    );
}
