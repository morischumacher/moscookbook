'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall } from '@/lib/ui';
import Loading from '@/components/ui/Loading';
import type { NameCheck } from '@/lib/inviteName';

interface Invite {
    id: number;
    code: string;
    note: string | null;
    createdAt: string;
    expiresAt: string;
    usedAt: string | null;
    state: 'valid' | 'used' | 'expired' | 'unknown';
    usedByEmail: string | null;
}

/**
 * The way somebody gets an account: a link with a code in it.
 *
 * Sits under the account list rather than on a page of its own, because an
 * invitation is a person who has not arrived yet, and "Users" beside
 * "Invitations" in a navigation made a reader work out the difference before
 * they could choose.
 */
export default function InvitationList() {
    const t = useTranslations('Invites');
    const tAdmin = useTranslations('Admin');
    const locale = useLocale();

    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [check, setCheck] = useState<NameCheck>({ state: 'free' });
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/invites');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();
            setInvites(data.invites);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    /*
     * Asked while typing, so a name that is already somebody's is said
     * before the link exists — with the two ways out: another first name, or
     * a last name as well. See lib/inviteName.
     */
    useEffect(() => {
        if (firstName.trim() === '') return;
        // An answer to an earlier keystroke that arrives late is dropped.
        let current = true;
        const timer = setTimeout(() => {
            const query = new URLSearchParams({ first: firstName, last: lastName });
            fetch(`/api/invites/name?${query}`)
                .then((res) => (res.ok ? res.json() : { state: 'free' }))
                .then((answer: NameCheck) => {
                    if (current) setCheck(answer);
                })
                .catch(() => undefined);
        }, 300);
        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [firstName, lastName]);

    const clash = firstName.trim() !== '' && check.state !== 'free';
    const needsLastName = check.state !== 'free' || lastName !== '';

    const linkFor = (code: string) =>
        `${window.location.origin}/${locale}/register?invite=${encodeURIComponent(code)}`;

    const create = async () => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName }),
            });
            if (res.status === 409) {
                setCheck(await res.json());
                return;
            }
            if (!res.ok) throw new Error(tAdmin('genericError'));
            setFirstName('');
            setLastName('');
            setCheck({ state: 'free' });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setCreating(false);
        }
    };

    const copy = async (invite: Invite) => {
        try {
            await navigator.clipboard.writeText(linkFor(invite.code));
            setCopiedId(invite.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // Clipboard access can be refused; the link is visible either way.
            setError(tAdmin('genericError'));
        }
    };

    const revoke = async (invite: Invite) => {
        try {
            const res = await fetch(`/api/invites/${invite.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(tAdmin('genericError'));
            setInvites((current) => current.filter((entry) => entry.id !== invite.id));
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        }
    };


    const stateLabel = (state: Invite['state']) =>
        state === 'used' ? t('stateUsed') : state === 'expired' ? t('stateExpired') : t('stateValid');

    return (
        <section>
            <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">
                {t('title')}
            </h2>

            <div className="flex flex-col gap-3 border-b border-line py-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        value={firstName}
                        onChange={(event) => {
                            setFirstName(event.target.value);
                            if (event.target.value.trim() === '') setCheck({ state: 'free' });
                        }}
                        placeholder={t('firstNamePlaceholder')}
                        // A placeholder is not a label: it vanishes the moment
                        // somebody types, taking the only explanation with it.
                        aria-label={t('firstNamePlaceholder')}
                        aria-invalid={clash}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink"
                    />
                    {needsLastName && (
                        <input
                            type="text"
                            value={lastName}
                            onChange={(event) => setLastName(event.target.value)}
                            placeholder={t('lastNamePlaceholder')}
                            aria-label={t('lastNamePlaceholder')}
                            autoComplete="off"
                            className="min-w-0 flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink"
                        />
                    )}
                </div>

                {clash && (
                    <p role="status" className="text-sm text-danger">
                        {check.state === 'firstTaken'
                            ? check.holders.every((holder) => holder.toLowerCase() === firstName.trim().toLowerCase())
                                ? t('firstTakenPlain', { name: firstName.trim() })
                                : t('firstTaken', { name: firstName.trim(), holders: check.holders.join(', ') })
                            : t('fullTaken', { name: `${firstName.trim()} ${lastName.trim()}` })}
                    </p>
                )}
                {!clash && firstName.trim() !== '' && (
                    <p className="text-sm text-muted">{t('nameFixed')}</p>
                )}

                <button
                    type="button"
                    onClick={create}
                    disabled={creating || firstName.trim() === '' || clash}
                    className={buttonPrimarySmall}
                >
                    {creating ? t('creating') : t('create')}
                </button>
            </div>

            {error && <p className="py-4 text-sm text-danger">{error}</p>}

            {loading ? (
                <Loading label={t('loading')} className="py-20" />
            ) : invites.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('none')}</p>
            ) : (
                <ul className="divide-y divide-line">
                    {invites.map((invite) => (
                        <li key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">
                                    {invite.note || t('title')}
                                </p>
                                <p className="truncate text-sm text-muted">
                                    {invite.usedByEmail
                                        ? t('usedBy', { email: invite.usedByEmail })
                                        : t('expiresOn', { date: formatDate(invite.expiresAt, locale, 'short') })}
                                </p>
                            </div>

                            <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-widest ${invite.state === 'valid'
                                    ? 'bg-ink text-page'
                                    : 'border border-line text-muted'
                                    }`}
                            >
                                {stateLabel(invite.state)}
                            </span>

                            <div className="flex shrink-0 items-center gap-3 text-sm">
                                {invite.state === 'valid' && (
                                    <button
                                        type="button"
                                        onClick={() => copy(invite)}
                                        className="underline underline-offset-4 hover:text-muted"
                                    >
                                        {copiedId === invite.id ? t('copied') : t('copy')}
                                    </button>
                                )}
                                <InlineConfirm
                                    label={t('revoke')}
                                    confirmLabel={t('revoke')}
                                    destructive
                                    onConfirm={() => revoke(invite)}
                                    className="underline underline-offset-4 hover:text-danger"
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
