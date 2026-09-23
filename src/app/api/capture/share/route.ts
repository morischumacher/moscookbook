import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { classifyCapture } from '@/lib/capture';
import { readInBackground } from '@/lib/captureBackground';

/**
 * Something shared to the installed site from another app — Android's and
 * desktop Chrome's share sheet — into the inbox.
 *
 * The device-token route (`/api/capture`) is for the iOS Shortcut and the
 * mail forwarder, which have no session. This one has the admin's own
 * session instead, because the share sheet opens the site in the browser the
 * admin is signed in to.
 */
const body = z.object({
    title: z.string().max(500).optional(),
    text: z.string().max(10_000).optional(),
    url: z.string().max(2048).optional(),
});

/** The reading runs after the response (after()), within this. */
export const maxDuration = 60;

export const POST = route({ access: 'admin', body, label: 'Shared capture' }, async ({ body: { title, text, url } }) => {
    // Apps put the link in either field, and often the title in front of it.
    const classified = classifyCapture({
        url: url?.trim() || null,
        text: [title, text].filter((part) => part && part.trim()).join('\n') || null,
    });
    if (!classified) refuse(400, 'Nothing usable was shared.');

    const capture = await prisma.capture.create({
        data: {
            kind: classified.kind,
            source: classified.source,
            sourceUrl: classified.sourceUrl,
            rawText: classified.rawText,
            note: classified.note,
            imageUrl: classified.imageUrl,
            status: 'new',
        },
        select: { id: true },
    });

    readInBackground(capture.id, classified);
    return NextResponse.json({ id: capture.id }, { status: 201 });
});
