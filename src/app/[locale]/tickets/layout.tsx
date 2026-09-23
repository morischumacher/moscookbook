import { titled } from '@/lib/metaTitle';

/** Only here for the page's title: the page itself is a client component. */
export const generateMetadata = titled('Tickets', 'title', false);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
