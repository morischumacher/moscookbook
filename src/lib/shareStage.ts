/**
 * The three ways something in this cookbook can be seen.
 *
 * They were always three, and the application never said so. A recipe was
 * private or public — one control — and separately it might or might not have
 * a secret link, minted by a different control that lived somewhere else, and
 * sometimes minted silently by the Share button without anybody asking. Two
 * mechanisms for one question is why nobody could answer "who can see this?"
 * by looking at the screen.
 *
 * Named here, once, so that the control, the endpoints and the pages all mean
 * the same thing by them:
 *
 *   household  only somebody with an account. The default, and what
 *              "private" always meant.
 *   link       anybody holding the secret address, no account needed. The
 *              /r/, /p/ and /c/ routes. Revocable, and revoking it is the
 *              only way back — a link that has been sent cannot be unsent.
 *   web        the thing's own address answers to anybody, and a search
 *              engine may keep a copy. The irreversible one, in the sense
 *              that un-publishing removes the page and not the copy.
 *
 * They are not a ladder, which matters. `link` and `web` are independent: a
 * public recipe may also have a secret link from before it was published, and
 * withdrawing one does not touch the other. What the control shows is the
 * *furthest* the thing currently reaches, because that is what somebody is
 * actually asking when they ask who can see it.
 */
export type ShareStage = 'household' | 'link' | 'web';

/** What kinds of thing can be shared. Each has its own endpoints and routes. */
export type ShareKind = 'recipe' | 'post' | 'collection';

export interface ShareState {
    /** Whether the thing's own address answers without a session. */
    isPublic: boolean;
    /** The secret address, when one has been minted. */
    linkUrl: string | null;
}

/**
 * The furthest this thing currently reaches.
 *
 * `web` wins over `link` when both are true, because it is the wider answer
 * and the one somebody needs to know about: "a search engine may have it"
 * outranks "one person has a link".
 */
export function stageOf({ isPublic, linkUrl }: ShareState): ShareStage {
    if (isPublic) return 'web';
    if (linkUrl) return 'link';
    return 'household';
}

/**
 * What has to happen to get from where it is to where somebody just asked for.
 *
 * Returned as a plan rather than performed, so that the component showing it
 * can be read without knowing any endpoints, and so this can be tested without
 * a network.
 *
 * The rules, and each is a decision:
 *
 * **Going up never withdraws anything.** Asking for `web` on something that
 * already has a secret link leaves the link alone: somebody has it, it works,
 * and quietly breaking it because a different door opened would be a surprise
 * of the worst kind.
 *
 * **Coming down to `household` withdraws everything**, because that is what
 * the word means. Anything less would be a setting that says "only the
 * household" next to a link that still works.
 *
 * **Coming down from `web` to `link`** unpublishes and mints a link if there
 * is not one, which is the reading of "now only the people I send it to".
 */
export interface SharePlan {
    /** Set the public flag to this, or leave it alone when null. */
    setPublic: boolean | null;
    /** Mint a secret link when there is none. */
    mintLink: boolean;
    /** Withdraw the secret link if one exists. */
    revokeLink: boolean;
}

export function planFor(state: ShareState, wanted: ShareStage): SharePlan {
    const now = stageOf(state);

    if (now === wanted) return { setPublic: null, mintLink: false, revokeLink: false };

    if (wanted === 'household') {
        return { setPublic: state.isPublic ? false : null, mintLink: false, revokeLink: Boolean(state.linkUrl) };
    }

    if (wanted === 'link') {
        return { setPublic: state.isPublic ? false : null, mintLink: !state.linkUrl, revokeLink: false };
    }

    return { setPublic: true, mintLink: false, revokeLink: false };
}

/** Whether a plan does anything at all. */
export function isNoop(plan: SharePlan): boolean {
    return plan.setPublic === null && !plan.mintLink && !plan.revokeLink;
}
