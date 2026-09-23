import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import InlinePicture from '@/components/ui/InlinePicture';

/**
 * The top of a collection's page: its picture, its name and what it says
 * about itself — the same on its own address and on a shared link.
 *
 * The description is Markdown now and can run to several paragraphs, so it is
 * rendered like an entry's text rather than squeezed into one grey line.
 */
export default function CollectionIntro({
    title,
    description,
    imageUrl,
    meta,
}: {
    title: string;
    description: string | null;
    imageUrl: string | null;
    meta: React.ReactNode;
}) {
    return (
        <div>
            {imageUrl && (
                <div className="relative -mx-4 mb-8 aspect-[3/2] overflow-hidden bg-surface sm:mx-0 sm:rounded-2xl">
                    <Image src={imageUrl} alt="" fill priority sizes="(max-width: 640px) 100vw, 672px" className="object-cover" />
                </div>
            )}

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>

            <p className="mt-3 text-xs uppercase tracking-widest text-faint">{meta}</p>

            {description && (
                <div className="post-body mt-6 font-serif text-lg leading-relaxed">
                    <ReactMarkdown components={{ img: InlinePicture }}>{description}</ReactMarkdown>
                </div>
            )}
        </div>
    );
}
