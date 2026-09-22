-- Captures whose "address" is a recipe.
--
-- The shortcut on a phone posts Shortcut Input into a field called `url`,
-- because that is the field it was built with. From Safari that is a link;
-- from Apple Notes it is the note. Until 049f62e the prose went straight into
-- `sourceUrl`, the capture was classified as a link, and the pipeline went off
-- to fetch a page whose address was "Kimchi Zutaten / Asimarkt / 2-3 Napa
-- cabbage…". Those rows are sitting in inboxes marked `failed`, with the
-- recipe they were complaining about inside them.
--
-- The code no longer creates them. This recovers the ones that exist.
--
-- Published rows are left alone: they already became a recipe, and rewriting
-- the capture they came from would edit a record of something that worked.

UPDATE "Capture"
SET
    -- The text is put in front of whatever else arrived rather than replacing
    -- it: a share that filled in both fields should not lose one of them.
    "rawText" = CASE
        WHEN "rawText" IS NULL OR "rawText" = '' THEN "sourceUrl"
        ELSE "sourceUrl" || E'\n\n' || "rawText"
    END,
    "sourceUrl" = NULL,
    "kind" = 'text',
    -- 'note' unless it arrived by mail, which is still where it came from.
    "source" = CASE WHEN "source" = 'email' THEN 'email' ELSE 'note' END,
    -- Back to the front of the queue, unparsed. The inbox's own retry does the
    -- reading; doing it here would mean a migration that makes network calls.
    "status" = 'new',
    "error" = NULL,
    "readBy" = NULL,
    "aiProvider" = NULL,
    "processedAt" = NULL
WHERE
    "sourceUrl" IS NOT NULL
    AND "status" <> 'published'
    -- Not a URL: anything with whitespace in it, or without a scheme.
    AND "sourceUrl" !~ '^https?://[^[:space:]]+$';
