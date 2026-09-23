/**
 * The routes' sentences, in German.
 *
 * Every route answers a failure with one English sentence, and the German UI
 * showed it as it came: "That is not an image we can read." in the middle of
 * a German page. Translating on the server would mean a locale on every
 * request and a message key per sentence across a hundred and fifty call
 * sites; this is the one place instead, applied where a message is shown
 * (lib/apiMessage).
 *
 * What is not in here and still reads as English is not shown at all in the
 * German UI: the caller's own German fallback is, which says what was being
 * attempted. So a route written tomorrow in English never leaks — at worst it
 * is less specific until its sentence is added here.
 */

const EXACT: Record<string, string> = {
    // Generic
    'Internal server error': 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
    'That did not work.': 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
    Unauthorized: 'Bitte melde dich an.',
    'Invalid request.': 'Diese Anfrage ist ungültig.',
    'Invalid input': 'Diese Eingabe ist ungültig.',
    'Invalid input data': 'Diese Eingabe ist ungültig.',
    'Invalid payload': 'Diese Anfrage ist ungültig.',
    'Not found': 'Nicht gefunden.',
    'Too many requests.': 'Zu viele Anfragen. Warte bitte einen Moment.',
    'Too many at once. Please wait a moment.': 'Zu viel auf einmal. Warte bitte einen Moment.',
    'That is a lot at once. Try again a little later.': 'Das ist gerade sehr viel auf einmal. Versuch es bitte etwas später.',
    'Too many attempts. Please try again later.': 'Zu viele Versuche. Versuch es bitte später noch einmal.',
    'Too many attempts. Please wait a few minutes.': 'Zu viele Versuche. Warte bitte ein paar Minuten.',
    'Too many attempts. Please wait a moment.': 'Zu viele Versuche. Warte bitte einen Moment.',
    'Too many attempts. Please wait a while.': 'Zu viele Versuche. Warte bitte eine Weile.',
    'That took too long. Please try again.': 'Das hat zu lange gedauert. Versuch es bitte noch einmal.',
    'That is no longer there.': 'Das gibt es nicht mehr.',
    'That is not there any more.': 'Das gibt es nicht mehr.',
    'Unknown action': 'Unbekannte Aktion.',
    'Clear what?': 'Was soll geleert werden?',
    'Which one?': 'Welches?',
    'Which picture?': 'Welches Bild?',
    'Which recipe?': 'Welches Rezept?',

    // Ids and things that are gone
    'Invalid ID': 'Ungültige Nummer.',
    'Invalid id': 'Ungültige Nummer.',
    'Invalid recipe ID': 'Dieses Rezept gibt es nicht.',
    'Recipe not found': 'Dieses Rezept gibt es nicht (mehr).',
    'That recipe no longer exists.': 'Dieses Rezept gibt es nicht mehr.',
    'One of those recipes no longer exists.': 'Eines dieser Rezepte gibt es nicht mehr.',
    'Invalid post ID': 'Diesen Beitrag gibt es nicht.',
    'Post not found': 'Diesen Beitrag gibt es nicht (mehr).',
    'That entry no longer exists.': 'Diesen Eintrag gibt es nicht mehr.',
    'Invalid collection id': 'Diese Sammlung gibt es nicht.',
    'Collection not found': 'Diese Sammlung gibt es nicht (mehr).',
    'That collection is gone.': 'Diese Sammlung gibt es nicht mehr.',
    'That collection no longer exists.': 'Diese Sammlung gibt es nicht mehr.',
    'That menu is gone.': 'Dieses Menü gibt es nicht mehr.',
    'That item is gone.': 'Diesen Eintrag gibt es nicht mehr.',
    'That row no longer exists.': 'Diese Zeile gibt es nicht mehr.',
    'That error is not there any more.': 'Diesen Fehler gibt es nicht mehr.',
    'Invalid capture ID': 'Diesen Eintrag gibt es nicht.',
    'Invalid capture id': 'Diesen Eintrag gibt es nicht.',
    'Capture not found': 'Diesen Eintrag gibt es nicht (mehr).',
    'Invalid entry id': 'Diesen Eintrag gibt es nicht.',
    'Invalid user ID': 'Dieses Konto gibt es nicht.',
    'User not found': 'Dieses Konto gibt es nicht (mehr).',
    'Invalid invite ID': 'Diese Einladung gibt es nicht.',
    'Invite not found': 'Diese Einladung gibt es nicht (mehr).',
    'Invalid token id': 'Diesen Schlüssel gibt es nicht.',
    'That version is not there.': 'Diese Version gibt es nicht.',
    'That version cannot be read.': 'Diese Version lässt sich nicht lesen.',

    // Sign-in, account, passkeys
    'Invalid credentials': 'E-Mail-Adresse oder Passwort stimmen nicht.',
    'Too many login attempts. Please try again later.': 'Zu viele Anmeldeversuche. Versuch es bitte später noch einmal.',
    'Too many sign-up attempts. Please try again later.': 'Zu viele Registrierungsversuche. Versuch es bitte später noch einmal.',
    'User already exists': 'Für diese Adresse gibt es schon ein Konto.',
    'That address already belongs to another account.': 'Diese Adresse gehört schon zu einem anderen Konto.',
    'No new address is waiting to be confirmed.': 'Es wartet keine neue Adresse auf Bestätigung.',
    'Please wait a little before asking for another e-mail.': 'Warte bitte kurz, bevor du noch eine E-Mail anforderst.',
    'The e-mail could not be sent.': 'Die E-Mail konnte nicht verschickt werden.',
    'Sending mail is not set up.': 'Der E-Mail-Versand ist nicht eingerichtet.',
    'That is not your password.': 'Das ist nicht dein Passwort.',
    'That is not your current password.': 'Das ist nicht dein aktuelles Passwort.',
    'This passkey is not known here (any more).': 'Diesen Passkey kennt das Kochbuch nicht (mehr).',
    'The passkey could not be checked.': 'Der Passkey konnte nicht geprüft werden.',
    'The passkey could not be saved.': 'Der Passkey konnte nicht gespeichert werden.',
    'Cannot delete your own account.': 'Dein eigenes Konto kannst du hier nicht löschen.',
    'The owner of the cookbook cannot be deleted.': 'Das Konto, dem das Kochbuch gehört, kann nicht gelöscht werden.',
    'You are the only admin. Make somebody else an admin first, or this cookbook would have nobody who can let anyone in.':
        'Du bist der einzige Admin. Mach zuerst jemand anderen zum Admin – sonst könnte niemand mehr Leute einladen.',
    'Somebody here already has that name. Please add or change your last name.':
        'Diesen Namen gibt es hier schon. Ergänze oder ändere bitte deinen Nachnamen.',
    'That name is already taken.': 'Diesen Namen gibt es schon.',
    'This invitation is not valid any more.': 'Diese Einladung gilt nicht mehr.',
    'This link cannot be used any more.': 'Dieser Link funktioniert nicht mehr.',
    'Invalid link.': 'Dieser Link ist ungültig.',
    'Unknown link.': 'Diesen Link kennt das Kochbuch nicht.',
    'Logged out successfully': 'Abgemeldet.',

    // Pictures and files
    'Unsupported file type. Please upload an image.': 'Diese Datei ist kein Bild. Wähle bitte ein Foto aus.',
    'That file is not a picture.': 'Diese Datei ist kein Bild.',
    'That is not a picture.': 'Das ist kein Bild.',
    'That is not an image we can read.': 'Dieses Bild lässt sich nicht lesen.',
    'No file received.': 'Es ist keine Datei angekommen.',
    'No picture received.': 'Es ist kein Bild angekommen.',
    'Upload failed': 'Das Hochladen hat nicht geklappt.',
    'The picture could not be saved.': 'Das Bild konnte nicht gespeichert werden.',
    'That is a lot of pictures at once. Try again a little later.': 'Das sind gerade sehr viele Bilder auf einmal. Versuch es bitte etwas später.',
    'You have added as many pictures to this recipe as this allows.': 'Zu diesem Rezept hast du schon so viele Bilder hinzugefügt, wie möglich sind.',
    'That entry already has as many pictures as it holds.': 'Dieser Eintrag hat schon so viele Bilder, wie möglich sind.',
    'Not yours to write on.': 'Das ist nicht dein Eintrag.',
    'Not yours to add to.': 'Das ist nicht dein Eintrag.',
    'That picture is not a report screenshot.': 'Dieses Bild ist kein Screenshot aus einer Meldung.',
    'The picture has to be an http(s) link': 'Das Bild muss ein http(s)-Link sein.',

    // Recipes, posts, collections, menus, sharing
    'A recipe with this slug already exists. Please choose a different one.':
        'Es gibt schon ein Rezept mit dieser Adresse. Ändere die Adresse (Slug) oder den Titel.',
    'Another entry already has that address.': 'Ein anderer Beitrag hat schon diese Adresse.',
    'Rating must be a whole number between 1 and 5': 'Eine Bewertung ist eine ganze Zahl von 1 bis 5.',
    'Public or not?': 'Öffentlich oder nicht?',
    onlyMe: 'Dieses Rezept ist nur für Admins. Stell es zuerst auf „Nur der Haushalt“.',
    draft: 'Ein Entwurf kann nicht veröffentlicht werden. Stell ihn zuerst fertig.',
    'Publish the entry before sharing it.': 'Veröffentliche den Beitrag, bevor du ihn teilst.',
    'An entry has to be published in the blog before it can go on the open web.':
        'Ein Beitrag muss im Blog veröffentlicht sein, bevor er ins offene Web kann.',
    'This list is not shared.': 'Diese Liste ist nicht geteilt.',
    'The suggestion changed a number, so it was discarded. Nothing has been altered.':
        'Der Vorschlag hat eine Zahl verändert und wurde deshalb verworfen. Es wurde nichts geändert.',
    'Too many translations. Please wait a moment.': 'Zu viele Übersetzungen. Warte bitte einen Moment.',
    'Too many revisions. Please wait a moment.': 'Zu viele Überarbeitungen. Warte bitte einen Moment.',
    'Too many views': 'Zu viele Aufrufe.',

    // Import and inbox
    'Please provide a URL.': 'Gib bitte einen Link ein.',
    'That is not a web address.': 'Das ist keine Webadresse.',
    'Too many imports. Please wait a moment.': 'Zu viele Importe. Warte bitte einen Moment.',
    'Too many AI imports. Please wait a moment.': 'Zu viele KI-Importe. Warte bitte einen Moment.',
    'Too many captures. Please wait a moment.': 'Zu viele Einträge auf einmal. Warte bitte einen Moment.',
    'Too many tests. Please wait a moment.': 'Zu viele Tests. Warte bitte einen Moment.',
    'AI import is not configured on this deployment.': 'Der KI-Import ist hier nicht eingerichtet.',
    'AI import was unavailable, so the text was parsed locally.': 'Die KI war nicht erreichbar, deshalb wurde der Text ohne sie gelesen.',
    'The AI is set to pictures only, so the text was parsed locally.': 'Die KI ist nur für Bilder eingeschaltet, deshalb wurde der Text ohne sie gelesen.',
    'The image could not be read. Please type the recipe in instead.': 'Das Bild ließ sich nicht lesen. Tipp das Rezept bitte ab.',
    'No recipe data found on that page. Try copying the recipe text and pasting it instead.':
        'Auf dieser Seite wurde kein Rezept gefunden. Kopier den Rezepttext und füg ihn stattdessen ein.',
    'The page could not be read.': 'Die Seite konnte nicht gelesen werden.',
    'Reading timed out.': 'Das Lesen hat zu lange gedauert.',
    'That is too large to capture.': 'Das ist zu groß für den Eingang.',
    'Nothing usable was sent.': 'Es ist nichts Brauchbares angekommen.',
    'Nothing usable was shared.': 'Es wurde nichts Brauchbares geteilt.',
    'Nothing was sent.': 'Es ist nichts angekommen.',
    'Send a url, some text, or both.': 'Schick einen Link, Text oder beides.',
    'A capture token is required.': 'Es fehlt der Capture-Schlüssel.',
    'That capture token is not valid.': 'Dieser Capture-Schlüssel ist ungültig.',
    'A name for the device is required.': 'Gib dem Gerät bitte einen Namen.',
    'The capture could not be saved. Nothing was kept — please send it again.':
        'Der Eintrag konnte nicht gespeichert werden. Es wurde nichts behalten – schick ihn bitte noch einmal.',
    'This capture has no complete recipe yet. Open it and finish it first.':
        'In diesem Eintrag steht noch kein vollständiges Rezept. Öffne ihn und vervollständige es zuerst.',
    'This capture has already become a recipe.': 'Aus diesem Eintrag ist schon ein Rezept geworden.',
    'That capture has already been dealt with.': 'Dieser Eintrag ist schon erledigt.',
    'The AI is switched off or has no key.': 'Die KI ist ausgeschaltet oder hat keinen Schlüssel.',
    'No AI key is configured.': 'Es ist kein KI-Schlüssel eingerichtet.',
    'No verified AI key is stored. Nothing can be learned without a model.':
        'Es ist kein geprüfter KI-Schlüssel gespeichert. Ohne Modell kann nichts gelernt werden.',
    'The model found no complete recipe on this page, so there is nothing to learn.':
        'Das Modell hat auf dieser Seite kein vollständiges Rezept gefunden – es gibt nichts zu lernen.',
    'That is not a hostname.': 'Das ist kein Hostname.',
    'Unknown provider.': 'Unbekannter Anbieter.',
    'Unknown provider': 'Unbekannter Anbieter.',
    'Unknown mode': 'Unbekannter Modus.',
    'The key could not be stored.': 'Der Schlüssel konnte nicht gespeichert werden.',
    'This deployment has no secret to store keys under.': 'Hier ist kein Geheimnis eingerichtet, unter dem Schlüssel gespeichert werden können.',
    'That is not a usable model name — letters, digits, dots, colons and dashes only.':
        'Das ist kein gültiger Modellname – nur Buchstaben, Ziffern, Punkte, Doppelpunkte und Bindestriche.',

    // Backup
    'That archive is too large to import here.': 'Dieses Archiv ist zu groß, um es hier einzuspielen.',
    'That file is not valid JSON.': 'Diese Datei ist kein gültiges JSON.',
    'The archive could not be imported.': 'Das Archiv konnte nicht eingespielt werden.',
    'The backup did not run.': 'Die Sicherung ist nicht gelaufen.',

    // Form fields (zod)
    'Title is required': 'Der Titel fehlt.',
    'A title is required': 'Der Titel fehlt.',
    'Add at least one ingredient': 'Mindestens eine Zutat fehlt.',
    'Ingredient name is required': 'Der Name der Zutat fehlt.',
    'Instructions are required': 'Die Zubereitung fehlt.',
    'An entry needs some text': 'Der Beitrag braucht etwas Text.',
    'A collection needs a name.': 'Die Sammlung braucht einen Namen.',
    'A menu needs a name.': 'Das Menü braucht einen Namen.',
    'First name is required': 'Der Vorname fehlt.',
    'Last name is required': 'Der Nachname fehlt.',
    'Password must be at least 8 characters': 'Das Passwort braucht mindestens 8 Zeichen.',
    'The new password must be at least 8 characters': 'Das neue Passwort braucht mindestens 8 Zeichen.',
    'Your current password is required': 'Dein aktuelles Passwort fehlt.',
    'Your password is required': 'Dein Passwort fehlt.',
    'That is not an e-mail address': 'Das ist keine E-Mail-Adresse.',
    'An invitation is required': 'Dafür brauchst du eine Einladung.',
    'Say something': 'Schreib bitte etwas.',
};

