'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { messageFrom } from '@/lib/apiMessage';
import { formatDate } from '@/lib/formatDate';
import { BusyLabel } from '@/components/ui/Busy';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';

interface Passkey {
    id: number;
    name: string;
    backedUp: boolean;
    createdAt: string;
    lastUsedAt: string | null;
}

/**
 * Your passkeys: the list, adding one (after the password, see the options
 * route), and taking one away.
 */
export default function Passkeys({ email }: { email: string }) {
    const t = useTranslations('Account');
    const locale = useLocale();
    const [keys, setKeys] = useState<Passkey[] | null>(null);
    const [supported, setSupported] = useState(true);
    const [adding, setAdding] = useState(false);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        const res = await fetch('/api/account/passkeys').catch(() => null);
        if (res?.ok) setKeys((await res.json()).passkeys);
    }, []);

    useEffect(() => {
        setSupported(browserSupportsWebAuthn());
        void load();
    }, [load]);

    const add = async () => {
        setBusy(true);
        setSaid(null);
        try {
            const optionsRes = await fetch('/api/account/passkeys/options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!optionsRes.ok) {
                setSaid({ good: false, text: await messageFrom(optionsRes, t('failed')) });
                return;
            }
            // The device asks for Face ID, Touch ID or the password manager here.
            const answer = await startRegistration({ optionsJSON: await optionsRes.json() });
            const res = await fetch('/api/account/passkeys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(answer),
            });
            if (!res.ok) {
                setSaid({ good: false, text: await messageFrom(res, t('failed')) });
                return;
            }
            setSaid({ good: true, text: t('passkeyAdded') });
            setAdding(false);
            await load();
        } catch (error) {
            // Cancelled on the device, or a passkey for this account already
            // lives in that password manager.
            const name = error instanceof Error ? error.name : '';
            setSaid({
                good: false,
                text: name === 'InvalidStateError' ? t('passkeyExists') : name === 'NotAllowedError' ? t('passkeyCancelled') : t('failed'),
            });
        } finally {
            setBusy(false);
            setPassword('');
        }
    };

    const remove = async (id: number) => {
        setBusy(true);
        const res = await fetch(`/api/account/passkeys/${id}`, { method: 'DELETE' }).catch(() => null);
        setBusy(false);
        // It said "removed" whatever happened.
        setSaid(res?.ok ? { good: true, text: t('passkeyRemoved') } : { good: false, text: t('passkeyRemoveFailed') });
        await load();
    };

    return (
        <section className="mt-8 border-t border-line pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t('passkeysTitle')}</h2>
                {supported && !adding && (
                    <button type="button" onClick={() => { setAdding(true); setSaid(null); }} className="text-sm underline underline-offset-4">
                        {t('passkeyAdd')}
                    </button>
                )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{supported ? t('passkeysExplain') : t('passkeysUnsupported')}</p>

            {keys && keys.length > 0 && (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                    {keys.map((key) => (
                        <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                            <span className="min-w-0">
                                <span className="block truncate font-medium">
                                    🔑 {key.name}
                                    {key.backedUp && <span className="ml-2 text-xs font-normal text-faint">{t('passkeySynced')}</span>}
                                </span>
                                <span className="block text-xs text-faint">
                                    {key.lastUsedAt
                                        ? t('passkeyUsed', { date: formatDate(new Date(key.lastUsedAt), locale, 'short') })
                                        : t('passkeyAddedOn', { date: formatDate(new Date(key.createdAt), locale, 'short') })}
                                </span>
                            </span>
                            <InlineConfirm
                                label={t('passkeyRemove')}
                                confirmLabel={t('passkeyRemove')}
                                destructive
                                disabled={busy}
                                onConfirm={() => remove(key.id)}
                                className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-danger"
                            />
                        </li>
                    ))}
                </ul>
            )}

            {adding && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void add();
                    }}
                    className="mt-4 flex flex-col gap-3"
                >
                    <input type="email" name="username" value={email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
                    <label htmlFor="passkey-password" className="text-sm text-muted">
                        {t('yourPassword')}
                    </label>
                    <input
                        id="passkey-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        className="w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-base outline-none transition-colors focus:border-ink"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="submit" disabled={busy || !password} className={buttonPrimarySmall}>
                            <BusyLabel busy={busy}>{t('passkeyCreate')}</BusyLabel>
                        </button>
                        <button type="button" onClick={() => setAdding(false)} className={buttonSecondary}>
                            {t('close')}
                        </button>
                    </div>
                </form>
            )}

            {said && (
                <p
                    role={said.good ? 'status' : 'alert'}
                    className={`mt-3 rounded-lg p-3 text-sm ${said.good ? 'bg-surface text-ink' : 'border border-danger-line bg-danger-surface text-danger'}`}
                >
                    {said.good && <span aria-hidden="true">✓ </span>}
                    {said.text}
                </p>
            )}
        </section>
    );
}
