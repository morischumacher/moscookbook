-- A face beside a name.
--
-- The cooking log shows who made a dish and when, and until now "who" was a
-- name in small capitals. A round picture is read before the text under it,
-- which is the whole point in a list of evenings: at a glance you can see it
-- was Anna twice and you once, without reading anything.
--
-- Nullable, and most accounts will stay that way. An interface that looks
-- unfinished without a profile picture is one that nags people into uploading
-- something, and the initials it falls back to are a perfectly good answer.

ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
