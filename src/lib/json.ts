/**
 * Turning an object into something a Json column will accept.
 *
 * Prisma types a Json column's input as roughly
 *
 *     type InputJsonObject = { readonly [key: string]: InputJsonValue | null }
 *
 * and TypeScript will not assign an `interface` to an index signature like
 * that — an interface can be augmented later, so the compiler cannot promise
 * its properties all fit. A `type` alias can. That is why storing a draft
 * typed as `ImportedRecipe` is rejected while the identical shape written as a
 * type alias is fine.
 *
 * The round trip through JSON is not only there to satisfy the compiler. It is
 * also what makes the value *actually* storable: anything that is not JSON —
 * a Date, an undefined, a function that crept in from a parser — is either
 * converted or dropped here rather than at the database.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

/**
 * Widens a value into plain JSON.
 *
 * Throws only for something that cannot be serialised at all, such as a
 * circular structure — which for a recipe draft would be a bug worth hearing
 * about rather than swallowing.
 */
export function toJsonObject(value: unknown): JsonObject {
    return JSON.parse(JSON.stringify(value)) as JsonObject;
}
