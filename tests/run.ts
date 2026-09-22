/**
 * Entry point for `npm test`.
 *
 * These cover the pure logic that is easy to get subtly wrong and expensive to
 * get wrong in production: recipe parsing, link import, payload validation and
 * amount scaling. UI behaviour is not covered here.
 */
import { summary } from './harness';
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
import captureProcess from './captureProcess.test';
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
import aiProviders from './aiProviders.test';
import aiPolish from './aiPolish.test';
import draftQuality from './draftQuality.test';

// Suites may be async — the capture pipeline stubs fetch and awaits it — so
// they are run in order rather than fired off together.
async function main() {
    recipeSchema();
    recipeParser();
    recipeFromHtml();
    amount();
    siteUrl();
    ingredientParts();
    invite();
    archive();
    archiveCollectionsTests();
    searchText();
    capture();
    youtube();
    await captureProcess();
    await email();
    duplicates();
    recipeJsonLd();
    errorReport();
    importVariants();
    personName();
    authTokens();
    access();
    await channels();
    post();
    uploadImage();
    ingredientSearch();
    blobCleanup();
    imageCompression();
    navigation();
    ownership();
    ticketPath();
    oysterMark();
    cookProgress();
    await safeFetch();
    similarRecipes();
    privateAddress();
    sinceCooked();
    secretBox();
    readableText();
    siteProfile();
    await aiProviders();
    await aiPolish();
    await siteLearn();
    draftQuality();
    await fixtures();
    pageTitle();
    await transcripts();

    process.exit(summary() === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
