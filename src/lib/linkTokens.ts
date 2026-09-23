/**
 * A share link's secret is its path (/de/r/<token>): kept in an error row or
 * a ticket, it sat there in plain text for anybody reading those — and was
 * published with the task. The route stays, the secret goes.
 */
export function withoutLinkTokens(path: string): string {
    return path.replace(/^((?:\/(?:en|de))?\/(?:r|p|c|m|s))\/[^/]+/, '$1/<token>');
}
