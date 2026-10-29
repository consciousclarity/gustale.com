#!/usr/bin/env python3
"""Build the GUS-242 step 1f vocabulary seed.

Three controlled vocabularies, grown to the sizes the GUS-242 plan set:
  families              28 -> 120-180   (with a parent_id HIERARCHY)
  techniques            26 -> ~60-90
  ingredient_categories 55 -> ~250-400  (built separately — FoodOn-derived)

Cross-referenced against FoodOn + Wikidata P279 — IDENTIFIERS ONLY. The
labels and definitions below are the project's own.

The stress-set decisions that constrain the VALUES are in
.hermes/REPORTS/GUS-242-1f-vocabulary-spec.md. The load-bearing ones:

  * composed_of = the relation `has_component`, plus a FAMILY value for a
    meal-set. ONLY five: Thali, Rijsttafel, Meze, Banchan, Nasi Campur.
  * budae-jjigae = stew; chop suey = stir-fry; potjiekos = stew.
  * Legal status is a CLAIM (ADR-002 predicate legal_status), so 1f adds
    NO vocabulary for it. ajvar -> protected_designation is a statement.
  * Context value `tableside` (hot pot, fondue, raclette, samgyeopsal;
    NOT caesar).
  * Pilaf = one dish + variants + a variant qualifier. NO form dimension.
  * No food/drink "both": cendol = dessert; bubble tea / champurrado out
    of scope for 1f.

HIERARCHY
---------
The families are a TWO-LEVEL tree: a coarse GROUP, and the specific values
under it. `parent_id` points at the group. The groups are the 28 that
already exist in the live database (bread, dessert, stew, ...) — so 1f
EXTENDS the existing vocabulary rather than replacing it. Every group below
must match a slug already in `dish_families`.

Output: /tmp/vocab_1f.json
"""

import json
from pathlib import Path

OUT = Path("/tmp/vocab_1f.json")

# The 28 families already live in the database; they become the GROUPS.
EXISTING_GROUPS = {
    "bread", "breaded-cutlet", "casserole", "curry", "dessert", "dumpling",
    "egg-dish", "fermented-dish", "filled-pastry", "fried-rice", "fritter",
    "kebab", "moussaka", "noodle-soup", "pancake", "pasta", "porridge",
    "rice-dish", "salad", "sandwich", "sauce", "side-dish", "soup", "stew",
    "stiff-porridge", "street-snack", "stuffed-vegetable", "taco",
}

