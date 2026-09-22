/**
 * Entry point for `npm test`.
 *
 * These cover the pure logic that is easy to get subtly wrong and expensive to
 * get wrong in production: recipe parsing, link import, payload validation and
 * amount scaling. UI behaviour is not covered here.
 */
import { summary, crashed } from './harness';
import recipeSchema from './recipeSchema.test';
import recipeParser from './recipeParser.test';
import recipeFromHtml from './recipeFromHtml.test';
import amount from './amount.test';
import siteUrl from './siteUrl.test';
import ingredientParts from './ingredientParts.test';
import invite from './invite.test';
import archive, { archiveCollectionsTests } from './archive.test';
import searchText from './searchText.test';
import capture from './capture.test';
import youtube from './youtube.test';
import captureProcess, { siteProfilePipelineTests, captionTests } from './captureProcess.test';
import email from './email.test';
import duplicates from './duplicates.test';
import recipeJsonLd from './recipeJsonLd.test';
import errorReport from './errorReport.test';
import importVariants from './importVariants.test';
import personName from './personName.test';
import authTokens from './authTokens.test';
import access from './access.test';
import channels from './channels.test';
import post from './post.test';
import uploadImage from './uploadImage.test';
import ingredientSearch from './ingredientSearch.test';
import blobCleanup from './blobCleanup.test';
import imageCompression from './imageCompression.test';
import navigation from './navigation.test';
import ownership from './ownership.test';
import ticketPath from './ticketPath.test';
import oysterMark from './oysterMark.test';
import cookProgress from './cookProgress.test';
import safeFetch from './safeFetch.test';
import similarRecipes from './similarRecipes.test';
import privateAddress from './privateAddress.test';
import sinceCooked from './sinceCooked.test';
import fixtures from './fixtures.test';
import transcripts from './transcript.test';
import pageTitle from './pageTitle.test';
import secretBox from './secretBox.test';
import readableText from './readableText.test';
import siteProfile from './siteProfile.test';
import siteLearn from './siteLearn.test';
import drafts from './drafts.test';
import routeParams from './routeParams.test';
import prismaErrors from './prismaErrors.test';
import htmlMeta from './htmlMeta.test';
import aiProviders from './aiProviders.test';
import aiPolish from './aiPolish.test';
import draftQuality from './draftQuality.test';

// Suites may be async — the capture pipeline stubs fetch and awaits it — so
// they are run in order rather than fired off together.
/**
 * Every suite, by name, in the order it runs.
 *
 * Names are what `crashed()` reports and what scripts/check-tests.mjs
 * compares against the files in this directory — a suite that exists and is
 * not in this list is a suite that never runs, and nothing else would say so.
 */
const suites: [string, () => void | Promise<void>][] = [
    ['recipeSchema', recipeSchema],
    ['recipeParser', recipeParser],
    ['recipeFromHtml', recipeFromHtml],
    ['amount', amount],
    ['siteUrl', siteUrl],
    ['ingredientParts', ingredientParts],
    ['invite', invite],
    ['archive', archive],
    ['archiveCollectionsTests', archiveCollectionsTests],
    ['searchText', searchText],
    ['capture', capture],
    ['youtube', youtube],
    ['captureProcess', captureProcess],
    ['siteProfilePipelineTests', siteProfilePipelineTests],
    ['captionTests', captionTests],
    ['email', email],
    ['duplicates', duplicates],
    ['recipeJsonLd', recipeJsonLd],
    ['errorReport', errorReport],
    ['importVariants', importVariants],
    ['personName', personName],
    ['authTokens', authTokens],
    ['access', access],
    ['channels', channels],
    ['post', post],
    ['uploadImage', uploadImage],
    ['ingredientSearch', ingredientSearch],
    ['blobCleanup', blobCleanup],
    ['imageCompression', imageCompression],
    ['navigation', navigation],
    ['ownership', ownership],
    ['ticketPath', ticketPath],
    ['oysterMark', oysterMark],
    ['cookProgress', cookProgress],
    ['safeFetch', safeFetch],
    ['similarRecipes', similarRecipes],
    ['privateAddress', privateAddress],
    ['sinceCooked', sinceCooked],
    ['secretBox', secretBox],
    ['readableText', readableText],
    ['siteProfile', siteProfile],
    ['aiProviders', aiProviders],
    ['aiPolish', aiPolish],
    ['siteLearn', siteLearn],
    ['drafts', drafts],
    ['routeParams', routeParams],
    ['prismaErrors', prismaErrors],
    ['htmlMeta', htmlMeta],
    ['draftQuality', draftQuality],
    ['fixtures', fixtures],
    ['pageTitle', pageTitle],
    ['transcripts', transcripts],
];

// Suites may be async — the capture pipeline stubs fetch and awaits it — so
// they are run in order rather than fired off together. Each in its own
// try/catch: a suite that throws is one failure, not the end of the run.
async function main() {
    for (const [name, run] of suites) {
        try {
            await run();
        } catch (error) {
            crashed(name, error);
        }
    }

    process.exit(summary() === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
