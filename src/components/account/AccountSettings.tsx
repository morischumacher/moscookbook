'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { messageFrom } from '@/lib/apiMessage';
import { forgetOfflineCopies } from '@/lib/offlineCopies';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimarySmall, buttonDanger } from '@/lib/ui';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * The three things every tool of this shape lets you do to your own account,
 * and this one did not: correct your name, move the address, change the
 * password without pretending to have forgotten it. Plus the fourth, which is
 * leaving.
 *
 * One component rather than four, because they share the whole of their
 * mechanism — a small form, a saved/failed line, a password field where the
 * change matters — and four copies of that is four places for the message to
 * be forgotten. The forms differ in their fields and in nothing else.
 *
 * Each says what happened, in the same place, and clears the password it was
 * given the moment it is done with it: a password left in React state lives
 * as long as the tab does.
 */
type Panel = 'name' | 'email' | 'password';

export default function AccountSettings({
    firstName,
    lastName,
    email,
}: {
    firstName: string;
    lastName: string;
    email: string;
}) {
    const t = useTranslations('Account');
    const locale = useLocale();
    const router = useRouter();
    const [ask, dialog] = useConfirm();

    const [open, setOpen] = useState<Panel | null>(null);
    const [busy, setBusy] = useState(false);
    /** How the last thing went, and which section it belongs under. */
    const [said, setSaid] = useState<{ good: boolean; text: string; panel: Panel | 'devices' | 'delete' } | null>(null);

    const [first, setFirst] = useState(firstName);
    const [last, setLast] = useState(lastName);
    const [nextEmail, setNextEmail] = useState(email);
    const [password, setPassword] = useState('');
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    // Its own, not the address form's: one shared field meant a password typed
    // to change the address also sat in the "delete account" box below.
    const [deletePassword, setDeletePassword] = useState('');
    const [reveal, setReveal] = useState(false);

    const show = (panel: Panel) => {
        setOpen(open === panel ? null : panel);
        setSaid(null);
        setPassword('');
        setCurrent('');
        setNext('');
        setReveal(false);
    };

    /** One request, one sentence about how it went. */
    const send = async (
        url: string,
        init: RequestInit,
        good: string,
        fallback: string,
        panel: Panel | 'devices' | 'delete'
    ): Promise<boolean> => {
        setBusy(true);
        setSaid(null);

        try {
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...init,
            });

            if (!res.ok) {
                setSaid({ good: false, text: await messageFrom(res, fallback), panel });
                return false;
            }

            setSaid({ good: true, text: good, panel });
            // Done is done: the form closes, and what happened is said under
            // the heading. Left open, an emptied form with a password
            // manager's highlight on it read as "something still to do".
            if (panel !== 'devices' && panel !== 'delete') setOpen(null);
            return true;
        } catch {
            setSaid({ good: false, text: fallback, panel });
            return false;
        } finally {
            setBusy(false);
            // Whatever the outcome, the secrets go.
            setPassword('');
            setCurrent('');
            setNext('');
            setDeletePassword('');
        }
    };

    const saveName = async () => {
        const ok = await send(
            '/api/account/name',
            { method: 'POST', body: JSON.stringify({ firstName: first, lastName: last }) },
            t('nameSaved'),
            t('failed'),
            'name'
        );
        // The greeting in the header is rendered on the server and still says
        // the old name until the cached render is thrown away.
        if (ok) router.refresh();
    };

    const saveEmail = async () => {
        const ok = await send(
            '/api/account/email',
            { method: 'POST', body: JSON.stringify({ password, email: nextEmail, locale }) },
            t('emailSaved'),
            t('failed'),
            'email'
        );
        if (ok) router.refresh();
    };

    const savePassword = () =>
        send(
            '/api/account/password',
            { method: 'POST', body: JSON.stringify({ current, next, locale }) },
            t('passwordSaved'),
            t('failed'),
            'password'
        );

    const remove = async () => {
        const sure = await ask({
            title: t('deleteConfirm'),
            body: t('deleteBody'),
            confirmLabel: t('deleteAction'),
            destructive: true,
        });
        if (!sure) return;

        const ok = await send(
            '/api/account',
            { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) },
            t('deleted'),
            t('failed'),
            'delete'
        );

        if (!ok) return;
        await forgetOfflineCopies();

        /*
         * The same pair as LogoutButton, and for the same reason: the session
         * is gone on the server while every cached render above this page —
         * the header greeting, the navigation — still believes it is not.
         * `refresh()` throws that cache away, so the login page and the chrome
         * around it are rebuilt without the account that no longer exists.
         *
         * `replace` rather than `push`: back from the login form must not land
         * on the settings of a deleted account.
         *
         * This was a `window.location.href` assignment, on the theory that
         * only a full load could be trusted to forget the session. It could
         * not stay: `@next/next/no-location-assign-relative-destination` warns
         * on it, lint runs at --max-warnings 0, and the theory was wrong
         * anyway — sign-out has the identical problem and solves it here.
         */
        router.replace('/login');
        router.refresh();
    };

    /** Every device, this one included — the account's session version goes up. */
    const signOutEverywhere = async () => {
        const ok = await send(
            '/api/auth/logout',
            { method: 'POST', body: JSON.stringify({ everywhere: true }) },
            t('signedOutEverywhere'),
            t('failed'),
            'devices'
        );
        if (!ok) return;

        await forgetOfflineCopies();
        router.replace('/login');
        router.refresh();
    };

    const field =
        'w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-base outline-none transition-colors focus:border-ink';

    /** Under the section it is about, not in a box at the top of the page. */
    const note = (panel: Panel | 'devices' | 'delete') =>
        said?.panel === panel ? (
            <p
                role="status"
                className={`mt-3 rounded-lg p-3 text-sm ${
                    said.good ? 'bg-surface text-ink' : 'border border-danger-line bg-danger-surface text-danger'
                }`}
            >
                {said.good && <span aria-hidden="true">✓ </span>}
                {said.text}
            </p>
        ) : null;

    /*
     * The account's address, invisibly, in every form that asks for a
     * password. Password managers file a password under the username beside
     * it; without one, 1Password saved the new password as a login with no
     * name, or offered to update the wrong one.
     */
    const username = (
        <input
            type="email"
            name="username"
            value={email}
            autoComplete="username"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
        />
    );
    const legend = 'text-xs font-bold uppercase tracking-widest text-muted';
    const row = 'flex flex-col gap-1.5';

    return (
        <>
            {dialog}

            {/* ───────────────────────────────────────────────── the name */}
            <section className="mt-10 border-t border-line pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className={legend}>{t('nameTitle')}</h2>
                    <button
                        type="button"
                        onClick={() => show('name')}
                        className="text-sm underline underline-offset-4"
                    >
                        {open === 'name' ? t('close') : t('change')}
                    </button>
                </div>

                {open === 'name' && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void saveName();
                        }}
                        className="mt-4 flex flex-col gap-3"
                    >
                        <div className={row}>
                            <label htmlFor="account-first" className="text-sm text-muted">
                                {t('firstName')}
                            </label>
                            <input
                                id="account-first"
                                value={first}
                                onChange={(event) => setFirst(event.target.value)}
                                autoComplete="given-name"
                                className={field}
                            />
                        </div>

                        <div className={row}>
                            <label htmlFor="account-last" className="text-sm text-muted">
                                {t('lastName')}
                            </label>
                            <input
                                id="account-last"
                                value={last}
                                onChange={(event) => setLast(event.target.value)}
                                autoComplete="family-name"
                                className={field}
                            />
                        </div>

                        <button type="submit" disabled={busy} className={buttonPrimarySmall}>
                            <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                        </button>
                    </form>
                )}
                {note('name')}
            </section>

            {/* ──────────────────────────────────────────────── the address */}
            <section className="mt-8 border-t border-line pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className={legend}>{t('emailTitle')}</h2>
                    <button
                        type="button"
                        onClick={() => show('email')}
                        className="text-sm underline underline-offset-4"
                    >
                        {open === 'email' ? t('close') : t('change')}
                    </button>
                </div>

                <p className="mt-2 text-sm text-muted">{email}</p>

                {open === 'email' && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void saveEmail();
                        }}
                        className="mt-4 flex flex-col gap-3"
                    >
                        <p className="text-sm leading-relaxed text-muted">{t('emailBody')}</p>
                        {username}

                        <div className={row}>
                            <label htmlFor="account-email" className="text-sm text-muted">
                                {t('newEmail')}
                            </label>
                            <input
                                id="account-email"
                                type="email"
                                value={nextEmail}
                                onChange={(event) => setNextEmail(event.target.value)}
                                autoComplete="email"
                                className={field}
                            />
                        </div>

                        <div className={row}>
                            <label htmlFor="account-email-password" className="text-sm text-muted">
                                {t('yourPassword')}
                            </label>
                            <input
                                id="account-email-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                className={field}
                            />
                        </div>

                        <button type="submit" disabled={busy} className={buttonPrimarySmall}>
                            <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                        </button>
                    </form>
                )}
                {note('email')}
            </section>

            {/* ─────────────────────────────────────────────── the password */}
            <section className="mt-8 border-t border-line pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className={legend}>{t('passwordTitle')}</h2>
                    <button
                        type="button"
                        onClick={() => show('password')}
                        className="text-sm underline underline-offset-4"
                    >
                        {open === 'password' ? t('close') : t('change')}
                    </button>
                </div>

                {open === 'password' && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void savePassword();
                        }}
                        className="mt-4 flex flex-col gap-3"
                    >
                        {username}
                        <div className={row}>
                            <label htmlFor="account-current" className="text-sm text-muted">
                                {t('currentPassword')}
                            </label>
                            <input
                                id="account-current"
                                type="password"
                                value={current}
                                onChange={(event) => setCurrent(event.target.value)}
                                autoComplete="current-password"
                                className={field}
                            />
                        </div>

                        <div className={row}>
                            <label htmlFor="account-next" className="text-sm text-muted">
                                {t('newPassword')}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="account-next"
                                    name="new-password"
                                    type={reveal ? 'text' : 'password'}
                                    value={next}
                                    onChange={(event) => setNext(event.target.value)}
                                    autoComplete="new-password"
                                    minLength={8}
                                    // Read by Safari and 1Password when they
                                    // suggest a password, so the suggestion
                                    // fits the rule the server applies.
                                    {...{ passwordrules: 'minlength: 8;' }}
                                    className={field}
                                />
                                <button
                                    type="button"
                                    onClick={() => setReveal((shown) => !shown)}
                                    aria-pressed={reveal}
                                    className="shrink-0 text-sm text-muted underline underline-offset-4"
                                >
                                    {reveal ? t('hide') : t('show')}
                                </button>
                            </div>
                            <p className="text-xs text-faint">{t('passwordHint')}</p>
                        </div>

                        <button type="submit" disabled={busy || next.length < 8 || !current} className={buttonPrimarySmall}>
                            <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                        </button>
                    </form>
                )}
                {note('password')}
            </section>

            {/* ─────────────────────────────────────────────── the devices */}
            <section className="mt-8 border-t border-line pt-6">
                <h2 className={legend}>{t('devicesTitle')}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('devicesExplain')}</p>
                <button
                    type="button"
                    onClick={() => void signOutEverywhere()}
                    disabled={busy}
                    className="mt-3 text-sm underline underline-offset-4"
                >
                    {t('signOutEverywhere')}
                </button>
                {note('devices')}
            </section>

            {/* ───────────────────────────────────────────────── the exit */}
            <section className="mt-12 border-t border-danger-line pt-6">
                <h2 className={legend}>{t('deleteTitle')}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('deleteExplain')}</p>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void remove();
                    }}
                    className="mt-4 flex flex-col gap-3"
                >
                    {username}
                    <div className={row}>
                        <label htmlFor="account-delete-password" className="text-sm text-muted">
                            {t('yourPassword')}
                        </label>
                        <input
                            id="account-delete-password"
                            type="password"
                            value={deletePassword}
                            onChange={(event) => setDeletePassword(event.target.value)}
                            // "off", not current-password: a password manager
                            // filling this box by itself is the last thing an
                            // account deletion should have happen to it.
                            autoComplete="off"
                            {...{ 'data-1p-ignore': true }}
                            className={field}
                        />
                    </div>

                    <button type="submit" disabled={busy || deletePassword === ''} className={buttonDanger}>
                        <BusyLabel busy={busy && deletePassword !== ''}>{t('deleteAction')}</BusyLabel>
                    </button>
                </form>
                {note('delete')}
            </section>
        </>
    );
}
