/** site URL resolution */
import { getSiteUrl } from '../src/lib/siteUrl';
import { suite, check } from './harness';

export default function run() {
    suite('getSiteUrl');

    const original = { ...process.env };
    const reset = () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
        delete process.env.VERCEL_URL;
    };

    reset();
    check('falls back to localhost in development', getSiteUrl() === 'http://localhost:3000', getSiteUrl());

    reset();
    process.env.VERCEL_URL = 'moscookbook-abc123.vercel.app';
    check('uses the deployment URL', getSiteUrl() === 'https://moscookbook-abc123.vercel.app', getSiteUrl());

    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'moscookbook.example.com';
    check(
        'production URL wins over the deployment URL',
        getSiteUrl() === 'https://moscookbook.example.com',
        getSiteUrl()
    );

    process.env.NEXT_PUBLIC_SITE_URL = 'https://kochbuch.example.com/';
    check(
        'an explicit setting wins and loses its trailing slash',
        getSiteUrl() === 'https://kochbuch.example.com',
        getSiteUrl()
    );

    process.env.NEXT_PUBLIC_SITE_URL = 'kochbuch.example.com';
    check('a bare host gets https', getSiteUrl() === 'https://kochbuch.example.com', getSiteUrl());

    reset();
    Object.assign(process.env, original);
}
