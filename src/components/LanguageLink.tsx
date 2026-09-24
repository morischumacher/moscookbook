'use client';

import { Suspense, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';

interface Props {
    locale: string;
    className?: string;
    onClick?: () => void;
    children: ReactNode;
}

/**
 * The same page in the other language — with its query.
 *
 * The path alone lost everything after the "?": a reset link's token
 * (/de/reset?token=…, then "In English lesen", and the link was gone), an
 * invitation, the open shopping list, the filters. The query is read in a
 * boundary of its own, so the navigation around it is not held back; until
 * it is there, the path alone.
 */
export default function LanguageLink(props: Props) {
    return (
        <Suspense fallback={<PathOnly {...props} />}>
            <WithQuery {...props} />
        </Suspense>
    );
}

function PathOnly({ locale, className, onClick, children }: Props) {
    const path = usePathname();
    return (
        <Link href={path} locale={locale} lang={locale} onClick={onClick} className={className}>
            {children}
        </Link>
    );
}

function WithQuery({ locale, className, onClick, children }: Props) {
    const path = usePathname();
    const query = useSearchParams();
    return (
        <Link href={{ pathname: path, query: Object.fromEntries(query.entries()) }} locale={locale} lang={locale} onClick={onClick} className={className}>
            {children}
        </Link>
    );
}
