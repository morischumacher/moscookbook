/**
 * A person's name, in two fields and one.
 *
 * Registration asks for a first and a last name, but everything that displays
 * a name — the greeting, the user list, the session — wants one string. Rather
 * than assembling it at each of those places, `name` stays the display field
 * and is written from the two parts. There is exactly one rule for how they
 * join, and it lives here.
 *
 * The split in the other direction exists for the rows that already have only
 * a `name`, and it is a guess. A guess is acceptable here because nothing
 * depends on it being right: the display name is unchanged either way, and the
 * parts are only ever shown back to the person in a form they can correct.
 */

export interface PersonName {
    firstName: string;
    lastName: string;
}

/** "Emma", "Huber" → "Emma Huber". Either part may be missing. */
export function fullName({ firstName, lastName }: PersonName): string {
    return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}
