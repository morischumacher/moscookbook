'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/** The one interactive part of the banner, kept small so the rest stays server-rendered. */
export default function ResendVerification() {
    const t = useTranslations('Auth');
    const locale = useLocale();
    const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

    const resend = async () => {
        setState('sending');

        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locale }),
            });

            setState(res.ok ? 'sent' : 'failed');
        } catch {
            setState('failed');
        }
    };

    if (state === 'sent') {
        return <span role="status">{t('verifyResent')}</span>;
    }

    return (
        <>
            <button
                type="button"
                onClick={resend}
                disabled={state === 'sending'}
                className="underline underline-offset-4 disabled:opacity-50"
            >
                {t('verifyResend')}
            </button>
            {state === 'failed' && <span role="status"> — {t('verifyResendFailed')}</span>}
        </>
    );
}