/** Sentences with a number or a name in them. */
const PATTERNS: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^The picture is larger than ([\d.,]+) MB\.$/, (mb) => `Das Bild ist größer als ${mb} MB.`],
    [/^File is too large\. Maximum size is ([\d.,]+) MB\.$/, (mb) => `Die Datei ist zu groß. Höchstens ${mb} MB.`],
    [/^The picture could not be stored \((.+)\)\.$/, (why) => `Das Bild konnte nicht gespeichert werden (${why}).`],
    [/^The page could not be read \((.+)\)\.$/, (why) => `Die Seite konnte nicht gelesen werden (${why}).`],
    [/^The model could not read the page: (.+)$/, (why) => `Das Modell konnte die Seite nicht lesen: ${why}`],
    [/^No usable key is stored for (.+)\.$/, (who) => `Für ${who} ist kein brauchbarer Schlüssel gespeichert.`],
    [/^(.+) learned and verified against this page\.$/, (host) => `${host} gelernt und an dieser Seite geprüft.`],
    [/^Not learned: (.+)$/, (why) => `Nicht gelernt: ${why}`],
    [/^Invalid (.+)$/, () => 'Diese Angabe ist ungültig.'],
];

/** The form fields a validation message names, as the form calls them. */
const FIELDS: Record<string, string> = {
    title: 'Titel',
    slug: 'Adresse',
    description: 'Beschreibung',
    instructions: 'Zubereitung',
    ingredients: 'Zutaten',
    servings: 'Portionen',
    prepMinutes: 'Vorbereitung',
    cookMinutes: 'Kochzeit',
    body: 'Text',
    imageUrl: 'Bild',
    name: 'Name',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    password: 'Passwort',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    recipeIds: 'Rezepte',
    date: 'Datum',
    guests: 'Gäste',
};

