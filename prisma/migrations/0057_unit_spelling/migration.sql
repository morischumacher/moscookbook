-- Units in stored amounts spelled one way (the owner's list), within the
-- language they were written in: "2 Tbsp" → "2 tbsp", "1 Essl." → "1 EL",
-- "200 Gramm" → "200 g", "1 cups" → "1 cup". The page spells them so on its
-- own already (lib/units unitSpelling); this makes what is stored, and so
-- what the editor and the history show, agree with it. Only the unit word
-- changes; quantities, names and anything unrecognised stay as they were.
CREATE TEMP TABLE unit_spelling (alias TEXT PRIMARY KEY, one TEXT NOT NULL, many TEXT NOT NULL);
INSERT INTO unit_spelling (alias, one, many) VALUES
    ('g', 'g', 'g'),
    ('gr', 'g', 'g'),
    ('gramm', 'g', 'g'),
    ('gram', 'g', 'g'),
    ('grams', 'g', 'g'),
    ('gramme', 'g', 'g'),
    ('grammes', 'g', 'g'),
    ('kg', 'kg', 'kg'),
    ('kilo', 'kg', 'kg'),
    ('kilogramm', 'kg', 'kg'),
    ('kilogram', 'kg', 'kg'),
    ('kilograms', 'kg', 'kg'),
    ('kilos', 'kg', 'kg'),
    ('mg', 'mg', 'mg'),
    ('milligramm', 'mg', 'mg'),
    ('milligram', 'mg', 'mg'),
    ('milligrams', 'mg', 'mg'),
    ('ml', 'ml', 'ml'),
    ('milliliter', 'ml', 'ml'),
    ('millilitre', 'ml', 'ml'),
    ('milliliters', 'ml', 'ml'),
    ('millilitres', 'ml', 'ml'),
    ('l', 'l', 'l'),
    ('ltr', 'l', 'l'),
    ('liter', 'l', 'l'),
    ('litre', 'l', 'l'),
    ('liters', 'l', 'l'),
    ('litres', 'l', 'l'),
    ('el', 'EL', 'EL'),
    ('esslöffel', 'EL', 'EL'),
    ('essloeffel', 'EL', 'EL'),
    ('tl', 'TL', 'TL'),
    ('teelöffel', 'TL', 'TL'),
    ('teeloeffel', 'TL', 'TL'),
    ('tbsp', 'tbsp', 'tbsp'),
    ('tbs', 'tbsp', 'tbsp'),
    ('tablespoon', 'tbsp', 'tbsp'),
    ('tablespoons', 'tbsp', 'tbsp'),
    ('tbl', 'tbsp', 'tbsp'),
    ('tsp', 'tsp', 'tsp'),
    ('teaspoon', 'tsp', 'tsp'),
    ('teaspoons', 'tsp', 'tsp'),
    ('tasse', 'Tasse', 'Tassen'),
    ('tassen', 'Tasse', 'Tassen'),
    ('cup', 'cup', 'cups'),
    ('cups', 'cup', 'cups'),
    ('oz', 'oz', 'oz'),
    ('ounce', 'oz', 'oz'),
    ('ounces', 'oz', 'oz'),
    ('lb', 'lb', 'lb'),
    ('lbs', 'lb', 'lb'),
    ('pound', 'lb', 'lb'),
    ('pounds', 'lb', 'lb'),
    ('prise', 'Prise', 'Prisen'),
    ('prisen', 'Prise', 'Prisen'),
    ('pinch', 'pinch', 'pinches'),
    ('pinches', 'pinch', 'pinches'),
    ('zehe', 'Zehe', 'Zehen'),
    ('zehen', 'Zehe', 'Zehen'),
    ('clove', 'clove', 'cloves'),
    ('cloves', 'clove', 'cloves');

UPDATE "Ingredient" AS i
SET
    "unit" = CASE WHEN COALESCE(i."quantityMax", i."quantity", 0) > 1 THEN s.many ELSE s.one END,
    -- The unit as a word of its own ("ca." keeps its c, "ungefähr" its g),
    -- with a full stop after it ("Tbsp.") taken along; once.
    "raw" = regexp_replace(
        i."raw",
        '(^|[^[:alpha:]])' || rtrim(i."unit", '.') || '\.?(?![[:alpha:]])',
        '\1' || (CASE WHEN COALESCE(i."quantityMax", i."quantity", 0) > 1 THEN s.many ELSE s.one END),
        'i'
    )
FROM unit_spelling AS s
WHERE i."unit" IS NOT NULL
  AND rtrim(i."unit", '.') ~ '^[[:alpha:]]+$'
  AND s.alias = lower(rtrim(i."unit", '.'))
  AND i."unit" IS DISTINCT FROM (CASE WHEN COALESCE(i."quantityMax", i."quantity", 0) > 1 THEN s.many ELSE s.one END);

DROP TABLE unit_spelling;
