'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Logo from './brand/Logo';
import LogoutButton from './LogoutButton';

interface MobileNavbarProps {
    user: { id: number; email: string; name: string; admin: boolean } | null;
    otherLocale: string;
}

/**
 * The navigation.
 *
 * The menu it opens on a phone had three different rules in three lines: the
 * greeting in a blue that appears nowhere else in the design, "Logout" centred
 * while everything around it was left-aligned, and the language switch in the
 * serif face at a different weight. It also did not cover the page, so the
 * search field showed through at the seam.
 *
 * The centring had a cause worth writing down: LogoutButton is a <button>, and
 * a button in a `flex-col` stretches to the full width, which centres its
 * label. Every row is a single shared class now, so a new entry cannot invent
 * its own alignment by accident.
 */
export default function MobileNavbar({ user, otherLocale }: MobileNavbarProps) {
    const t = useTranslations('Navigation');
    const tInvites = useTranslations('Invites');
    const tInbox = useTranslations('Inbox');
    const tErrors = useTranslations('Errors');
    const [isOpen, setIsOpen] = useState(false);
    const toggleRef = useRef<HTMLButtonElement>(null);

    // Escape closes it and the focus goes back to the button that opened it,
    // or a keyboard user is left standing in a menu that is no longer there.
    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
            toggleRef.current?.focus();
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen]);

    const close = () => setIsOpen(false);

    /** One row, one rule. */
    const row =
        'py-2 text-base font-medium text-ink text-left hover:opacity-60 transition-opacity';
    const deskLink = 'text-sm text-ink hover:opacity-60 transition-opacity';


    const adminLinks = [
        { href: '/admin', label: t('admin') },
        { href: '/admin/inbox', label: tInbox('nav') },
        { href: '/admin/users', label: t('users') },
        { href: '/admin/invites', label: tInvites('nav') },
        { href: '/admin/errors', label: tErrors('nav') },
    ];

    return (
        <nav className="sticky top-0 z-[100] border-b border-line bg-page py-4">
            <div className="container mx-auto flex items-center justify-between px-4 md:px-8">
                <Link href="/" onClick={close} className="flex items-center transition-opacity hover:opacity-70">
                    <Logo height={44} priority />
                </Link>

                <div className="hidden items-center gap-8 md:flex">
                    {!user ? (
                        <Link href="/login" className={deskLink}>
                            {t('login')}
                        </Link>
                    ) : (
                        <>
                            {user.admin &&
                                adminLinks.map((link) => (
                                    <Link key={link.href} href={link.href} className={deskLink}>
                                        {link.label}
                                    </Link>
                                ))}
                            <LogoutButton className={deskLink} />
                        </>
                    )}

                    <Link
                        href="/"
                        locale={otherLocale}
                        className="text-sm font-medium text-muted transition-colors hover:text-ink"
                    >
                        {otherLocale.toUpperCase()}
                    </Link>
                </div>

                <button
                    ref={toggleRef}
                    type="button"
                    className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded md:hidden"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={t('toggleMenu')}
                    aria-expanded={isOpen}
                    aria-controls="mobile-menu"
                >
                    <span className={`block h-0.5 w-6 bg-ink transition-opacity ${isOpen ? 'opacity-40' : ''}`} />
                    <span className={`block h-0.5 w-6 bg-ink transition-opacity ${isOpen ? 'opacity-40' : ''}`} />
                    <span className={`block h-0.5 w-6 bg-ink transition-opacity ${isOpen ? 'opacity-40' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <>
                    {/* The panel used to sit on the page with nothing behind it,
                        so the search field showed through at its edge. This
                        covers what is underneath and closes on a tap. */}
                    <button
                        type="button"
                        aria-label={t('toggleMenu')}
                        onClick={close}
                        className="fixed inset-0 top-[77px] z-40 bg-page/80 backdrop-blur-sm md:hidden"
                    />

                    <div
                        id="mobile-menu"
                        className="absolute left-0 top-full z-50 flex w-full flex-col items-start border-b border-line bg-page px-4 py-4 shadow-lg md:hidden"
                    >
                        {user && (
                            <p className="w-full pb-2 text-xs uppercase tracking-widest text-faint">
                                {t('greeting', { name: user.name })}
                            </p>
                        )}

                        <div className="flex w-full flex-col items-start">
                            {!user ? (
                                <Link href="/login" onClick={close} className={row}>
                                    {t('login')}
                                </Link>
                            ) : (
                                <>
                                    {user.admin &&
                                        adminLinks.map((link) => (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={close}
                                                className={row}
                                            >
                                                {link.label}
                                            </Link>
                                        ))}
                                    <LogoutButton className={row} />
                                </>
                            )}

                        </div>

                        <Link
                            href="/"
                            locale={otherLocale}
                            onClick={close}
                            className={`${row} mt-3 w-full border-t border-line pt-3 text-muted`}
                        >
                            {t('language')}: {otherLocale.toUpperCase()}
                        </Link>
                    </div>
                </>
            )}
        </nav>
    );
}
