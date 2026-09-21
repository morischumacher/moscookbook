'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';

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

export default function AdminInvitesPage() {
    const t = useTranslations('Invites');
    const tAdmin = useTranslations('Admin');
    const locale = useLocale();
    const router = useRouter();

    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [note, setNote] = useState('');
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

    const linkFor = (code: string) =>
        `${window.location.origin}/${locale}/register?invite=${encodeURIComponent(code)}`;

    const create = async () => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });
            if (!res.ok) throw new Error(tAdmin('genericError'));
            setNote('');
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
        if (!confirm(t('confirmRevoke'))) return;
        try {
            const res = await fetch(`/api/invites/${invite.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(tAdmin('genericError'));
            setInvites((current) => current.filter((entry) => entry.id !== invite.id));
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        }
    };

    const dateFormat = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    const stateLabel = (state: Invite['state']) =>
        state === 'used' ? t('stateUsed') : state === 'expired' ? t('stateExpired') : t('stateValid');

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <button
                    type="button"
                    onClick={() => router.push('/admin')}
                    className="text-sm underline underline-offset-4 hover:text-muted"
                >
                    {tAdmin('backToRecipes')}
                </button>
            </header>

            <div className="flex flex-col gap-3 border-b border-line py-6 sm:flex-row">
                <input
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={t('notePlaceholder')}
                    className="flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink"
                />
                <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-medium text-page disabled:opacity-50"
                >
                    {creating ? t('creating') : t('create')}
                </button>
            </div>

            {error && <p className="py-4 text-sm text-danger">{error}</p>}

            {loading ? (
                <p className="py-20 text-center text-muted">{t('loading')}</p>
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
                                        : t('expiresOn', { date: dateFormat.format(new Date(invite.expiresAt)) })}
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
                                <button
                                    type="button"
                                    onClick={() => revoke(invite)}
                                    className="underline underline-offset-4 hover:text-danger"
                                >
                                    {t('revoke')}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