# (slug, name, description, group)
FAMILIES = [
    # --- intermediate groups -------------------------------------------
    # These are NEW families that themselves parent other new families, so
    # the tree has real depth rather than one flat level under the 28
    # existing groups.
    ("beverage", "Beverage", "A drink, whether hot, cold, alcoholic or fermented.", "side-dish"),
    ("alcoholic-drink", "Alcoholic Drink", "A fermented or distilled alcoholic drink.", "beverage"),
    ("spirit", "Spirit", "A distilled alcoholic drink.", "alcoholic-drink"),
    ("fermented-drink", "Fermented Drink", "A non-alcoholic drink made by fermentation.", "beverage"),
    ("confection", "Confection", "A small sweet made to be eaten as a treat.", "dessert"),
    ("frozen-dessert", "Frozen Dessert", "A dessert made by freezing a mixture.", "dessert"),
    ("indian-sweet", "Indian Sweet", "A sweet of the Indian subcontinent, usually set or fried in syrup.", "dessert"),
    ("preserved-vegetable", "Preserved Vegetable", "A vegetable preserved in vinegar, brine or salt.", "fermented-dish"),
    ("fermented-vegetable", "Fermented Vegetable", "A vegetable dish whose character comes from fermentation.", "fermented-dish"),
    ("fermented-soy", "Fermented Soy", "A preparation made from fermented soybeans or soy paste.", "fermented-dish"),
    ("cured-meat", "Cured Meat", "Meat preserved by salt, sugar or smoke.", "fermented-dish"),

    # --- the five meal-sets (composed_of families) --------------------
    ("thali", "Thali", "A South Indian meal assembled from many small bowls served together on a plate.", "side-dish"),
    ("rijsttafel", "Rijsttafel", "A Dutch meal of many small dishes shared at the table.", "side-dish"),
    ("meze", "Meze", "An assortment of small dishes served as a course, shared at the table.", "side-dish"),
    ("banchan", "Banchan", "The Korean table of small accompanying dishes served with a meal.", "side-dish"),
    ("nasi-campur", "Nasi Campur", "An Indonesian rice plate served with a range of small side dishes.", "side-dish"),

    # --- breads -------------------------------------------------------
    ("flatbread", "Flatbread", "An unleavened or lightly leavened flat bread, baked on a hot surface.", "bread"),
    ("baked-bread", "Baked Bread", "A bread leavened and baked in an enclosed oven.", "bread"),
    ("steamed-bread", "Steamed Bread", "A bread leavened and steamed rather than baked.", "bread"),
    ("frybread", "Frybread", "A flat bread fried in fat.", "bread"),
    ("bread-roll", "Bread Roll", "A small, round, soft leavened bread.", "bread"),
    ("baguette", "Baguette", "A long, thin crusty bread.", "bread"),
    ("pita", "Pita", "A flatbread pocket, traditionally baked and allowed to puff.", "bread"),
    ("naan", "Naan", "A leavened flatbread cooked in a tandoor.", "bread"),
    ("tortilla", "Tortilla", "A thin flatbread of maize or wheat.", "bread"),
    ("bannock", "Bannock", "A round, dense, unleavened oat or barley cake.", "bread"),
    ("cracker", "Cracker", "A thin, crisp, dry biscuit.", "bread"),
    ("wafer", "Wafer", "A thin, crisp, often layered sweet wafer.", "bread"),
    ("pretzel", "Pretzel", "A knot or twist of baked dough, traditionally lye-treated.", "bread"),

    # --- rice ---------------------------------------------------------
    ("plain-rice", "Plain Rice", "Cooked rice served as the staple, with no other preparation.", "rice-dish"),
    ("rice-balls", "Rice Balls", "Cooked rice shaped into balls or pressed into forms.", "rice-dish"),
    ("risotto", "Risotto", "Rice slowly cooked in stock until creamy.", "rice-dish"),
    ("biryani", "Biryani", "Spiced rice and meat or vegetables cooked together by the dum method.", "rice-dish"),
    ("pilaf", "Pilaf", "Rice cooked in fat and stock so the grains separate and take colour.", "rice-dish"),
    ("pulao", "Pulao", "Whole spices and rice cooked together in seasoned stock.", "rice-dish"),
    ("congee", "Congee", "Rice cooked in a large amount of water into a thin porridge.", "rice-dish"),
    ("sticky-rice", "Sticky Rice", "Rice cooked so the grains stick together.", "rice-dish"),

    # --- noodles and pasta --------------------------------------------
    ("rice-noodle", "Rice Noodle", "A noodle made from rice flour.", "noodle-soup"),
    ("noodle-dish", "Noodle Dish", "Noodles as the base of a dressed or stir-fried dish.", "noodle-soup"),
    ("ramen", "Ramen", "A Japanese noodle bowl built on broth, noodles and toppings.", "noodle-soup"),
    ("pho", "Pho", "A Vietnamese noodle soup of beef or chicken in a clear aromatic broth.", "noodle-soup"),
    ("laksa", "Laksa", "A Southeast Asian noodle soup in a spiced coconut or fish broth.", "noodle-soup"),
    ("dough", "Dough", "A worked mixture of flour and liquid, for bread, pastry or noodles.", "pasta"),
    ("pie", "Pie", "A filling enclosed in a pastry crust and baked.", "filled-pastry"),
    ("tart", "Tart", "A shallow pastry case with a filling, baked.", "filled-pastry"),
    ("crepe", "Crepe", "A very thin pancake cooked on a hot flat surface.", "pancake"),
    ("waffle", "Waffle", "A batter cake cooked in a moulded iron.", "pancake"),

    # --- soups, stews and stocks --------------------------------------
    ("hot-pot", "Hot Pot", "A dish served at the table from a communal pot of simmering broth.", "soup"),
    ("fondue", "Fondue", "A dish served at the table by dipping into a shared melted or liquid base.", "soup"),
    ("broth", "Broth", "A clear, thin stock served on its own.", "soup"),
    ("bouillon", "Bouillon", "A concentrated stock, usually clarified and seasoned.", "soup"),
    ("bisque", "Bisque", "A smooth thick soup, classically of seafood.", "soup"),
    ("chowder", "Chowder", "A thick soup of seafood or vegetables, classically with milk or cream.", "soup"),
    ("minestrone", "Minestrone", "An Italian vegetable and pasta soup.", "soup"),
    ("chili", "Chili", "A stew of meat or beans seasoned with chiles.", "stew"),
    ("shakshuka", "Shakshuka", "Eggs poached in a spiced tomato and pepper sauce.", "stew"),
    ("potjiekos", "Potjiekos", "A South African stew of meat and vegetables cooked slowly in a three-pot arrangement.", "stew"),
    ("budae-jjigae", "Budae-jjigae", "A Korean army-base stew of meat, sausages and noodles in a spicy broth.", "stew"),

    # --- porridges and grains ------------------------------------------
    ("polenta", "Polenta", "A cooked maize porridge, soft or set and sliced.", "porridge"),
    ("couscous", "Couscous", "Steamed small grains of wheat semolina, served as a base or with a stew.", "porridge"),
    ("muesli", "Muesli", "A dry mixture of toasted grains, fruit and nuts eaten with milk.", "porridge"),
    ("granola", "Granola", "A baked, sweetened, clustered mixture of oats and nuts.", "porridge"),
    ("rice-porridge", "Rice Porridge", "Rice cooked in water until it breaks down into a soft porridge.", "porridge"),
    ("rice-congee", "Rice Congee", "Rice cooked in a large amount of water into a thin porridge.", "stiff-porridge"),

    # --- vegetables ---------------------------------------------------
    ("roasted-vegetable", "Roasted Vegetable", "Vegetables roasted until browned and sweet.", "stuffed-vegetable"),
    ("grilled-vegetable", "Grilled Vegetable", "Vegetables grilled over direct heat.", "stuffed-vegetable"),
    ("fried-vegetable", "Fried Vegetable", "Vegetables fried until crisp.", "stuffed-vegetable"),
    ("pickled-vegetable", "Pickled Vegetable", "Vegetables preserved in vinegar or brine.", "stuffed-vegetable"),
    ("leafy-green", "Leafy Green", "A dish built around leaves, raw or cooked.", "stuffed-vegetable"),
    ("mushroom-dish", "Mushroom Dish", "A dish in which mushrooms are the principal ingredient.", "stuffed-vegetable"),
    ("root-vegetable", "Root Vegetable", "A dish built around a root vegetable.", "stuffed-vegetable"),
    ("legume-dish", "Legume Dish", "A dish built around pulses - beans, lentils, peas.", "stuffed-vegetable"),
    ("tofu-dish", "Tofu Dish", "A dish built around tofu or another soy curd.", "stuffed-vegetable"),
    ("vegetable-tart", "Vegetable Tart", "A tart with a vegetable filling.", "filled-pastry"),
    ("vegetable-curry", "Vegetable Curry", "A curry with no meat, only vegetables.", "curry"),
    ("pickled-salad", "Pickled Salad", "A salad of pickled vegetables.", "salad"),

    # --- meats --------------------------------------------------------
    ("grilled-meat", "Grilled Meat", "Meat cooked over direct heat.", "kebab"),
    ("roast-meat", "Roast Meat", "A large joint of meat roasted.", "kebab"),
    ("braised-meat", "Braised Meat", "Meat cooked slowly in liquid until very tender.", "stew"),
    ("fried-chicken", "Fried Chicken", "Chicken coated and fried.", "fritter"),
    ("roast-chicken", "Roast Chicken", "Chicken roasted whole.", "kebab"),
    ("braised-poultry", "Braised Poultry", "Poultry cooked slowly in liquid.", "stew"),
    ("dried-meat", "Dried Meat", "Meat preserved by drying.", "fermented-dish"),
    ("sausage", "Sausage", "Seasoned meat in a casing.", "kebab"),
    ("meatball", "Meatball", "Minced meat shaped into a ball or roll.", "kebab"),
    ("meatloaf", "Meatloaf", "A baked loaf of minced meat with a seasoned mixture.", "kebab"),
    ("offal", "Offal", "A dish of organ meat.", "kebab"),
    ("game", "Game", "A dish of wild game.", "kebab"),
    ("bacon", "Bacon", "Cured pork belly, sliced or cubed.", "cured-meat"),
    ("ham", "Ham", "Cured leg of pork.", "cured-meat"),
    ("prosciutto", "Prosciutto", "Cured, dry-aged, thinly sliced pork.", "cured-meat"),

    # --- fish and seafood ---------------------------------------------
    ("grilled-fish", "Grilled Fish", "Fish cooked over direct heat.", "kebab"),
    ("fried-fish", "Fried Fish", "Fish coated and fried.", "fritter"),
    ("steamed-fish", "Steamed Fish", "Fish cooked by steam.", "casserole"),
    ("raw-fish", "Raw Fish", "Fish served uncooked.", "salad"),
    ("cured-fish", "Cured Fish", "Fish preserved by salt or smoke.", "fermented-dish"),
    ("shellfish", "Shellfish", "A dish of molluscs or crustaceans.", "kebab"),
    ("fish-soup", "Fish Soup", "A soup whose principal ingredient is fish.", "soup"),

    # --- eggs ---------------------------------------------------------
    ("omelette", "Omelette", "Whipped eggs cooked into a folded or flat omelette.", "egg-dish"),
    ("boiled-egg", "Boiled Egg", "Egg cooked in its shell.", "egg-dish"),
    ("scrambled-egg", "Scrambled Egg", "Eggs beaten and gently cooked into curds.", "egg-dish"),
    ("egg-tart", "Egg Tart", "A tart with a custard of eggs.", "filled-pastry"),
    ("custard", "Custard", "A set egg-and-milk preparation, sweet or savoury.", "dessert"),

    # --- breads as a course / sandwiches ------------------------------
    ("burger", "Burger", "A patty of minced meat in a bun.", "sandwich"),
    ("hot-dog", "Hot Dog", "A sausage in a long bun.", "sandwich"),
    ("burrito", "Burrito", "A wheat tortilla wrapped around a filling.", "taco"),
    ("wrap", "Wrap", "A flatbread or tortilla rolled around a filling.", "taco"),
    ("quesadilla", "Quesadilla", "A folded wheat tortilla with a cheese filling, grilled.", "taco"),
    ("panini", "Panini", "A sandwich pressed on a grill.", "sandwich"),
    ("open-faced-sandwich", "Open-faced Sandwich", "A topping on a single slice of bread, without a top slice.", "sandwich"),

    # --- fried and battered -------------------------------------------
    ("tempura", "Tempura", "A light batter of flour and egg, fried crisp.", "fritter"),
    ("falafel", "Falafel", "A fried ball or patty of pulsed chickpeas or fava beans.", "fritter"),
    ("donut", "Donut", "A ring or ball of leavened dough, fried.", "fritter"),
    ("beignet", "Beignet", "A square of fried, yeast-raised dough.", "fritter"),
    ("samosa", "Samosa", "A crisp, folded pastry triangle with a filling.", "fritter"),
    ("pakora", "Pakora", "A battered vegetable or piece, fried.", "fritter"),
    ("nugget", "Nugget", "A small, breaded or battered piece of food.", "breaded-cutlet"),
    ("croquette", "Croquette", "A shaped, coated and fried or baked shell with a filling.", "breaded-cutlet"),
    ("arancini", "Arancini", "A breaded, fried rice ball filled with a centre.", "breaded-cutlet"),
    ("onion-ring", "Onion Ring", "A ring of onion in batter, fried.", "fritter"),
    ("chips", "Chips", "Slices of potato fried crisp.", "side-dish"),
    ("french-fries", "French Fries", "Cut sticks of potato fried or baked crisp.", "side-dish"),
    ("tempura-fries", "Tempura Fries", "Cut potato in a light batter, fried.", "side-dish"),
    ("chips-fry", "Chips Fry", "A chip-shop portion of fried potatoes.", "side-dish"),

    # --- kebabs and grills --------------------------------------------
    ("shashlik", "Shashlik", "Marinated cubes of meat on a skewer, grilled.", "kebab"),
    ("satay", "Satay", "Skewered meat grilled and served with a peanut sauce.", "kebab"),
    ("skewer", "Skewer", "Anything threaded on a skewer and grilled.", "kebab"),
    ("barbecue", "Barbecue", "Meat cooked slowly over an open, smoky fire.", "kebab"),
    ("chinese-hot-pot", "Chinese Hot Pot", "A communal pot of broth at the table, with ingredients cooked in it.", "soup"),

    # --- dressings and accompaniments ----------------------------------
    ("condiment", "Condiment", "A table accompaniment, usually sharp or pickled.", "sauce"),
    ("dip", "Dip", "A thick sauce or spread for dipping.", "sauce"),
    ("chutney", "Chutney", "A relish of cooked fruit or vegetables, sweet and spiced.", "sauce"),
    ("relish", "Relish", "A chopped, spiced vegetable or fruit preparation served as an accompaniment.", "sauce"),
    ("pickle", "Pickle", "A preserved vegetable or fruit in vinegar or brine.", "side-dish"),
    ("garnish", "Garnish", "An edible material added to a dish for colour or contrast.", "side-dish"),
    ("base", "Base", "The starch or grain a dish is built on.", "side-dish"),
    ("stuffing", "Stuffing", "A filling put inside a food.", "stuffed-vegetable"),
    ("filling", "Filling", "The material enclosed by a wrapper or hollowed-out food.", "filled-pastry"),
    ("breading", "Breading", "A coating of breadcrumbs or flour applied before frying.", "breaded-cutlet"),
    ("batter", "Batter", "A liquid or semi-liquid mixture of flour and liquid, for coating or frying.", "fritter"),
    ("marinade", "Marinade", "A seasoned liquid in which food is soaked before cooking.", "side-dish"),
    ("glaze", "Glaze", "A coating applied during cooking for colour and flavour.", "sauce"),
    ("aromatics", "Aromatics", "The aromatic vegetables and spices that flavour a dish.", "side-dish"),
    ("herbs", "Herbs", "The aromatic green plants used to flavour a dish.", "side-dish"),
    ("spice", "Spice", "The aromatic seed, bark or root used to flavour a dish.", "side-dish"),
    ("sweetener", "Sweetener", "The substance used to sweeten a dish.", "dessert"),
    ("thickener", "Thickener", "The substance used to give a sauce or stew body.", "sauce"),

    # --- sweets -------------------------------------------------------
    ("cake", "Cake", "A baked sweet dish of batter, usually leavened.", "dessert"),
    ("cookie", "Cookie", "A small, flat, sweet baked item.", "confection"),
    ("biscuit", "Biscuit", "A small, dry, crisp baked good, sweet or savoury.", "dessert"),
    ("sweet-tart", "Sweet Tart", "A shallow pastry case with a sweet filling, baked.", "dessert"),
    ("sweet-pie", "Sweet Pie", "A filling in a pastry crust, baked, and sweet.", "dessert"),
    ("pudding", "Pudding", "A sweet dish set with starch, or steamed in a vessel.", "dessert"),
    ("sweet-custard", "Sweet Custard", "A set egg-and-milk preparation, sweet.", "dessert"),
    ("ice-cream", "Ice Cream", "A frozen sweetened dairy dessert.", "frozen-dessert"),
    ("sorbet", "Sorbet", "A frozen fruit or sugar dessert, without dairy.", "frozen-dessert"),
    ("gelato", "Gelato", "An Italian frozen dessert churned with less air and more cream than ice cream.", "frozen-dessert"),
    ("chocolate", "Chocolate", "A sweet preparation of cocoa, usually in confectionery or a drink.", "confection"),
    ("candy", "Candy", "A small sweet confection.", "confection"),
    ("caramel", "Caramel", "Sugar brought to a deep amber colour, or a confection made from it.", "confection"),
    ("meringue", "Meringue", "A confection of whipped egg white and sugar.", "confection"),
    ("souffle", "Souffle", "A light dish of whipped egg or foam, baked or served risen.", "dessert"),
    ("crumble", "Crumble", "A baked dish of fruit or vegetables under a crumb topping.", "dessert"),
    ("trifle", "Trifle", "A layered dessert of sponge, fruit and custard or cream.", "dessert"),
    ("cheesecake", "Cheesecake", "A baked dessert of a cream cheese base on a crumb or pastry base.", "dessert"),
    ("sweet-pudding", "Sweet Pudding", "A sweet dish set with starch or steamed in a vessel.", "dessert"),
    ("halwa", "Halwa", "A dense sweet confection of flour, starch or semolina cooked with fat and sugar.", "indian-sweet"),
    ("laddu", "Laddu", "A round Indian sweet made from a flour or chickpea base.", "indian-sweet"),
    ("barfi", "Barfi", "A squared Indian sweet of cooked sugar and milk or cream.", "indian-sweet"),
    ("jalebi", "Jalebi", "A coiled, fried, sugar-soaked Indian sweet.", "indian-sweet"),
    ("kulfi", "Kulfi", "A frozen Indian dessert of milk, cream and sugar.", "indian-sweet"),
    ("mochi", "Mochi", "A Japanese rice cake of pounded glutinous rice.", "dessert"),
    ("matcha-dessert", "Matcha Dessert", "A dessert made with matcha tea powder.", "dessert"),
    ("crepe-cake", "Crepe Cake", "A layered cake of thin crepes and cream.", "dessert"),
    ("panna-cotta", "Panna Cotta", "A set cream dessert, Italian in name and borrowed in method.", "dessert"),
    ("tiramisu", "Tiramisu", "An Italian layered dessert of mascarpone and coffee-soaked sponge.", "dessert"),
    ("baklava", "Baklava", "Layers of pastry with a nut filling, soaked in syrup.", "confection"),
    ("cannoli", "Cannoli", "An Italian pastry tube filled with sweetened ricotta.", "confection"),
    ("cendol", "Cendol", "An Indonesian dessert of shaved ice with sweet green beans and coconut milk, served in a bowl.", "dessert"),
    ("sweet-crepe", "Sweet Crepe", "A thin pancake of flour and liquid, sweet.", "pancake"),

    # --- drinks -------------------------------------------------------
    ("tea", "Tea", "An infusion of tea leaves in hot water.", "beverage"),
    ("coffee", "Coffee", "An infusion of roasted coffee beans in hot water.", "beverage"),
    ("juice", "Juice", "The liquid extracted from fruit or vegetables.", "beverage"),
    ("smoothie", "Smoothie", "A drink of fruit blended with liquid until smooth.", "beverage"),
    ("shake", "Shake", "A thick drink of milk or a milk substitute, blended with flavouring.", "beverage"),
    ("cocktail", "Cocktail", "A mixed drink of spirits, mixer and garnish.", "alcoholic-drink"),
    ("wine", "Wine", "A fermented grape drink.", "alcoholic-drink"),
    ("beer", "Beer", "A fermented drink made from grain.", "alcoholic-drink"),
    ("cider", "Cider", "A fermented apple drink.", "alcoholic-drink"),
    ("kombucha", "Kombucha", "A fermented sweet-tea drink with a SCOBY culture.", "fermented-drink"),
    ("lassi", "Lassi", "A yogurt-based drink, sweet or salted.", "fermented-drink"),
    ("ayran", "Ayran", "A salted yogurt drink, Turkish in origin.", "fermented-drink"),
    ("kefir", "Kefir", "A fermented milk drink made with kefir grains.", "fermented-drink"),
    ("horchata", "Horchata", "A sweet rice-based drink, Spanish in origin.", "beverage"),
    ("aguas-frescas", "Aguas Frescas", "A refreshing Mexican drink of fruit, rice or oat base and water.", "beverage"),
    ("bubbletea", "Bubble Tea", "A tea drink served with tapioca pearls and milk, often with sugar.", "beverage"),
    ("lemonade", "Lemonade", "A drink of lemon juice, water and sugar.", "beverage"),
    ("drink", "Drink", "A beverage served as a course.", "beverage"),
    ("sake", "Sake", "A Japanese fermented rice wine.", "alcoholic-drink"),
    ("soju", "Soju", "A Korean distilled spirit, usually from rice or sweet potato.", "spirit"),
    ("baijiu", "Baijiu", "A Chinese distilled spirit from grain.", "spirit"),
    ("tequila", "Tequila", "A Mexican distilled spirit from agave.", "spirit"),
    ("mezcal", "Mezcal", "A Mexican distilled spirit from agave, smoky in character.", "spirit"),
    ("rum", "Rum", "A spirit distilled from sugarcane by-products.", "spirit"),
    ("brandy", "Brandy", "A spirit distilled from wine.", "spirit"),

    # --- preserved and fermented --------------------------------------
    ("pickled-vegetable-dish", "Pickled Vegetable Dish", "A dish built around preserved vegetables.", "preserved-vegetable"),
    ("cured-fish-dish", "Cured Fish Dish", "A dish built around preserved fish.", "preserved-vegetable"),
    ("kimchi", "Kimchi", "Korean fermented vegetables, chiefly cabbage.", "fermented-vegetable"),
    ("sauerkraut", "Sauerkraut", "Fermented shredded cabbage.", "fermented-vegetable"),
    ("miso", "Miso", "A Japanese fermented paste of soybeans and grains.", "fermented-soy"),
    ("tempeh", "Tempeh", "An Indonesian fermented soybean cake bound with fungal mycelium.", "fermented-soy"),
    ("natto", "Natto", "Japanese fermented soybeans, sticky and strongly scented.", "fermented-soy"),
    ("marmite", "Marmite", "A dark yeast extract spread, British in origin.", "fermented-soy"),
    ("bouillon-base", "Bouillon Base", "A concentrated savoury base for soups and stews.", "soup"),
]

