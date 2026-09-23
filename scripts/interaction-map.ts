/**
 * The interaction map, generated from the code.
 *
 * Every screen, every API endpoint, every place a component calls one, and
 * every link from one screen to another — read off the source rather than
 * written down, so that the map cannot quietly stop describing the app. The
 * analysis on top of it is hand-written and lives in docs/interaction-map.md;
 * this produces docs/interaction-map.generated.md, and `check:map` fails when
 * the committed copy differs from what the code says today.
 *
 * Deliberately regex-based rather than a parse of the TypeScript. A route file
 * exports its methods by name, a fetch names its path as a string or a
 * template, a Link names its href — all of it is on the surface, and a full
 * parser would be more code than the app's own routing. The cost is that a
 * fetch whose URL is built somewhere else is invisible here; the map says so
 * and lists what it could not resolve.
 *
 *   npx ts-node --transpile-only --project tests/tsconfig.json scripts/interaction-map.ts
 *   npm run map            (writes)
 *   npm run check:map      (compares)
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathAccess, apiAccess, proxyStepsAside, type Access } from '../src/lib/accessRules';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'interaction-map.generated.md');

/* -------------------------------------------------------------------------- */
/*  Walking                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A file's code, without its prose.
 *
 * Every reader below is a regex over the source, and this codebase explains
 * itself at length in comments — including, in `useAction`, an example of the
 * very thing being looked for:
 *
 *     await run(() => fetch('/api/…', { method: 'POST' }), t('couldNotSave'));
 *
 * which the map dutifully listed as a call to an endpoint named `/api/…`.
 * check:prisma learned this same lesson the same way. Strings are left alone:
 * a quote inside a comment is gone with the comment, and a `//` inside a URL
 * string is not a comment — so block comments go first, then a line comment
 * only where it is not preceded by a colon.
 */
function code(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir: string, keep: (path: string) => boolean, into: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, keep, into);
        else if (keep(path)) into.push(path);
    }
    return into.sort();
}

function rel(path: string): string {
    return relative(ROOT, path).split(sep).join('/');
}

/* -------------------------------------------------------------------------- */
/*  Screens                                                                   */
/* -------------------------------------------------------------------------- */

interface Screen {
    route: string;
    file: string;
    access: Access | 'root';
    proxy: 'steps aside' | 'requires session' | 'requires admin' | '—';
    components: string[];
    fetches: string[];
    links: string[];
}

/** `src/app/[locale]/admin/edit/[id]/page.tsx` → `/[locale]/admin/edit/[id]` */
function routeOf(file: string): string {
    const inner = rel(file).replace(/^src\/app/, '').replace(/\/page\.tsx$/, '');
    return inner === '' ? '/' : inner;
}

/** The route with a concrete locale, for `pathAccess`, which wants one. */
function concrete(route: string): string {
    return route.replace('[locale]', 'de').replace(/\[[^\]]+\]/g, 'x');
}

