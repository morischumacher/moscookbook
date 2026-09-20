import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Creates the first admin from the environment.
 *
 * Nothing is hard-coded: this file lives in a public repository, and a seed
 * script with a known e-mail and password is an open door on any deployment
 * where someone ran it once.
 */
const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';

    if (!email || !password) {
        console.log(
            'Skipping seed: set ADMIN_EMAIL and ADMIN_PASSWORD to create an admin.\n' +
            "Example: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npx prisma db seed"
        );
        return;
    }

    if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: { name, password: hashedPassword, admin: true },
        create: { email, name, password: hashedPassword, admin: true },
    });

    console.log(`Admin ready: ${user.email} (id ${user.id})`);
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
