import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * A small sealed envelope, for the one kind of secret this cookbook stores.
 *
 * API keys have to be *stored*, not hashed: the whole point of one is to send
 * it to somebody. So the question is not "can this be read back" — it must be —
 * but "what does reading the database get you". Sealed, the answer is nothing:
 * a dump, a backup, a screenshot of a row, a support session with somebody
 * reading the table over a shoulder, all of it is ciphertext.
 *
 * AES-256-GCM, because the tag means a tampered envelope fails to open rather
 * than opening into something else. A fresh 96-bit IV per seal, which is what
 * GCM wants and what makes sealing the same key twice produce two different
 * envelopes.
 *
 * **The key is derived, not stored.** HKDF-SHA256 over the session secret with
 * a fixed label, so there is no second secret to set, forget and lose — and the
 * label means this derived key is not the session key even though it comes from
 * the same material. `AI_SECRET_KEY` overrides it for anyone who would rather
 * separate the two; almost nobody needs to.
 *
 * ## What happens when the session secret is rotated
 *
 * The envelopes stop opening. That is the honest consequence of not storing a
 * second secret, and the design choice here is about *how* it fails: `open`
 * returns null rather than throwing, every caller treats null as "no key
 * configured", and the admin screen says the key cannot be read and asks for it
 * again. An import quietly falling back to its rules is a much better Tuesday
 * than an admin page that will not render.
 */

/** Stamped into every envelope, so a future scheme can be told from this one. */
const VERSION = 'v1';

/**
 * Separates this key from every other use of the same secret. Changing this
 * string makes every stored envelope unreadable — it is part of the format.
 */
const INFO = 'moscookbook:ai-credentials:v1';

/**
 * The shortest secret worth deriving from. Matches the length the session
 * helper already insists on, so a deployment that boots at all has enough.
 */
const MIN_SECRET_LENGTH = 32;

function material(): string | null {
    const value = process.env.AI_SECRET_KEY || process.env.SECRET_COOKIE_PASSWORD || '';
    return value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** Whether sealing is possible at all. The admin screen asks before offering. */
export function canSeal(): boolean {
    return material() !== null;
}

function derive(secret: string): Buffer {
    // No salt: the input is already a long random secret rather than a
    // password, and a stored salt would be one more thing to lose. The label
    // does the domain separation.
    return Buffer.from(hkdfSync('sha256', secret, new Uint8Array(0), INFO, 32));
}

/**
 * Seals a secret. Throws only when there is no key material to derive from,
 * which is a deployment that cannot hold secrets at all and should say so
 * loudly rather than write something it cannot read back.
 */
export function seal(plaintext: string): string {
    const secret = material();
    if (!secret) throw new Error('No secret is configured, so keys cannot be stored.');

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derive(secret), iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
        VERSION,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        body.toString('base64'),
    ].join('.');
}

/**
 * Opens an envelope, or returns null.
 *
 * Null covers every way this can go wrong and deliberately does not
 * distinguish between them: a rotated secret, a truncated column, a row
 * written by a newer version, somebody's hand-edited value. The caller's
 * behaviour is the same in all of those cases — behave as though no key is
 * configured — and a function that reports *why* a decryption failed is a
 * function that helps somebody work out what the key is.
 */
export function open(envelope: string): string | null {
    const secret = material();
    if (!secret) return null;

    const parts = envelope.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) return null;

    try {
        const iv = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const body = Buffer.from(parts[3], 'base64');

        // GCM's own lengths. A wrong one throws below anyway, but failing here
        // keeps a malformed row from reaching the cipher at all.
        if (iv.length !== 12 || tag.length !== 16) return null;

        const decipher = createDecipheriv('aes-256-gcm', derive(secret), iv);
        decipher.setAuthTag(tag);

        const opened = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
        return opened === '' ? null : opened;
    } catch {
        return null;
    }
}

/**
 * The last four characters, for a screen that has to say *which* key this is
 * without saying what it is.
 *
 * Four, not eight: a provider key is long and its prefix is a brand
 * (`sk-ant-`, `sk-`, `AIza`), so the tail is the only part that identifies one
 * key from another, and four characters of it is 1 in 65 000 — enough to tell
 * two of your own apart, useless to anybody guessing.
 */
export function hintFor(plaintext: string): string {
    return plaintext.slice(-4);
}

/**
 * Removes a key from a message on its way to a screen or a log.
 *
 * Providers echo credentials back in error bodies — an OpenAI 401 has
 * contained the key it rejected — and those bodies are shown to an admin and
 * written to `checkError`, which is a column, which ends up in a dump. So
 * nothing that came from a provider is shown until it has been through here.
 */
export function scrub(message: string, ...secrets: (string | null | undefined)[]): string {
    let cleaned = message;

    for (const secret of secrets) {
        // Short strings would match half the alphabet; a real key is long.
        if (!secret || secret.length < 8) continue;
        cleaned = cleaned.split(secret).join('«key»');
        // Providers sometimes redact the middle themselves and leave the ends.
        cleaned = cleaned.split(secret.slice(0, 12)).join('«key»');
        cleaned = cleaned.split(secret.slice(-8)).join('«key»');
    }

    return cleaned;
}