const COMPONENT_IMPORT = /from '@\/components\/([^']+)'/g;
// `import MobileNavbar from './MobileNavbar'` — a sibling, named relative to
// the importing file. Only components import each other this way.
const RELATIVE_IMPORT = /from '(\.{1,2}\/[^']+)'/g;
const FETCH = /fetch\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*(?:,\s*\{[^}]*?method:\s*(?:['"](\w+)['"]|([^,}\s]+)))?/g;
const HREF = /href[=:]\s*\{?\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/g;
const PUSH = /router\.(?:push|replace)\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/g;
const REDIRECT = /redirect\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/g;

/** `/api/recipes/${id}/favorite` → `/api/recipes/[id]/favorite` */
function normalisePath(raw: string): string {
    return raw
        .replace(/\$\{[^}]*\}/g, '[x]')
        .replace(/\?.*$/, '')
        // A template glued to the end of a segment is a query string built
        // elsewhere (`photos${query}`), not part of the path.
        .replace(/(?<=[a-z])\[x\]$/, '')
        .replace(/\/\[x\](?=\/|$)/g, '/[id]')
        .replace(/^\/\[id\]\//, '/[locale]/');
}

/** `/api/ai-keys/[provider]` and `/api/ai-keys/[id]` are the same shape. */
function shape(path: string): string {
    return path.replace(/\[[^\]]+\]/g, '[]');
}

/** Any `/api/…` string or template literal, wherever it sits. */
const API_LITERAL = /(?:`|')(\/api\/[^`'\s]*)(?:`|')/g;

function fetchesIn(text: string): string[] {
    const found = new Set<string>();

    for (const m of text.matchAll(FETCH)) {
        const url = m[1] ?? m[2] ?? m[3] ?? '';
        if (!url.startsWith('/api/')) continue;
        // A method that is an expression (`isFavorited ? 'DELETE' : 'POST'`),
        // or the `{ method }` shorthand, is recorded as `*` and matched to
        // every method on that path.
        const method = m[4] ? m[4].toUpperCase() : m[5] ? '*' : 'GET';
        const path = normalisePath(url);
        found.add(`${method} ${path}`);
    }

    // The shorthand `fetch(url, { method })` has no `method:` for the regex
    // above; it shows up as a fetch with no options match. Treat any fetch
    // whose options mention `method` without a colon as dynamic.
    for (const m of text.matchAll(/fetch\(\s*(?:`([^`]*)`|'([^']*)')\s*,\s*\{\s*method\s*[,}]/g)) {
        const path = normalisePath(m[1] ?? m[2] ?? '');
        if (!path.startsWith('/api/')) continue;
        found.delete(`GET ${path}`);
        found.add(`* ${path}`);
    }

    // And a URL built into a variable before the fetch — `const url = post ?
    // \`/api/posts/${id}\` : '/api/posts'` — which the fetch regex cannot see.
    // Recorded with an unknown method so the endpoint is not wrongly listed
    // as called by nothing.
    // Counted, not just checked: a path that appears in two literals but was
    // captured by one fetch has a second use somewhere the fetch regex did
    // not see (a conditional URL, a variable), and that use has some method.
    const captured = new Map<string, number>();
    for (const m of text.matchAll(FETCH)) {
        const url = m[1] ?? m[2] ?? m[3] ?? '';
        if (url.startsWith('/api/')) {
            const path = normalisePath(url);
            captured.set(path, (captured.get(path) ?? 0) + 1);
        }
    }
    const literal = new Map<string, number>();
    for (const m of text.matchAll(API_LITERAL)) {
        const path = normalisePath(m[1]);
        literal.set(path, (literal.get(path) ?? 0) + 1);
    }
    for (const [path, count] of literal) {
        if (count > (captured.get(path) ?? 0)) found.add(`* ${path}`);
    }

    // A download link is a GET the browser makes.
    for (const m of text.matchAll(/href=\{?\s*(?:`|'|")(\/api\/[^`'"\s]*)(?:`|'|")/g)) {
        found.add(`GET ${normalisePath(m[1])}`);
    }

    return [...found].sort();
}

function linksIn(text: string): string[] {
    const found = new Set<string>();
    for (const re of [HREF, PUSH, REDIRECT]) {
        for (const m of text.matchAll(re)) {
            const url = m[1] ?? m[2] ?? m[3] ?? '';
            if (!url.startsWith('/') || url.startsWith('/api/') || url.startsWith('//')) continue;
            // next-intl's Link takes `/admin` and adds the locale itself; a
            // plain `<a>` or a redirect names it. Both mean the same screen.
            let path = normalisePath(url).replace(/^\/(?:de|en)(?=\/|$)/, '/[locale]');
            if (!path.startsWith('/[locale]')) path = path === '/' ? '/[locale]' : `/[locale]${path}`;
            found.add(path);
        }
    }
    return [...found].sort();
}

function componentsIn(text: string, from?: string): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(COMPONENT_IMPORT)) found.add(m[1]);
    if (from !== undefined) {
        // Resolve `./X` and `../X` against the importer's own folder inside
        // src/components; anything that walks out of it is not a component.
        const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
        for (const m of text.matchAll(RELATIVE_IMPORT)) {
            const parts = (dir ? dir + '/' : '').concat(m[1]).split('/');
            const stack: string[] = [];
            for (const part of parts) {
                if (part === '.' || part === '') continue;
                if (part === '..') { if (!stack.length) { stack.push('\0'); break; } stack.pop(); continue; }
                stack.push(part);
            }
            const name = stack.join('/');
            if (componentSources.has(name)) found.add(name);
        }
    }
    return [...found].sort();
}

/** What a component transitively imports, for the "renders" column. */
const componentSources = new Map<string, string>();
for (const file of walk(join(ROOT, 'src', 'components'), (p) => p.endsWith('.tsx'))) {
    componentSources.set(rel(file).replace(/^src\/components\//, '').replace(/\.tsx$/, ''), code(readFileSync(file, 'utf8')));
}

function transitive(names: string[], seen = new Set<string>()): string[] {
    for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        const source = componentSources.get(name);
        if (source) transitive(componentsIn(source, name), seen);
    }
    return [...seen].sort();
}

const screens: Screen[] = walk(join(ROOT, 'src', 'app'), (p) => p.endsWith('page.tsx') && !p.includes('/api/')).map((file) => {
    const route = routeOf(file);
    const text = code(readFileSync(file, 'utf8'));
    const direct = componentsIn(text);
    const all = transitive(direct);
    const own = fetchesIn(text);
    const viaComponents = all.flatMap((name) => fetchesIn(componentSources.get(name) ?? ''));
    const ownLinks = linksIn(text);
    const viaComponentLinks = all.flatMap((name) => linksIn(componentSources.get(name) ?? ''));

    const access: Access | 'root' = route.startsWith('/[locale]') ? pathAccess(concrete(route)) : 'root';
    const proxy =
        access === 'root' ? '—'
            : proxyStepsAside(access) ? 'steps aside'
                : access === 'admin' ? 'requires admin'
                    : 'requires session';

    return {
        route,
        file: rel(file),
        access,
        proxy,
        components: all,
        fetches: [...new Set([...own, ...viaComponents])].sort(),
        links: [...new Set([...ownLinks, ...viaComponentLinks])].sort(),
    };
});

/* -------------------------------------------------------------------------- */
/*  Endpoints                                                                 */
/* -------------------------------------------------------------------------- */

interface Endpoint {
    method: string;
    path: string;
    file: string;
    gate: string;
    validated: boolean;
    limited: boolean;
    callers: string[];
}

const METHODS = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

const endpoints: Endpoint[] = [];
for (const file of walk(join(ROOT, 'src', 'app', 'api'), (p) => p.endsWith('route.ts'))) {
    const path = rel(file).replace(/^src\/app/, '').replace(/\/route\.ts$/, '');
    const text = code(readFileSync(file, 'utf8'));
    const starts = [...text.matchAll(METHODS)];
    for (const [i, m] of starts.entries()) {
        // The gate is read from this handler's body alone: a file can guard
        // its GET with the session and its POST with a device token.
        const body = text.slice(m.index ?? 0, starts[i + 1]?.index ?? text.length);
        const gate =
            /requireAdmin\(/.test(body) ? 'admin'
                : /requireUser\(/.test(body) ? 'user'
                    : /getCurrentUser\(/.test(body) ? 'user (manual)'
                        : /captureToken|tokenHash|tokenFromHeader/.test(body) ? 'device token'
                            : /authorised\(|CRON_SECRET/.test(body) ? 'cron secret'
                                : apiAccess(path) === 'open' ? 'none (open by design)'
                                    : 'session (proxy only)';
        endpoints.push({
            method: m[1],
            path,
            file: rel(file),
            gate,
            validated: /\.safeParse\(|\.parse\(/.test(text),
            limited: /rateLimit(?:Shared)?\(/.test(text),
            callers: [],
        });
    }
}

// Who calls what: components and client pages.
const callerSources = new Map<string, string>(componentSources);
for (const file of walk(join(ROOT, 'src', 'app'), (p) => p.endsWith('.tsx') && !p.includes('/api/'))) {
    callerSources.set(rel(file), code(readFileSync(file, 'utf8')));
}
const unresolved = new Set<string>();
for (const [name, text] of callerSources) {
    for (const call of fetchesIn(text)) {
        const [method, path] = call.split(' ');
        const hits = endpoints.filter(
            (e) => shape(e.path) === shape(path) && (method === '*' || e.method === method)
        );
        if (hits.length) for (const hit of hits) hit.callers.push(name);
        else unresolved.add(`${call}  (from ${name})`);
    }
}
for (const e of endpoints) e.callers = [...new Set(e.callers)].sort();

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

const lines: string[] = [];
const out = (s = '') => lines.push(s);

out('# Interaction map — generated');
out();
out('Read from the source by `scripts/interaction-map.ts`. Do not edit; run `npm run map`.');
out('The analysis lives in [interaction-map.md](./interaction-map.md).');
out();
out(`${screens.length} screens · ${endpoints.length} endpoints · ${screens.reduce((n, s) => n + s.links.length, 0)} link edges · ${endpoints.reduce((n, e) => n + e.callers.length, 0)} call edges`);
out();

/* ── screens ── */
out('## Screens');
out();
out('| Route | Access | Proxy | Calls | Links to |');
out('|---|---|---|---|---|');
for (const s of screens) {
    const calls = s.fetches.length ? s.fetches.map((f) => `\`${f}\``).join('<br>') : '—';
    const links = s.links.length ? s.links.map((l) => `\`${l}\``).join('<br>') : '—';
    out(`| \`${s.route}\` | ${s.access} | ${s.proxy} | ${calls} | ${links} |`);
}
out();

/* ── endpoints ── */
out('## Endpoints');
out();
out('| Method | Path | Gate | Validated | Rate-limited | Called from |');
out('|---|---|---|---|---|---|');
for (const e of endpoints) {
    const callers = e.callers.length ? e.callers.map((c) => `\`${c}\``).join('<br>') : '*(nothing in the UI)*';
    out(`| ${e.method} | \`${e.path}\` | ${e.gate} | ${e.validated ? 'zod' : '—'} | ${e.limited ? 'yes' : '—'} | ${callers} |`);
}
out();
if (unresolved.size) {
    out('Calls the map could not match to an endpoint (a URL built elsewhere, or a path the regex misread):');
    out();
    for (const u of [...unresolved].sort()) out(`- \`${u}\``);
    out();
}

/* ── global navigation ── */
out('## Always present');
out();
out('Rendered by a layout rather than a page, so they are on every screen (or every admin screen) and are listed once rather than drawn as forty edges.');
out();
const GLOBAL: [string, string][] = [
    ['Header', 'Navbar'],
    ['Footer', 'Footer'],
    ['Admin nav', 'admin/AdminNav'],
];
out('| Where | Component | Links to |');
out('|---|---|---|');
for (const [label, name] of GLOBAL) {
    const source = componentSources.get(name) ?? '';
    const targets = linksIn(source).concat(transitive(componentsIn(source, name)).flatMap((n) => linksIn(componentSources.get(n) ?? '')));
    const unique = [...new Set(targets)].sort();
    out(`| ${label} | \`${name}\` | ${unique.map((t) => '`' + t + '`').join('<br>') || '—'} |`);
}
out();

/* ── navigation graph ── */
out('## Navigation');
out();
out('Screen to screen, from every `href`, `router.push` and `redirect` in the page and the components it renders — the layouts\' header, footer and admin nav excluded, since those are on every screen and are listed above.');
out();
out('```mermaid');
out('flowchart LR');
const id = (route: string) => 'n' + route.replace(/[^a-zA-Z0-9]/g, '_');
const byAccess = new Map<string, Screen[]>();
for (const s of screens) {
    const key = s.access === 'root' ? 'root' : s.access;
    byAccess.set(key, [...(byAccess.get(key) ?? []), s]);
}
for (const [group, list] of byAccess) {
    out(`  subgraph ${group}`);
    for (const s of list) out(`    ${id(s.route)}["${s.route}"]`);
    out('  end');
}
const known = new Set(screens.map((s) => s.route));
for (const s of screens) {
    for (const target of s.links) {
        // A link to a pattern the map knows draws an edge; anything else is a
        // leaf (an external address, a query-only change, a locale switch).
        const match = [...known].find((r) => shape(r) === shape(target));
        if (match && match !== s.route) out(`  ${id(s.route)} --> ${id(match)}`);
    }
}
out('```');
out();

/* ── calls graph ── */
out('## Who calls what');
out();
out('```mermaid');
out('flowchart LR');
const cid = (name: string) => 'c' + name.replace(/[^a-zA-Z0-9]/g, '_');
const eid = (e: Endpoint) => 'e' + (e.method + e.path).replace(/[^a-zA-Z0-9]/g, '_');
const callersSeen = new Set<string>();
for (const e of endpoints) {
    if (e.callers.length === 0) continue;
    out(`  ${eid(e)}(["${e.method} ${e.path}"])`);
    for (const c of e.callers) {
        if (!callersSeen.has(c)) {
            callersSeen.add(c);
            out(`  ${cid(c)}["${c}"]`);
        }
        out(`  ${cid(c)} --> ${eid(e)}`);
    }
}
out('```');
out();

const text = lines.join('\n') + '\n';

if (process.argv.includes('--check')) {
    let current = '';
    try {
        current = readFileSync(OUT, 'utf8');
    } catch {
        current = '';
    }
    if (current !== text) {
        console.error('\x1b[31mcheck:map — docs/interaction-map.generated.md is out of date. Run `npm run map` and commit the result.\x1b[0m');
        process.exit(1);
    }
    console.log(`\x1b[32mcheck:map — ${screens.length} screens, ${endpoints.length} endpoints, map is current.\x1b[0m`);
} else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${rel(OUT)}: ${screens.length} screens, ${endpoints.length} endpoints, ${unresolved.size} unresolved call(s).`);
}
