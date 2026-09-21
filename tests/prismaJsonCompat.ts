/**
 * A compile-time check that what we store in a Json column is storable.
 *
 * This repository is worked on in two places: one where `prisma generate` has
 * run and one where it has not. Without a generated client, `prisma.capture`
 * is `any` and every argument to it typechecks — which is exactly how a draft
 * typed as an interface got written into a Json column and only failed on the
 * other machine.
 *
 * So Prisma's own declarations for that column are reproduced here, copied
 * from @prisma/client v5, and the assignment is asserted against them. There
 * is nothing to run: `npm run typecheck` either accepts this file or does not.
 *
 * If a Prisma upgrade changes these types, this file will disagree with
 * reality. That is a smaller problem than the alternative — it fails loudly
 * on both machines rather than quietly on one.
 */
import type { JsonObject } from '../src/lib/json';
import { toJsonObject } from '../src/lib/json';
import type { ImportedRecipe } from '../src/lib/recipeFromHtml';

/* ---- copied from @prisma/client v5 ------------------------------------- */

type InputJsonObject = { readonly [Key in string]?: InputJsonValue | null };
type InputJsonArray = ReadonlyArray<InputJsonValue | null>;
type InputJsonValue =
    | string
    | number
    | boolean
    | InputJsonObject
    | InputJsonArray
    | { toJSON(): unknown };

/* ---- the assertions ---------------------------------------------------- */

/**
 * Only its parameter type matters; the body never runs. Declared rather than
 * defined, so there is no unused argument to explain away.
 */
declare function accepts(value: InputJsonValue | undefined): void;

const draft: ImportedRecipe = {
    title: '',
    description: '',
    ingredients: [],
    instructions: '',
    imageUrl: '',
    category: '',
    nationality: '',
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    sourceUrl: '',
};

// The point of the exercise: widened, a draft is accepted.
accepts(toJsonObject(draft));

// And so is a plain JsonObject, which is what toJsonObject promises.
const plain: JsonObject = { a: 1, b: [true, null, { c: 'd' }] };
accepts(plain);

// Left as a comment rather than deleted: passing the interface directly is
// what failed, and uncommenting it must fail again.
//
//   accepts(draft);
//
// > Type 'ImportedRecipe' is not assignable to type 'InputJsonValue'.
// >   Index signature for type 'string' is missing in type 'ImportedRecipe'.

export {};
