/** Menus: courses in, courses out */
import { suite, check, equal } from './harness';
import { COURSE_PRESETS, coursesFromRecipes, coursesOf, itemsFromCourses, menuInputSchema, menuStyle } from '../src/lib/menu';

export default function menuTests() {
    suite('menus: what a form sends');
    const parsed = menuInputSchema.safeParse({
        title: 'Weihnachten',
        date: '2026-12-24',
        guests: 6,
        style: 'festive',
        courses: [
            { name: 'Vorspeise', dishes: [{ recipeId: 3, title: '' }, { recipeId: null, title: 'Brot und Butter', description: '' }] },
            { name: 'Hauptgang', dishes: [{ recipeId: 1, title: 'Gans', description: 'mit Rotkohl' }] },
            { name: 'Dessert', dishes: [{ recipeId: null, title: '' }] },
        ],
    });
    check('accepted', parsed.success, parsed.success ? '' : parsed.error.issues);
    if (!parsed.success) return;
    check('the date is a date', parsed.data.date instanceof Date);
    equal('an unknown style falls back to casual', menuStyle('baroque'), 'casual');

    const items = itemsFromCourses(parsed.data.courses, (id) => (id === 3 ? 'Kürbissuppe' : 'Gänsebraten'));
    equal('a recipe dish takes the recipe title unless given one', items.map((item) => item.title), ['Kürbissuppe', 'Brot und Butter', 'Gans']);
    equal('an empty dish is dropped, and with it an empty course', items.map((item) => item.course), ['Vorspeise', 'Vorspeise', 'Hauptgang']);
    equal('positions run through the whole menu', items.map((item) => item.position), [0, 1, 2]);
    equal('an empty description is none', items[1].description, null);

    suite('menus: rows back into courses');
    const courses = coursesOf(items);
    equal('grouped in order', courses.map((course) => [course.name, course.dishes.length]), [['Vorspeise', 2], ['Hauptgang', 1]]);

    suite('menus: the suggested courses');
    equal('three for friends', COURSE_PRESETS.casual.de.length, 3);
    check('more for Christmas', COURSE_PRESETS.festive.de.length > COURSE_PRESETS.chic.de.length);

    suite('menus: from a collection');
    const fromCollection = coursesFromRecipes(
        [
            { id: 1, title: 'Gans', category: 'Dinner' },
            { id: 2, title: 'Mousse', category: 'Dessert' },
            { id: 3, title: 'Spritz', category: 'Drink' },
            { id: 4, title: 'Knödel', category: null },
        ],
        'de'
    );
    equal('drinks first, then starter, main, dessert', fromCollection.map((course) => course.name), ['Aperitif', 'Vorspeise', 'Hauptgang', 'Dessert']);
    equal('uncategorised recipes go to the main course', fromCollection[2].dishes.map((dish) => dish.recipeId), [1, 4]);
    equal('an empty course keeps one empty dish', fromCollection[1].dishes, [{ recipeId: null, title: '', description: '' }]);
    equal('no drinks, no aperitif', coursesFromRecipes([], 'en').map((course) => course.name), ['Starter', 'Main', 'Dessert']);
}
