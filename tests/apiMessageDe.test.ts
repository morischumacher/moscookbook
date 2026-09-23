/** The routes' English sentences, as the German UI shows them */
import { suite, equal } from './harness';
import { sayable } from '../src/lib/apiMessage';

export default function apiMessageDeTests() {
    suite('API messages in the German UI');
    equal('a known sentence is translated', sayable('That is not an image we can read.', 'X', 'de'), 'Dieses Bild lässt sich nicht lesen.');
    equal('with its number', sayable('The picture is larger than 8 MB.', 'X', 'de'), 'Das Bild ist größer als 8 MB.');
    equal('a zod field names the field', sayable('title: Title is required', 'X', 'de'), 'Titel: Der Titel fehlt.');
    equal('an ingredient by its number', sayable('ingredients.0.item: Ingredient name is required', 'X', 'de'), 'Zutat 1: Der Name der Zutat fehlt.');
    equal('several issues, each', sayable('title: Title is required; instructions: Instructions are required', 'X', 'de'), 'Titel: Der Titel fehlt. Zubereitung: Die Zubereitung fehlt.');
    equal('an unknown English one falls back to the caller', sayable('Something nobody translated went wrong.', 'Das hat nicht geklappt.', 'de'), 'Das hat nicht geklappt.');
    equal('a German one is kept', sayable('Diese Zutat ist schon da.', 'X', 'de'), 'Diese Zutat ist schon da.');
    equal('the machine codes read as sentences', sayable('onlyMe', 'X', 'de').startsWith('Dieses Rezept ist nur für Admins'), true);
    equal('English stays English', sayable('That is not an image we can read.', 'X', 'en'), 'That is not an image we can read.');
    equal('nothing said is the fallback', sayable('', 'Fallback', 'de'), 'Fallback');
}
