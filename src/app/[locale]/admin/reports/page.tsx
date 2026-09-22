import prisma from '@/lib/prisma';
import Reports from '@/components/admin/Reports';

/**
 * Everything that has been reported, from either side.
 *
 * Errors and tickets were two entries in the admin's navigation and two
 * pages, built to the same shape — load, a toggle for the resolved ones, a
 * list — and asking the same question from two directions: what the
 * application noticed, and what a person noticed. Two taps, and a decision
 * about which to check first, for one question.
 *
 * One entry now, with the two sides next to each other.
 *
 * Counted here rather than in the panels so that the side with something on
 * it is the side that opens: an empty error list hiding three unread tickets
 * behind a tap would be the same problem in a smaller box. Both counts fail
 * to zero rather than failing the page — a number that could not be fetched
 * is not a reason to withhold the lists.
 */
export default async function AdminReportsPage() {
    const [openErrors, openTickets]: [number, number] = await Promise.all([
        prisma.errorLog.count({ where: { resolvedAt: null } }).catch(() => 0),
        prisma.ticket.count({ where: { resolvedAt: null } }).catch(() => 0),
    ]);

    return <Reports openErrors={openErrors} openTickets={openTickets} />;
}
