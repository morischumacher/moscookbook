'use client';

import { useCallback, type ReactNode } from 'react';
import { useConfirm } from './useConfirm';
import { messageFrom } from '@/lib/apiMessage';

/**
 * A request that says so when it fails.
 *
 * The interaction map turned up seven buttons whose failure was indistinguishable
 * from success: logging out left you logged in with the button looking dead, the
 * favourite heart reverted without a word, the AI mode chip had already moved
 * before the save was attempted and never moved back, deleting a key or
 * forgetting a site reloaded a list that had not changed. Each one had caught
 * its own failure and then had nowhere to put it, because telling the person
 * meant building a place to tell them, and none of those components had one.
 *
 * So here is the place. `run` performs the request, and if it fails — a thrown
 * fetch, a status that is not ok — it shows the same dialog the rest of the
 * application already uses for "there is nothing to decide, but you should know
 * this", carrying whatever the route said, or the caller's sentence when the
 * route said nothing usable.
 *
 *     const [run, dialog] = useAction();
 *     …
 *     const done = await run(() => fetch('/api/…', { method: 'POST' }), t('couldNotSave'));
 *     if (!done) return;              // the person has already been told
 *     …
 *     return <>{dialog}…</>;
 *
 * It returns the `Response` so the caller can read a body it wanted anyway, and
 * `null` when it failed, which is the one thing every caller has to check. That
 * asymmetry is deliberate: `if (!done) return;` is one line and reads as what it
 * is, where a thrown error would have every one of these components growing a
 * try/catch again.
 *
 * What it does not do is decide what happens next. Reverting an optimistic
 * heart, putting a chip back, leaving a list alone — those are the caller's,
 * because only the caller knows what it changed before asking.
 */
export type Run = (request: () => Promise<Response>, fallback: string) => Promise<Response | null>;

export function useAction(): [Run, ReactNode] {
    const [ask, dialog] = useConfirm();

    const run = useCallback<Run>(
        async (request, fallback) => {
            let response: Response;

            try {
                response = await request();
            } catch {
                // No network, or the request never left. There is no body to
                // read and nothing to add: the caller's sentence is the whole
                // of what is known.
                await ask({ title: fallback, kind: 'alert' });
                return null;
            }

            if (!response.ok) {
                await ask({ title: await messageFrom(response, fallback), kind: 'alert' });
                return null;
            }

            return response;
        },
        [ask]
    );

    return [run, dialog];
}
