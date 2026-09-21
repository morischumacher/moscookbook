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

/**
 * Splits at the *last* space, not the first.
 *
 * German names carry particles — "Anna von Bergen", "Max zu Guttenberg" — and
 * those belong to the surname. Splitting at the first space would make "von
 * Bergen" a first name of "Anna" and a surname of "von"; splitting at the last
 * gets "Anna von" and "Bergen", which is wrong in a different way.
 *
 * So particles are recognised: once one appears, everything from there on is
 * the surname. Beyond that the last space is used, which is right far more
 * often than it is wrong for the names a personal cookbook will see.
 */
const PARTICLES = new Set([
    'von', 'van', 'de', 'del', 'della', 'di', 'da', 'dos', 'du', 'le', 'la',
    'zu', 'zum', 'zur', 'ter', 'ten', 'af', 'av', 'bin', 'ibn', "d'", 'o',
]);

export function splitName(name: string): PersonName {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };

    // The first particle that is not the very first word starts the surname.
    for (let index = 1; index < parts.length; index += 1) {
        if (PARTICLES.has(parts[index].toLowerCase())) {
            return {
                firstName: parts.slice(0, index).join(' '),
                lastName: parts.slice(index).join(' '),
            };
        }
    }

    return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1],
    };
}
