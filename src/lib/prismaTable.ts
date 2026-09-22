import prisma from './prisma';

/**
 * A Prisma model that may not be in the generated client yet.
 *
 * The client is generated from the schema by `postinstall`, and the generated
 * file is not in the repository. So on every machine there is a window
 * between pulling a branch that adds a model and running `prisma generate`:
 * the schema has the model, the database has the table, and `prisma.<model>`
 * is `undefined`. Calling a method on it throws a *synchronous* `TypeError`,
 * before any promise exists, so a `.catch()` never runs and the whole request
 * dies with a stack trace about `findMany` on a machine where the only thing
 * wrong is a missing build step. This has cost an evening twice.
 *
 * Three modules each carried their own copy of the guard, with two different
 * `Delegate` interfaces and two different `warned` flags. One now. The caller
 * supplies the method shape it needs; this supplies the check and the
 * warning, once per model per process.
 *
 * `T` is deliberately loose — a record of methods returning `Promise<unknown>`
 * — because without a generated client there is nothing truer to say, and a
 * signature that claims to know the row shape is an assertion dressed as a
 * type. Callers annotate what they read back, which is the discipline the
 * rest of this codebase already follows.
 */
const warned = new Set<string>();

export function optionalTable<T extends Record<string, (...args: never[]) => unknown>>(
    name: string,
    probe: keyof T & string,
    consequence: string
): T | null {
    const model = (prisma as unknown as Record<string, T | undefined>)[name];

    if (!model || typeof model[probe] !== 'function') {
        if (!warned.has(name)) {
            warned.add(name);
            console.warn(
                `The Prisma client does not know about "${name}" yet. ` +
                `Run \`npx prisma generate\`. ${consequence}`
            );
        }
        return null;
    }

    return model;
}

/**
 * The same, inside an interactive transaction.
 *
 * `$transaction(async (tx) => …)` hands over a client whose models are typed
 * as loosely as the outer one here, and statements must be issued on it, not
 * on the outer client — issuing them outside would look identical and run
 * outside the transaction. No warning: by the time a transaction is running,
 * the outer accessor has already checked and said.
 */
export function transactionTable<T>(tx: unknown, name: string): T | null {
    const model = (tx as Record<string, T | undefined>)[name];
    return model ?? null;
}
