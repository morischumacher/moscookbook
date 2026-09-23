/**
 * Applies the database migrations when Vercel builds for production.
 *
 * `next build` never touched the database, so every migration since the last
 * time somebody ran `npm run db:deploy` by hand was missing in production —
 * and a page that reads a new column fails with nothing but "could not be
 * loaded". Now the production build applies them first, and a migration that
 * fails stops the deploy, so the old version stays live instead of a new one
 * that expects tables that are not there.
 *
 * Only for production: preview builds run for branches that are not merged,
 * and their migrations must not reach the one real database.
 */
import { execSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'production') {
    console.log(`migrate-on-deploy: skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
    process.exit(0);
}

execSync('npm run db:deploy', { stdio: 'inherit' });
