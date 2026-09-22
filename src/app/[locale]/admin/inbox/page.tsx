'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { captureLabel } from '@/lib/capture';
import { useConfirm } from '@/components/ui/useConfirm';
import { formatDate } from '@/lib/formatDate';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';
import Loading from '@/components/ui/Loading';

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

/**
 * The provider's own name, for a line that says who read a draft.
 *
 * Not translated: "Anthropic" is "Anthropic" in both languages, and a
 * translation key per provider would be three keys that can only ever hold the
 * same string.
 */
function providerLabel(provider: string | null): string {
    if (provider === 'anthropic') return 'Anthropic';
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'google') return 'Gemini';
    return '—';
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
    /** 'rules' | 'rules+ai' | 'ai', or null on a row from before this existed. */
    readBy: string | null;
    aiProvider: string | null;
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
    // The same word as the admin navigation's, from the same key: two keys
    // holding one string is two strings waiting to disagree.
    const tDevices = useTranslations('Devices');
    const router = useRouter();

    const [ask, dialog] = useConfirm();
    const [captures, setCaptures] = useState<Capture[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState('');
    /** Whether "read this with the AI" can do anything. Reported by the list. */
    const [aiAvailable, setAiAvailable] = useState(false);
    /** And which model would be asked, so the wait can say who is working. */
    const [aiModel, setAiModel] = useState<string | null>(null);
    /** Which row is busy doing what, so the right thing can be said about it. */
    const [busyAction, setBusyAction] = useState<'retry' | 'askAi' | 'publish' | 'stage' | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/capture');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();
            setCaptures(data.captures);
            setAiAvailable(Boolean(data.aiAvailable));
            setAiModel(typeof data.aiModel === 'string' ? data.aiModel : null);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (id: number, action: 'retry' | 'askAi' | 'publish' | 'stage') => {
        setBusyId(id);
        setBusyAction(action);
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

            /*
             * Taking a capture makes a recipe, and then left you in the inbox
             * looking at a list it had just vanished from — with no way to
             * reach the thing you made except going to the overview and
             * finding it. The slug is in the answer; this is the shortest path
             * in the whole application and it was missing a step.
             *
             * Only for `publish`. Staging is "not now": the point of it is to
             * carry on down the list, so it stays put.
             */
            const slug: unknown = data?.recipe?.slug;
            if (action === 'publish' && typeof slug === 'string' && slug !== '') {
                router.push(`/recipe/${slug}`);
                return;
            }

            await load();
            if (action === 'publish' || action === 'stage') router.refresh();
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusyId(null);
            setBusyAction(null);
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
        <main className={`${pageContainer} pb-32`}>
            <div className={`mb-8 flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <Link href="/admin/devices" className="text-sm underline underline-offset-4">
                    {tDevices('nav')}
                </Link>
            </div>

            <p className="mb-8 font-serif text-muted">{t('explanation')}</p>

            {error && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {loading ? (
                <Loading label={t('loading')} />
            ) : open.length === 0 ? (
                <p className="border-t border-line py-16 text-center text-muted">{t('empty')}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-line">
                    {open.map((capture) => (
                        <CaptureRow
                            key={capture.id}
                            capture={capture}
                            busy={busyId === capture.id}
                            busyAction={busyId === capture.id ? busyAction : null}
                            aiModel={aiModel}
                            onPublish={() => act(capture.id, 'publish')}
                            onStage={() => act(capture.id, 'stage')}
                            onRetry={() => act(capture.id, 'retry')}
                            onAskAi={() => act(capture.id, 'askAi')}
                            aiAvailable={aiAvailable}
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
    busyAction,
    aiModel,
    onPublish,
    onStage,
    onRetry,
    onAskAi,
    aiAvailable,
    onDiscard,
    onMerge,
}: {
    capture: Capture;
    busy: boolean;
    /** What this row is doing, when it is doing something. */
    busyAction: 'retry' | 'askAi' | 'publish' | 'stage' | null;
    /** The model that would be asked, for the one wait that is somebody else's. */
    aiModel: string | null;
    onPublish: () => void;
    onStage: () => void;
    onRetry: () => void;
    onAskAi: () => void;
    /** False when no key is configured or the AI is switched off. */
    aiAvailable: boolean;
    onDiscard: () => void;
    /** Only offered when the inbox thinks this is something we already have. */
    onMerge?: () => void;
}) {
    const t = useTranslations('Inbox');
    const tAi = useTranslations('Ai');
    const tDrafts = useTranslations('Drafts');
    // The site's language, not the browser's: this page used
    // toLocaleDateString() with no argument, so a German reader on an
    // English-language phone saw 9/21/2026 here and 21. September 2026 on
    // the blog, in one visit.
    const locale = useLocale();

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

                {/* Whether a model was involved, on the same line as where it
                    came from and what state it is in — the three things you
                    want before deciding how hard to read a draft. Nothing is
                    shown for a capture from before this was recorded, because
                    the alternative is labelling it with a guess. */}
                {capture.readBy && (
                    <>
                        {/* The accent colour means "a model was involved", and
                            that has to keep being true. A capture read from a
                            learned site layout involves no model at all — it
                            follows a mapping written down weeks ago — so it is
                            plain, like the rules. Getting this wrong would say
                            the AI wrote a recipe it never saw, which is the one
                            thing this line exists to prevent. */}
                        <span
                            className={
                                capture.readBy === 'rules' || capture.readBy === 'profile'
                                    ? undefined
                                    : capture.readBy === 'rules+ai-failed'
                                        ? 'text-danger'
                                        : 'text-accent-text'
                            }
                        >
                            {capture.readBy === 'rules'
                                ? tAi('usedRules')
                                : capture.readBy === 'profile'
                                    ? tAi('usedProfile')
                                    : capture.readBy === 'profile+ai'
                                        ? tAi('usedProfileAndAi', {
                                            provider: providerLabel(capture.aiProvider),
                                        })
                                        : capture.readBy === 'ai'
                                            ? tAi('usedAi', { provider: providerLabel(capture.aiProvider) })
                                            : capture.readBy === 'rules+ai-failed'
                                                ? tAi('usedAiFailed', {
                                                    provider: providerLabel(capture.aiProvider),
                                                })
                                                : tAi('usedRulesAndAi', {
                                                    provider: providerLabel(capture.aiProvider),
                                                })}
                        </span>
                        <span aria-hidden="true">·</span>
                    </>
                )}

                <time dateTime={capture.createdAt}>
                    {formatDate(capture.createdAt, locale, 'short')}
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

            {/*
                The row is working, and this says on whose time.

                Rereading with the rules is ours and takes a moment; asking a
                model is somebody else's, takes seconds, costs money and can
                come back with nothing. The buttons all said "Just a moment…"
                either way, which made the expensive wait look like the cheap
                one — so the one that is not ours names the model doing it.
            */}
            {busy && (busyAction === 'askAi' || busyAction === 'retry') && (
                <Loading
                    className="mt-3"
                    size={22}
                    label={busyAction === 'askAi' ? tAi('reading') : t('rereading')}
                    model={busyAction === 'askAi' ? aiModel : null}
                />
            )}

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

                {/* The same act, one step short: the recipe is taken in but
                    does not count yet. Beside the direct one rather than
                    replacing it, because sometimes you already know — a recipe
                    you have cooked for years and are only typing up does not
                    need a probation period, and making it serve one would
                    teach you to press past the draft state without reading it. */}
                {canPublish && (
                    <button
                        type="button"
                        onClick={onStage}
                        disabled={busy}
                        title={tDrafts('stageHint')}
                        className="text-muted underline underline-offset-4 disabled:opacity-50"
                    >
                        {tDrafts('stage')}
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

                {/*
                    Always offered, including on a draft the scoring called
                    good — which is the whole point of it being here.

                    The scoring decides whether a model is asked *without*
                    being told to. It is a guess made from shape alone: it can
                    see that a draft has a title, ingredients with quantities
                    and a method, and it cannot see that the method is the
                    wrong recipe's. Somebody reading the draft can. So the
                    automatic decision saves them the trouble in the common
                    case and never takes the decision away from them.

                    Costs a call every time it is pressed, which is why it says
                    what it does rather than being a second "retry".
                */}
                <button
                    type="button"
                    onClick={onAskAi}
                    disabled={busy || !aiAvailable}
                    title={aiAvailable ? undefined : tAi('polishOff')}
                    className="text-muted underline underline-offset-4 disabled:no-underline disabled:opacity-50"
                >
                    {tAi('askAi')}
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
