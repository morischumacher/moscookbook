import { suite, equal, check } from './harness';
import { ownerScope, type Actor } from '../src/lib/ownership';

/**
 * Who may touch somebody else's row.
 *
 * This file exists because the rule was previously held in place by nothing
 * except the person who wrote it having remembered it that day — and he did
 * not: the cooking log ended up author-only for deletion while the
 * photographs allowed an admin, and the justification given for the difference
 * described a privacy the feature did not have.
 *
 * A permission rule that is only correct by habit is the one worth nailing
 * down, because when it drifts nothing fails: the wrong person quietly gets to
 * do the thing.
 */
export default function ownershipTests() {
    suite('ownerScope');

    const guest: Actor = { id: 7, admin: false };
    const admin: Actor = { id: 1, admin: true };

    /* ------------------------------------------------------------ writing */

    // The whole point of the `edit` case: an admin who rewrote somebody's note
    // would be putting words in their mouth, under their name, on a page the
    // other person reads.
    equal('an author may edit their own', ownerScope(guest, 'edit'), { userId: 7 });
    equal('an admin is still limited to their own', ownerScope(admin, 'edit'), { userId: 1 });

    check(
        'no actor whatsoever gets an unrestricted edit',
        [guest, admin, { id: 99, admin: true }, { id: 0, admin: false }]
            .every((actor) => ownerScope(actor, 'edit').userId === actor.id)
    );

    /* ----------------------------------------------------------- deleting */

    equal('a guest may delete only their own', ownerScope(guest, 'delete'), { userId: 7 });
    equal('an admin may delete any', ownerScope(admin, 'delete'), {});

    /* ------------------------------------------- what the fragment becomes */

    /*
     * The admin's delete is an empty object, and an empty object spread into a
     * `where` clause adds no condition at all. That is correct only because
     * the caller always pins the row by id — and if a caller ever stopped
     * doing that, this would be a `deleteMany` matching the whole table.
     *
     * So: the shape is asserted rather than assumed. An empty fragment must
     * have no `userId` key at all, not a `userId` of undefined — Prisma treats
     * `{ userId: undefined }` as "no filter" too, which happens to be the same
     * answer here, but by accident rather than by intent.
     */
    equal("an admin's delete adds no condition", Object.keys(ownerScope(admin, 'delete')), []);
    equal('a guest fragment has exactly one', Object.keys(ownerScope(guest, 'delete')), ['userId']);

    check(
        'the id in the fragment is always the actor, never anything else',
        ownerScope({ id: 42, admin: false }, 'edit').userId === 42 &&
            ownerScope({ id: 42, admin: false }, 'delete').userId === 42
    );

    /* -------------------------------------------- the two acts are not one */

    check(
        'being an admin changes deleting and only deleting',
        JSON.stringify(ownerScope(admin, 'edit')) !== JSON.stringify(ownerScope(admin, 'delete'))
    );

    check(
        'being a guest changes nothing between the two',
        JSON.stringify(ownerScope(guest, 'edit')) === JSON.stringify(ownerScope(guest, 'delete'))
    );
}
