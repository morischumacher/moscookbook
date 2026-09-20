/**
 * Duck-typed check for Prisma's known request errors.
 *
 * Deliberately avoids importing the generated `Prisma` namespace: route
 * handlers then typecheck even before `prisma generate` has run, and the
 * check works the same at runtime.
 *
 * Codes used in this app:
 *   P2002 – unique constraint violated (duplicate slug, duplicate favourite)
 *   P2003 – foreign key violated (referenced recipe does not exist)
 *   P2025 – record to update/delete not found
 */
export function isPrismaError(error: unknown, code: string): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === code
    );
}
