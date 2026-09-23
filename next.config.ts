import type { NextConfig } from "next";

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * The headers every response carries.
 *
 * There were none. Not one — no frame protection, no nosniff, no referrer
 * policy — which meant the admin screens could be framed by any page, and a
 * password-reset link with its token in the query string sent that token
 * along as a referrer to anything the reset page happened to load.
 *
 * What is here and why:
 *
 * `Referrer-Policy: no-referrer`. Two flows put a secret in the URL — the
 * reset link and the invitation link — and nothing on this site reads a
 * referrer. The strictest value costs nothing.
 *
 * `X-Frame-Options: DENY` and `frame-ancestors 'none'`: nobody has a reason
 * to embed this site, and an admin page inside somebody else's iframe is the
 * standard clickjacking setup.
 *
 * `X-Content-Type-Options: nosniff`: uploads are stored under the type the
 * uploader declared, on a separate origin, but a browser that refuses to
 * guess is one fewer thing to reason about.
 *
 * The Content-Security-Policy is deliberately partial. `frame-ancestors`,
 * `base-uri`, `form-action` and `object-src` are the directives that do not
 * touch script or style loading and cannot break a page; they are set. A
 * `script-src` without `'unsafe-inline'` needs a nonce threaded through the
 * proxy into every inline script the framework emits, and that is a change
 * to verify in a browser rather than ship blind. It is the next step, not
 * this one.
 *
 * HSTS is set by the platform in front of this and repeated here so the
 * configuration is true on its own.
 */
const SECURITY_HEADERS = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

/**
 * The one Blob store this site's pictures live in.
 *
 * The optimizer used to accept `*.public.blob.vercel-storage.com` — every
 * Vercel customer's store — so anybody could have `/_next/image` fetch,
 * resize and cache their pictures on this project's bill. The store's id is
 * the fourth part of its token (`vercel_blob_rw_<storeId>_<secret>`), which is
 * exactly how @vercel/blob itself builds a store's address; the token is
 * there at build time wherever the site is deployed. Without one (a fresh
 * checkout) it falls back to the wildcard, since nothing is being served.
 */
function blobHostname(): string {
    const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split('_')[3];
    return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : '*.public.blob.vercel-storage.com';
}

const nextConfig: NextConfig = {
  // The work list's prompt is read from the repository at run time.
  outputFileTracingIncludes: {
    '/api/work-items/prompt': ['./docs/work-list-prompt.md'],
  },

  // Where a password manager sends you to change this site's password:
  // 1Password, iCloud Keychain and Chrome all look for this address.
  async redirects() {
    return [{ source: '/.well-known/change-password', destination: '/de/account', permanent: false }];
  },

  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: blobHostname(),
        port: '',
      },
    ],

    /*
     * The image optimizer is billed per source image per (width, quality), and
     * the defaults offer sixteen widths — so one photograph shown as a tile, a
     * thumbnail, a strip and a hero quietly becomes several separate
     * transformations, each one paid for again when its cache expires.
     *
     * These are the widths this site actually asks for, read off the `sizes`
     * attributes: 45vw and 320px tiles, 48px and 80px thumbnails, and a hero
     * capped at a 672px column (so 640 and 1200 for retina). A width that is
     * not in the list is rounded up to the next one, which costs a few
     * kilobytes and saves a transformation.
     *
     * A month is the cache floor rather than the default minute: a recipe
     * photograph does not change, and when one does its URL changes with it,
     * because uploads are written under a fresh name every time.
     */
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [48, 80, 96, 128, 256, 320],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default withNextIntl(nextConfig);
