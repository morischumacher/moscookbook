import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import AvatarForm from '@/components/account/AvatarForm';
import AccountSettings from '@/components/account/AccountSettings';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

/**
 * Your own account.
 *
 * It held one thing for a long time — the picture beside your name — on the
 * reasoning that a settings page invented before there are settings collects
 * empty sections. Fair, and it stopped being true: correcting a typo in your
 * own name, moving the address, changing a password you have not forgotten
 * and leaving altogether are the four things every tool of this shape lets a
 * person do, and none of them were possible here. A name typed once at
 * registration was permanent unless an admin went into the database.
 *
 * A server component so the current picture is on the page rather than fetched
 * after it, which is the difference between a circle and a circle that pops
 * into existence.
 */
export default async function AccountPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('Account');
    const session = await getSession();

    // The proxy already requires an account for this path; this is the second
    // lock on the same door, and it costs one query that the page needs anyway.
    if (!session.user) redirect(`/${locale}/login`);

    const me: {
        name: string;
        firstName: string;
        lastName: string;
        email: string;
        avatarUrl: string | null;
    } | null = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, firstName: true, lastName: true, email: true, avatarUrl: true },
    });

    if (!me) redirect(`/${locale}/login`);

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <h1 className={pageHeading}>{t('title')}</h1>

            <p className="mt-6 font-serif text-lg leading-relaxed text-muted">
                {me.name} · {me.email}
            </p>

            <section className="mt-10 border-t border-line pt-6">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                    {t('pictureTitle')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('pictureBody')}</p>

                <div className="mt-4">
                    <AvatarForm name={me.name} initialUrl={me.avatarUrl} />
                </div>
            </section>

            <AccountSettings
                firstName={me.firstName}
                lastName={me.lastName}
                email={me.email}
            />
        </main>
    );
}
