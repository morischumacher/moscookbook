/** shareStage — the three stages, and what it takes to move between them */
import { suite, check, equal } from './harness';
import { stageOf, planFor, isNoop, type ShareState } from '../src/lib/shareStage';

const household: ShareState = { isPublic: false, linkUrl: null };
const linked: ShareState = { isPublic: false, linkUrl: 'https://x.test/de/r/abc' };
const web: ShareState = { isPublic: true, linkUrl: null };
const both: ShareState = { isPublic: true, linkUrl: 'https://x.test/de/r/abc' };

export default function shareStageTests() {
    suite('which stage something is at');

    equal('nothing shared', stageOf(household), 'household');
    equal('a secret link', stageOf(linked), 'link');
    equal('on the web', stageOf(web), 'web');

    /*
     * The case the old two-control arrangement could not express at all: a
     * recipe that was published and still carries a link minted before that.
     * The wider answer wins, because "a search engine may have it" is what
     * somebody needs to know.
     */
    equal('both at once reads as the wider one', stageOf(both), 'web');

    suite('going up never takes anything away');

    const toWeb = planFor(linked, 'web');
    equal('publishing sets the flag', toWeb.setPublic, true);
    check('and leaves the existing link alone', !toWeb.revokeLink, toWeb);

    const toLink = planFor(household, 'link');
    check('asking for a link mints one', toLink.mintLink, toLink);
    equal('and does not touch the public flag, which is already false', toLink.setPublic, null);

    suite('coming down means what it says');

    /*
     * The whole point of the word. A setting that says "only the household"
     * beside a link that still works is a setting that lies.
     */
    const home = planFor(both, 'household');
    equal('back to the household unpublishes', home.setPublic, false);
    check('and withdraws the link', home.revokeLink, home);

    const fromWeb = planFor(web, 'link');
    equal('web down to link unpublishes', fromWeb.setPublic, false);
    check('and mints a link, since there was none', fromWeb.mintLink, fromWeb);

    const linkedHome = planFor(linked, 'household');
    equal('with no public flag to clear, it is left alone', linkedHome.setPublic, null);
    check('but the link still goes', linkedHome.revokeLink, linkedHome);

    suite('asking for what it already is does nothing');

    for (const [label, state] of [
        ['household', household],
        ['link', linked],
        ['web', web],
    ] as const) {
        check(`${label} to ${label}`, isNoop(planFor(state, label)), planFor(state, label));
    }

    /*
     * And the one that is *not* a no-op even though the stage matches: asking
     * for `web` on something already at `web` changes nothing, but asking for
     * `link` on `both` is a real change — it is at `web`, so it comes down.
     */
    check('but both-at-once asked for a link comes down', !isNoop(planFor(both, 'link')), planFor(both, 'link'));
    equal('by unpublishing', planFor(both, 'link').setPublic, false);
    check('and keeping the link it already has', !planFor(both, 'link').mintLink, planFor(both, 'link'));
}
