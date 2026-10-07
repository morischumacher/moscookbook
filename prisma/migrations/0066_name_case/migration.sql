-- Further names kept per language, so neither has to be told apart by its capitals:
-- the English ones (written in lower case until now) move to "enAliases".
ALTER TABLE "IngredientItem" ADD COLUMN "enAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "IngredientItem" SET
  "enAliases" = COALESCE(ARRAY(SELECT a FROM unnest("aliases") a WHERE a !~ '(^|[\s-])[A-ZÄÖÜ]'), ARRAY[]::TEXT[]),
  "aliases"   = COALESCE(ARRAY(SELECT a FROM unnest("aliases") a WHERE a ~ '(^|[\s-])[A-ZÄÖÜ]'), ARRAY[]::TEXT[]);

-- Every name starts with a capital, in both languages: "Gochugaru" / "Gochugaru".
CREATE FUNCTION pg_temp.cap(t TEXT) RETURNS TEXT AS $$ SELECT upper(left(t, 1)) || substr(t, 2) $$ LANGUAGE SQL IMMUTABLE;
UPDATE "IngredientItem" SET
  "de" = pg_temp.cap("de"),
  "en" = pg_temp.cap("en"),
  "aliases" = COALESCE(ARRAY(SELECT pg_temp.cap(a) FROM unnest("aliases") a), ARRAY[]::TEXT[]),
  "enAliases" = COALESCE(ARRAY(SELECT pg_temp.cap(a) FROM unnest("enAliases") a), ARRAY[]::TEXT[]);