# ---------------------------------------------------------------------
# TECHNIQUES — target ~60-90 (from 26).
#
# ADR-002 D3e is strict here: a dimension cell is a controlled-vocabulary
# value VERBATIM, so a technique value must name the METHOD and nothing
# else. 'braising (dry)' is rejected; 'braising' is the value and 'dry' is
# a claim.
#
# (slug, name, description, parent)
# ---------------------------------------------------------------------

TECHNIQUES = [
    ("baking", "Baking", "Cooking in an enclosed oven or a covered vessel by dry heat.", None),
    ("roasting", "Roasting", "Cooking by dry heat with strong browning, in an oven or over a fire.", None),
    ("spit-roasting", "Spit-roasting", "Roasting on a rotating spit before a fire.", None),
    ("pit-roasting", "Pit-roasting", "Slow cooking in a pit or under a layer of embers.", None),
    ("grilling", "Grilling", "Cooking directly over or under a strong heat source.", None),
    ("broiling", "Broiling", "Cooking under a high heat source, close to the element.", None),
    ("barbecue", "Barbecuing", "Slow cooking over an open, smoky fire.", None),
    ("frying", "Frying", "Cooking food in hot fat.", None),
    ("deep-frying", "Deep-frying", "Frying food submerged in hot fat.", None),
    ("shallow-frying", "Shallow-frying", "Frying food in a shallow layer of hot fat.", None),
    ("stir-frying", "Stir-frying", "Frying small pieces while moving them constantly in a little hot fat.", "frying"),
    ("tempering", "Tempering", "Heating and cooling chocolate so it sets glossy and snaps.", None),
    ("emulsifying", "Emulsifying", "Combining an oil and a liquid into a stable mixture.", None),
    ("boiling", "Boiling", "Cooking in vigorously bubbling liquid.", None),
    ("poaching", "Poaching", "Cooking gently in liquid just below a simmer.", None),
    ("blanching", "Blanching", "Briefly immersing in boiling liquid to soften or set the surface.", None),
    ("steaming", "Steaming", "Cooking over boiling water so the food does not touch the liquid.", None),
    ("simmering", "Simmering", "Cooking gently just below boiling.", "boiling"),
    ("stewing", "Stewing", "Cooking slowly in liquid at a steady simmer until tender.", None),
    ("braising", "Braising", "Cooking meat slowly in a little liquid, partly covered.", None),
    ("stirring", "Stirring", "Moving a mixture continuously while it cooks, to prevent sticking or to disperse heat.", None),
    ("whisking", "Whisking", "Beating a mixture rapidly with a whisk to incorporate air or emulsify.", None),
    ("whipping", "Whipping", "Beating a liquid to incorporate air until light.", None),
    ("kneading", "Kneading", "Working a dough by hand or machine to develop gluten.", None),
    ("proofing", "Proofing", "Allowing dough to rise before baking.", None),
    ("laminating", "Laminating", "Rolling butter into dough in layers for a flaky pastry.", None),
    ("rolling", "Rolling", "Flattening a dough or pastry with a rolling pin.", None),
    ("mashing", "Mashing", "Crushing cooked food to a soft texture with a masher.", None),
    ("grating", "Grating", "Shaving a hard food into fine particles with a grater.", None),
    ("mincing", "Mincing", "Cutting food into very small pieces with a knife or machine.", None),
    ("slicing", "Slicing", "Cutting food into flat, even pieces.", None),
    ("dicing", "Dicing", "Cutting food into small cubes.", None),
    ("julienning", "Julienning", "Cutting food into thin matchsticks.", None),
    ("skewering", "Skewering", "Threading food onto a skewer.", None),
    ("curing", "Curing", "Preserving meat or fish with salt, sugar or smoke.", None),
    ("pickling", "Pickling", "Preserving food in vinegar or brine.", "curing"),
    ("fermenting", "Fermenting", "Preserving food by the action of microorganisms.", "curing"),
    ("smoking", "Smoking", "Imparting a smoky flavour by exposing food to smoke.", "curing"),
    ("drying", "Drying", "Removing water from food to preserve it.", None),
    ("dehydrating", "Dehydrating", "Drying food in a dehydrator or low oven.", None),
    ("candying", "Candying", "Preserving fruit or vegetables in a concentrated sugar syrup.", "drying"),
    ("confectioning", "Confectioning", "Making a confection, usually by cooking sugar with other ingredients.", None),
    ("caramelizing", "Caramelizing", "Cooking sugar until it browns, or browning food in its own sugars.", None),
    ("blending", "Blending", "Combining ingredients into a smooth mixture.", None),
    ("pureeing", "Pureeing", "Blending cooked food until completely smooth.", None),
    ("straining", "Straining", "Passing a liquid through a sieve to remove solids.", None),
    ("reducing", "Reducing", "Cooking a liquid to concentrate its flavour.", None),
    ("deglazing", "Deglazing", "Dissolving the browned residue of a pan in a liquid.", None),
    ("marinating", "Marinating", "Soaking food in a seasoned liquid before cooking.", None),
    ("brining", "Brining", "Soaking food in salt solution before cooking.", "marinating"),
    ("toasting", "Toasting", "Browning bread or nuts dry, or before liquid is added.", None),
    ("charring", "Charring", "Burning the surface of food to blacken it in places.", None),
    ("sprouting", "Sprouting", "Growing seeds or grains into sprouts.", None),
    ("extracting", "Extracting", "Drawing out flavour or substance by soaking or pressing.", None),
    ("infusing", "Infusing", "Steeping an ingredient in a hot liquid to flavour it.", None),
    ("freezing", "Freezing", "Chilling food below its freezing point to preserve it.", None),
    ("chilling", "Chilling", "Cooling food, usually to set a preparation.", None),
    ("tempering-meat", "Tempering Meat", "Bringing meat to room temperature before cooking so it cooks evenly.", None),
    ("resting", "Resting", "Leaving cooked food to stand so its juices redistribute.", None),
    ("garnishing", "Garnishing", "Adding an edible accent to a finished dish.", None),
    ("portioning", "Portioning", "Dividing a prepared dish into servings.", None),
    ("plating", "Plating", "Arranging a finished dish for service.", None),
    ("griddle", "Griddle", "Cooking on a flat hot metal surface.", None),
    ("wok", "Wok", "Cooking in a wok, over high heat with little fat.", None),
    ("clay-oven", "Clay Oven", "Baking in a clay oven, as a tandoor or pizza oven.", None),
    ("sun-drying", "Sun-drying", "Drying food in the sun.", None),
    ("salt-curing", "Salt-curing", "Preserving food with salt, dry or in brine.", None),
    ("oil-curing", "Oil-curing", "Preserving food submerged in oil.", None),
    ("sugaring", "Sugaring", "Preserving food with sugar.", None),
    ("macerating", "Macerating", "Soaking fruit in sugar or spirit to soften it and draw out juice.", None),
    ("coring", "Coring", "Removing the core or stalk from a fruit or vegetable.", None),
    ("peeling", "Peeling", "Removing the outer skin of a fruit or vegetable.", None),
    ("dressing", "Dressing", "Coating a salad or raw dish with a dressing.", None),
    ("tossing", "Tossing", "Mixing ingredients by a light turning motion.", None),
    ("layering", "Layering", "Building a dish in layers.", None),
    ("skimming", "Skimming", "Removing floating fat or impurities from a cooking liquid.", None),
    ("pressing", "Pressing", "Compressing food to extract liquid or shape it.", None),
    ("wringing", "Wringing", "Twisting cloth or leaves to squeeze out liquid.", None),
]

