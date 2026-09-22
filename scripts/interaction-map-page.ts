/**
 * The interaction map as a page you can look at.
 *
 * `interaction-map.ts` writes the map as Markdown, which is the right format
 * for a file CI diffs and a reviewer reads in a pull request, and the wrong
 * one for the question "what does this app actually look like" — a hundred
 * rows of table and two Mermaid blocks nothing renders.
 *
 * So this reads that Markdown back and writes docs/interaction-map.html: the
 * same numbers, the two graphs drawn, both tables filterable by access tier
 * and by gate, and the recommendations. One self-contained file, no build, no
 * network — open it in a browser.
 *
 * It is a transform of the generated map rather than a second reader of the
 * source. That is the point: there is one thing that reads the code, and if
 * it is wrong both outputs are wrong together, which is far better than two
 * readers that disagree. The recommendations are parsed out of the
 * hand-written docs/interaction-map.md for the same reason — prose copied
 * into a second file is prose that drifts.
 *
 *   npm run map            (writes both)
 *   npm run check:map      (compares both)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const FROM = join(ROOT, 'docs', 'interaction-map.generated.md');
const ANALYSIS = join(ROOT, 'docs', 'interaction-map.md');
const OUT = join(ROOT, 'docs', 'interaction-map.html');

/* -------------------------------------------------------------------------- */
/*  Reading the generated map                                                 */
/* -------------------------------------------------------------------------- */

interface Screen { route: string; access: string; proxy: string; calls: string[]; links: string[] }
interface Endpoint {
    method: string; path: string; gate: string;
    validated: string; limited: string; callers: string[]; orphan: boolean;
}
interface Global { where: string; component: string; links: string[] }

const source = readFileSync(FROM, 'utf8');

