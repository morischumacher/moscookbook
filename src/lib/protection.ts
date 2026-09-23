/** Which rule protects an account from being demoted or deleted; see lib/userProtection. Pure, for the tests. */
export type Protection = 'self' | 'owner' | 'lastAdmin' | null;

export function protectionOf(targetId: number, actingId: number, owner: number | null, admins: number): Protection {
    if (targetId === actingId) return 'self';
    if (targetId === owner) return 'owner';
    if (admins <= 1) return 'lastAdmin';
    return null;
}