# ---------------------------------------------------------------------
# CONTEXTS — the stress set requires `tableside`.
# ---------------------------------------------------------------------

CONTEXTS = [
    ("tableside", "Tableside", "Cooked or served at the table, in front of the diner, from a shared vessel.", None),
    ("street-vendor", "Street Vendor", "Sold and eaten from a street stall or cart.", None),
    ("home-cooking", "Home Cooking", "Prepared in a domestic kitchen rather than a professional one.", None),
    ("banquet", "Banquet", "Prepared for and served at a formal gathering.", None),
    ("buffet", "Buffet", "Served from a buffet, in portions, for self-service.", None),
    ("picnic", "Picnic", "Prepared for eating outdoors, packed to be carried.", None),
    ("camping", "Camping", "Prepared for eating in the outdoors, on a camp stove or cold.", None),
    ("school-meal", "School Meal", "Prepared as part of institutional or school catering.", None),
    ("hospitality", "Hospitality", "Served in a hotel or restaurant setting.", None),
    ("festive", "Festive", "Eaten at a festival or on a feast day.", None),
    ("fasting", "Fasting", "Eaten during a fast, or made without the ingredients a fast excludes.", None),
    ("breakfast", "Breakfast", "Eaten at breakfast.", None),
    ("lunch", "Lunch", "Eaten at midday.", None),
    ("dinner", "Dinner", "Eaten at the evening meal.", None),
    ("supper", "Supper", "Eaten in the evening, later or lighter than dinner.", None),
    ("snack", "Snack", "Eaten between meals.", None),
    ("dessert-course", "Dessert Course", "Served as the sweet course of a meal.", None),
    ("appetizer", "Appetizer", "Served at the start of a meal.", None),
    ("condiment-course", "Condiment Course", "Served as a table accompaniment rather than as a course.", None),
    ("preserved", "Preserved", "Eaten as a preserved food, from a jar, crock or tin.", None),
    ("emergency-ration", "Emergency Ration", "Made to be carried and kept, as a ration.", None),
    ("travel-food", "Travel Food", "Made to survive travel, as a packaged or dried food.", None),
    ("funeral", "Funeral", "Prepared for and served at a funeral.", None),
    ("temple-offering", "Temple Offering", "Prepared as an offering in a temple.", None),
    ("military", "Military", "Prepared as a ration for soldiers.", None),
    ("workplace", "Workplace", "Eaten at work, as a packed lunch.", None),
]



