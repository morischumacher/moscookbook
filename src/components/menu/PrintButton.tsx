'use client';

import { buttonSecondary } from '@/lib/ui';

/** The browser's own print dialog, which is also where "Save as PDF" lives. */
export default function PrintButton({ label }: { label: string }) {
    return (
        <button type="button" onClick={() => window.print()} className={`${buttonSecondary} w-full sm:w-auto`}>
            <span aria-hidden="true">🖨 </span>
            {label}
        </button>
    );
}
