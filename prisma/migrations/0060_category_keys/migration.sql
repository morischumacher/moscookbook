-- Categories and cuisines by their one key: "Appetizer" and "Vorspeise" are one filter chip
-- (lib/recipeLabels canonicalCategory / canonicalCuisine; new saves are kept in line there).
CREATE TEMP TABLE category_synonym (syn text PRIMARY KEY, key text NOT NULL) ON COMMIT DROP;
INSERT INTO category_synonym VALUES
  ('appetizer','Starter'),
  ('appetizers','Starter'),
  ('starter','Starter'),
  ('starters','Starter'),
  ('vorspeise','Starter'),
  ('vorspeisen','Starter'),
  ('antipasti','Starter'),
  ('side','Side'),
  ('sides','Side'),
  ('side dish','Side'),
  ('side dishes','Side'),
  ('beilage','Side'),
  ('beilagen','Side'),
  ('main','Main'),
  ('main course','Main'),
  ('main dish','Main'),
  ('mains','Main'),
  ('entree','Main'),
  ('hauptgericht','Main'),
  ('hauptspeise','Main'),
  ('hauptgerichte','Main'),
  ('breakfast','Breakfast'),
  ('brunch','Breakfast'),
  ('frühstück','Breakfast'),
  ('lunch','Lunch'),
  ('mittagessen','Lunch'),
  ('dinner','Dinner'),
  ('abendessen','Dinner'),
  ('abendbrot','Dinner'),
  ('soup','Soup'),
  ('soups','Soup'),
  ('suppe','Soup'),
  ('suppen','Soup'),
  ('eintopf','Soup'),
  ('stew','Soup'),
  ('salad','Salad'),
  ('salads','Salad'),
  ('salat','Salad'),
  ('salate','Salad'),
  ('dessert','Dessert'),
  ('desserts','Dessert'),
  ('nachtisch','Dessert'),
  ('nachspeise','Dessert'),
  ('süßspeise','Dessert'),
  ('baking','Baking'),
  ('backen','Baking'),
  ('gebäck','Baking'),
  ('kuchen','Baking'),
  ('cake','Baking'),
  ('cakes','Baking'),
  ('bread','Bread'),
  ('breads','Bread'),
  ('brot','Bread'),
  ('snack','Snack'),
  ('snacks','Snack'),
  ('fingerfood','Snack'),
  ('sauce','Sauce'),
  ('sauces','Sauce'),
  ('soße','Sauce'),
  ('sosse','Sauce'),
  ('soße & dip','Sauce'),
  ('dip','Sauce'),
  ('dips','Sauce'),
  ('dressing','Sauce'),
  ('seasoning','Seasoning'),
  ('seasonings','Seasoning'),
  ('condiment','Seasoning'),
  ('condiments','Seasoning'),
  ('gewürz','Seasoning'),
  ('gewürzmischung','Seasoning'),
  ('würzmittel','Seasoning'),
  ('spice mix','Seasoning'),
  ('würze & gewürzmischung','Seasoning'),
  ('drink','Drink'),
  ('drinks','Drink'),
  ('beverage','Drink'),
  ('getränk','Drink'),
  ('getränke','Drink'),
  ('cocktail','Drink');

UPDATE "Recipe" r SET "categories" = sub.arr, "category" = sub.arr[1]
FROM (
  SELECT id, ARRAY(
    SELECT x FROM (
      SELECT COALESCE(m.key, btrim(u.v)) AS x, min(u.ord) AS o
      FROM unnest("categories") WITH ORDINALITY AS u(v, ord)
      LEFT JOIN category_synonym m ON m.syn = lower(btrim(u.v))
      WHERE btrim(u.v) <> ''
      GROUP BY 1
    ) t ORDER BY o
  ) AS arr
  FROM "Recipe"
) sub
WHERE r.id = sub.id AND r."categories" IS DISTINCT FROM sub.arr;

CREATE TEMP TABLE cuisine_synonym (syn text PRIMARY KEY, key text NOT NULL) ON COMMIT DROP;
INSERT INTO cuisine_synonym VALUES
  ('deutsch','German'),
  ('german','German'),
  ('österreichisch','Austrian'),
  ('austrian','Austrian'),
  ('italienisch','Italian'),
  ('italian','Italian'),
  ('französisch','French'),
  ('french','French'),
  ('spanisch','Spanish'),
  ('spanish','Spanish'),
  ('griechisch','Greek'),
  ('greek','Greek'),
  ('türkisch','Turkish'),
  ('turkish','Turkish'),
  ('orientalisch','Middle Eastern'),
  ('middle eastern','Middle Eastern'),
  ('nahöstlich','Middle Eastern'),
  ('indisch','Indian'),
  ('indian','Indian'),
  ('thailändisch','Thai'),
  ('thai','Thai'),
  ('vietnamesisch','Vietnamese'),
  ('vietnamese','Vietnamese'),
  ('chinesisch','Chinese'),
  ('chinese','Chinese'),
  ('japanisch','Japanese'),
  ('japanese','Japanese'),
  ('koreanisch','Korean'),
  ('korean','Korean'),
  ('asiatisch','Asian'),
  ('asian','Asian'),
  ('mexikanisch','Mexican'),
  ('mexican','Mexican'),
  ('amerikanisch','American'),
  ('american','American');

UPDATE "Recipe" r SET "cuisines" = sub.arr, "nationality" = sub.arr[1]
FROM (
  SELECT id, ARRAY(
    SELECT x FROM (
      SELECT COALESCE(m.key, btrim(u.v)) AS x, min(u.ord) AS o
      FROM unnest("cuisines") WITH ORDINALITY AS u(v, ord)
      LEFT JOIN cuisine_synonym m ON m.syn = lower(btrim(u.v))
      WHERE btrim(u.v) <> ''
      GROUP BY 1
    ) t ORDER BY o
  ) AS arr
  FROM "Recipe"
) sub
WHERE r.id = sub.id AND r."cuisines" IS DISTINCT FROM sub.arr;
