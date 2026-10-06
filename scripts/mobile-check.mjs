/**
 * The cookbook on a phone, checked by machine.
 *
 *   BASE=http://localhost:3000 node scripts/mobile-check.mjs
 *
 * Opens the main pages at an iPhone's size, with touch, as a visitor, as a
 * member and as the admin (scripts/mobile-seed.ts makes them), and fails on
 * what has gone wrong on a phone before and nobody saw on a laptop:
 *
 *   - a page wider than the screen (it scrolls sideways);
 *   - something sticking out past the right edge;
 *   - a button or link smaller than a fingertip (24 × 24 px, WCAG 2.5.8);
 *   - a sheet (a menu from the bottom) reaching below what is visible —
 *     on an iPhone Safari's toolbar covered its last rows (work #52).
 *
 * Every page is also photographed to MOBILE_SHOTS (default mobile-shots/),
 * which CI keeps as an artifact: a look at the pictures is the check no
 * script can make — whether it looks good.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.MOBILE_PASSWORD ?? 'mobile-check-123';
const SHOTS = process.env.MOBILE_SHOTS ?? 'mobile-shots';
mkdirSync(SHOTS, { recursive: true });

const PAGES = {
    visitor: ['/de/login', '/de/register', '/de/forgot'],
    member: ['/de', '/de/recipe/laab-gai', '/de/shopping', '/de/collections', '/de/menus', '/de/account'],
    admin: [
        '/de',
        '/en',
        '/de/recipe/laab-gai',
        '/de/shopping',
        '/de/admin',
        '/de/admin/create',
        '/de/admin/drafts',
        '/de/admin/inbox',
        '/de/admin/ingredients',
        '/de/admin/reports',
        '/de/admin/ai',
        '/de/admin/users',
        '/de/admin/collections',
    ],
};

const problems = [];
const browser = await chromium.launch();

async function session(who) {
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
    const page = await context.newPage();
    if (who !== 'visitor') {
        await page.goto(`${BASE}/de/login`);
        await page.fill('input[type=email]', `${who}@mobile.test`);
        await page.fill('input[type=password]', PASSWORD);
        await page.keyboard.press('Enter');
        await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => problems.push(`${who}: could not sign in`));
    }
    return page;
}

/** What is wrong with the page as it is on screen now. */
function inspect() {
    const width = window.innerWidth;
    const found = [];
    if (document.documentElement.scrollWidth > width + 1) found.push(`scrolls sideways (${document.documentElement.scrollWidth}px on a ${width}px screen)`);
    const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 && !el.closest('[aria-hidden="true"], .sr-only');
    };
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        // Inside something that scrolls sideways on purpose (a chip rail) is fine.
        let scroller = el.parentElement;
        while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
        if (!scroller && rect.right > width + 1 && getComputedStyle(el).position !== 'fixed') found.push(`sticks out to the right: ${el.tagName.toLowerCase()} "${name(el)}" (${Math.round(rect.right)}px)`);
    }
    // A target under 24 × 24 is still fine with nothing else to tap within a
    // 24 px square around its middle (WCAG 2.5.8, the spacing exception) —
    // a lone underlined link like "Bearbeiten". Two small ones side by side are not.
    const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem]')].filter(visible);
    const rects = targets.map((el) => el.getBoundingClientRect());
    targets.forEach((el, index) => {
        const rect = rects[index];
        if (rect.height >= 24 && rect.width >= 24) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const crowded = rects.some((other, at) => at !== index && !targets[at].contains(el) && !el.contains(targets[at]) && other.left < cx + 12 && other.right > cx - 12 && other.top < cy + 12 && other.bottom > cy - 12);
        if (crowded) found.push(`too small to tap, and too close to another: ${el.tagName.toLowerCase()} "${name(el)}" (${Math.round(rect.width)}×${Math.round(rect.height)})`);
    });
    return [...new Set(found)].slice(0, 15);
}

/** Every open sheet ends inside what is visible. */
function sheetFits() {
    const dialog = document.querySelector('[role=dialog][aria-modal="true"]');
    if (!dialog) return 'no sheet opened';
    const bottom = dialog.getBoundingClientRect().bottom;
    const visibleHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    return bottom <= visibleHeight + 1 ? null : `the sheet ends at ${Math.round(bottom)}px, below the visible ${Math.round(visibleHeight)}px`;
}

for (const [who, paths] of Object.entries(PAGES)) {
    const page = await session(who);
    for (const path of paths) {
        const response = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch((error) => ({ status: () => `error ${error.message}` }));
        const status = response?.status?.() ?? '?';
        if (typeof status !== 'number' || status >= 400) problems.push(`${who} ${path}: answered ${status}`);
        for (const problem of await page.evaluate(inspect)) problems.push(`${who} ${path}: ${problem}`);
        await page.screenshot({ path: `${SHOTS}/${who}${path.replace(/\//g, '_')}.png`, fullPage: true });
    }

    if (who === 'admin') {
        // The list's menu, opened as a thumb would.
        await page.goto(`${BASE}/de/shopping`, { waitUntil: 'networkidle' });
        const menu = page.getByRole('button', { name: 'Mehr zu dieser Liste' });
        if (await menu.count()) {
            await menu.first().tap();
            await page.waitForTimeout(300);
            const fit = await page.evaluate(sheetFits);
            if (fit) problems.push(`admin /de/shopping menu: ${fit}`);
            await page.screenshot({ path: `${SHOTS}/admin_shopping_menu.png` });
        } else problems.push('admin /de/shopping: no "Mehr zu dieser Liste" button');
    }
    await page.context().close();
}

await browser.close();

if (problems.length > 0) {
    console.error(`Phone check — ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\nPictures of every page are in ${SHOTS}/.`);
    process.exit(1);
}
console.log(`Phone check — every page fits an iPhone, every tap target is big enough, the sheet fits. Pictures in ${SHOTS}/.`);
