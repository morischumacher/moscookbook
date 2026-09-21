import { getTranslations } from 'next-intl/server';
import UserList from '@/components/admin/UserList';
import InvitationList from '@/components/admin/InvitationList';

/**
 * The people: those who have an account, and those who have been asked.
 *
 * Two pages until now, "Users" and "Invitations", sitting side by side in the
 * navigation and making a reader work out the difference before they could
 * choose one. There is no difference worth a decision — an invitation is a
 * person who has not arrived yet — so they are two lists on one page, in the
 * order they happen in.
 */
export default async function AdminPeoplePage() {
    const t = await getTranslations('Admin');

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <h1 className="pb-8 pt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t('people')}
            </h1>

            <div className="flex flex-col gap-14">
                <UserList />
                <InvitationList />
            </div>
        </main>
    );
}
