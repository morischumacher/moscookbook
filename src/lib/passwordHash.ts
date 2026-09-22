/**
 * How expensive a password hash is.
 *
 * Cost 10 was the value in three places, chosen when bcrypt was added and
 * never revisited. Hardware has moved on; the usual floor now is 12, which
 * is four times the work per guess — a quarter of a second on an ordinary
 * core, which a person signing in does not notice and a person guessing
 * does.
 *
 * Existing hashes are unaffected: bcrypt stores its cost in the hash, so a
 * password hashed at 10 keeps verifying at 10 until it is next set, when it
 * is hashed at this. Nobody has to reset anything.
 */
export const BCRYPT_COST = 12;
