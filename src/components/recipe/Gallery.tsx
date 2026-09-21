'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

/**
 * A recipe's pictures.
 *
 * Deliberately not a carousel with autoplay and dots. A cookbook has two or
 * three pictures of a dish, and what you want is the big one plus a way to see
 * the others — so it is one large image and a row of thumbnails, and with a
 * single picture it is exactly what was there before.
 *
 * The large image keeps its box whichever picture is selected, so choosing a
 * thumbnail does not make the page jump under your thumb.
 */
export default function Gallery({ images, title }: { images: string[]; title: string }) {
    const t = useTranslations('Recipe');
    const [selected, setSelected] = useState(0);

    const current = images[selected] ?? images[0];

    return (
        <div>
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface shadow-sm sm:aspect-[16/9] sm:rounded-xl">
                {current ? (
                    <Image
                        src={current}
                        alt={
                            images.length > 1
                                ? t('imageOf', { number: selected + 1, total: images.length, title })
                                : title
                        }
                        fill
                        sizes="(max-width: 640px) 100vw, 672px"
                        className="object-cover"
                        // Only the first one is worth blocking the render for.
                        priority={selected === 0}
                    />
                ) : (
                    <div className="absolute inset-0 bg-surface" />
                )}
            </div>

            {images.length > 1 && (
                <ul className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden print:hidden">
                    {images.map((url, index) => (
                        <li key={url}>
                            <button
                                type="button"
                                onClick={() => setSelected(index)}
                                aria-label={t('showImage', { number: index + 1 })}
                                aria-current={index === selected}
                                className={`relative block h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${index === selected ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'
                                    }`}
                            >
                                <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* On paper there is no clicking, so every picture is printed. */}
            {images.length > 1 && (
                <div className="hidden print:mt-4 print:grid print:grid-cols-3 print:gap-2">
                    {images.slice(1).map((url) => (
                        <span key={url} className="relative block aspect-[4/3]">
                            <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
