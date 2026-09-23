/**
 * The name an invitation is for.
 *
 * The admin names the person when making the link, and the registration form
 * takes that name and does not let it be changed — so the people in the
 * cookbook are who the admin says they are, not whatever somebody typed.
 *
 * Names are how people are told apart here (a cooking entry says "Anna",
 * not an address), so a first name may be used once. When it is already
 * taken, the admin either picks another or adds a last name, and then the
 * whole name has to be unique.
 */

export interface PersonName {
    firstName: string;
    lastName: string;
}

export type NameCheck =
    /** Nobody has it. */
    | { state: 'free' }
    /** The first name is taken and no last name was given. */
    | { state: 'firstTaken'; holders: string[] }
    /** First and last name together are taken. */
    | { state: 'fullTaken'; holders: string[] };

const key = (value: string) => value.trim().toLocaleLowerCase('de');

const shown = (person: PersonName) => [person.firstName.trim(), person.lastName.trim()].filter(Boolean).join(' ');

/**
 * Checks a name against the people who have one already — accounts and the
 * invitations still open.
 */
export function checkName(wanted: PersonName, taken: PersonName[]): NameCheck {
    const first = key(wanted.firstName);
    if (first === '') return { state: 'free' };

    const sameFirst = taken.filter((person) => key(person.firstName) === first);
    if (sameFirst.length === 0) return { state: 'free' };

    const last = key(wanted.lastName);
    if (last === '') return { state: 'firstTaken', holders: sameFirst.map(shown) };

    const sameFull = sameFirst.filter((person) => key(person.lastName) === last);
    return sameFull.length === 0 ? { state: 'free' } : { state: 'fullTaken', holders: sameFull.map(shown) };
}

/**
 * The name the account is made with: the invitation's where it has one, what
 * was typed where it does not. The form shows the invitation's as fixed; this
 * is the server making sure of it.
 */
export function registeredName(typed: PersonName, invite: { firstName: string | null; lastName: string | null }): PersonName {
    return {
        firstName: invite.firstName?.trim() || typed.firstName.trim(),
        lastName: invite.lastName?.trim() || typed.lastName.trim(),
    };
}
