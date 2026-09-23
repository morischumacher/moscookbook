import type { ListSummary } from '@/lib/shoppingDb';

type Translate = (key: string, values?: Record<string, string>) => string;

/** How a list is called in the chips and the add button: "Einkaufsliste", "Grillparty", "Liste von Ann", "Grillparty · Ann". */
export function listLabel(list: Pick<ListSummary, 'name' | 'owner' | 'ownerName'>, t: Translate): string {
    if (list.owner) return list.name ?? t('mainList');
    if (list.name === null) return t('sharedBy', { name: list.ownerName ?? '' });
    return `${list.name} · ${list.ownerName ?? ''}`;
}
