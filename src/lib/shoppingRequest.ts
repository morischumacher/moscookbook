import { refuse } from './route';
import { listFor, type ListAccess } from './shoppingDb';

/**
 * The list a shopping request is about, from its `?list=<id>` — the person's
 * main list when there is none. Refuses a list that is not theirs or joined,
 * and, with `owner`, one they only joined.
 */
export async function requestedList(req: Request, userId: number, need?: 'owner'): Promise<ListAccess> {
    const list = await listFor(userId, new URL(req.url).searchParams.get('list'));
    if (!list) refuse(404, 'This list is not there.');
    if (need === 'owner' && !list.owner) refuse(403, 'Only whoever made this list can do that.');
    return list;
}
