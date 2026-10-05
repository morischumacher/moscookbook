/** Recipe history: what a version was, and what changed after it */
import { readFileSync } from 'node:fs';
import { suite, check, equal } from './harness';
import { changedFields, readSnapshot, snapshotOf } from '../src/lib/revisions';

const base = {
    title: 'Käsespätzle',
    slug: 'kaesespaetzle',
    description: null,
    category: 'Dinner',
    nationality: 'German',
    instructions: 'Zwiebeln rösten.',
    tips: '',
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 30,
    tags: ['vegetarian'],
    ingredients: [{ raw: '400 g', name: 'Spätzle', section: null }],
};

export default function revisionsTests() {
    suite('revisions: what changed');
    const before = snapshotOf(base);
    equal('nothing, when nothing did', changedFields(before, snapshotOf(base)), []);
    equal('an ingredient', changedFields(before, snapshotOf({ ...base, ingredients: [{ raw: '500 g', name: 'Spätzle', section: null }] })), ['ingredients']);
    equal('the method, ignoring a trailing space', changedFields(before, snapshotOf({ ...base, instructions: 'Zwiebeln rösten. ' })), []);
    equal('tags, whatever their order', changedFields(snapshotOf({ ...base, tags: ['a', 'b'] }), snapshotOf({ ...base, tags: ['b', 'a'] })), []);
    equal('several at once, in a fixed order', changedFields(before, snapshotOf({ ...base, title: 'Kässpätzle', cookMinutes: 40 })), ['title', 'times']);

    equal('tips, when they are added', changedFields(before, snapshotOf({ ...base, tips: 'Mit Schnittlauch.' })), ['tips']);
    equal('tips, ignoring a trailing space', changedFields(snapshotOf({ ...base, tips: 'A' }), snapshotOf({ ...base, tips: 'A ' })), []);
    const beforeTips = readSnapshot({ ...JSON.parse(JSON.stringify(before)), tips: undefined });
    check('a version kept before tips existed says nothing about them', beforeTips !== null && beforeTips.tips === undefined, beforeTips);
    equal('and is not a change from a recipe without any', beforeTips ? changedFields(beforeTips, before) : null, []);

    suite('revisions: stored and read back');
    equal('a snapshot survives the JSON column', readSnapshot(JSON.parse(JSON.stringify(before))), before);
    check('something that is not one is refused', readSnapshot({ nope: true }) === null);

    suite('revisions: kept on every edit');
    const route = readFileSync('src/app/api/recipes/[id]/route.ts', 'utf8');
    check('the edit route keeps the version it replaces', /keepRevisionOf\(recipeId, previous/.test(route));
    check('only when something changed', /changedFields\(previous, next\)\.length > 0/.test(route));
    check('tips not sent are tips kept', /tips: parsed\.data\.tips \?\? before\?\.tips/.test(route));
    const restore = readFileSync('src/app/api/recipes/[id]/revisions/[revisionId]/route.ts', 'utf8');
    check('restoring a version from before tips keeps today\'s', /tips: snapshot\.tips \?\? current\.tips/.test(restore));
}
