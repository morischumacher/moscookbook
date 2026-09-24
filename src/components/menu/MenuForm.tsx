'use client';

import { useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';
import { COURSE_PRESETS, MENU_STYLES, type MenuStyle } from '@/lib/menu';

interface Dish {
    recipeId: number | null;
    title: string;
    description: string;
}

interface Course {
    name: string;
    dishes: Dish[];
}

export interface MenuDraft {
    id?: number;
    title: string;
    occasion: string;
    date: string;
    guests: number | null;
    style: MenuStyle;
    intro: string;
    courses: Course[];
}

const field =
    'w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const label = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

const emptyDish = (): Dish => ({ recipeId: null, title: '', description: '' });

/**
 * Making a menu: what the evening is, who comes, how it should look, and
 * the courses. A dish is picked from the cookbook or just written down — the
 * bread and the cheese board belong on the card too.
 */
export default function MenuForm({ initial, recipes }: { initial: MenuDraft; recipes: { id: number; title: string }[] }) {
    const t = useTranslations('Menus');
    const locale = useLocale() as 'en' | 'de';
    const router = useRouter();

    const [menu, setMenu] = useState<MenuDraft>(
        initial.courses.length > 0
            ? initial
            : { ...initial, courses: COURSE_PRESETS[initial.style][locale].map((name) => ({ name, dishes: [emptyDish()] })) }
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const set = <K extends keyof MenuDraft>(key: K, value: MenuDraft[K]) => setMenu((current) => ({ ...current, [key]: value }));
    const setCourse = (index: number, next: Course) =>
        setMenu((current) => ({ ...current, courses: current.courses.map((course, i) => (i === index ? next : course)) }));
    const moveCourse = (index: number, by: number) =>
        setMenu((current) => {
            const courses = [...current.courses];
            const [moved] = courses.splice(index, 1);
            courses.splice(index + by, 0, moved);
            return { ...current, courses };
        });

    const onlyEmptyDishes = menu.courses.every((course) => course.dishes.every((dish) => !dish.title && dish.recipeId === null));

    const chooseStyle = (style: MenuStyle) =>
        setMenu((current) => ({
            ...current,
            style,
            // Nothing filled in yet: the new style's courses replace the old
            // style's. Once a dish is written, courses are the author's.
            courses: onlyEmptyDishes ? COURSE_PRESETS[style][locale].map((name) => ({ name, dishes: [emptyDish()] })) : current.courses,
        }));

    const save = async () => {
        let left = false;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(menu.id ? `/api/menus/${menu.id}` : '/api/menus', {
                method: menu.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: menu.title,
                    occasion: menu.occasion,
                    date: menu.date,
                    guests: menu.guests,
                    style: menu.style,
                    intro: menu.intro,
                    courses: menu.courses.filter((course) => course.name.trim()),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setError(sayable(data?.message, t('saveFailed')));
                return;
            }
            // Saved: the button stays disabled while the page changes. Freed in
            // `finally`, a second press in that moment saved a copy ("…-2").
            left = true;
            router.push(`/menus/${data.slug}`);
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            if (!left) setBusy(false);
        }
    };

    const remove = async () => {
        if (!menu.id) return;
        setBusy(true);
        setError('');
        // It went to the list whatever happened, so a menu that was not
        // deleted looked deleted.
        const res = await fetch(`/api/menus/${menu.id}`, { method: 'DELETE' }).catch(() => null);
        if (!res?.ok) {
            setError(t('saveFailed'));
            setBusy(false);
            return;
        }
        router.push('/menus');
        router.refresh();
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
            className="flex flex-col gap-8"
        >
            {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">{error}</p>}

            <div>
                <label htmlFor="menu-title" className={label}>{t('fieldTitle')}</label>
                <input id="menu-title" value={menu.title} onChange={(event) => set('title', event.target.value)} required maxLength={120} placeholder={t('titlePlaceholder')} className={field} />
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
                <div className="sm:col-span-3">
                    <label htmlFor="menu-occasion" className={label}>{t('fieldOccasion')}</label>
                    <input id="menu-occasion" value={menu.occasion} onChange={(event) => set('occasion', event.target.value)} maxLength={120} placeholder={t('occasionPlaceholder')} className={field} />
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="menu-date" className={label}>{t('fieldDate')}</label>
                    <input id="menu-date" type="date" value={menu.date} onChange={(event) => set('date', event.target.value)} className={field} />
                </div>
                <div>
                    <label htmlFor="menu-guests" className={label}>{t('fieldGuests')}</label>
                    <input
                        id="menu-guests"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={200}
                        value={menu.guests ?? ''}
                        onChange={(event) => set('guests', event.target.value ? Number(event.target.value) : null)}
                        className={field}
                    />
                </div>
            </div>

            <fieldset>
                <legend className={label}>{t('fieldStyle')}</legend>
                <div className="grid grid-cols-3 gap-2">
                    {MENU_STYLES.map((style) => (
                        <button
                            key={style}
                            type="button"
                            aria-pressed={menu.style === style}
                            onClick={() => chooseStyle(style)}
                            className={`rounded-xl border p-3 text-left transition-colors ${menu.style === style ? 'border-ink bg-surface' : 'border-line'}`}
                        >
                            <span className="block text-sm font-bold">{t(`style_${style}`)}</span>
                            <span className="mt-1 block text-xs text-muted">{t(`style_${style}_hint`)}</span>
                        </button>
                    ))}
                </div>
            </fieldset>

            <div>
                <label htmlFor="menu-intro" className={label}>{t('fieldIntro')}</label>
                <textarea id="menu-intro" value={menu.intro} onChange={(event) => set('intro', event.target.value)} rows={2} maxLength={600} placeholder={t('introPlaceholder')} className={field} />
            </div>

            <div>
                <p className={label}>{t('fieldCourses')}</p>
                <ol className="flex flex-col gap-4">
                    {menu.courses.map((course, courseIndex) => (
                        <li key={courseIndex} className="rounded-2xl border border-line p-3">
                            <div className="flex items-center gap-1">
                                <input
                                    value={course.name}
                                    maxLength={60}
                                    onChange={(event) => setCourse(courseIndex, { ...course, name: event.target.value })}
                                    aria-label={t('courseName')}
                                    className={`${field} font-bold`}
                                />
                                <button type="button" onClick={() => moveCourse(courseIndex, -1)} disabled={courseIndex === 0} aria-label={t('moveUp')} className="flex h-10 w-9 shrink-0 items-center justify-center text-muted disabled:opacity-30">↑</button>
                                <button type="button" onClick={() => moveCourse(courseIndex, 1)} disabled={courseIndex === menu.courses.length - 1} aria-label={t('moveDown')} className="flex h-10 w-9 shrink-0 items-center justify-center text-muted disabled:opacity-30">↓</button>
                                <button
                                    type="button"
                                    onClick={() => set('courses', menu.courses.filter((_, i) => i !== courseIndex))}
                                    aria-label={t('removeCourse')}
                                    className="flex h-10 w-9 shrink-0 items-center justify-center text-muted hover:text-danger"
                                >
                                    ×
                                </button>
                            </div>

                            <ul className="mt-3 flex flex-col gap-3">
                                {course.dishes.map((dish, dishIndex) => {
                                    const setDish = (next: Dish) =>
                                        setCourse(courseIndex, { ...course, dishes: course.dishes.map((d, i) => (i === dishIndex ? next : d)) });
                                    const chosen = recipes.find((recipe) => recipe.id === dish.recipeId);
                                    return (
                                        <li key={dishIndex} className="flex flex-col gap-2 border-l-2 border-line pl-3">
                                            <select
                                                value={dish.recipeId ?? ''}
                                                onChange={(event) => setDish({ ...dish, recipeId: event.target.value ? Number(event.target.value) : null })}
                                                aria-label={t('dishRecipe')}
                                                className={field}
                                            >
                                                <option value="">{t('ownDish')}</option>
                                                {recipes.map((recipe) => (
                                                    <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                                                ))}
                                            </select>
                                            <input
                                                value={dish.title}
                                                maxLength={160}
                                                onChange={(event) => setDish({ ...dish, title: event.target.value })}
                                                placeholder={chosen ? chosen.title : t('dishTitlePlaceholder')}
                                                aria-label={t('dishTitle')}
                                                className={field}
                                            />
                                            <input
                                                value={dish.description}
                                                maxLength={240}
                                                onChange={(event) => setDish({ ...dish, description: event.target.value })}
                                                placeholder={t('dishDescriptionPlaceholder')}
                                                aria-label={t('dishDescription')}
                                                className={`${field} text-sm italic`}
                                            />
                                            {course.dishes.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCourse(courseIndex, { ...course, dishes: course.dishes.filter((_, i) => i !== dishIndex) })}
                                                    className="self-start text-sm text-muted underline underline-offset-4 hover:text-danger"
                                                >
                                                    {t('removeDish')}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            <button
                                type="button"
                                onClick={() => setCourse(courseIndex, { ...course, dishes: [...course.dishes, emptyDish()] })}
                                className="mt-3 text-sm underline underline-offset-4"
                            >
                                {t('addDish')}
                            </button>
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    onClick={() => set('courses', [...menu.courses, { name: '', dishes: [emptyDish()] }])}
                    className={`${buttonSecondary} mt-4`}
                >
                    {t('addCourse')}
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-6 border-t border-line pt-6">
                <button type="submit" disabled={busy || !menu.title.trim()} className={buttonPrimary}>
                    <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                </button>
                {menu.id && (
                    <InlineConfirm
                        label={t('delete')}
                        question={t('confirmDelete')}
                        confirmLabel={t('delete')}
                        destructive
                        disabled={busy}
                        onConfirm={remove}
                        className="text-sm text-muted underline underline-offset-4 hover:text-danger"
                    />
                )}
            </div>
        </form>
    );
}
