'use client';

import { useRef, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import ReactMarkdown from 'react-markdown';
import { useTranslations } from 'next-intl';
import { looksLikeImage } from '@/lib/imageCompression';
import { uploadPicture } from '@/lib/uploadClient';
import { BusyLabel } from '@/components/ui/Busy';
import InlinePicture from '@/components/ui/InlinePicture';

/**
 * Writing with formatting, without having to know Markdown.
 *
 * The text is still Markdown — it is what the site stores and what an archive
 * carries — but nobody has to type it: the buttons above the box wrap the
 * selection in it, "Picture" uploads a photograph and puts it where the cursor
 * is, and "Preview" shows the text as it will be read. The one-line hint that
 * used to be the whole of the help ("# for a heading, - for a list") is now a
 * short table under the box, for anybody who would rather type.
 *
 * A picture can also be dropped or pasted straight into the box.
 */
export default function MarkdownEditor({
    id,
    label,
    value,
    onChange,
    rows = 14,
    pictures = true,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (next: string) => void;
    rows?: number;
    /** Whether "Picture" is offered. Off for short texts. */
    pictures?: boolean;
}) {
    const t = useTranslations('Editor');
    const box = useRef<HTMLTextAreaElement>(null);
    const file = useRef<HTMLInputElement>(null);
    const [tab, setTab] = useState<'write' | 'preview'>('write');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    /** Replaces the selection with `before + selection + after`, and reselects it. */
    const wrap = (before: string, after = before, placeholder = '') => {
        const area = box.current;
        if (!area) return;
        const { selectionStart: start, selectionEnd: end } = area;
        const selected = value.slice(start, end) || placeholder;
        const next = value.slice(0, start) + before + selected + after + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
            area.focus();
            area.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
    };

    /** Puts a prefix at the start of every selected line: headings, lists. */
    const prefixLines = (prefix: string) => {
        const area = box.current;
        if (!area) return;
        const start = value.lastIndexOf('\n', area.selectionStart - 1) + 1;
        const end = area.selectionEnd;
        const lines = value.slice(start, end).split('\n').map((line) => (line.startsWith(prefix) ? line : prefix + line));
        onChange(value.slice(0, start) + lines.join('\n') + value.slice(end));
        requestAnimationFrame(() => area.focus());
    };

    /** A picture where the cursor is, on a line of its own. */
    const insertPicture = async (picture: File | undefined) => {
        if (!picture || !looksLikeImage(picture)) return;
        setUploading(true);
        setError('');
        const result = await uploadPicture(picture);
        setUploading(false);

        if (!result.ok) {
            setError(result.reason === 'too-large' ? t('uploadTooLarge') : sayable(result.message, t('uploadFailed')));
            return;
        }

        const at = box.current?.selectionStart ?? value.length;
        const snippet = `\n\n![${t('pictureAlt')}](${result.url})\n\n`;
        onChange(value.slice(0, at) + snippet + value.slice(at));
    };

    const tool = 'flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm hover:bg-surface disabled:opacity-40';

    return (
        <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <label htmlFor={id} className="block text-sm font-bold uppercase tracking-widest text-muted">
                    {label}
                </label>
                <div className="flex gap-1 text-sm">
                    {(['write', 'preview'] as const).map((which) => (
                        <button
                            key={which}
                            type="button"
                            // Two toggle buttons: a tablist without arrow keys
                            // and panels promised what it did not do.
                            aria-pressed={tab === which}
                            onClick={() => setTab(which)}
                            className={`rounded-full px-3 py-1 ${tab === which ? 'bg-ink text-page' : 'text-muted hover:text-ink'}`}
                        >
                            {t(which)}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'write' ? (
                <div className="rounded-lg border border-control focus-within:border-ink">
                    <div role="toolbar" className="flex flex-wrap items-center gap-0.5 border-b border-line px-1 py-1" aria-label={t('toolbar')}>
                        <button type="button" className={tool} onClick={() => prefixLines('## ')} title={t('heading')} aria-label={t('heading')}>
                            <span className="font-bold">H</span>
                        </button>
                        <button type="button" className={tool} onClick={() => wrap('**', '**', t('boldText'))} title={t('bold')} aria-label={t('bold')}>
                            <span className="font-bold">B</span>
                        </button>
                        <button type="button" className={tool} onClick={() => wrap('*', '*', t('italicText'))} title={t('italic')} aria-label={t('italic')}>
                            <span className="italic">I</span>
                        </button>
                        <button type="button" className={tool} onClick={() => prefixLines('- ')} title={t('list')} aria-label={t('list')}>
                            •
                        </button>
                        <button type="button" className={tool} onClick={() => prefixLines('1. ')} title={t('numbered')} aria-label={t('numbered')}>
                            1.
                        </button>
                        <button type="button" className={tool} onClick={() => wrap('[', '](https://)', t('linkText'))} title={t('link')}>
                            {t('link')}
                        </button>
                        {pictures && (
                            <button
                                type="button"
                                className={tool}
                                onClick={() => file.current?.click()}
                                disabled={uploading}
                                title={t('pictureHint')}
                            >
                                <BusyLabel busy={uploading} busyText={t('uploading')}>
                                    {t('picture')}
                                </BusyLabel>
                            </button>
                        )}
                    </div>
                    <textarea
                        ref={box}
                        id={id}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onDrop={(event) => {
                            const dropped = event.dataTransfer.files?.[0];
                            if (pictures && dropped && looksLikeImage(dropped)) {
                                event.preventDefault();
                                void insertPicture(dropped);
                            }
                        }}
                        onPaste={(event) => {
                            const pasted = Array.from(event.clipboardData?.files ?? []).find(looksLikeImage);
                            if (pictures && pasted) {
                                event.preventDefault();
                                void insertPicture(pasted);
                            }
                        }}
                        rows={rows}
                        className="block w-full resize-y bg-transparent px-3 py-2 font-mono text-base leading-relaxed outline-none"
                    />
                    <input
                        ref={file}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        tabIndex={-1}
                        onChange={(event) => {
                            void insertPicture(event.target.files?.[0]);
                            event.target.value = '';
                        }}
                    />
                </div>
            ) : (
                <div className="post-body min-h-40 rounded-lg border border-line px-4 py-3 font-serif text-lg leading-relaxed">
                    {value.trim() ? (
                        <ReactMarkdown components={{ img: InlinePicture }}>{value}</ReactMarkdown>
                    ) : (
                        <p className="font-sans text-sm text-faint">{t('previewEmpty')}</p>
                    )}
                </div>
            )}

            {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}

            <details className="mt-2 text-sm text-muted">
                <summary className="cursor-pointer underline underline-offset-4">{t('formatHelpTitle')}</summary>
                <table className="mt-2 w-full border-collapse text-left">
                    <tbody className="divide-y divide-line">
                        {(['helpHeading', 'helpBold', 'helpItalic', 'helpList', 'helpLink', 'helpPicture', 'helpParagraph'] as const).map((key) => {
                            const [code, meaning] = t(key).split(' → ');
                            return (
                                <tr key={key}>
                                    <td className="py-1.5 pr-4 font-mono text-xs text-ink">{code}</td>
                                    <td className="py-1.5">{meaning}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </details>
        </div>
    );
}
