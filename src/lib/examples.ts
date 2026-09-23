/**
 * The example entry and the example collection.
 *
 * Asked for twice, for the same reason: the blog editor and the collection
 * form each have a handful of features — formatting, pictures in the text,
 * several recipes, a cover — and the quickest way to learn what they do is
 * one finished thing that uses all of them, opened in the editor. Each also
 * serves as a test: tests/examples.test.ts checks that every feature is in
 * it, so the example cannot quietly stop showing something the editor can do.
 *
 * Built from the cookbook's own recipes and pictures, so it looks like this
 * cookbook rather than like a template. With no recipes yet it still works,
 * just without pictures.
 */

export interface ExampleRecipe {
    id: number;
    title: string;
    slug: string;
    image: string | null;
}

export type ExampleLocale = 'en' | 'de';

export const EXAMPLE_COLLECTION_SLUG = { en: 'example-collection', de: 'beispiel-sammlung' } as const;
export const EXAMPLE_POST_SLUG = { en: 'example-post', de: 'beispiel-beitrag' } as const;

function picture(recipe: ExampleRecipe | undefined, caption: string): string {
    return recipe?.image ? `![${recipe.title}](${recipe.image} "${caption}")` : '';
}

export function exampleCollection(locale: ExampleLocale, recipes: ExampleRecipe[]) {
    const chosen = recipes.slice(0, 4);
    const [first, second] = chosen;

    const description =
        locale === 'de'
            ? [
                  'Ein **Beispiel**, das zeigt, was eine Sammlung kann. Bearbeite oder lösche es, wann du willst.',
                  '## Wofür Sammlungen gut sind',
                  'Ein Menü für einen Anlass, die Rezepte einer Reise, *alles mit Kürbis* — was zusammengehört, in der Reihenfolge, in der man es kocht.',
                  '- Eine **Beschreibung** wie diese, so lang wie nötig, mit Überschriften, Listen und Links',
                  '- Ein **Titelbild** oben (ohne eigenes nimmt sie das Bild des ersten Rezepts)',
                  '- Die **Rezepte** in einer Reihenfolge, die du mit ↑ und ↓ festlegst',
                  '- Ein **Bild mitten im Text**, wie dieses:',
                  picture(second ?? first, 'Ein Bild im Text, mit Bildunterschrift'),
                  '## Was du mit einer Sammlung machen kannst',
                  '1. **Einkaufsliste**: unten auf der Seite kommen alle Zutaten aller Rezepte auf einmal auf die Liste, zusammengefasst.',
                  '2. **Als Menü anlegen**: macht aus der Sammlung eine Menükarte mit Gängen, zum Drucken oder als Link für Gäste.',
                  '3. **Teilen**: privat für den Haushalt, mit einem Link für einzelne Leute, oder öffentlich.',
                  '4. **Im Blog**: ein Beitrag kann von dieser Sammlung erzählen; er erscheint dann unten auf dieser Seite.',
                  first ? `Anfangen würde ich mit [${first.title}](/de/recipe/${first.slug}).` : '',
              ]
            : [
                  'An **example** of what a collection can do. Edit it or delete it whenever you like.',
                  '## What collections are for',
                  'A menu for an occasion, the recipes from a trip, *everything with pumpkin* — what belongs together, in the order you would cook it.',
                  '- A **description** like this one, as long as it needs to be, with headings, lists and links',
                  '- A **cover picture** at the top (without one, the first recipe\'s picture is used)',
                  '- The **recipes** in an order you set with ↑ and ↓',
                  '- A **picture in the middle of the text**, like this one:',
                  picture(second ?? first, 'A picture in the text, with a caption'),
                  '## What you can do with a collection',
                  '1. **Shopping list**: at the bottom of the page, every ingredient of every recipe goes onto the list at once, combined.',
                  '2. **Make a menu**: turns the collection into a menu card with courses, to print or to send to your guests.',
                  '3. **Share**: private to the household, with a link for particular people, or public.',
                  '4. **In the blog**: a post can tell the story of this collection; it then appears at the bottom of this page.',
                  first ? `I would start with [${first.title}](/en/recipe/${first.slug}).` : '',
              ];

    return {
        title: locale === 'de' ? 'Beispiel: Ein Sonntagsmenü' : 'Example: a Sunday menu',
        slug: EXAMPLE_COLLECTION_SLUG[locale],
        description: description.filter(Boolean).join('\n\n'),
        imageUrl: first?.image ?? null,
        recipeIds: chosen.map((recipe) => recipe.id),
    };
}

