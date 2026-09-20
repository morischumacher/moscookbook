import { randomBytes } from 'node:crypto';

/**
 * Registration is invite-only. An admin creates a single-use link, sends it,
 * and it stops working once someone signs up with it or it expires.
 */

export const INVITE_VALID_DAYS = 14;

/** 128 bits, URL-safe, no characters that get mangled in a chat message. */
export function generateInviteCode(): string {
    return randomBytes(16).toString('base64url');
}

export function inviteExpiryFromNow(days = INVITE_VALID_DAYS): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export type InviteState = 'valid' | 'used' | 'expired' | 'unknown';

export interface InviteRecord {
    id: number;
    expiresAt: Date;
    usedAt: Date | null;
}

/** Single place that decides whether a code may still be redeemed. */
export function inviteState(invite: InviteRecord | null, now = new Date()): InviteState {
    if (!invite) return 'unknown';
    if (invite.usedAt !== null) return 'used';
    if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
    return 'valid';
}

export function inviteUrl(baseUrl: string, locale: string, code: string): string {
    return `${baseUrl.replace(/\/$/, '')}/${locale}/register?invite=${encodeURIComponent(code)}`;
}
