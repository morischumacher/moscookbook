'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';

export default function MenuActions({ menuId }: { menuId: number }) {
    const t = useTranslations('Menus');
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        setBusy(true);
        try {
            const res = await fetch(`/api/menus/${menuId}`, { method: 'DELETE' });
            if (res.ok) {
                router.refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 flex items-center gap-4 text-xs">
            <Link
                href={`/admin/menus/${menuId}`}
                className="font-medium underline underline-offset-4 hover:text-muted"
            >
                {t('edit')}
            </Link>
            <InlineConfirm
                label={t('delete')}
                question={t('confirmDelete')}
                confirmLabel={t('delete')}
                destructive
                disabled={busy}
                onConfirm={remove}
                className="text-muted underline underline-offset-4 hover:text-danger"
            />
        </div>
    );
}
