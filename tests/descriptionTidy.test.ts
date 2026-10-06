/** A description is words about the dish, not a social caption or the recipe again */
import { suite, equal } from './harness';
import { tidyDescription } from '../src/lib/descriptionTidy';

export default function descriptionTidyTests() {
    suite('description: social captions');
    const rows = [{ item: 'Sesampaste' }, { item: 'Erdnussbutter' }, { item: 'Sojasauce' }, { item: 'Chiliöl' }];
    equal(
        'a whole Instagram caption with the recipe in it leaves nothing',
        tidyDescription('150.000 Likes, 465 Kommentare - derekkchen am 29. März 2024: "Sesam-Nudeln Zutaten Sauce * 3 EL Sesampaste * 3 EL Erdnussbutter * 1 EL Sojasauce * 2 EL Chiliöl Anleitung 1. Alles vermischen. #sesamnudeln #rezept".', rows),
        ''
    );
    equal('the counters, the quotes and the hashtags go; the words stay', tidyDescription('12K likes, 80 comments - cook on March 2, 2024: "The noodles I make every week. #noodles #easy"'), 'The noodles I make every week.');
    equal('a description is left alone', tidyDescription('Ein scharfer, säuerlicher Hähnchensalat aus dem Nordosten Thailands.'), 'Ein scharfer, säuerlicher Hähnchensalat aus dem Nordosten Thailands.');
    equal('one that only mentions an ingredient stays', tidyDescription('Cremige Nudeln mit Sesampaste – in zehn Minuten fertig.', rows), 'Cremige Nudeln mit Sesampaste – in zehn Minuten fertig.');
    equal('empty stays empty', tidyDescription(''), '');
}
