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
import ingredientParts, { ingredientSectionTests } from './ingredientParts.test';
import invite from './invite.test';
import archive, { archiveCollectionsTests, archiveBackupNameTests } from './archive.test';
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
import safeFetch, { readCappedTests } from './safeFetch.test';
import similarRecipes from './similarRecipes.test';
import privateAddress, { privateIPv6FormsTests } from './privateAddress.test';
import sinceCooked from './sinceCooked.test';
import fixtures from './fixtures.test';
import transcripts from './transcript.test';
import pageTitle from './pageTitle.test';
import secretBox from './secretBox.test';
import readableText from './readableText.test';
import siteProfile from './siteProfile.test';
import clientMessages from './clientMessages.test';
import recipeRepo, { recipeRoutesPassTags, storedDraftTests } from './recipeRepo.test';
import examples from './examples.test';
import units from './units.test';
import shopping from './shopping.test';
import cookSteps from './cookSteps.test';
import tags from './tags.test';
import offline from './offline.test';
import revisions from './revisions.test';
import foreignImport from './foreignImport.test';
import menu from './menu.test';
import inboxFilter from './inboxFilter.test';
import socialImport from './socialImport.test';
import passkeys from './passkeys.test';
import workItems from './workItems.test';
import siteLearn, { siteLearnWiringTests } from './siteLearn.test';
import drafts from './drafts.test';
import routeParams from './routeParams.test';
import prismaErrors from './prismaErrors.test';
import htmlMeta from './htmlMeta.test';
import apiMessage from './apiMessage.test';
import account, { sessionVersionTests } from './account.test';
import publicPages from './publicPages.test';
import shareStage from './shareStage.test';
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
    ['ingredientSectionTests', ingredientSectionTests],
    ['invite', invite],
    ['archive', archive],
    ['archiveCollectionsTests', archiveCollectionsTests],
    ['archiveBackupNameTests', archiveBackupNameTests],
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
    ['readCappedTests', readCappedTests],
    ['similarRecipes', similarRecipes],
    ['privateAddress', privateAddress],
    ['privateIPv6FormsTests', privateIPv6FormsTests],
    ['sinceCooked', sinceCooked],
    ['secretBox', secretBox],
    ['readableText', readableText],
    ['siteProfile', siteProfile],
    ['aiProviders', aiProviders],
    ['aiPolish', aiPolish],
    ['clientMessages', clientMessages],
    ['recipeRepo', recipeRepo],
    ['storedDraftTests', storedDraftTests],
    ['recipeRoutesPassTags', recipeRoutesPassTags],
    ['examples', examples],
    ['units', units],
    ['shopping', shopping],
    ['cookSteps', cookSteps],
    ['tags', tags],
    ['offline', offline],
    ['revisions', revisions],
    ['foreignImport', foreignImport],
    ['menu', menu],
    ['inboxFilter', inboxFilter],
    ['socialImport', socialImport],
    ['passkeys', passkeys],
    ['workItems', workItems],
    ['siteLearn', siteLearn],
    ['siteLearnWiringTests', siteLearnWiringTests],
    ['drafts', drafts],
    ['routeParams', routeParams],
    ['prismaErrors', prismaErrors],
    ['htmlMeta', htmlMeta],
    ['apiMessage', apiMessage],
    ['account', account],
    ['sessionVersionTests', sessionVersionTests],
    ['publicPages', publicPages],
    ['shareStage', shareStage],
    ['draftQuality', draftQuality],
    ['fixtures', fixtures],
    ['pageTitle', pageTitle],
    ['transcripts', transcripts],
];

// Suites may be async — the capture pipeline stubs fetch and awaits it — so
// they are run in order rather than fired off together. Each in its own
// try/catch: a suite that throws is one failure, not the end of the run.
/*
 * What a suite may not leave behind.
 *
 * Suites stub `globalThis.fetch` and set API keys in `process.env`, and every
 * one of them put things back on the happy path — and not one did it in a
 * `finally`. A check that threw halfway left `fetch` stubbed and a fake key
 * in the environment for every suite after it, so one real failure became
 * a cascade of confusing ones. Fixing that in fifteen places is fifteen
 * chances to miss one; restoring here, around every suite, is one.
 */
async function main() {
    for (const [name, run] of suites) {
        const fetchBefore = globalThis.fetch;
        const envBefore = { ...process.env };

        try {
            await run();
        } catch (error) {
            crashed(name, error);
        } finally {
            globalThis.fetch = fetchBefore;
            for (const key of Object.keys(process.env)) {
                if (!(key in envBefore)) delete process.env[key];
            }
            Object.assign(process.env, envBefore);
        }
    }

    process.exit(summary() === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
