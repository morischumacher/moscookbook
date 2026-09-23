-- The "Green Curry" recipe was saved with a method and no ingredients, which
-- left it with nothing to shop for, scale or tick off in cook mode. These
-- follow its method (oil, paste, coconut milk, protein, stock, vegetables,
-- lime leaves, fish sauce, sugar, rice). Only when it still has none: a
-- recipe somebody has since filled in by hand is left alone.
WITH target AS (
    SELECT r.id FROM "Recipe" r
    WHERE lower(trim(r.title)) = 'green curry'
      AND NOT EXISTS (SELECT 1 FROM "Ingredient" i WHERE i."recipeId" = r.id)
), added AS (
    INSERT INTO "Ingredient" ("recipeId", "position", "quantity", "unit", "name", "raw")
    SELECT target.id, v.position, v.quantity, v.unit, v.name, v.raw
    FROM target
    CROSS JOIN (VALUES
        (0, 2::double precision, 'tbsp', 'vegetable oil', '2 tbsp'),
        (1, 3::double precision, 'tbsp', 'green curry paste', '3 tbsp'),
        (2, 400::double precision, 'ml', 'coconut milk', '400 ml'),
        (3, 400::double precision, 'g', 'chicken breast or firm tofu, sliced', '400 g'),
        (4, 150::double precision, 'ml', 'water or chicken stock', '150 ml'),
        (5, 1::double precision, NULL, 'red bell pepper, sliced', '1'),
        (6, 150::double precision, 'g', 'green beans or snow peas', '150 g'),
        (7, 1::double precision, NULL, 'small courgette, sliced', '1'),
        (8, 4::double precision, NULL, 'kaffir lime leaves', '4'),
        (9, 2::double precision, 'tbsp', 'fish sauce', '2 tbsp'),
        (10, 1::double precision, 'tsp', 'palm or brown sugar', '1 tsp'),
        (11, 1::double precision, 'handful', 'Thai basil', '1 handful'),
        (12, 300::double precision, 'g', 'jasmine rice, to serve', '300 g')
    ) AS v(position, quantity, unit, name, raw)
    RETURNING "recipeId"
)
UPDATE "Recipe"
SET "searchBody" = trim("searchBody" || ' vegetable oil green curry paste coconut milk chicken breast firm tofu water chicken stock red bell pepper green beans snow peas courgette kaffir lime leaves fish sauce palm brown sugar thai basil jasmine rice'),
    "servings" = COALESCE("servings", 4)
WHERE id IN (SELECT DISTINCT "recipeId" FROM added);
