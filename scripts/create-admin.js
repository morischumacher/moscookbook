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

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword, admin: true },
        create: { email, name, password: hashedPassword, admin: true },
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
