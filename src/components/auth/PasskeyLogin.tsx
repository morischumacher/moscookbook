'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication, WebAuthnAbortService } from '@simplewebauthn/browser';
import { messageFrom, sayable } from '@/lib/apiMessage';
import { buttonSecondary } from '@/lib/ui';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * "Sign in with a passkey", and the quieter version of the same: where the
 * browser supports it, tapping the e-mail field already offers the passkey
 * (autofill), so most of the time the button is not even needed.
 */
export default function PasskeyLogin({ onSignedIn, onError }: { onSignedIn: (admin: boolean) => void; onError: (message: string) => void }) {
    const t = useTranslations('Auth');
    const [supported, setSupported] = useState(false);
    const [busy, setBusy] = useState(false);
    const autofillStarted = useRef(false);

    const signIn = async (autofill: boolean) => {
        const optionsRes = await fetch('/api/auth/passkey-options', { method: 'POST' });
        if (!optionsRes.ok) throw new Error(await messageFrom(optionsRes, t('failed')));
        const answer = await startAuthentication({ optionsJSON: await optionsRes.json(), useBrowserAutofill: autofill });
        const res = await fetch('/api/auth/passkey-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(answer),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(sayable(data?.message, t('failed')));
        onSignedIn(Boolean(data.admin));
    };

    useEffect(() => {
        if (!browserSupportsWebAuthn()) return;
        setSupported(true);
        if (autofillStarted.current) return;
        autofillStarted.current = true;
        // Waits quietly for the person to pick a passkey from the e-mail
        // field's suggestions; the button below cancels it and asks directly.
        void browserSupportsWebAuthnAutofill().then((yes) => {
            if (yes) signIn(true).catch(() => undefined);
        });
        return () => WebAuthnAbortService.cancelCeremony();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!supported) return null;

    return (
        <button
            type="button"
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                try {
                    await signIn(false);
                } catch (error) {
                    const name = error instanceof Error ? error.name : '';
                    if (name !== 'NotAllowedError' && name !== 'AbortError') {
                        onError(error instanceof Error && error.message ? error.message : t('failed'));
                    }
                } finally {
                    setBusy(false);
                }
            }}
            className={`${buttonSecondary} w-full`}
        >
            <BusyLabel busy={busy}>
                <span aria-hidden="true">🔑 </span>
                {t('passkeyLogin')}
            </BusyLabel>
        </button>
    );
}
