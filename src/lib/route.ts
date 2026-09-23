import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { getCurrentUser, requireAdmin, requireUser } from './auth';
import type { SessionUser } from './session';
import { positiveIntId } from './routeParams';
import { formatZodError } from './zodMessage';
import { failed } from './reportServerError';

/**
 * The part of a route handler that is the same in every route.
 *
 * Fifty-odd handlers each opened with the same four steps — who is asking,
 * which id, is the body well-formed, and a try/catch that logs and answers
 * 500 — written out by hand every time, and each one a place to forget one
 * of them. This does the four, and the handler is left with what the route is
 * actually for:
 *
 *   export const POST = route({ access: 'user', body: schema, label: 'Cook entry' },
 *       async ({ user, params, body }) => { … return NextResponse.json(…); });
 *
 * Inside a handler, `refuse(status, message)` ends the request with that
 * answer from any depth, so a guard does not need its own early return.
 *
 * Not every route has been moved onto it: the old ones work, and rewriting
 * all of them at once is a large change for no behaviour. New routes use it,
 * and old ones move over when they are next changed.
 */

type Access = 'public' | 'user' | 'admin';

type UserFor<A extends Access> = A extends 'public' ? SessionUser | null : SessionUser;

export class Refusal extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
    }
}

/** Ends the request with this status and message. */
export function refuse(status: number, message: string): never {
    throw new Refusal(status, message);
}

/** A positive integer id from a route parameter, or a 400. */
export function idFrom(raw: string | null | undefined, what = 'ID'): number {
    const id = positiveIntId(raw);
    if (id === null) refuse(400, `Invalid ${what}`);
    return id;
}

export function route<
    A extends Access,
    S extends z.ZodType | undefined = undefined,
    P extends Record<string, string> = Record<string, string>,
>(
    options: { access: A; body?: S; label: string },
    handler: (context: {
        req: NextRequest;
        user: UserFor<A>;
        params: P;
        body: S extends z.ZodType ? z.infer<S> : undefined;
    }) => Promise<Response>
) {
    return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
        try {
            let user: SessionUser | null = null;

            if (options.access !== 'public') {
                const auth = options.access === 'admin' ? await requireAdmin() : await requireUser();
                if ('response' in auth) return auth.response;
                user = auth.user;
            } else {
                user = await getCurrentUser();
            }

            const params = context?.params ? await context.params : ({} as P);

            let body: unknown = undefined;
            if (options.body) {
                // A missing or unreadable body is parsed as `{}`, so a schema
                // whose fields are all optional accepts an empty request.
                const raw: unknown = await req.json().catch(() => ({}));
                const parsed = options.body.safeParse(raw ?? {});
                if (!parsed.success) {
                    return NextResponse.json({ message: formatZodError(parsed.error) }, { status: 400 });
                }
                body = parsed.data;
            }

            return await handler({
                req,
                user: user as UserFor<A>,
                params,
                body: body as S extends z.ZodType ? z.infer<S> : undefined,
            });
        } catch (error) {
            if (error instanceof Refusal) {
                return NextResponse.json({ message: error.message }, { status: error.status });
            }
            failed(`${options.label} failed:`, error);
            return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
        }
    };
}
