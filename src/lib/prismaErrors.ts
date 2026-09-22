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

/**
 * Why a write failed, in a sentence that can go to a screen.
 *
 * Prisma's own messages are for developers: they name the model, the field,
 * the constraint and the expected type, and they are unbounded. The archive
 * import was returning them verbatim, so a crafted upload got a field-by-field
 * map of the schema back — admin-only, and the schema is not a secret, but a
 * pool error would have carried a connection string the same way. The full
 * error still goes to the log. The person gets the one thing they can act on.
 */
export function describeWriteFailure(error: unknown): string {
    if (isPrismaError(error, 'P2002')) return 'already exists';
    if (isPrismaError(error, 'P2003')) return 'refers to something that is not there';
    if (isPrismaError(error, 'P2025')) return 'not found';
    if (isPrismaError(error, 'P2000')) return 'a value is too long for its field';
    return 'could not be written';
}
