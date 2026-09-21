import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import { Link } from '@/i18n/routing';

export interface RecipeNote {
    id: number;
    title: string;
    slug: string;
    body: string;
    publishedAt: Date | null;
    createdAt: Date;
    author: { name: string } | null;
}

/**
 * The entries written about this recipe, oldest first.
 *
 * This is the other half of the blog: an entry with a recipe attached shows up
 * here as a dated note — "made it again with half the sugar, better" — and on
 * the blog page as an ordinary entry. Same row in the same table, read from
 * two directions, which is why attaching one is a dropdown rather than a
 * different editor.
 *
 * Oldest first, unlike the blog index. A cooking log is read as a sequence:
 * what changed, and then what changed after that.
 *
 * Only ever rendered on the private page. A note is a kitchen diary, and the
 * person you sent a recipe to did not ask for it.
 */
export default async function RecipeNotes({
    notes,
    recipeId,
    isAdmin,
    locale,
}: {
    notes: RecipeNote[];
    recipeId: number;
    isAdmin: boolean;
    locale: string;
}) {
    const t = await getTranslations('Blog');

    if (notes.length === 0 && !isAdmin) return null;

    const dateFormatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    return (
        <section className="print:hidden mt-16 border-t border-line pt-8">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                    {t('notesTitle')}
                </h2>

                {isAdmin && (
                    <Link
                        href={`/admin/posts/new?recipeId=${recipeId}`}
                        className="text-sm underline underline-offset-4"
                    >
                        {t('addNote')}
                    </Link>
                )}
            </div>

            {notes.length === 0 ? (
                <p className="text-sm text-muted">{t('noNotes')}</p>
            ) : (
                <ol className="flex flex-col gap-8">
                    {notes.map((note) => (
                        <li key={note.id}>
                            <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-widest text-muted">
                                <span>{dateFormatter.format(note.publishedAt ?? note.createdAt)}</span>
                                {note.author && <span>• {note.author.name}</span>}
                                {note.publishedAt === null && <span>• {t('draft')}</span>}
                            </p>

                            <h3 className="mb-2 text-lg font-bold tracking-tight">
                                <Link href={`/blog/${note.slug}`} className="underline-offset-4 hover:underline">
                                    {note.title}
                                </Link>
                            </h3>

                            <div className="post-body font-serif leading-relaxed">
                                <ReactMarkdown>{note.body}</ReactMarkdown>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
