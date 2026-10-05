'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';

interface Person {
    id: number;
    name: string;
}

interface Household {
    owner: Person;
    members: Person[];
    invited: Person[];
}

/**
 * Who else is on the list, for its owner — shown in a sheet from the list's
 * menu.
 *
 * People of the cookbook are found by searching for their name, not picked
 * from everybody (with a hundred people that was a wall of names). Once they
 * accept, it is the list they shop on too. And a link: anybody holding it can
 * see the list, even without an account; ticking and adding through it needs
 * an account and the owner's leave. The address itself is not shown — it is
 * sent or copied, which is what anybody wants to do with it.
 */
export default function ShoppingSharing({
    listId,
    shareLink,
    onShareToken,
    canAdd: initialCanAdd,
    onNote,
    onChanged,
}: {
    listId: number;
    shareLink: string | null;
    onShareToken: (token: string | null) => void;
    canAdd: boolean;
    onNote: (note: string) => void;
    /** Somebody joined or was taken off: the page's names change. */
    onChanged: () => void;
}) {
    const t = useTranslations('Shopping');
    const [ask, dialog] = useConfirm();
    const [household, setHousehold] = useState<Household | null>(null);
    const [query, setQuery] = useState('');
    const [matches, setMatches] = useState<Person[] | null>(null);
    const [canAdd, setCanAdd] = useState(initialCanAdd);
    const [busy, setBusy] = useState<number | 'link' | 'canAdd' | null>(null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/shopping/members?list=${listId}`).catch(() => null);
        if (!res?.ok) return;
        setHousehold(((await res.json()) as { household: Household }).household);
    }, [listId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, from the server
        void load();
    }, [load]);

    // Asked a moment after the last key, not on every one.
    useEffect(() => {
        const q = query.trim();
        if (!q) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- an empty search shows nobody
            setMatches(null);
            return;
        }
        let stale = false;
        const timer = setTimeout(async () => {
            const res = await fetch(`/api/shopping/members?list=${listId}&q=${encodeURIComponent(q)}`).catch(() => null);
            if (stale || !res?.ok) return;
            setMatches(((await res.json()) as { people: Person[] }).people);
        }, 200);
        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [query, listId]);

    const invite = async (person: Person) => {
        setBusy(person.id);
        const res = await fetch(`/api/shopping/members?list=${listId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: person.id }),
        }).catch(() => null);
        setBusy(null);
        if (res?.ok) {
            setQuery('');
            onNote(t('invitedNote', { name: person.name }));
            await load();
        } else onNote(t('failed'));
    };

    const takeOff = async (person: Person, joined: boolean) => {
        if (joined && !(await ask({ title: t('takeOffQuestion', { name: person.name }), confirmLabel: t('takeOff'), destructive: true }))) return;
        setBusy(person.id);
        const res = await fetch(`/api/shopping/members?list=${listId}&userId=${person.id}`, { method: 'DELETE' }).catch(() => null);
        setBusy(null);
        if (res?.ok) {
            await load();
            if (joined) onChanged();
        } else onNote(t('failed'));
    };

    const toggleLink = async () => {
        if (shareLink && !(await ask({ title: t('unshareQuestion'), confirmLabel: t('unshare'), destructive: true }))) return;
        setBusy('link');
        const res = await fetch(`/api/shopping/share?list=${listId}`, { method: shareLink ? 'DELETE' : 'POST' }).catch(() => null);
        setBusy(null);
        if (res?.ok) onShareToken(((await res.json()) as { shareToken: string | null }).shareToken);
        else onNote(t('failed'));
    };

    const toggleCanAdd = async () => {
        setBusy('canAdd');
        const res = await fetch(`/api/shopping/share?list=${listId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canAdd: !canAdd }),
        }).catch(() => null);
        setBusy(null);
        if (res?.ok) setCanAdd(((await res.json()) as { canAdd: boolean }).canAdd);
        else onNote(t('failed'));
    };

    const copy = () => shareLink && void navigator.clipboard.writeText(shareLink).then(() => onNote(t('copied')), () => onNote(t('failed')));

    const send = () => {
        if (!shareLink) return;
        if (navigator.share) void navigator.share({ title: t('title'), url: shareLink }).catch(() => undefined);
        else copy();
    };

    const row = 'flex min-h-12 items-center justify-between gap-3';
    const quiet = 'min-h-11 shrink-0 px-2 text-sm text-muted underline underline-offset-4 hover:text-danger disabled:opacity-60';
    const heading = 'text-xs font-bold uppercase tracking-widest text-muted';
    const onList = household ? household.members.length + household.invited.length : 0;

    return (
        <div>
            {dialog}

            <section>
                <h3 className={heading}>{t('sharePeople')}</h3>
                <p className="mt-1 text-sm text-muted">{t('sharePeopleExplain')}</p>

                {household && onList > 0 && (
                    <ul className="mt-2 divide-y divide-line">
                        {household.members.map((person) => (
                            <li key={person.id} className={row}>
                                <span>{person.name}</span>
                                <button type="button" disabled={busy === person.id} onClick={() => void takeOff(person, true)} className={quiet}>
                                    {t('takeOff')}
                                </button>
                            </li>
                        ))}
                        {household.invited.map((person) => (
                            <li key={person.id} className={row}>
                                <span>
                                    {person.name} <span className="text-faint">· {t('invitedPending')}</span>
                                </span>
                                <button type="button" disabled={busy === person.id} onClick={() => void takeOff(person, false)} className={quiet}>
                                    {t('withdraw')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <label htmlFor="invite-search" className="sr-only">
                    {t('inviteSearch')}
                </label>
                <input
                    id="invite-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('inviteSearch')}
                    autoComplete="off"
                    className="mt-3 w-full rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                />
                {matches && (
                    <ul className="mt-1 divide-y divide-line" aria-live="polite">
                        {matches.length === 0 && <li className="py-3 text-sm text-faint">{t('inviteNoMatch')}</li>}
                        {matches.map((person) => (
                            <li key={person.id} className={row}>
                                <span>{person.name}</span>
                                <button type="button" disabled={busy === person.id} onClick={() => void invite(person)} className={buttonSecondary}>
                                    {t('inviteOne')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="mt-6 border-t border-line pt-4">
                <h3 className={heading}>{t('shareLinkTitle')}</h3>
                <p className="mt-1 text-sm text-muted">{t('shareExplain')}</p>
                {shareLink ? (
                    <>
                        <p className="mt-3 flex items-center gap-2 text-sm font-medium">
                            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                            {t('linkActive')}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={send} className={buttonPrimarySmall}>
                                {t('sendLink')}
                            </button>
                            <button type="button" onClick={copy} className={buttonSecondary}>
                                {t('copyLink')}
                            </button>
                        </div>
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={canAdd}
                            disabled={busy === 'canAdd'}
                            onClick={() => void toggleCanAdd()}
                            className="mt-3 flex min-h-11 w-full items-center gap-3 text-left text-sm disabled:opacity-60"
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${canAdd ? 'border-transparent bg-ink text-page' : 'border-control'}`}
                                aria-hidden
                            >
                                {canAdd ? '✓' : ''}
                            </span>
                            {t('linkCanAdd')}
                        </button>
                        <button type="button" disabled={busy === 'link'} onClick={() => void toggleLink()} className={`mt-1 ${quiet} px-0`}>
                            {t('unshare')}
                        </button>
                    </>
                ) : (
                    <button type="button" disabled={busy === 'link'} onClick={() => void toggleLink()} className={`mt-3 ${buttonSecondary}`}>
                        {t('share')}
                    </button>
                )}
            </section>
        </div>
    );
}
