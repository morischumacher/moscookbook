'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { captureLabel } from '@/lib/capture';
import { useConfirm } from '@/components/ui/useConfirm';

interface DraftSummary {
    title?: string;
    ingredients?: unknown[];
    instructions?: string;
    imageUrl?: string;
}

interface DuplicateHint {
    id: number;
    title: string;
    slug: string;
    reason: 'link' | 'title';
}

interface Capture {
    id: number;
    kind: string;
    source: string;
    sourceUrl: string | null;
    rawText: string | null;
    note: string | null;
    status: string;
    error: string | null;
    draft: DraftSummary | null;
    recipeId: number | null;
    createdAt: string;
    /** Worked out when the list is read, against what the cookbook holds now. */
    duplicateOf: DuplicateHint | null;
}

/**
 * The inbox.
 *
 * Everything shared from a phone lands here. The list is deliberately one
 * decision per row — take it, finish it, retry it, bin it — because the point
 * of the inbox is to make the deciding cheap, not to be another form.
 */
export default function AdminInboxPage() {
    const t = useTranslations('Inbox');
    const tAdmin = useTranslations('Admin');
    const router = useRouter();

    const [ask, dialog] = useConfirm();
    const [captures, setCaptures] = useState<Capture[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/capture');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();
            setCaptures(data.captures);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (id: number, action: 'retry' | 'publish') => {
        setBusyId(id);
        setError('');
        try {
            const res = await fetch(`/api/capture/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || tAdmin('genericError'));
                return;
            }
            await load();
            if (action === 'publish') router.refresh();
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusyId(null);
        }
    };

    const merge = async (id: number, recipeId: number, title: string) => {
        const sure = await ask({
            title: t('confirmMerge', { title }),
            confirmLabel: t('merge'),
        });
        if (!sure) return;

        setBusyId(id);
        setError('');

        try {
            const res = await fetch(`/api/capture/${id}/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.message || tAdmin('genericError'));
                return;
            }

            await load();
            router.refresh();
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusyId(null);
        }
    };

    const discard = async (id: number) => {
        const sure = await ask({
            title: t('confirmDiscard'),
            confirmLabel: t('discard'),
            destructive: true,
        });
        if (!sure) return;
        setBusyId(id);
        try {
            const res = await fetch(`/api/capture/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(tAdmin('genericError'));
                return;
            }
            setCaptures((current) => current.filter((capture) => capture.id !== id));
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusyId(null);
        }
    };

    const open = captures.filter((capture) => capture.status !== 'published');
    const done = captures.filter((capture) => capture.status === 'published');

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 pt-10 sm:px-8">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <div className="flex gap-4 text-sm">
                    <Link href="/admin/devices" className="underline underline-offset-4">
                        {t('devices')}
                    </Link>
                    <Link href="/admin" className="underline underline-offset-4 text-muted">
                        {tAdmin('backToRecipes')}
                    </Link>
                </div>
            </div>

            <p className="mb-8 font-serif text-muted">{t('explanation')}</p>

            {error && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {loading ? (
                <p className="text-muted">{t('loading')}</p>
            ) : open.length === 0 ? (
                <p className="border-t border-line py-16 text-center text-muted">{t('empty')}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-line">
                    {open.map((capture) => (
                        <CaptureRow
                            key={capture.id}
                            capture={capture}
                            busy={busyId === capture.id}
                            onPublish={() => act(capture.id, 'publish')}
                            onRetry={() => act(capture.id, 'retry')}
                            onDiscard={() => discard(capture.id)}
                            onMerge={
                                capture.duplicateOf
                                    ? () =>
                                          merge(
                                              capture.id,
                                              capture.duplicateOf!.id,
                                              capture.duplicateOf!.title
                                          )
                                    : undefined
                            }
                        />
                    ))}
                </ul>
            )}

            {done.length > 0 && (
                <section className="mt-12 border-t border-line pt-6">
                    <h2 className="mb-4 text-xs uppercase tracking-widest text-faint">
                        {t('published', { count: done.length })}
                    </h2>
                    <ul className="flex flex-col divide-y divide-line text-sm">
                        {done.slice(0, 20).map((capture) => (
                            <li key={capture.id} className="flex items-center justify-between py-3">
                                <span className="truncate text-muted">
                                    {capture.draft?.title || captureLabel(capture)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => discard(capture.id)}
                                    className="shrink-0 pl-4 text-faint underline underline-offset-4 hover:text-danger"
                                >
                                    {t('discard')}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {dialog}
        </main>
    );
}

function CaptureRow({
    capture,
    busy,
    onPublish,
    onRetry,
    onDiscard,
    onMerge,
}: {
    capture: Capture;
    busy: boolean;
    onPublish: () => void;
    onRetry: () => void;
    onDiscard: () => void;
    /** Only offered when the inbox thinks this is something we already have. */
    onMerge?: () => void;
}) {
    const t = useTranslations('Inbox');

    const label = capture.draft?.title || captureLabel(capture) || t('untitled');
    const ingredientCount = capture.draft?.ingredients?.length ?? 0;
    const canPublish =
        capture.status === 'ready' ||
        (Boolean(capture.draft?.title) && Boolean(capture.draft?.instructions));

    return (
        <li className="py-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-widest text-faint">
                <span>{t(`source.${capture.source}`)}</span>
                <span aria-hidden="true">·</span>
                <StatusBadge status={capture.status} />
                <span aria-hidden="true">·</span>
                <time dateTime={capture.createdAt}>
                    {new Date(capture.createdAt).toLocaleDateString()}
                </time>
            </div>

            <h3 className="mt-2 text-lg font-bold leading-snug">{label}</h3>

            {ingredientCount > 0 && (
                <p className="mt-1 text-sm text-muted">{t('recognised', { count: ingredientCount })}</p>
            )}

            {capture.duplicateOf && (
                <p className="mt-2 text-sm">
                    <span className="text-muted">
                        {capture.duplicateOf.reason === 'link'
                            ? t('duplicateLink')
                            : t('duplicateTitle')}{' '}
                    </span>
                    <Link
                        href={`/recipe/${capture.duplicateOf.slug}`}
                        className="underline underline-offset-4"
                    >
                        {capture.duplicateOf.title}
                    </Link>

                    {/* Right next to the hint rather than down in the row of
                        actions: this is the answer to the sentence above it,
                        and it should read as one. */}
                    {onMerge && (
                        <>
                            {' · '}
                            <button
                                type="button"
                                onClick={onMerge}
                                disabled={busy}
                                className="font-medium underline underline-offset-4 disabled:opacity-50"
                            >
                                {t('merge')}
                            </button>
                        </>
                    )}
                </p>
            )}

            {capture.error && <p className="mt-1 text-sm text-muted">{capture.error}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {canPublish && (
                    <button
                        type="button"
                        onClick={onPublish}
                        disabled={busy}
                        className="font-medium underline underline-offset-4 disabled:opacity-50"
                    >
                        {busy ? t('working') : t('accept')}
                    </button>
                )}

                <Link
                    href={`/admin/create?capture=${capture.id}`}
                    className="underline underline-offset-4"
                >
                    {t('finish')}
                </Link>

                <button
                    type="button"
                    onClick={onRetry}
                    disabled={busy}
                    className="text-muted underline underline-offset-4 disabled:opacity-50"
                >
                    {t('retry')}
                </button>

                {capture.sourceUrl && (
                    <a
                        href={capture.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted underline underline-offset-4"
                    >
                        {t('openSource')}
                    </a>
                )}

                <button
                    type="button"
                    onClick={onDiscard}
                    disabled={busy}
                    className="text-faint underline underline-offset-4 hover:text-danger disabled:opacity-50"
                >
                    {t('discard')}
                </button>
            </div>
        </li>
    );
}

function StatusBadge({ status }: { status: string }) {
    const t = useTranslations('Inbox');
    const tone =
        status === 'ready' ? 'text-ink' : status === 'failed' ? 'text-danger' : 'text-faint';

    return <span className={tone}>{t(`status.${status}`)}</span>;
}
