import { getTranslations } from 'next-intl/server';
import UserList from '@/components/admin/UserList';
import InvitationList from '@/components/admin/InvitationList';
import { pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';

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
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('people')} />

            <div className="flex flex-col gap-14">
                <UserList />
                <InvitationList />
            </div>
        </main>
    );
}
