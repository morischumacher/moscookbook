'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Person {
    id: number;
    name: string;
    member: boolean;
}

/**
 * Who else sees the owner's list, in two ways.
 *
 * People of the cookbook, chosen by name: the list turns up beside their own
 * under Einkaufsliste, and they add, tick and remove on it as the owner does.
 * And a link for somebody without an account, which can tick and — if the
 * owner leaves it on — add, and nothing else.
 */
export default function ShoppingSharing({
    shareLink,
    onShareToken,
    canAdd: initialCanAdd,
    onNote,
}: {
    shareLink: string | null;
    onShareToken: (token: string | null) => void;
    canAdd: boolean;
    onNote: (note: string) => void;
}) {
    const t = useTranslations('Shopping');
    const [people, setPeople] = useState<Person[] | null>(null);
    const [canAdd, setCanAdd] = useState(initialCanAdd);
    const [busy, setBusy] = useState<number | 'link' | 'canAdd' | null>(null);

    useEffect(() => {
        let alive = true;
        fetch('/api/shopping/members')
            .then((res) => (res.ok ? (res.json() as Promise<{ people: Person[] }>) : null))
            .then((data) => alive && data && setPeople(data.people))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, []);

    const togglePerson = async (person: Person) => {
        setBusy(person.id);
        const res = await fetch(
            person.member ? `/api/shopping/members?userId=${person.id}` : '/api/shopping/members',
            person.member
                ? { method: 'DELETE' }
                : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: person.id }) }
        ).catch(() => null);
        setBusy(null);
        if (res?.ok) setPeople((current) => current?.map((p) => (p.id === person.id ? { ...p, member: !p.member } : p)) ?? null);
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

    return (
        <div className="rounded-xl border border-line p-4">
            <p className="font-medium">{t('shareTitle')}</p>

            <section className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('sharePeople')}</h3>
                <p className="mt-1 text-muted">{t('sharePeopleExplain')}</p>
                {people === null ? null : people.length === 0 ? (
                    <p className="mt-3 text-faint">{t('sharePeopleNone')}</p>
                ) : (
                    <ul className="mt-2">
                        {people.map((person) => (
                            <li key={person.id}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={person.member}
                                    disabled={busy === person.id}
                                    onClick={() => void togglePerson(person)}
                                    className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60"
                                >
                                    <span className={box(person.member)} aria-hidden>
                                        {person.member ? '✓' : ''}
                                    </span>
                                    {person.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
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