# ---------------------------------------------------------------------
# TRIMS
#
# The plan's "120-180 families" is an estimate. The list below removes the
# values that a reference work describes in prose rather than as a family
# value: generic building-block nouns (aromatics, batter, glaze) and
# narrow specifics that no dish in the catalogue needs yet. The families
# are kept intact — trimming a parent is never done, because that would
# orphan its children.
# ---------------------------------------------------------------------
TRIM_FAMILIES = {
    # generic building-block nouns
    "aromatics", "herbs", "spice", "sweetener", "thickener", "garnish",
    "base", "stuffing", "filling", "breading", "batter", "marinade",
    "glaze", "emulsion", "broth-base", "bouillon-base", "condiment",
    "relish", "chutney", "dip",
    # narrow specifics not needed yet
    "plain-rice", "rice-porridge", "rice-congee", "steamed-bread",
    "frybread", "bannock", "cracker", "wafer", "pretzel", "bread-roll",
    "baguette", "arancini", "beignet", "donut", "pakora", "nugget",
    "onion-ring", "boiled-egg", "scrambled-egg", "root-vegetable",
    "vegetable-curry", "vegetable-tart", "pickled-salad", "cured-fish-dish",
    "pickled-vegetable-dish", "game", "offal", "meatloaf", "rock",
    "poutine", "ceviche", "charlotte",
}


