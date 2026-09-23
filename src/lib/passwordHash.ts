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

/**
 * Compared against when no account has the address, so that a wrong address
 * and a wrong password take the same time and cannot be told apart.
 *
 * It must be hashed at `BCRYPT_COST`. It used to be a cost-10 hash while real
 * ones are cost 12 — four times cheaper — so an unknown address answered in a
 * quarter of the time and the login form told anybody who timed it which
 * addresses had accounts. A test holds the two together.
 */
export const DUMMY_HASH = '$2b$12$5Zf5AB1FDXd6gqS.gFe4D.eVQ2.Zdg0hA1wdP7XW5gvhcVazIh7nm';

