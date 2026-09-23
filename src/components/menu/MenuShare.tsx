'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonSecondary } from '@/lib/ui';

/**
 * The guests' link: the card and nothing else. Made on request, withdrawn
 * with one tap — the link stops working at once.
 */
export default function MenuShare({ id, initialToken }: { id: number; initialToken: string | null }) {
    const t = useTranslations('Menus');
    const locale = useLocale();
    const [token, setToken] = useState(initialToken);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    // The address needs the origin, which the server render does not know;
    // reading it during render would not match on hydration.
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);

    const url = token && origin ? `${origin}/${locale}/m/${token}` : '';

    const toggle = async () => {
        setBusy(true);
        setFailed(false);
        try {
            const res = await fetch(`/api/menus/${id}/share`, { method: token ? 'DELETE' : 'POST' });
            if (res.ok) setToken((await res.json()).shareToken ?? null);
            else setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!url) return;
        if (navigator.share) {
            await navigator.share({ url }).catch(() => null);
            return;
        }
        await navigator.clipboard.writeText(url).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <section className="rounded-2xl border border-line p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t('share')}</h2>
            <p className="mt-1 text-sm text-muted">{t('shareHint')}</p>
            {url && (
                <p className="mt-3 break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs">{url}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
                {url && (
                    <button type="button" onClick={() => void copy()} className={buttonSecondary}>
                        {copied ? t('copied') : t('copy')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void toggle()}
                    disabled={busy}
                    className={token ? 'text-sm text-muted underline underline-offset-4 hover:text-danger' : buttonSecondary}
                >
                    <BusyLabel busy={busy}>{token ? t('shareRemove') : t('shareCreate')}</BusyLabel>
                </button>
            </div>
            {failed && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {t('shareFailed')}
                </p>
            )}
        </section>
    );
}
