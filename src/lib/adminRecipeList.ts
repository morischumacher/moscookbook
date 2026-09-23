/**
 * The admin recipe list's address: what is searched, how it is sorted, which
 * recipes are shown and which page. In the address rather than in state, so
 * the back button, a reload and a bookmark all land where they left.
 */

export const ADMIN_PAGE_SIZE = 30;

export const ADMIN_SORTS = ['new', 'title', 'views'] as const;
export type AdminSort = (typeof ADMIN_SORTS)[number];

export const ADMIN_SHOWS = ['all', 'web', 'link', 'household', 'onlyMe'] as const;
export type AdminShow = (typeof ADMIN_SHOWS)[number];

export interface AdminListQuery {
    q: string;
    sort: AdminSort;
    show: AdminShow;
    page: number;
}

const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? '').replace(/\u0000/g, '');

export function readListQuery(params: Record<string, string | string[] | undefined>): AdminListQuery {
    const sort = first(params.sort);
    const show = first(params.show);
    const page = Number.parseInt(first(params.page), 10);
    return {
        q: first(params.q).trim().slice(0, 100),
        sort: (ADMIN_SORTS as readonly string[]).includes(sort) ? (sort as AdminSort) : 'new',
        show: (ADMIN_SHOWS as readonly string[]).includes(show) ? (show as AdminShow) : 'all',
        page: Number.isFinite(page) && page > 1 ? page : 1,
    };
}

/** The address for the same list with something changed; a new filter starts on page 1. */
export function listHref(query: AdminListQuery, change: Partial<AdminListQuery>): string {
    const next = { ...query, ...(change.page === undefined ? { page: 1 } : {}), ...change };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.sort !== 'new') params.set('sort', next.sort);
    if (next.show !== 'all') params.set('show', next.show);
    if (next.page > 1) params.set('page', String(next.page));
    const text = params.toString();
    return text ? `/admin?${text}` : '/admin';
}

/** Who can see it, as a database condition. */
export function showWhere(show: AdminShow) {
    switch (show) {
        case 'web':
            return { isPublic: true };
        case 'link':
            return { isPublic: false, shareToken: { not: null } };
        case 'household':
            return { isPublic: false, shareToken: null, onlyMe: false };
        case 'onlyMe':
            return { onlyMe: true };
        default:
            return {};
    }
}

export function sortOrder(sort: AdminSort) {
    switch (sort) {
        // The id last in each: two rows that tie otherwise must not swap
        // places between one page and the next.
        case 'title':
            return [{ title: 'asc' as const }, { id: 'desc' as const }];
        case 'views':
            return [{ views: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];
        default:
            return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    }
}
