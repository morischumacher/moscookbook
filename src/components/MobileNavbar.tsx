'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, usePathname as usePagePath } from '@/i18n/routing';
import Logo from './brand/Logo';
import LogoutButton from './LogoutButton';
import ProfileMenu from './ProfileMenu';
import { sectionFor, type Section } from '@/lib/navigation';

interface MobileNavbarProps {
    user: { id: number; email: string; name: string; admin: boolean } | null;
    /** Name and picture as they are now. Null when nobody is signed in. */
    profile: { name: string; avatarUrl: string | null } | null;
    otherLocale: string;
}

/**
 * The navigation.
 *
 * It used to be a row of up to eight links — Blog, Admin, Inbox, Users,
 * Invitations, Entries, Errors, Logout — with nothing marked as current and no
 * link to the recipes at all. You reached the recipes by pressing the logo,
 * which is a thing designers know and nobody else does; and having pressed
 * "Blog", there was no way back that said so. "Entries" sat two links from
 * "Blog" meaning the admin's view of the same thing.
 *
 * Four sections now — Recipes, Collections, Blog, Admin — one of which is
 * always marked, and the admin's tools moved to a navigation of their own on
 * the pages they belong to (components/admin/AdminNav.tsx). On a phone the
 * section you are in is also written beside the logo, so "where am I" is
 * answered without opening anything.
 *
 * Four is the ceiling. A fifth would need the bar to start making decisions
 * about what to hide, and a bar that hides things is the bar this replaced.
 *
 * One more rule worth keeping: every row in the open menu shares a single class.
 * LogoutButton is a <button>, and a button in a `flex-col` stretches to the
 * full width, which centres its label — so the menu used to have one entry
 * centred among left-aligned ones for no reason anybody could see.
 */
