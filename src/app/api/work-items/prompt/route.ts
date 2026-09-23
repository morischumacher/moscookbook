import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { route } from '@/lib/route';

/**
 * The brief for whoever works through the list — docs/work-list-prompt.md,
 * the part below the line, which is what is meant to be pasted. Read from the
 * file so there is one copy of it, in the repository, where it is reviewed
 * like code. (next.config.ts ships the file with this function.)
 */
export const GET = route({ access: 'admin', label: 'Work list prompt' }, async () => {
    const file = await readFile(path.join(process.cwd(), 'docs', 'work-list-prompt.md'), 'utf8');
    const below = file.split(/^---\s*$/m).slice(1).join('---').trim();
    return new NextResponse(below || file, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
});
