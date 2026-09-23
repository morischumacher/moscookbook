-- More than one category and one cuisine per recipe, and how hot it is.
ALTER TABLE "Recipe" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Recipe" ADD COLUMN "cuisines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Recipe" ADD COLUMN "spiciness" INTEGER NOT NULL DEFAULT 0;

UPDATE "Recipe" SET "categories" = ARRAY["category"] WHERE coalesce("category", '') <> '';
UPDATE "Recipe" SET "cuisines" = ARRAY["nationality"] WHERE coalesce("nationality", '') <> '';

CREATE INDEX "Recipe_categories_idx" ON "Recipe" USING GIN ("categories");
CREATE INDEX "Recipe_cuisines_idx" ON "Recipe" USING GIN ("cuisines");

-- The single columns stay, as "the first one": imports, the archive and the
-- structured data for search engines read and write them. This keeps the two
-- in step whichever side a writer touched, so no writer has to know:
--   * the list was written → the single column is its first entry;
--   * only the single column was written → it becomes the first entry of the
--     list, replacing what was first before.
CREATE OR REPLACE FUNCTION recipe_keep_lists_in_step() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."categories" IS NOT DISTINCT FROM OLD."categories"
       AND NEW."category" IS DISTINCT FROM OLD."category" THEN
        NEW."categories" := CASE
            WHEN coalesce(NEW."category", '') = '' THEN coalesce(OLD."categories"[2:], ARRAY[]::TEXT[])
            ELSE array_prepend(NEW."category", array_remove(coalesce(OLD."categories"[2:], ARRAY[]::TEXT[]), NEW."category"))
        END;
    ELSIF TG_OP = 'INSERT' AND cardinality(NEW."categories") = 0 AND coalesce(NEW."category", '') <> '' THEN
        NEW."categories" := ARRAY[NEW."category"];
    END IF;
    NEW."category" := NULLIF(NEW."categories"[1], '');

    IF TG_OP = 'UPDATE' AND NEW."cuisines" IS NOT DISTINCT FROM OLD."cuisines"
       AND NEW."nationality" IS DISTINCT FROM OLD."nationality" THEN
        NEW."cuisines" := CASE
            WHEN coalesce(NEW."nationality", '') = '' THEN coalesce(OLD."cuisines"[2:], ARRAY[]::TEXT[])
            ELSE array_prepend(NEW."nationality", array_remove(coalesce(OLD."cuisines"[2:], ARRAY[]::TEXT[]), NEW."nationality"))
        END;
    ELSIF TG_OP = 'INSERT' AND cardinality(NEW."cuisines") = 0 AND coalesce(NEW."nationality", '') <> '' THEN
        NEW."cuisines" := ARRAY[NEW."nationality"];
    END IF;
    NEW."nationality" := NULLIF(NEW."cuisines"[1], '');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Recipe_keep_lists_in_step"
BEFORE INSERT OR UPDATE ON "Recipe"
FOR EACH ROW EXECUTE FUNCTION recipe_keep_lists_in_step();
