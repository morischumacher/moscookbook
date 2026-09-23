-- Further screenshots of the same share (a post and its comments), read together with the first.
ALTER TABLE "Capture" ADD COLUMN "moreImageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
