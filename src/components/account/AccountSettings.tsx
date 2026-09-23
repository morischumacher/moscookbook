'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { messageFrom } from '@/lib/apiMessage';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimarySmall, buttonDanger } from '@/lib/ui';

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
    const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);

    const [first, setFirst] = useState(firstName);
    const [last, setLast] = useState(lastName);
    const [nextEmail, setNextEmail] = useState(email);
    const [password, setPassword] = useState('');
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');

    const show = (panel: Panel) => {
        setOpen(open === panel ? null : panel);
        setSaid(null);
        setPassword('');
        setCurrent('');
        setNext('');
    };

    /** One request, one sentence about how it went. */
    const send = async (
        url: string,
        init: RequestInit,
        good: string,
        fallback: string
    ): Promise<boolean> => {
        setBusy(true);
        setSaid(null);

        try {
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...init,
            });

            if (!res.ok) {
                setSaid({ good: false, text: await messageFrom(res, fallback) });
                return false;
            }

            setSaid({ good: true, text: good });
            return true;
        } catch {
            setSaid({ good: false, text: fallback });
            return false;
        } finally {
            setBusy(false);
            // Whatever the outcome, the secrets go.
            setPassword('');
            setCurrent('');
            setNext('');
        }
    };

    const saveName = async () => {
        const ok = await send(
            '/api/account/name',
            { method: 'POST', body: JSON.stringify({ firstName: first, lastName: last }) },
            t('nameSaved'),
            t('failed')
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
            t('failed')
        );
        if (ok) router.refresh();
    };

    const savePassword = () =>
        send(
            '/api/account/password',
            { method: 'POST', body: JSON.stringify({ current, next }) },
            t('passwordSaved'),
            t('failed')
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
            { method: 'DELETE', body: JSON.stringify({ password }) },
            t('deleted'),
            t('failed')
        );

        // A full load, not router.push: the session is gone and every cached
        // server render above this page still believes it is not.
        if (ok) window.location.href = `/${locale}/login`;
    };

    const field =
        'w-full min-w-0 rounded border border-control bg-transparent px-2 py-1.5 text-base';
    const legend = 'text-xs font-bold uppercase tracking-widest text-muted';
    const row = 'flex flex-col gap-1.5';

    return (
        <>
            {dialog}

            {said && (
                <p
                    role="status"
                    className={`mt-6 rounded-lg border p-3 text-sm ${
                        said.good
                            ? 'border-line text-muted'
                            : 'border-danger-line bg-danger-surface text-danger'
                    }`}
                >
                    {said.text}
                </p>
            )}

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
                            {t('save')}
                        </button>
                    </form>
                )}
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
                            {t('save')}
                        </button>
                    </form>
                )}
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
                            <input
                                id="account-next"
                                type="password"
                                value={next}
                                onChange={(event) => setNext(event.target.value)}
                                autoComplete="new-password"
                                className={field}
                            />
                        </div>

                        <button type="submit" disabled={busy} className={buttonPrimarySmall}>
                            {t('save')}
                        </button>
                    </form>
                )}
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
                    <div className={row}>
                        <label htmlFor="account-delete-password" className="text-sm text-muted">
                            {t('yourPassword')}
                        </label>
                        <input
                            id="account-delete-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            className={field}
                        />
                    </div>

                    <button type="submit" disabled={busy || password === ''} className={buttonDanger}>
                        {t('deleteAction')}
                    </button>
                </form>
            </section>
        </>
    );
}