/** The body of one `## …` section, by heading. */
function section(heading: string): string {
    const parts = source.split(/^## /m);
    const found = parts.find((part) => part.split('\n')[0].trim() === heading);
    if (!found) throw new Error(`The generated map has no "${heading}" section. Run \`npm run map\`.`);
    return found;
}

/** A Markdown table's data rows, header dropped, each as trimmed cells. */
function rows(block: string): string[][] {
    const out: string[][] = [];
    for (const line of block.split('\n')) {
        if (!line.startsWith('|') || line.startsWith('|---')) continue;
        out.push(line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
    }
    return out.slice(1);
}

/** One cell to the list of things in it. `—` is nothing; `<br>` separates. */
function items(cell: string): string[] {
    if (cell === '—') return [];
    return cell
        .split('<br>')
        .map((part) => part.trim().replace(/^`|`$/g, ''))
        .filter((part) => part !== '' && !part.startsWith('*('));
}

const screens: Screen[] = rows(section('Screens')).map((r) => ({
    route: items(r[0])[0],
    access: r[1],
    proxy: r[2],
    calls: items(r[3]),
    links: items(r[4]),
}));

const endpoints: Endpoint[] = rows(section('Endpoints')).map((r) => {
    const callers = items(r[5]);
    return {
        method: r[0],
        path: items(r[1])[0],
        gate: r[2],
        validated: r[3],
        limited: r[4],
        callers,
        orphan: callers.length === 0,
    };
});

const globals: Global[] = rows(section('Always present')).map((r) => ({
    where: r[0],
    component: items(r[1])[0],
    links: items(r[2]),
}));

function mermaid(heading: string): string {
    const found = /```mermaid\n([\s\S]*?)```/.exec(section(heading));
    if (!found) throw new Error(`No diagram in "${heading}".`);
    return found[1].trim();
}

const counts = /(\d+) screens · (\d+) endpoints · (\d+) link edges · (\d+) call edges/.exec(source);
if (!counts) throw new Error('The generated map has no summary line.');

/* -------------------------------------------------------------------------- */
/*  Reading the hand-written recommendations                                  */
/* -------------------------------------------------------------------------- */

/**
 * The numbered list under "Recommendations, in order", with `~~struck~~`
 * meaning done. Parsed rather than repeated so the page and the analysis
 * cannot say different things about what is still open.
 */
interface Finding { done: boolean; text: string }

function findings(): Finding[] {
    const analysis = readFileSync(ANALYSIS, 'utf8');
    const list = analysis.split(/^## Recommendations, in order$/m)[1];
    if (!list) throw new Error('docs/interaction-map.md has no "Recommendations, in order" section.');

    const out: Finding[] = [];
    for (const block of list.split(/^\d+\. /m).slice(1)) {
        const text = block.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim();
        if (text === '') continue;
        const done = text.startsWith('~~');
        out.push({ done, text: text.replace(/~~/g, '') });
    }
    return out;
}

/* -------------------------------------------------------------------------- */
/*  Writing the page                                                          */
/* -------------------------------------------------------------------------- */

function escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Back-ticked spans in the hand-written prose become real code spans. */
function prose(text: string): string {
    return escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Mermaid renders itself in the viewer, so the only control over its colours
 * is this init block. The nodes are dark with light text on purpose: that
 * pair reads on the cream ground and on the dark one, and a diagram cannot
 * re-render when the reader flips the theme.
 */
const MERMAID_INIT =
    "%%{init: {'theme':'base','themeVariables':{" +
    "'background':'transparent'," +
    "'primaryColor':'#2A2622','primaryTextColor':'#FFF8F0','primaryBorderColor':'#2A2622'," +
    "'lineColor':'#9A9088','secondaryColor':'#2A2622','tertiaryColor':'transparent'," +
    "'clusterBkg':'transparent','clusterBorder':'#6B5F54','titleColor':'#6B5F54'," +
    "'edgeLabelBackground':'transparent'," +
    "'fontFamily':'Geist, ui-sans-serif, system-ui','fontSize':'13px'" +
    '}}}%%\n';

const GATE_LABEL: Record<string, string> = {
    admin: 'admin',
    user: 'angemeldet',
    none: 'offen',
    cron: 'cron-secret',
    device: 'Geräte-Token',
};

function chipsOf(values: string[], className: string, fallback: string): string {
    if (values.length === 0) return `<span class="none">${fallback}</span>`;
    return values.map((value) => `<code class="${className}">${escape(value)}</code>`).join('');
}

function screenRow(screen: Screen): string {
    const text = [screen.route, ...screen.calls, ...screen.links].join(' ').toLowerCase();
    return (
        `<tr data-access="${escape(screen.access)}" data-text="${escape(text)}">` +
        `<td class="route"><code>${escape(screen.route)}</code></td>` +
        `<td><span class="tier t-${escape(screen.access)}">${escape(screen.access)}</span>` +
        `<span class="proxy">${escape(screen.proxy)}</span></td>` +
        `<td><div class="chips">${chipsOf(screen.calls, 'call', '—')}</div></td>` +
        `<td><div class="chips">${chipsOf(screen.links, 'lnk', 'Sackgasse')}</div></td></tr>`
    );
}

function endpointRow(endpoint: Endpoint): string {
    const gate = endpoint.gate.split(' ')[0];
    const marks =
        (endpoint.validated === 'zod' ? '<span class="mark">zod</span>' : '') +
        (endpoint.limited === 'yes' ? '<span class="mark">limitiert</span>' : '');
    const callers = endpoint.orphan
        ? '<span class="orphan">nichts in der Oberfläche</span>'
        : chipsOf(endpoint.callers, 'call', '—');
    const text = [endpoint.method, endpoint.path, ...endpoint.callers].join(' ').toLowerCase();

    return (
        `<tr data-gate="${escape(gate)}" data-text="${escape(text)}">` +
        `<td class="verb v-${escape(endpoint.method.toLowerCase())}">${escape(endpoint.method)}</td>` +
        `<td class="route"><code>${escape(endpoint.path)}</code></td>` +
        `<td><span class="gate g-${escape(gate)}">${escape(endpoint.gate)}</span>${marks}</td>` +
        `<td><div class="chips">${callers}</div></td></tr>`
    );
}

function tally<T>(values: T[], keyOf: (value: T) => string): [string, number][] {
    const counted = new Map<string, number>();
    for (const value of values) {
        const key = keyOf(value);
        counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    return [...counted.entries()].sort((a, b) => b[1] - a[1]);
}

const tierChips = tally(screens, (s) => s.access)
    .map(([tier, n]) =>
        `<button class="chip" data-filter="${escape(tier)}" aria-pressed="false">${escape(tier)} <b>${n}</b></button>`)
    .join('');

const gateChips = tally(endpoints, (e) => e.gate.split(' ')[0])
    .map(([gate, n]) =>
        `<button class="chip" data-gfilter="${escape(gate)}" aria-pressed="false">${escape(GATE_LABEL[gate] ?? gate)} <b>${n}</b></button>`)
    .join('');

const globalCards = globals
    .map((g) =>
        `<div class="gcard"><h3>${escape(g.where)}</h3><code class="cmp">${escape(g.component)}</code>` +
        `<div class="glinks">${chipsOf(g.links, 'lnk', '—')}</div></div>`)
    .join('');

const findingList = findings()
    .map((finding, index) =>
        `<li class="${finding.done ? 'f-done' : 'f-open'}"><div class="fnum">${index + 1}</div>` +
        `<p>${prose(finding.text)}</p></li>`)
    .join('');

const page = `<title>Mo'sCookbook Interaction Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
  /* The cookbook's own tokens: this is a map of that app and should wear its
     colours. src/app/globals.css is where they come from. */
  :root {
    --bg: #FFF8F0; --panel: #FFFCF7; --fg: #111111; --muted: #4B5563; --faint: #6B7280;
    --line: #E4DDD3; --hair: #EFE8DE; --accent: #ff4a0e; --accent-text: #C73500;
    --open: #15803D; --admin: #C73500; --account: #5A6270; --recipe: #8A6D3B;
    --orphan: #B45309; --done: #15803D;
    --sans: 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #0B0A09; --panel: #131110; --fg: #EDE8E2; --muted: #A49C94; --faint: #8A827A;
      --line: #2C2724; --hair: #211D1B; --accent: #ff4a0e; --accent-text: #FF7A4A;
      --open: #34D399; --admin: #FF7A4A; --account: #9AA3B2; --recipe: #D6A85F;
      --orphan: #F0A24B; --done: #34D399;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0B0A09; --panel: #131110; --fg: #EDE8E2; --muted: #A49C94; --faint: #8A827A;
    --line: #2C2724; --hair: #211D1B; --accent: #ff4a0e; --accent-text: #FF7A4A;
    --open: #34D399; --admin: #FF7A4A; --account: #9AA3B2; --recipe: #D6A85F;
    --orphan: #F0A24B; --done: #34D399;
  }

  html { background: var(--bg); }
  body { background: var(--bg); color: var(--fg); font-family: var(--sans); line-height: 1.55; margin: 0; }
  .wrap { max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 40px 72px; }
  h1, h2, h3 { text-wrap: balance; margin: 0; letter-spacing: -0.02em; }
  h1 { font-size: clamp(30px, 6vw, 46px); font-weight: 700; line-height: 1.05; }
  h2 { font-size: clamp(19px, 3vw, 23px); font-weight: 600; }
  p { margin: 0; }
  code { font-family: var(--mono); font-size: 0.86em; }

  header .eyebrow {
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent-text); font-weight: 600; margin-bottom: 14px;
  }
  header .lede { color: var(--muted); max-width: 62ch; margin-top: 16px; font-size: 16px; }

  .counts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  .count {
    border: 1px solid var(--line); border-radius: 3px; padding: 10px 16px 11px;
    background: var(--panel); min-width: 104px;
  }
  .count b { display: block; font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .count span { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }

  section { margin-top: 64px; }
  section > .head { border-top: 2px solid var(--fg); padding-top: 12px; margin-bottom: 20px; }
  section > .head p { color: var(--muted); font-size: 14px; margin-top: 6px; max-width: 70ch; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .chip {
    font: inherit; font-size: 12.5px; cursor: pointer; border-radius: 999px;
    border: 1px solid var(--line); background: transparent; color: var(--muted);
    padding: 5px 12px; display: inline-flex; gap: 6px; align-items: center;
  }
  .chip b { font-variant-numeric: tabular-nums; color: var(--faint); font-weight: 500; }
  .chip[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  .chip[aria-pressed="true"] b { color: var(--bg); opacity: 0.7; }
  .chip:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  input[type="search"] {
    font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--panel); color: var(--fg); min-width: 190px; flex: 1 1 190px;
  }

  .scroller { overflow-x: auto; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th {
    text-align: left; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--faint); font-weight: 600; padding: 11px 14px; border-bottom: 1px solid var(--line);
    white-space: nowrap; position: sticky; top: 0; background: var(--panel);
  }
  td { padding: 11px 14px; border-bottom: 1px solid var(--hair); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.route code { font-weight: 500; white-space: nowrap; }
  /* The flex lives on a div inside the cell, never on the cell: display:flex
     on a <td> takes it out of the table layout and the columns stop lining up. */
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  #screens, #endpoints { min-width: 860px; }
  #screens th:nth-child(1) { width: 21%; } #screens th:nth-child(2) { width: 13%; }
  #screens th:nth-child(3) { width: 36%; } #screens th:nth-child(4) { width: 30%; }
  #endpoints th:nth-child(1) { width: 8%; } #endpoints th:nth-child(2) { width: 32%; }
  #endpoints th:nth-child(3) { width: 24%; } #endpoints th:nth-child(4) { width: 36%; }
  .call, .lnk, .cmp {
    border: 1px solid var(--hair); border-radius: 3px; padding: 2px 6px;
    background: var(--bg); color: var(--muted); white-space: nowrap;
  }
  .lnk { color: var(--accent-text); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
  .none { color: var(--faint); font-size: 12px; font-style: italic; }
  .orphan { color: var(--orphan); font-size: 12px; }

  .tier, .gate {
    display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap;
  }
  .t-open, .g-none { color: var(--open); }
  .t-admin, .g-admin { color: var(--admin); }
  .t-account, .g-user { color: var(--account); }
  .t-recipe, .g-cron, .g-device { color: var(--recipe); }
  .proxy { display: block; font-size: 11.5px; color: var(--faint); margin-top: 4px; white-space: nowrap; }
  .mark {
    display: inline-block; margin-left: 6px; font-size: 10.5px; color: var(--faint);
    border: 1px solid var(--hair); border-radius: 3px; padding: 1px 5px;
  }
  .verb { font-family: var(--mono); font-size: 11.5px; font-weight: 500; white-space: nowrap; }
  .v-get { color: var(--account); } .v-post { color: var(--open); }
  .v-patch, .v-put { color: var(--recipe); } .v-delete { color: var(--accent-text); }
  .empty { padding: 26px 14px; color: var(--faint); font-size: 13px; }

  .diagram {
    border: 1px solid var(--line); border-radius: 4px; background: var(--panel);
    padding: 18px 12px; overflow-x: auto;
  }
  .diagram pre.mermaid { margin: 0; min-width: 640px; }
  .diagram svg { max-width: none; height: auto; }

  .gcards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .gcard { border: 1px solid var(--line); border-radius: 4px; background: var(--panel); padding: 14px 16px 16px; }
  .gcard h3 { font-size: 14px; font-weight: 600; }
  .gcard .cmp { display: inline-block; margin-top: 6px; }
  .glinks { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }

  ol.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  ol.findings li {
    display: grid; grid-template-columns: 38px 1fr; gap: 14px; align-items: start;
    padding: 14px 0; border-bottom: 1px solid var(--hair);
  }
  ol.findings li:last-child { border-bottom: 0; }
  .fnum {
    font-family: var(--mono); font-size: 12px; color: var(--faint);
    border: 1px solid var(--line); border-radius: 3px; text-align: center; padding: 3px 0;
  }
  .f-done .fnum { color: var(--done); border-color: currentColor; }
  ol.findings p { font-size: 15px; max-width: 74ch; }
  .f-done p { color: var(--faint); text-decoration: line-through; text-decoration-color: var(--done); }

  footer { margin-top: 64px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--faint); font-size: 12.5px; }
  footer code { color: var(--muted); }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  @media (max-width: 640px) { th, td { padding: 9px 10px; } }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Mo&#39;sCookbook &middot; aus dem Quelltext gelesen</div>
    <h1>Jeder Bildschirm, jeder Knopf, jede Route</h1>
    <p class="lede">
      <code>npm run map</code> liest diese Karte aus dem Quelltext: jede <code>page.tsx</code> mit ihrer
      Zugriffsregel, jeder <code>fetch</code> aus den Komponenten, die sie rendert, jede <code>route.ts</code>
      mit ihrem Türsteher. <code>npm run check:map</code> macht CI rot, sobald sie veraltet ist — sie kann
      also nicht vom Code abweichen. Diese Seite ist eine Umformung derselben Datei, keine zweite Lesung.
    </p>
    <div class="counts">
      <div class="count"><b>${counts[1]}</b><span>Bildschirme</span></div>
      <div class="count"><b>${counts[2]}</b><span>Endpunkte</span></div>
      <div class="count"><b>${counts[3]}</b><span>Verlinkungen</span></div>
      <div class="count"><b>${counts[4]}</b><span>Aufrufe</span></div>
    </div>
  </header>

  <section>
    <div class="head">
      <h2>Navigation</h2>
      <p>Bildschirm zu Bildschirm, aus jedem <code>href</code>, <code>router.push</code> und <code>redirect</code> —
      Header, Footer und Admin-Navigation ausgenommen, die stehen weiter unten, weil sie auf jeder Seite sind.
      Gruppiert nach dem, was der Proxy verlangt.</p>
    </div>
    <div class="diagram"><pre class="mermaid">${escape(MERMAID_INIT + mermaid('Navigation'))}</pre></div>
  </section>

  <section>
    <div class="head">
      <h2>Bildschirme</h2>
      <p>Zugriff ist, was <code>pathAccess()</code> sagt; Proxy ist, was <code>src/proxy.ts</code> daraufhin tut.
      „Sackgasse" heißt: von hier führt kein Link weiter — bei <code>/c/[token]</code> ist das Absicht, sonst selten.</p>
    </div>
    <div class="toolbar">
      ${tierChips}
      <input type="search" id="screen-search" placeholder="Route, Aufruf oder Ziel suchen" aria-label="Bildschirme filtern">
    </div>
    <div class="scroller">
      <table id="screens">
        <thead><tr><th>Route</th><th>Zugriff</th><th>Ruft auf</th><th>Verlinkt auf</th></tr></thead>
        <tbody>${screens.map(screenRow).join('')}</tbody>
      </table>
      <div class="empty" id="screens-empty" hidden>Nichts gefunden.</div>
    </div>
  </section>

  <section>
    <div class="head">
      <h2>Endpunkte</h2>
      <p>Eine Zeile je exportierter Methode. „Türsteher" ist, was der Handler selbst prüft — darunter liegt
      zusätzlich der Proxy, der <code>/api</code> ohne Session abweist, sofern der Pfad nicht ausdrücklich offen ist.
      <code>zod</code> heißt, der Body wird gegen ein Schema geprüft; <code>limitiert</code> heißt, die Route zählt mit.</p>
    </div>
    <div class="toolbar">
      ${gateChips}
      <input type="search" id="endpoint-search" placeholder="Pfad oder Aufrufer suchen" aria-label="Endpunkte filtern">
    </div>
    <div class="scroller">
      <table id="endpoints">
        <thead><tr><th>Methode</th><th>Pfad</th><th>Türsteher</th><th>Aufgerufen von</th></tr></thead>
        <tbody>${endpoints.map(endpointRow).join('')}</tbody>
      </table>
      <div class="empty" id="endpoints-empty" hidden>Nichts gefunden.</div>
    </div>
  </section>

  <section>
    <div class="head">
      <h2>Immer da</h2>
      <p>Aus einem Layout gerendert, nicht aus einer Seite — deshalb einmal aufgezählt statt als vierzig Kanten gezeichnet.</p>
    </div>
    <div class="gcards">${globalCards}</div>
  </section>

  <section>
    <div class="head">
      <h2>Was daran zu verbessern ist</h2>
      <p>Aus <code>docs/interaction-map.md</code> gelesen, damit hier nichts anderes steht als dort.
      Durchgestrichen heißt erledigt. Keine davon braucht eine Migration.</p>
    </div>
    <ol class="findings">${findingList}</ol>
  </section>

  <section>
    <div class="head">
      <h2>Wer ruft was</h2>
      <p>Komponenten und die Endpunkte, die sie anfassen. Ein Endpunkt ohne eingehenden Pfeil steht in der
      Tabelle oben als „nichts in der Oberfläche".</p>
    </div>
    <div class="diagram"><pre class="mermaid">${escape(MERMAID_INIT + mermaid('Who calls what'))}</pre></div>
  </section>

  <footer>
    Erzeugt von <code>scripts/interaction-map-page.ts</code> aus <code>docs/interaction-map.generated.md</code>
    und <code>docs/interaction-map.md</code>. Nicht von Hand ändern — <code>npm run map</code>.
  </footer>
</div>

<script>
  function wire(tableId, emptyId, searchId, key, chipAttr) {
    var table = document.getElementById(tableId);
    var empty = document.getElementById(emptyId);
    var search = document.getElementById(searchId);
    var chips = Array.prototype.slice.call(document.querySelectorAll('[' + chipAttr + ']'));
    var rows = Array.prototype.slice.call(table.tBodies[0].rows);
    var active = [];

    function apply() {
      var term = search.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var byChip = active.length === 0 || active.indexOf(row.dataset[key]) !== -1;
        var byTerm = term === '' || row.dataset.text.indexOf(term) !== -1;
        row.hidden = !(byChip && byTerm);
        if (!row.hidden) shown++;
      });
      empty.hidden = shown > 0;
      table.hidden = shown === 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var value = chip.getAttribute(chipAttr);
        var on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (on) active = active.filter(function (v) { return v !== value; });
        else active.push(value);
        apply();
      });
    });
    search.addEventListener('input', apply);
  }

  wire('screens', 'screens-empty', 'screen-search', 'access', 'data-filter');
  wire('endpoints', 'endpoints-empty', 'endpoint-search', 'gate', 'data-gfilter');
</script>
`;

/* -------------------------------------------------------------------------- */
/*  Writing, or checking                                                      */
/* -------------------------------------------------------------------------- */

if (process.argv.includes('--check')) {
    let current = '';
    try {
        current = readFileSync(OUT, 'utf8');
    } catch {
        current = '';
    }
    if (current !== page) {
        console.error(
            '\x1b[31mcheck:map — docs/interaction-map.html is out of date. Run `npm run map` and commit the result.\x1b[0m'
        );
        process.exit(1);
    }
    console.log(`\x1b[32mcheck:map — the page is current (${screens.length} screens, ${endpoints.length} endpoints).\x1b[0m`);
} else {
    writeFileSync(OUT, page);
    console.log(
        `Wrote docs/interaction-map.html: ${screens.length} screens, ${endpoints.length} endpoints, ` +
        `${findings().length} recommendations.`
    );
}
