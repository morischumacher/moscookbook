/** The admin recipe list: its address, its filters, its order */
import { suite, equal } from './harness';
import { listHref, readListQuery, showWhere, sortOrder } from '../src/lib/adminRecipeList';

export default function adminRecipeListTests() {
    suite('admin list: the address is the state');
    equal('nothing given, the defaults', readListQuery({}), { q: '', sort: 'new', show: 'all', page: 1 });
    equal('unknown values fall back', readListQuery({ sort: 'x', show: 'y', page: '-3' }), { q: '', sort: 'new', show: 'all', page: 1 });
    const query = readListQuery({ q: ' curry ', sort: 'title', page: '3' });
    equal('a search, trimmed', query.q, 'curry');
    equal('the defaults stay out of the address', listHref(readListQuery({}), {}), '/admin');
    equal('a new filter starts on page one', listHref(query, { show: 'web' }), '/admin?q=curry&sort=title&show=web');
    equal('paging keeps the rest', listHref(query, { page: 4 }), '/admin?q=curry&sort=title&page=4');

    suite('admin list: filters and order');
    equal('public', showWhere('web'), { isPublic: true });
    equal('with a link', showWhere('link'), { isPublic: false, shareToken: { not: null } });
    equal('household only', showWhere('household'), { isPublic: false, shareToken: null });
    equal('most viewed, newest breaking ties', sortOrder('views'), [{ views: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
}