function field(path: string): string {
    // "ingredients.2.item" → "Zutat 3"
    const ingredient = /^ingredients\.(\d+)/.exec(path);
    if (ingredient) return `Zutat ${Number(ingredient[1]) + 1}`;
    return FIELDS[path.split('.')[0]] ?? path;
}

function one(sentence: string): string | null {
    const exact = EXACT[sentence.trim()];
    if (exact) return exact;
    for (const [pattern, write] of PATTERNS) {
        const match = pattern.exec(sentence.trim());
        if (match) return write(...match.slice(1));
    }
    // "title: Title is required" — zod, through lib/zodMessage.
    const named = /^([\w.]+): (.+)$/.exec(sentence.trim());
    if (named) {
        const said = one(named[2]);
        return said ? `${field(named[1])}: ${said}` : null;
    }
    return null;
}

/**
 * The sentence in German, or null when it is not one we know. Several issues
 * joined with "; " are translated one by one.
 */
export function germanFor(message: string): string | null {
    const parts = message.split('; ');
    const said = parts.map(one);
    return said.every((part) => part !== null) ? said.join(' ') : null;
}

/** Whether a sentence reads as German already (an umlaut, ß, or a common word). */
export function looksGerman(message: string): boolean {
    return /[äöüÄÖÜß]|\b(nicht|bitte|kein|keine|das|die|der|ist|zu|und|noch|schon)\b/.test(message);
}
