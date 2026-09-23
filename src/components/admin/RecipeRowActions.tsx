'use client';

import { useTranslations } from 'next-intl';
import ShareButton from '@/components/share/ShareButton';
import { stageOf } from '@/lib/shareStage';

/**
 * Who can see this one, from the list.
 *
 * This used to be three words — Share, Publish, Make private — doing the same
 * job as the recipe page in a shorter form, and it carried the same fault: a
 * private recipe with no link, shared, quietly minted a permanent public link
 * and copied it. In a list, where a mis-tap is likeliest because the rows are
 * close together and the labels are short.
 *
 * One word now, and it opens the same control the recipe page opens, which is
 * the whole point: the answer to "who can see this" should not depend on which
 * screen you asked from. Beside it, where the recipe currently stands, so the
 * list can still be read at a glance without opening anything — which is what
 * the three words were really for.
 */
export default function RecipeRowActions({
    recipeId,
    title,
    locale,
    isPublic,
    url,
    shareUrl,
    onlyMe = false,
    showStage = true,
}: {
    recipeId: number;
    title: string;
    locale: string;
    isPublic: boolean;
    /** The recipe's own address. */
    url: string;
    /** The secret link, when one already exists. */
    shareUrl: string | null;
    /** Only the admins read it. */
    onlyMe?: boolean;
    /** False where the row already says it (the admin list, next to the title). */
    showStage?: boolean;
}) {
    const t = useTranslations('Share');

    const stage = stageOf({ isPublic, linkUrl: shareUrl, onlyMe });
    const label = {
        admins: t('stageAdmins'),
        household: t('stageHousehold'),
        link: t('stageLink'),
        web: t('stageWeb'),
    }[stage];

    return (
        <span className="flex flex-wrap items-center gap-3">
            {showStage && <span className="text-xs uppercase tracking-widest text-faint">{label}</span>}

            <ShareButton
                id={recipeId}
                kind="recipe"
                title={title}
                locale={locale}
                isPublic={isPublic}
                linkUrl={shareUrl}
                onlyMe={onlyMe}
                ownUrl={url}
                mayChange
                className="underline underline-offset-4 hover:text-muted"
            />
        </span>
    );
}
