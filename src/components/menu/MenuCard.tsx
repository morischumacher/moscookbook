import { getTranslations } from 'next-intl/server';
import Logo from '@/components/brand/Logo';
import { coursesOf, type MenuStyle } from '@/lib/menu';
import { cormorant, playfair } from './fonts';
import styles from './MenuCard.module.css';

export interface MenuCardData {
    title: string;
    occasion: string | null;
    date: Date | null;
    guests: number | null;
    style: MenuStyle;
    intro: string | null;
    items: { course: string; title: string; description: string | null; recipeId: number | null }[];
}

/**
 * The card as it goes on the table: the logo, the evening, the courses — no
 * pictures, no links, nothing that needs a screen. The same on the admin's
 * page, on a guest's shared link and on paper.
 */
export default async function MenuCard({ menu, locale }: { menu: MenuCardData; locale: string }) {
    const t = await getTranslations({ locale, namespace: 'Menus' });
    const font = menu.style === 'chic' ? cormorant.className : menu.style === 'festive' ? playfair.className : '';
    const date = menu.date
        ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(menu.date)
        : null;

    return (
        <article className={`${styles.card} ${styles[menu.style]} ${font}`}>
            <div className={styles.logo}>
                <Logo height={menu.style === 'casual' ? 40 : 32} />
            </div>

            {(menu.occasion || date) && (
                <p className={styles.occasion}>{[menu.occasion, date].filter(Boolean).join(' · ')}</p>
            )}
            <h1 className={styles.title}>{menu.title}</h1>
            {menu.intro && <p className={styles.intro}>{menu.intro}</p>}

            <div className={styles.courses}>
                {coursesOf(menu.items).map((course, index) => (
                    <section key={`${course.name}-${index}`} className={styles.course}>
                        <h2 className={styles.courseName}>{course.name}</h2>
                        {course.dishes.map((dish, dishIndex) => (
                            <div key={dishIndex} className={styles.dish}>
                                <p className={styles.dishTitle}>{dish.title}</p>
                                {dish.description && <p className={styles.dishDescription}>{dish.description}</p>}
                            </div>
                        ))}
                    </section>
                ))}
            </div>

            {menu.guests && <p className={styles.footer}>{t('forGuests', { count: menu.guests })}</p>}
        </article>
    );
}
