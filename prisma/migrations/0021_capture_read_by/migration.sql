-- How a draft was read, recorded on the capture.
--
-- Nullable and with no default: a row written before this column existed did
-- not record it, and saying "rules" about a draft nobody watched being made
-- would be a guess written into a field whose entire purpose is not guessing.
-- The inbox shows nothing for a null, which is the truth.

ALTER TABLE "Capture" ADD COLUMN "readBy" TEXT;
ALTER TABLE "Capture" ADD COLUMN "aiProvider" TEXT;
