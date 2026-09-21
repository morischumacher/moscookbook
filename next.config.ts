import type { NextConfig } from "next";

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
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