def live_slugs(table: str) -> set:
    """Read the slugs already in the live database for a vocabulary table.

    The generator excludes them, so the seed can only ever ADD values and
    the migration's "these slugs must not already exist" assertion holds.
    """
    import subprocess
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", f"select slug from {table} order by slug;"],
        capture_output=True, text=True,
    ).stdout
    slugs = set()
    for line in out.splitlines():
        line = line.strip()
        if not line or set(line) <= set("- "):
            continue
        if line.startswith("slug"):          # the column header
            continue
        if "(" in line and ")" in line:      # a row count, e.g. "(26 rows)"
            continue
        # A single-column psql result has no separator; take the field.
        slug = line.split("|")[0].strip()
        if slug:
            slugs.add(slug)
    return slugs


def main() -> int:
    # Drop anything the live database already has. 1f EXTENDS the
    # vocabulary; it never redefines an existing value.
    have_fam = live_slugs("dish_families")
    have_tech = live_slugs("dish_techniques")
    have_ctx = live_slugs("dish_contexts")

    fams = [
        {"slug": s, "name": n, "description": d, "parent": p}
        for s, n, d, p in FAMILIES
        if s not in TRIM_FAMILIES and s not in have_fam
    ]
    TRIM_TECHNIQUES = {
        "layering", "tossing", "dressing", "coring", "peeling", "brining",
        "infusing", "extracting", "sprouting", "emulsifying", "macerating",
        "confectioning", "portioning", "plating", "garnishing",
    }
    techs = [
        {"slug": s, "name": n, "description": d, "parent": p}
        for s, n, d, p in TECHNIQUES
        if s not in TRIM_TECHNIQUES and s not in have_tech
    ]
    ctxs = [
        {"slug": s, "name": n, "description": d, "parent": p}
        for s, n, d, p in CONTEXTS
        if s not in have_ctx
    ]

    ok = True
    for label, rows, existing in (
        ("families", fams, EXISTING_GROUPS),
        ("techniques", techs, set()),
        ("contexts", ctxs, set()),
    ):
        slugs = [r["slug"] for r in rows]
        dupes = {s for s in slugs if slugs.count(s) > 1}
        if dupes:
            print(f"ERROR: duplicate slugs in {label}: {dupes}")
            ok = False
        # A parent may be a NEW value in this same vocabulary, or a value
        # that already exists in the database.
        known = set(slugs) | set(existing)
        for r in rows:
            if r["parent"] and r["parent"] not in known:
                print(f"ERROR: {label}.{r['slug']} has unknown parent '{r['parent']}'")
                ok = False
            if r["parent"] == r["slug"]:
                print(f"ERROR: {label}.{r['slug']} is its own parent")
                ok = False

    # Every family group must be either an existing DB family or a new
    # family in this same batch.
    new_fam_slugs = {r["slug"] for r in fams}
    for r in fams:
        if r["parent"] and r["parent"] not in EXISTING_GROUPS and r["parent"] not in new_fam_slugs:
            print(f"ERROR: family '{r['slug']}' has group '{r['parent']}' which is neither an existing DB family nor a new one")
            ok = False

    # The hierarchy must be acyclic: a parent chain may not loop.
    by_slug = {r["slug"]: r for r in fams}
    for r in fams:
        seen = {r["slug"]}
        cur = r["parent"]
        while cur:
            if cur in seen:
                print(f"ERROR: family '{r['slug']}' has a cyclic parent chain at '{cur}'")
                ok = False
                break
            seen.add(cur)
            cur = (by_slug.get(cur) or {}).get("parent")

    if not ok:
        return 1

    out = {"families": fams, "techniques": techs, "contexts": ctxs}
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"families   : {len(fams)} new (28 groups already live)")
    print(f"techniques : {len(techs)} new (26 already live)")
    print(f"contexts   : {len(ctxs)} new (5 already live)")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