export default function MobileNavbar({ user, profile, otherLocale }: MobileNavbarProps) {
    const pagePath = usePagePath();
    const t = useTranslations('Navigation');
    const tBlog = useTranslations('Blog');
    const tCollections = useTranslations('Collections');
    const tShopping = useTranslations('Shopping');
    const tMenus = useTranslations('Menus');
    const [isOpen, setIsOpen] = useState(false);
    const toggleRef = useRef<HTMLButtonElement>(null);

    const current = sectionFor(usePathname());

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

    /**
     * The sections. Recipes first and always present, because they are what
     * the site is; the admin only for an admin.
     */
    const sections: { href: string; label: string; section: Section }[] = user
        ? [
              { href: '/', label: t('recipes'), section: 'recipes' },
              { href: '/collections', label: tCollections('nav'), section: 'collections' },
              { href: '/menus', label: tMenus('title'), section: 'menus' },
              { href: '/blog', label: tBlog('nav'), section: 'blog' },
              { href: '/shopping', label: tShopping('nav'), section: 'shopping' },
              ...(user.admin
                  ? [{ href: '/admin', label: t('admin'), section: 'admin' as Section }]
                  : []),
          ]
        : [];

    const currentLabel = sections.find((entry) => entry.section === current)?.label ?? '';

    /** One row, one rule. */
    const row =
        'py-2 text-base font-medium text-left hover:opacity-60 transition-opacity';

    return (
        <nav className="sticky top-0 z-[100] border-b border-line bg-page py-4">
            <div className="container mx-auto flex items-center justify-between px-4 md:px-8">
                <div className="flex min-w-0 items-center gap-3">
                    <Link
                        href="/"
                        onClick={close}
                        className="flex shrink-0 items-center transition-opacity hover:opacity-70"
                    >
                        <Logo height={44} priority />
                    </Link>

                    {/* Where you are, on the screen too narrow to show the
                        sections. Hidden once they are visible, since a marked
                        link says the same thing better. */}
                    {currentLabel && (
                        <span className="truncate text-xs font-semibold uppercase tracking-widest text-faint md:hidden">
                            {currentLabel}
                        </span>
                    )}
                </div>

                <div className="hidden items-center gap-7 md:flex">
                    {!user ? (
                        <Link href="/login" className="text-sm text-ink hover:opacity-60">
                            {t('login')}
                        </Link>
                    ) : (
                        <>
                            {sections.map((entry) => (
                                <Link
                                    key={entry.href}
                                    href={entry.href}
                                    aria-current={entry.section === current ? 'page' : undefined}
                                    className={`border-b-2 pb-0.5 text-sm transition-colors ${
                                        entry.section === current
                                            ? 'border-ink font-semibold text-ink'
                                            : 'border-transparent text-muted hover:text-ink'
                                    }`}
                                >
                                    {entry.label}
                                </Link>
                            ))}

                            {/* Your account, the language and signing out were
                                three items strung along this row, one of which
                                — the account — existed only inside the mobile
                                menu, so on a desktop there was no way to reach
                                it at all. One control in the corner now. */}
                            <ProfileMenu
                                user={profile ?? { name: user.name, avatarUrl: null }}
                                otherLocale={otherLocale}
                            />
                        </>
                    )}

                    {/* Signed out, the language still needs somewhere to live:
                        there is no profile menu to put it in. */}
                    {!user && (
                        <Link
                            // The same page in the other language, not the home page: from a
                            // recipe, "In English lesen" means this recipe.
                            href={pagePath}
                            locale={otherLocale}
                            lang={otherLocale}
                            className="text-sm font-medium text-muted transition-colors hover:text-ink"
                        >
                            {otherLocale.toUpperCase()}
                        </Link>
                    )}
                </div>

                <button
                    ref={toggleRef}
                    type="button"
                    className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded md:hidden"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? t('closeMenu') : t('toggleMenu')}
                    aria-expanded={isOpen}
                    aria-controls="mobile-menu"
                >
                    {/* Three bars that become a cross when the menu is open:
                        greying them out did not say "press to close". */}
                    <span className={`block h-0.5 w-6 bg-ink transition-transform ${isOpen ? 'translate-y-2 rotate-45' : ''}`} />
                    <span className={`block h-0.5 w-6 bg-ink transition-opacity ${isOpen ? 'opacity-0' : ''}`} />
                    <span className={`block h-0.5 w-6 bg-ink transition-transform ${isOpen ? '-translate-y-2 -rotate-45' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <>
                    {/* The panel used to sit on the page with nothing behind it,
                        so the search field showed through at its edge. This
                        covers what is underneath and closes on a tap.

                        It did not, until now: `bg-page/80` compiled to nothing
                        at all, so this element has been an invisible tap
                        target and the search field has been showing through
                        the whole time. tailwind.config.ts has the why. Here it
                        stays the page colour rather than the scrim, because
                        what it covers *is* the page, and it should follow the
                        page into dark mode. */}
                    <button
                        type="button"
                        aria-label={t('closeMenu')}
                        onClick={close}
                        className="fixed inset-0 top-[77px] z-40 bg-page/80 backdrop-blur-sm md:hidden"
                    />

                    <div
                        id="mobile-menu"
                        className="absolute left-0 top-full z-50 flex w-full flex-col items-start border-b border-line bg-page px-4 py-4 shadow-lg md:hidden"
                    >
                        {/* The greeting was a dead line of text at the top of
                            the menu. It is the obvious place to look for your
                            own account, so it leads there. */}
                        {user && (
                            <Link
                                href="/account"
                                onClick={close}
                                className="w-full pb-2 text-xs uppercase tracking-widest text-faint underline-offset-4 hover:underline"
                            >
                                {t('greeting', { name: user.name })}
                            </Link>
                        )}

                        <div className="flex w-full flex-col items-start">
                            {!user ? (
                                <Link href="/login" onClick={close} className={`${row} text-ink`}>
                                    {t('login')}
                                </Link>
                            ) : (
                                <>
                                    {sections.map((entry) => (
                                        <Link
                                            key={entry.href}
                                            href={entry.href}
                                            onClick={close}
                                            aria-current={
                                                entry.section === current ? 'page' : undefined
                                            }
                                            className={`${row} ${
                                                entry.section === current
                                                    ? 'font-bold text-ink underline underline-offset-4'
                                                    : 'text-ink'
                                            }`}
                                        >
                                            {entry.label}
                                        </Link>
                                    ))}

                                    <LogoutButton className={`${row} text-muted`} />
                                </>
                            )}
                        </div>

                        <Link
                            // The same page in the other language, not the home page: from a
                            // recipe, "In English lesen" means this recipe.
                            href={pagePath}
                            locale={otherLocale}
                            lang={otherLocale}
                            onClick={close}
                            className={`${row} mt-3 w-full border-t border-line pt-3 text-muted`}
                        >
                            {/* "Sprache: EN" read as "the language is EN"; this says what pressing does. */}
                            {t('switchLanguage')}
                        </Link>
                    </div>
                </>
            )}
        </nav>
    );
}
