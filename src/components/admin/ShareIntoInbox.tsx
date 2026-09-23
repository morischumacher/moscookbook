'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Loading from '@/components/ui/Loading';

/**
 * Sends a share into the inbox once, on arrival. A ref guards against React
 * running the effect twice in development and against a reload re-sending:
 * the page's own address still carries the share, so it is replaced first.
 */
export default function ShareIntoInbox({ title, text, url }: { title: string; text: string; url: string }) {
    const t = useTranslations('ShareTarget');
    const sent = useRef(false);
    const [state, setState] = useState<'sending' | 'done' | 'failed'>('sending');

    useEffect(() => {
        if (sent.current) return;
        sent.current = true;
        window.history.replaceState(null, '', window.location.pathname);

        fetch('/api/capture/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, text, url }),
        })
            .then((res) => setState(res.ok ? 'done' : 'failed'))
            .catch(() => setState('failed'));
    }, [title, text, url]);

    const shown = url || text || title;

    return (
        <div>
            {shown && <p className="mb-6 break-words rounded-xl bg-surface p-4 text-sm text-muted">{shown}</p>}
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
