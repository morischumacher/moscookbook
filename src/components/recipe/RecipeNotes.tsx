import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import { Link } from '@/i18n/routing';
import { formatDate } from '@/lib/formatDate';

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
 * The blog entries written about this recipe, oldest first.
 *
 * This is the other half of the blog: an entry with a recipe attached shows up
 * here and on the blog page as an ordinary entry. Same row in the same table,
 * read from two directions, which is why attaching one is a dropdown rather
 * than a different editor.
 *
 * **It used to be headed "Notizen", one section below a cooking log whose
 * note field is labelled "what to do differently next time" — so the page had
 * two things called a note, a hand's breadth apart, and a button for each.**
 * They are not the same thing at all: one is a line somebody types into a row
 * that already exists, the other is a titled, published article with its own
 * address that also appears on the blog. The data model was right and the
 * vocabulary was wrong, which is the harder of the two to notice and the
 * easier to fix.
 *
 * So it says where these end up. "Aus dem Blog" is not a label for a kind of
 * text; it is the answer to "why is this here and not up there".
 *
 * **Nothing is drawn when there is nothing.** This used to render the full
 * furniture — a rule, a heading, a button and a sentence explaining that the
 * section was empty — which is a whole room built to say "empty", directly
 * under another section that was also mostly empty. An admin gets one quiet
 * line instead; everybody else gets nothing, because there is nothing.
 *
 * Only ever rendered on the private page. A kitchen diary is not part of a
 * link you send somebody.
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

    if (notes.length === 0) {
        if (!isAdmin) return null;

        // One line, no section. The action still has to be reachable — this is
        // the only place that attaches an entry to *this* recipe — but it does
        // not need a room of its own to be reachable from.
        return (
            <p className="print:hidden mt-10">
                <Link
                    href={`/admin/posts/new?recipeId=${recipeId}`}
                    className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                >
                    {t('addNote')}
                </Link>
            </p>
        );
    }


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

            <ol className="flex flex-col gap-8">
                    {notes.map((note) => (
                        <li key={note.id}>
                            <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-widest text-muted">
                                <span>{formatDate(note.publishedAt ?? note.createdAt, locale)}</span>
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
        </section>
    );
}