export function examplePost(locale: ExampleLocale, recipes: ExampleRecipe[], collection: { id: number; slug: string; title: string } | null) {
    const [first, second, third] = recipes;
    const picked = [first, second, third].filter((recipe): recipe is ExampleRecipe => Boolean(recipe));
    const recipeLink = (recipe: ExampleRecipe) => `[${recipe.title}](/${locale}/recipe/${recipe.slug})`;
    const numbered = (lines: string[]) => lines.map((line, index) => `${index + 1}. ${line}`).join('\n');

    const body =
        locale === 'de'
            ? [
                  'Das ist ein **Beispielbeitrag**. Er zeigt alles, was der Editor kann — öffne ihn zum Bearbeiten und sieh dir an, wie es geschrieben ist. Er ist ein Entwurf, bis du ihn veröffentlichst.',
                  '## Text formatieren',
                  'Mit den Knöpfen über dem Textfeld: **fett**, *kursiv*, Überschriften, Listen und [Links](https://de.wikipedia.org/wiki/Kochen).',
                  '- eine Liste wie diese\n- mit so vielen Punkten wie nötig\n- und **Formatierung** darin',
                  '> Ein Zitat oder ein Tipp am Rand steht so da.',
                  '## Bilder im Text',
                  'Mit dem Knopf **Bild** wird ein Foto hochgeladen und genau dort eingefügt, wo der Cursor steht. Eine Bildunterschrift steht in Anführungszeichen dahinter.',
                  picture(first, 'Das erste Bild, mit Bildunterschrift'),
                  'Und der Text geht danach einfach weiter.',
                  picture(second, 'Ein zweites Bild'),
                  '## Rezepte und Sammlungen',
                  'Ein Beitrag kann über **mehrere Rezepte** und **Sammlungen** sein. Jedes bekommt am Ende eine Karte, und der Beitrag erscheint auf der Seite jedes Rezepts.',
                  numbered(picked.map(recipeLink)),
                  collection ? `Und die ganze Sammlung: [${collection.title}](/${locale}/collections/${collection.slug}).` : '',
                  '## Titelbild, Entwurf, Veröffentlichen',
                  'Das **Titelbild** steht oben über dem Beitrag und in der Übersicht. Solange der Beitrag ein **Entwurf** ist, sehen ihn nur Admins; **Veröffentlichen** macht ihn für den Haushalt sichtbar, und über **Teilen** auch mit einem Link oder öffentlich.',
                  '## Ein Abend daraus',
                  `Aus einer Sammlung wird mit „Als Menü anlegen“ eine Menükarte – mit Gängen, im Stil „Unter Freunden“, „Date Night“ oder „Festlich“, zum Drucken als A5 oder als Link für die Gäste. Alle Menüs: [Menüs](/${locale}/menus).`,
              ]
            : [
                  'This is an **example post**. It shows everything the editor can do — open it to edit and see how it is written. It stays a draft until you publish it.',
                  '## Formatting text',
                  'With the buttons above the text box: **bold**, *italic*, headings, lists and [links](https://en.wikipedia.org/wiki/Cooking).',
                  '- a list like this one\n- with as many points as it needs\n- and **formatting** inside it',
                  '> A quote or a tip on the side looks like this.',
                  '## Pictures in the text',
                  'The **Picture** button uploads a photograph and places it exactly where the cursor is. A caption goes in quotation marks after it.',
                  picture(first, 'The first picture, with a caption'),
                  'And the text simply carries on afterwards.',
                  picture(second, 'A second picture'),
                  '## Recipes and collections',
                  'A post can be about **several recipes** and **collections**. Each gets a card at the end, and the post appears on every recipe\'s page.',
                  numbered(picked.map(recipeLink)),
                  collection ? `And the whole collection: [${collection.title}](/${locale}/collections/${collection.slug}).` : '',
                  '## Cover picture, draft, publishing',
                  'The **cover picture** sits above the post and in the overview. While the post is a **draft**, only admins see it; **Publish** makes it visible to the household, and **Share** also with a link or publicly.',
                  '## An evening out of it',
                  `“Make a menu” turns a collection into a menu card – with courses, in the style “With friends”, “Date night” or “Festive”, to print on A5 or to send to your guests as a link. All menus: [Menus](/${locale}/menus).`,
              ];

    return {
        title: locale === 'de' ? 'Beispiel: Alles, was ein Beitrag kann' : 'Example: everything a post can do',
        slug: EXAMPLE_POST_SLUG[locale],
        body: body.filter(Boolean).join('\n\n'),
        imageUrl: third?.image ?? first?.image ?? null,
        recipeIds: picked.map((recipe) => recipe.id),
        collectionIds: collection ? [collection.id] : [],
    };
}
