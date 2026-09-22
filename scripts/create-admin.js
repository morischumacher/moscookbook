/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Creates or promotes an admin user.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ADMIN_NAME='Mo' node scripts/create-admin.js
 *
 * Credentials come from the environment on purpose — nothing is hard-coded, so
 * this file can live in a public repository without handing anyone an account.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';

    if (!email || !password) {
        throw new Error(
            'ADMIN_EMAIL and ADMIN_PASSWORD must be set.\n' +
            "Example: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' node scripts/create-admin.js"
        );
    }

    if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
    }

    // Split at the last space, matching migration 0006 rather than the fuller
    // rule in src/lib/personName.ts — this script is plain JS and importing
    // the TypeScript module would drag a build step into a bootstrap tool. An
    // admin's own name is the one most likely to be corrected by hand anyway.
    const trimmed = name.trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    const firstName = lastSpace === -1 ? trimmed : trimmed.slice(0, lastSpace).trim();
    const lastName = lastSpace === -1 ? '' : trimmed.slice(lastSpace + 1).trim();

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword, admin: true, firstName, lastName },
        create: { email, name, firstName, lastName, password: hashedPassword, admin: true },
    });

    console.log(`Admin ready: ${user.email} (id ${user.id})`);
}

main()
    .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
