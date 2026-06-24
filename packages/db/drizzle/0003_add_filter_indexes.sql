-- Migration: 0003_add_filter_indexes
-- Adds covering indexes for structured dish filter queries:
--   ingredient: matches dish_ingredients(dish_id, ingredient_id)
--   technique:  matches dish_preparations(dish_id, method_id)
--   region:     matches geo_entities hierarchy + dish_variants(parent_dish_id)
-- Also adds geoEntities name index for origin: / region: lookups.

-- dish_ingredients: ingredient lookup (for ingredient:X filter)
CREATE INDEX IF NOT EXISTS dish_ingredients_dish_id_idx ON dish_ingredients(dish_id);
CREATE INDEX IF NOT EXISTS dish_ingredients_ingredient_id_idx ON dish_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS dish_ingredients_composite_idx ON dish_ingredients(dish_id, ingredient_id);

-- dish_preparations: technique lookup (for technique:X filter)
CREATE INDEX IF NOT EXISTS dish_preparations_dish_id_idx ON dish_preparations(dish_id);
CREATE INDEX IF NOT EXISTS dish_preparations_method_id_idx ON dish_preparations(method_id);
CREATE INDEX IF NOT EXISTS dish_preparations_composite_idx ON dish_preparations(dish_id, method_id);

-- dish_variants: parent lookup (for variant / regional origin filtering)
CREATE INDEX IF NOT EXISTS dish_variants_parent_dish_id_idx ON dish_variants(parent_dish_id);
CREATE INDEX IF NOT EXISTS dish_variants_region_geo_id_idx ON dish_variants(region_geo_id);

-- geo_entities: name + hierarchy lookups (for origin:X / region:X filters)
CREATE INDEX IF NOT EXISTS geo_entities_name_idx ON geo_entities(name);
CREATE INDEX IF NOT EXISTS geo_entities_parent_id_idx ON geo_entities(parent_id);
CREATE INDEX IF NOT EXISTS geo_entities_entity_type_idx ON geo_entities(entity_type);

-- ingredients: name index for ingredient:X lookups
CREATE INDEX IF NOT EXISTS ingredients_name_idx ON ingredients(name);

-- preparation_methods: name + slug indexes for technique:X lookups
CREATE INDEX IF NOT EXISTS preparation_methods_slug_idx ON preparation_methods(slug);
CREATE INDEX IF NOT EXISTS preparation_methods_name_idx ON preparation_methods(name);
