/**
 * Who may touch somebody else's row.
 *
 * The cookbook has exactly two kinds of thing a person contributes — a cooked
 * photograph and an entry in the cooking log — and both are **shared**: every
 * account sees all of them, with the author's name on top. That single fact
 * decides the whole rule, and it is worth writing down because getting it from
 * memory produced two different answers in the same afternoon.
 *
 * **Writing is the author's, deleting is the admin's.**
 *
 * A caption and a note are somebody speaking. An admin who edited them would
 * be putting words in another person's mouth under that person's name, and no
 * amount of being the admin makes that a reasonable thing to be able to do. So
 * editing is the author's alone, admin or not.
 *
 * Removing it whole says nothing on anybody's behalf. It is moderation, and
 * moderation is the thing an admin is for — on a page everyone reads, somebody
 * has to be able to take down what does not belong there.
 *
 * The cooking log used to be the exception: nobody could delete anybody else's
 * entry, justified as "one person's record of their own evening". That reason
 * describes something private, and the log is not private — every account reads
 * every entry, notes included. A rule that only holds if you forget how the
 * feature works is not a rule. They are comments, and they are moderated like
 * the comments they are.
 *
 * Returned as a fragment for a `where` clause rather than checked in an `if`,
 * so the permission travels *inside* the query: there is no window between
 * asking who owns a row and writing to it, and a query that forgets to apply
 * it does not compile to something that quietly matches everything.
 */

export interface Actor {
    id: number;
    admin: boolean;
}

/** What an actor is doing to a row that may not be theirs. */
export type Act =
    /** Rewriting what somebody wrote. Never anyone but its author. */
    | 'edit'
    /** Taking it down whole. An admin may, on a shared page. */
    | 'delete';

/**
 * The `where` fragment that limits a query to the rows this actor may act on.
 *
 * Spread into the query beside the row's own identifiers:
 *
 *     where: { id: entryId, recipeId, ...ownerScope(user, 'delete') }
 *
 * An empty object is not an oversight — it is an admin deleting, and the
 * surrounding `id` and `recipeId` are what still pin the query to one row.
 */
export function ownerScope(actor: Actor, act: Act): { userId?: number } {
    if (act === 'delete' && actor.admin) return {};
    return { userId: actor.id };
}
