#!/usr/bin/env node
/**
 * Guards the translation catalogues.
 *
 * A missing key is a runtime error in next-intl, and a key that exists in one
 * language but not the other is invisible until someone switches language. So:
 *
 *   1. every key used in the source must exist in every catalogue
 *   2. the catalogues must have exactly the same set of keys
 *   3. a message's ICU placeholders must match across languages
 *   4. no empty strings
 *
 * Run with: npm run check:messages
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MESSAGES_DIR = 'messages';
const SOURCE_DIR = 'src';

const red = (text) => `\u001b[31m${text}\u001b[0m`;
const green = (text) => `\u001b[32m${text}\u001b[0m`;

const problems = [];

/* ---------------------------------------------------------------- loading */

const locales = readdirSync(MESSAGES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''));

if (locales.length === 0) {
    console.error(red('No message files found.'));
    process.exit(1);
}

const catalogues = new Map(
    locales.map((locale) => [
        locale,
        JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8')),
    ])
);

function flatten(object, prefix = '') {
    const result = new Map();
    for (const [key, value] of Object.entries(object)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [nested, nestedValue] of flatten(value, path)) {
                result.set(nested, nestedValue);
            }
        } else {
            result.set(path, value);
        }
    }
    return result;
}

const flat = new Map([...catalogues].map(([locale, data]) => [locale, flatten(data)]));

/* ------------------------------------------------------- catalogue parity */

const reference = locales[0];
const referenceKeys = new Set(flat.get(reference).keys());

for (const locale of locales.slice(1)) {
    const keys = new Set(flat.get(locale).keys());

    for (const key of referenceKeys) {
        if (!keys.has(key)) problems.push(`${locale}.json is missing "${key}" (present in ${reference}.json)`);
    }
    for (const key of keys) {
        if (!referenceKeys.has(key)) problems.push(`${reference}.json is missing "${key}" (present in ${locale}.json)`);
    }
}

/* ------------------------------- empty values and placeholder consistency */

// Top-level ICU arguments: {name}, {count, plural, ...} -> name, count
function placeholders(message) {
    if (typeof message !== 'string') return new Set();
    const found = new Set();
    let depth = 0;
    let current = '';

    for (let index = 0; index < message.length; index++) {
        const character = message[index];
        if (character === '{') {
            if (depth === 0) current = '';
            depth++;
            continue;
        }
        if (character === '}') {
            depth--;
            if (depth === 0 && current.trim()) found.add(current.split(',')[0].trim());
            continue;
        }
        if (depth === 1) current += character;
    }

    return found;
}

for (const [locale, entries] of flat) {
    for (const [key, value] of entries) {
        if (typeof value !== 'string' || value.trim() === '') {
            problems.push(`${locale}.json has an empty value for "${key}"`);
        }
    }
}

for (const key of referenceKeys) {
    const expected = placeholders(flat.get(reference).get(key));
    for (const locale of locales.slice(1)) {
        const actual = placeholders(flat.get(locale).get(key));
        const missing = [...expected].filter((name) => !actual.has(name));
        const extra = [...actual].filter((name) => !expected.has(name));

        if (missing.length > 0) {
            problems.push(`${locale}.json "${key}" is missing placeholder(s): ${missing.join(', ')}`);
        }
        if (extra.length > 0) {
            problems.push(`${locale}.json "${key}" has unexpected placeholder(s): ${extra.join(', ')}`);
        }
    }
}

/* ------------------------------------------------------ keys used in code */

function sourceFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
        else if (['.ts', '.tsx'].includes(extname(path))) files.push(path);
    }
    return files;
}

const NAMESPACE_PATTERN =
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace:\s*)?['"]([\w.]+)['"]/g;

for (const file of sourceFiles(SOURCE_DIR)) {
    const source = readFileSync(file, 'utf8');
    const namespaces = new Map();

    for (const match of source.matchAll(NAMESPACE_PATTERN)) {
        namespaces.set(match[1], match[2]);
    }

    for (const [variable, namespace] of namespaces) {
        // t('key') and t('key', {...}) — but not t.has('key'), which is a guard.
        const usage = new RegExp(`\\b${variable}\\(\\s*['"]([\\w.]+)['"]`, 'g');

        for (const match of source.matchAll(usage)) {
            const key = `${namespace}.${match[1]}`;
            for (const locale of locales) {
                if (!flat.get(locale).has(key)) {
                    problems.push(`${file}: "${key}" is not defined in ${locale}.json`);
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ report */

if (problems.length > 0) {
    console.error(red(`${problems.length} translation problem(s):\n`));
    for (const problem of [...new Set(problems)].sort()) console.error(`  • ${problem}`);
    process.exit(1);
}

console.log(
    green(
        `Translations OK — ${referenceKeys.size} keys × ${locales.length} locales (${locales.join(', ')}).`
    )
);
