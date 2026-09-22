'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Avatar from './Avatar';
import LogoutButton from './LogoutButton';

/**
 * You, top right.
 *
 * The three things that are about the person rather than about the cookbook —
 * your account, the language, signing out — were three separate items strung
 * along the header, and one of them (the account) existed only inside the
 * mobile menu, so on a desktop there was no way to reach it at all.
 *
 * They are one control now, in the corner every application of this shape puts
 * it in, which also takes two items out of a bar that was running out of room.
 *
 * Deliberately not a library. A menu is a button, a list, Escape, a click
 * outside, and focus going back where it came from; the rest of what a menu
 * package brings — portals, floating-position maths, a focus trap — is for
 * menus that have to survive being opened inside a scrolling table.
 */
export default function ProfileMenu({
    user,
    otherLocale,
}: {
    user: { name: string; avatarUrl: string | null };
    otherLocale: string;
}) {
    const t = useTranslations('Navigation');
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    // Escape closes it and the focus goes back to the button that opened it,
    // or a keyboard user is left standing in a menu that is no longer there.
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            button.current?.focus();
        };

        // `pointerdown`, not `click`: a click outside that lands on another
        // button should close this *and* press that, and waiting for the click
        // to finish means the first tap elsewhere only ever closes the menu.
        const onOutside = (event: PointerEvent) => {
            const target = event.target as Node;
            if (panel.current?.contains(target) || button.current?.contains(target)) return;
            setOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onOutside);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onOutside);
        };
    }, [open]);

    const row = 'block w-full px-4 py-2.5 text-left text-sm hover:bg-surface';

    return (
        <div className="relative">
            <button
                ref={button}
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={t('accountMenu')}
                className="flex items-center rounded-full transition-opacity hover:opacity-70"
            >
                <Avatar name={user.name} url={user.avatarUrl} size={32} />
            </button>

            {open && (
                <div
                    ref={panel}
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-page py-1 shadow-lg"
                >
                    <p className="truncate px-4 py-2 text-xs uppercase tracking-widest text-faint">
                        {user.name}
                    </p>

                    <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className={row}>
                        {t('account')}
                    </Link>

                    <Link
                        href="/"
                        locale={otherLocale}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className={row}
                    >
                        {t('language')} · {otherLocale.toUpperCase()}
                    </Link>

                    <div className="my-1 border-t border-line" />

                    <LogoutButton className={row} />
                </div>
            )}
        </div>
    );
}
