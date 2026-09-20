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
import shoppingList from './shoppingList.test';
import invite from './invite.test';
import archive from './archive.test';

recipeSchema();
recipeParser();
recipeFromHtml();
amount();
siteUrl();
ingredientParts();
shoppingList();
invite();
archive();

process.exit(summary() === 0 ? 0 : 1);
