/** Token usage: counting, comparing, and what to do about it */
import { suite, check, equal } from './harness';
import { compareUsage, median, shortTokens } from '../src/lib/tokenUsage';
import { analyse, type UsageRow } from '../src/lib/tokenAnalytics';

export default function tokenUsageTests() {
    suite('tokens: comparing one item with the others');
    equal('median of an odd list', median([5, 1, 3]), 3);
    equal('median of an even list', median([1, 2, 3, 4]), 3);
    equal('no median of nothing', median([]), null);
    const compared = compareUsage(3000, [1000, 0, 2000, 3000]);
    equal('items no model read are left out', compared.others, [1000, 2000, 3000]);
    equal('the ratio is to the median', compared.ratio, 1.5);
    equal('nothing to compare, no ratio', compareUsage(10, []).ratio, null);
    equal('short numbers', [shortTokens(950, 'de'), shortTokens(3240, 'de'), shortTokens(3240, 'en')], ['950', '3,2k', '3.2k']);

    suite('tokens: the dashboard');
    const now = new Date('2026-09-23T12:00:00Z');
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000);
    const row = (over: Partial<UsageRow>): UsageRow => ({
        createdAt: at(1), purpose: 'capture', provider: 'anthropic', model: 'claude-sonnet-5',
        captureId: null, source: 'instagram', input: 1000, output: 200, ...over,
    });
    const rows = [
        row({ captureId: 1, purpose: 'capture' }),
        row({ captureId: 1, purpose: 'askAi' }),
        row({ captureId: 1, purpose: 'aiOnly', input: 4000 }),
        row({ captureId: 2 }),
        row({ captureId: 3 }),
        row({ captureId: 4, source: 'web' }),
        row({ captureId: 5, source: 'web' }),
        row({ purpose: 'translate', captureId: null, source: null, createdAt: at(40) }),
    ];
    const facts = [
        { id: 2, reason: 'recipeByDm', host: null, title: 'Corn' },
        { id: 3, reason: 'recipeInBio', host: null, title: null },
        { id: 4, reason: null, host: 'example.com', title: 'A' },
        { id: 5, reason: null, host: 'example.com', title: 'B' },
    ];
    const data = analyse(rows, facts, { now, days: 30, mode: 'always', learnedHosts: [] });

    equal('only the last thirty days are counted', data.total.calls, 7);
    check('and the thirty before are the comparison', data.previousTokens === 1200, data.previousTokens);
    equal('the most expensive item first', data.topItems[0].captureId, 1);
    const ids = data.recommendations.map((advice) => advice.id);
    check('posts without a recipe are named', ids.includes('noRecipe'), ids);
    check('an item read three times is named', ids.includes('repeats'), ids);
    check('a site read twice should be learned', ids.includes('learnSite') && data.recommendations.find((a) => a.id === 'learnSite')?.detail === 'example.com', ids);
    check('a large model doing most of it', ids.includes('smallerModel'), ids);
    check('the automatic setting is named', ids.includes('modeImages'), ids);
    check('biggest lever first', data.recommendations.every((advice, index, all) => index === 0 || all[index - 1].tokens >= advice.tokens));

    const learnedAlready = analyse(rows, facts, { now, days: 30, mode: 'images', learnedHosts: ['example.com'] });
    check('a learned site is not recommended again', !learnedAlready.recommendations.some((advice) => advice.id === 'learnSite'));
    equal('nothing at all, nothing to say', analyse([], [], { now, days: 30, mode: 'images', learnedHosts: [] }).recommendations, []);
    equal('all quiet says so', analyse([row({ model: 'claude-haiku-4-5' })], [], { now, days: 30, mode: 'images', learnedHosts: [] }).recommendations[0].id, 'fine');
}
