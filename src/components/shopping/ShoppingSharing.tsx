'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';

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
 * Who else shops on the list, in two ways.
 *
 * People of the cookbook, invited by name: once they accept, it is the list
 * they shop on too — one list for the household, the same for everybody on
 * it. Whoever made the list chooses who is on it and can take people off;
 * the others can leave. And a link for somebody without an account, which can
 * tick and — if the owner leaves it on — add, and nothing else.
 */
export default function ShoppingSharing({
    owner,
    shareLink,
    onShareToken,
    canAdd: initialCanAdd,
    onNote,
}: {
    owner: boolean;
    shareLink: string | null;
    onShareToken: (token: string | null) => void;
    canAdd: boolean;
    onNote: (note: string) => void;
}) {
    const t = useTranslations('Shopping');
    const router = useRouter();
    const [ask, dialog] = useConfirm();
    const [household, setHousehold] = useState<Household | null>(null);
    const [people, setPeople] = useState<Person[]>([]);
    const [canAdd, setCanAdd] = useState(initialCanAdd);
    const [busy, setBusy] = useState<number | 'link' | 'canAdd' | 'leave' | null>(null);

    const load = useCallback(async () => {
        const res = await fetch('/api/shopping/members').catch(() => null);
        if (!res?.ok) return;
        const data = (await res.json()) as { household: Household; people: Person[] };
        setHousehold(data.household);
        setPeople(data.people);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, from the server
        void load();
    }, [load]);

    const invite = async (person: Person) => {
        setBusy(person.id);
        const res = await fetch('/api/shopping/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: person.id }),
        }).catch(() => null);
        setBusy(null);
        if (res?.ok) await load();
        else onNote(t('failed'));
    };

    const takeOff = async (person: Person, joined: boolean) => {
        if (joined && !(await ask({ title: t('takeOffQuestion', { name: person.name }), confirmLabel: t('takeOff'), destructive: true }))) return;
        setBusy(person.id);
        const res = await fetch(`/api/shopping/members?userId=${person.id}`, { method: 'DELETE' }).catch(() => null);
        setBusy(null);
        if (res?.ok) await load();
        else onNote(t('failed'));
    };

    const leave = async () => {
        if (!(await ask({ title: t('leaveQuestion'), confirmLabel: t('leave') }))) return;
        setBusy('leave');
        const res = await fetch('/api/shopping/members?leave=1', { method: 'DELETE' }).catch(() => null);
        setBusy(null);
        if (res?.ok) router.refresh();
        else onNote(t('failed'));
    };

    const toggleLink = async () => {
        setBusy('link');
        const res = await fetch('/api/shopping/share', { method: shareLink ? 'DELETE' : 'POST' }).catch(() => null);
        setBusy(null);
        if (res?.ok) onShareToken(((await res.json()) as { shareToken: string | null }).shareToken);
        else onNote(t('failed'));
    };

    const toggleCanAdd = async () => {
        setBusy('canAdd');
        const res = await fetch('/api/shopping/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canAdd: !canAdd }),
        }).catch(() => null);
        setBusy(null);
        if (res?.ok) setCanAdd(((await res.json()) as { canAdd: boolean }).canAdd);
        else onNote(t('failed'));
    };

    const box = (on: boolean) =>
        `flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm ${on ? 'border-transparent bg-ink text-page' : 'border-control'}`;

    const row = 'flex min-h-11 items-center justify-between gap-3';
    const small = 'shrink-0 text-muted underline underline-offset-4 hover:text-danger disabled:opacity-60';

    if (!owner) {
        return (
            <div className="rounded-xl border border-line p-4">
                {dialog}
                <p className="font-medium">{t('shareTitle')}</p>
                {household && (
                    <p className="mt-1 text-muted">
                        {t('memberExplain', { name: household.owner.name, names: [household.owner, ...household.members].map((p) => p.name).join(', ') })}
                    </p>
                )}
                <button type="button" disabled={busy === 'leave'} onClick={() => void leave()} className={`mt-3 ${small}`}>
                    {t('leave')}
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-line p-4">
            {dialog}
            <p className="font-medium">{t('shareTitle')}</p>

            <section className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('sharePeople')}</h3>
                <p className="mt-1 text-muted">{t('sharePeopleExplain')}</p>
                {household && (household.members.length > 0 || household.invited.length > 0) && (
                    <ul className="mt-2 divide-y divide-line">
                        {household.members.map((person) => (
                            <li key={person.id} className={row}>
                                <span>{person.name}</span>
                                <button type="button" disabled={busy === person.id} onClick={() => void takeOff(person, true)} className={small}>
                                    {t('takeOff')}
                                </button>
                            </li>
                        ))}
                        {household.invited.map((person) => (
                            <li key={person.id} className={row}>
                                <span>
                                    {person.name} <span className="text-faint">· {t('invitedPending')}</span>
                                </span>
                                <button type="button" disabled={busy === person.id} onClick={() => void takeOff(person, false)} className={small}>
                                    {t('withdraw')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {household &&
                    (people.length === 0 ? (
                        household.members.length + household.invited.length === 0 && <p className="mt-3 text-faint">{t('sharePeopleNone')}</p>
                    ) : (
                        <details className="mt-2">
                            <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('invite')}</summary>
                            <ul className="divide-y divide-line">
                                {people.map((person) => (
                                    <li key={person.id} className={row}>
                                        <span>{person.name}</span>
                                        <button
                                            type="button"
                                            disabled={busy === person.id}
                                            onClick={() => void invite(person)}
                                            className="shrink-0 font-medium underline underline-offset-4 disabled:opacity-60"
                                        >
                                            {t('inviteOne')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    ))}
            </section>

            <section className="mt-5 border-t border-line pt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('shareLinkTitle')}</h3>
                <p className="mt-1 text-muted">{t('shareExplain')}</p>
                {shareLink && (
                    <>
                        {/* A tap copies it: selecting a long address on a
                            phone is the fiddly part. */}
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(shareLink).then(() => onNote(t('copied')), () => undefined)}
                            aria-label={t('copyLink')}
                            className="mt-3 block w-full break-all rounded-lg bg-surface px-3 py-2 text-left font-mono text-xs hover:bg-line"
                        >
                            {shareLink}
                            <span className="mt-1 block font-sans text-faint">{t('tapToCopy')}</span>
                        </button>
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={canAdd}
                            disabled={busy === 'canAdd'}
                            onClick={() => void toggleCanAdd()}
                            className="mt-2 flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60"
                        >
                            <span className={box(canAdd)} aria-hidden>
                                {canAdd ? '✓' : ''}
                            </span>
                            {t('linkCanAdd')}
                        </button>
                    </>
                )}
                <div className="mt-3 flex flex-wrap gap-4">
                    {shareLink && (
                        <button
                            type="button"
                            onClick={() => {
                                if (navigator.share) void navigator.share({ title: t('title'), url: shareLink }).catch(() => undefined);
                                else void navigator.clipboard.writeText(shareLink).then(() => onNote(t('copied')));
                            }}
                            className="font-medium underline underline-offset-4"
                        >
                            {t('sendLink')}
                        </button>
                    )}
                    <button type="button" disabled={busy === 'link'} onClick={() => void toggleLink()} className="text-muted underline underline-offset-4">
                        {shareLink ? t('unshare') : t('share')}
                    </button>
                </div>
            </section>
        </div>
    );
}
