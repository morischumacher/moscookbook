/**
 * Where am I?
 *
 * The navigation used to be a row of eight links with nothing marked, so a
 * person who tapped "Blog" arrived somewhere with no indication of where they
 * were or how to get back to the recipes — and the recipes, which are the
 * entire point of the site, had no link of their own at all. You reached them
 * by pressing the logo, which is a thing designers know and nobody else does.
 *
 * So: three sections at the top, one of them always marked as the one you are
 * in. The admin's six tools are not sections — they are one section with a
 * sub-navigation of its own, on the pages where they apply.
 *
 * This file is only the matching, kept apart from the markup because it is the
 * part that can be wrong in a way nobody notices: a rule that matches too much
 * lights up two sections at once, and one that matches too little lights up
 * none, which is exactly the state this replaces.
 */

export type Section = 'recipes' | 'blog' | 'admin' | null;

/**
 * Strips `/en` or `/de` from the front, so the rules below are written once.
 * A path with no locale is returned unchanged rather than mangled.
 */
export function withoutLocale(pathname: string): string {
    const stripped = pathname.replace(/^\/(?:en|de)(?=\/|$)/, '');
    return stripped === '' ? '/' : stripped;
}

/**
 * Which top-level section a path belongs to.
 *
 * Admin is tested first and on its own: `/admin/posts` is an admin page about
 * the blog, not a blog page, and marking "Blog" there would send an admin
 * looking for the way out of a section they are not in.
 */
export function sectionFor(pathname: string): Section {
    const path = withoutLocale(pathname);

    if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
    if (path === '/blog' || path.startsWith('/blog/')) return 'blog';

    // The recipe list is the front page, and a single recipe belongs with it.
    if (path === '/' || path.startsWith('/recipe/')) return 'recipes';

    // Login, registration, a shared link: pages that are not anywhere in
    // particular. Marking a section on them would be a lie, and the people
    // reading them have no navigation to speak of anyway.
    return null;
}

/** One entry in the admin's own navigation. */
export interface AdminLink {
    href: string;
    /** The translation namespace and key, so the checker can see every one. */
    label: string;
}

/**
 * Which admin tool a path is in, for marking that tool's tab.
 *
 * `/admin` itself is exact: every other page starts with it, and a
 * `startsWith` test would light the overview up on all of them.
 */
export function adminSectionFor(pathname: string): string | null {
    const path = withoutLocale(pathname);
    if (!path.startsWith('/admin')) return null;

    for (const candidate of ['/admin/inbox', '/admin/posts', '/admin/users', '/admin/invites', '/admin/errors', '/admin/devices']) {
        if (path === candidate || path.startsWith(`${candidate}/`)) return candidate;
    }

    // Creating and editing a recipe belong to the recipe list they came from.
    if (path === '/admin' || path.startsWith('/admin/create') || path.startsWith('/admin/edit')) {
        return '/admin';
    }

    return null;
}
