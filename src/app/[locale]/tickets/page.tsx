import { getCurrentUser } from '@/lib/auth';
import TicketPage from '@/components/tickets/TicketForm';

/** The ticket form; the admin's has one more choice — straight to the AI (components/tickets/TicketForm). */
export default async function TicketsPage() {
    const user = await getCurrentUser();
    return <TicketPage admin={Boolean(user?.admin)} />;
}
