-- A first and a last name.
--
-- `name` stays the display field, written from the two parts, so nothing that
-- reads a name has to change. The parts are backfilled from what is already
-- there, which is a guess — and an acceptable one, because the displayed name
-- is unchanged either way and the parts are only shown back to the person in a
-- form they can correct.

ALTER TABLE "User" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "lastName"  TEXT NOT NULL DEFAULT '';

-- Split at the last space. A name with no space at all keeps all of it as the
-- first name rather than inventing a surname out of nothing.
--
-- One known difference from splitName() in src/lib/personName.ts, which the
-- application uses: that one recognises particles, so "Anna von Bergen" gives
-- "Anna" and "von Bergen". This gives "Anna von" and "Bergen". Reproducing
-- particle handling in SQL for the handful of rows that exist when this runs
-- is not worth it — the displayed name is identical either way, and the parts
-- appear in a form where they can be corrected.
UPDATE "User"
SET "firstName" = CASE
        WHEN position(' ' IN btrim("name")) = 0 THEN btrim("name")
        ELSE btrim(left(btrim("name"), length(btrim("name")) - position(' ' IN reverse(btrim("name")))))
    END,
    "lastName" = CASE
        WHEN position(' ' IN btrim("name")) = 0 THEN ''
        ELSE btrim(right(btrim("name"), position(' ' IN reverse(btrim("name"))) - 1))
    END;
