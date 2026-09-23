'use client';

import { useCallback, useState } from 'react';

/**
 * Put something on the clipboard and say so for a moment.
 *
 * The same nine lines were in five components — write, set a flag, clear it on
 * a timer, catch the refusal — and in two of them the catch was empty, which
 * is how a copy button comes to look identical whether it worked or not. The
 * code audit listed this as a deferred tidy; it is here because the reports
 * page needed a sixth copy of it.
 *
 * `token` is whatever the caller uses to tell its buttons apart — a row id, a
 * string, `true` for the only button on the page — and comes back as `copied`
 * until the moment passes. Refusal is reported rather than swallowed: the
 * clipboard is denied outright in some app views and over plain http, and a
 * person who is not told simply presses again.
 */
export function useCopy(): {
    copy: (text: string, token?: unknown) => Promise<boolean>;
    copied: unknown;
    failed: boolean;
} {
    const [copied, setCopied] = useState<unknown>(null);
    const [failed, setFailed] = useState(false);

    const copy = useCallback(async (text: string, token: unknown = true) => {
        setFailed(false);

        try {
            await navigator.clipboard.writeText(text);
            setCopied(token);
            window.setTimeout(() => setCopied(null), 2500);
            return true;
        } catch {
            setFailed(true);
            return false;
        }
    }, []);

    return { copy, copied, failed };
}
