-- German ingredient names with a capital first letter, as a German list writes
-- them ("Rote Zwiebeln"); new ones are kept so by lib/ingredientNames germanName.
-- The keys are folded to lower case, so matching is unchanged.
UPDATE "IngredientItem"
SET "de" = upper(left("de", 1)) || substr("de", 2)
WHERE "de" ~ '^[a-zäöüß]';
