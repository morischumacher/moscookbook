'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Loading from '@/components/ui/Loading';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * Sends a share into the inbox once, on arrival. A ref guards against React
 * running the effect twice in development and against a reload re-sending:
 * the page's own address still carries the share, so it is replaced first.
 */
export default function ShareIntoInbox({
    title,
    text,
    url,
    confirm = false,
}: {
    title: string;
    text: string;
    url: string;
    /** Arrived from another site rather than the share sheet: ask first. */
    confirm?: boolean;
}) {
    const t = useTranslations('ShareTarget');
    const sent = useRef(false);
    // Opened with nothing shared — from the history, or typed in — is not a
    // failed share, and sending an empty one only earned a 400.
    const empty = !(title.trim() || text.trim() || url.trim());
    const [state, setState] = useState<'asking' | 'sending' | 'done' | 'failed'>(confirm ? 'asking' : 'sending');

    const send = useCallback(() => {
        if (sent.current || empty) return;
        sent.current = true;
        window.history.replaceState(null, '', window.location.pathname);

        fetch('/api/capture/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, text, url }),
        })
            .then((res) => setState(res.ok ? 'done' : 'failed'))
            .catch(() => setState('failed'));
    }, [title, text, url, empty]);

    useEffect(() => {
        if (!confirm) send();
    }, [confirm, send]);

    const shown = url || text || title;

    if (empty) return <p className="text-muted">{t('nothing')}</p>;

    return (
        <div>
            {shown && <p className="mb-6 break-words rounded-xl bg-surface p-4 text-sm text-muted">{shown}</p>}
            {state === 'asking' && (
                <button
                    type="button"
                    onClick={() => {
                        setState('sending');
                        send();
                    }}
                    className={buttonPrimarySmall}
                >
                    {t('confirm')}
                </button>
            )}
            {state === 'sending' && <Loading label={t('sending')} />}
            {state === 'done' && (
                <p role="status" className="text-lg">
                    {t('done')}{' '}
                    <Link href="/admin/inbox" className="font-medium underline underline-offset-4">
                        {t('openInbox')}
                    </Link>
                </p>
            )}
            {state === 'failed' && <p role="alert" className="text-danger">{t('failed')}</p>}
        </div>
    );
}
