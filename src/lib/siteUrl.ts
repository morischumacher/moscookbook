/**
 * Base URL for canonical links and OpenGraph images.
 *
 * Order matters:
 *   1. NEXT_PUBLIC_SITE_URL — your own domain, once you have one
 *   2. VERCEL_PROJECT_PRODUCTION_URL — set by Vercel, always the production
 *      deployment, so preview builds still point at the real site
 *   3. VERCEL_URL — the current deployment, used when the one above is absent
 *   4. localhost, for development
 *
 * There is deliberately no hard-coded domain: a guessed one silently produces
 * share links that go nowhere.
 */
function withProtocol(host: string): string {
    return host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`;
}

export function getSiteUrl(): string {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (configured) return withProtocol(configured).replace(/\/$/, '');

    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (production) return withProtocol(production);

    const deployment = process.env.VERCEL_URL?.trim();
    if (deployment) return withProtocol(deployment);

    return 'http://localhost:3000';
}
