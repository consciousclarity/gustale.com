# GUS-241 — the structural stress set: 50 dishes, classified against the current model

**Purpose:** find where the model BREAKS, before the global vocabulary (GUS-242 step 1f) is designed. **No live writes.**

Each dish is classified with what EXISTS today (28 families, 191 cuisines, 8 courses, 26 techniques, 38 traditions, 5 contexts, 55 ingredients), and the break is what does not fit.

**Every article title was verified against English Wikipedia** on 2026-10-28 by direct API check, with redirects followed. **Two have no English article at all** and must not be given an invented one. The classification facts are taken from the articles' own text, and the three richest ones are quoted directly.

| # | Dish | Wikipedia article | Test | What breaks | Fix |
|---|---|---|---|---|---|
| 1 | `biscuit` | Biscuit | homonym | The US 'biscuit' is a soft leavened quickbread; the British 'biscuit' is a hard dry biscuit. ONE NAME, TWO DISHES, and the vocabulary has 'Bread' and 'Dessert' but nothing for the dry/hard form. The name alone cannot resolve which is meant, and the US item is also a breakfast while the British one is a snack - so the same name carries two different courses. | **new-vocab-value** — New vocabulary value 'Dry biscuit', plus a disambiguation rule: a dish whose name has multiple documented senses gets a sense-qualified canonical_name and its own row. |
| 2 | `japanese_curry` | Japanese curry | homonym | The name contains a FAMILY ('curry') but names a NATIONAL VARIANT, and Wikipedia documents three main forms (curry rice, curry udon, curry bread) plus regional forms (Navy/Yokosuka, Spice, Nakamura-ya, katsu). One canonical name covers a whole family of forms, and 'curry' is a dish FAMILY here while Japanese curry is a CUISINE-level preparation. The model has one row per dish and no way to say 'this name denotes a family of forms'. | **new-rule** — New rule: a dish whose documented forms are individually nameable gets each form as its own statement under the same subject, with the family value carried as the dish_family. 'Curry' already exists, so this is a granularity rule, not a vocabulary change. |
| 3 | `hainanese_chicken_rice` | Hainanese chicken rice | homonym | Named for HAINAN (a Chinese island) but created by Hainanese immigrants and served in Singapore and Malaysia. Wikipedia documents a COMPETING Malaysia-vs-Singapore origin claim and calls the phenomenon 'gastronationalism'. The place in the NAME is not the place of origin, the origin is disputed between two modern states, and the dish is found across Indonesia, Malaysia, Thailand, Vietnam and Singapore. | **new-rule** — New rule: a place in a dish's NAME is not an origin claim. The origin is carried by a statement with its own place qualifier, and the disputed state is recorded as competing statements (Q5's rule) with cuisine unset(disputed) - which the model already supports. |
| 4 | `baklava` | Baklava | multi-national | Competing origin theories (Greece, Turkey, Levant, Central Asia) across FOUR traditions, and a dish row carries ONE tradition value in practice, so a four-way shared claim cannot be expressed as values. | **new-rule** — The traditions go on the STATEMENT (each competing version with its own place qualifier), not on the dish row, which stays unset(disputed). No new vocabulary - Q5's competing-statements rule already covers it. |
| 5 | `ajvar` | Ajvar | multi-national | A PEPPER RELISH - a condiment, not a main dish - in a Yugoslav/Serbian/Macedonian context, and Wikipedia names "Leskovac ajvar" and "Macedonian ajvar" as WIPO-REGISTERED BRAND NAMES. So the dish is claimed by Serbia, Bosnia and North Macedonia, and two of those claims are legally registered designations of origin. 'Sauce' as a family and 'Condiment' as a course are a near-duplicate pair in the vocabulary, and the claim spans three countries. | **new-rule** — No new family needed ('Sauce' fits). The condiment is a COURSE and the pepper an INGREDIENT. The three-nation claim is a competing-statement case, not a new dimension. |
| 6 | `pilaf` | Pilaf | multi-national | THE WORST CASE IN THE SET. Wikipedia says 'there are thousands of variations', lists 26 named regional sections, and Azerbaijan alone has 'more than 40 different plov recipes'. Around 25 distinct named forms are given: sade pilav, chelo, ruzz mufalfal, Kabuli palaw, roz Bukhari, polao/pulao, akhni polao, tehari, kebuli, nasi mandi, polow, kateh, dami, chelow, tahchin and more. ONE canonical name covers 26 national traditions and 25+ named forms, and the model has no 'name variant' concept. | **new-rule** — New rule: a dish with documented named regional forms gets ONE dish row (the shared preparation) with a FORM dimension, and each named form is a statement with its own cuisine/tradition. Creating 26 dishes would be a different claim each. 'Rice Dish' fits - no new family value. |
| 7 | `lahmacun` | Lahmacun | multi-national | A FLATBREAD with a meat topping, shared by Lebanon, Syria, Armenia and Turkey, and called 'pizza' in three of them. The family vocabulary has 'Bread' and 'Filled pastry' but no flatbread, and the name carries the topping. | **new-vocab-value** — New family value 'Flatbread' - which would cover lahmacun, pide, lavash, manakish, saj and matzo, so it is not a one-dish value. Plus the multi-national rule. |
| 8 | `thali` | Thali | meal-vs-dish | Simultaneously a VESSEL (a circular metal plate) and a MEAL (a set of dishes), with at least 7 regional types named (Andhra bhojanam, Nepalese, Rajasthani, Gujarati, Maharashtrian, Manipuri chakluk, Tamil unavu, Thai unavu). The model has no 'a set of dishes' concept: a dish row implies a single preparation with a family, a course and a technique, and a meal is none of those. | **new-dimension** — New dimension 'composed of' (a dish is composed of other dishes) - the one thing the model genuinely cannot express. A 'Meal' family value for the set-as-dish rows. The 7 regional types become statements. |
| 9 | `rijsttafel` | Rijsttafel | meal-vs-dish | A Dutch MEAL: an Indonesian nasi padang adapted by the Dutch, served as many small side dishes - 'forty is not an unusual number'. It is a set, not a preparation, with no single technique or family, and its ingredient is Indonesian while its context is Dutch. | **new-dimension** — The 'composed of' dimension plus a 'Meal' family. The national-cuisine rule handles the origin by leaving the cuisine unset and the tradition carrying it (Peranakan already exists). |
| 10 | `meze` | Meze | meal-vs-dish | Explicitly a CATEGORY - 'a selection of small dishes', either appetizers or a meal in itself - covering Greece, Cyprus, Bulgaria, Palestine, Jordan, Syria, Lebanon, Turkey and the Balkans. Not a dish, so no family, no technique and no single course. | **new-dimension** — The 'composed of' dimension, OR declare it out of scope as a dish and keep it as a tradition value - the second is cheaper and arguably more honest, since meze is a way of eating rather than a food. |
| 11 | `banchan` | Banchan | meal-vs-dish | A CATEGORY of side dishes, with Wikipedia documenting 3-, 5-, 7-, 9- and 12-dish table settings plus the bansang set, and the categories of kimchi, namul, bokkeum, jorim, jjim, jeon. So it is a set AND a category AND a course. | **new-dimension** — The 'composed of' dimension. The 3/5/7/9/12-dish settings are a further granularity level with no place in the model - they are composition, not dishes. |
| 12 | `nasi_campur` | Nasi campur | meal-vs-dish | Mixed rice with assorted sides - arguably a meal, arguably a dish - and Wikipedia names nasi campur, nasi rames and sega campur as the same thing, then draws parallels to khao kaeng, com binh dan, carinderia, ichiju-sansai, plate lunch and fiesta plate. So a name with three spellings, variable composition and six international analogues. | **new-dimension** — The 'composed of' dimension handles the variable composition; the three names are NAME VARIANTS of one dish, not three dishes. |
| 13 | `hot_pot` | Hot pot | table-cooked | Cooked AT THE TABLE by the diners, in the vessel. The technique vocabulary describes a METHOD the cook used; here the method is 'the diner does it', and the dish's defining feature is the shared vessel plus a communal act. There is no 'table-cooked' attribute anywhere. | **new-vocab-value** — New context value 'Table' (or a 'cooked_at' qualifier on the statement) alongside Home/Restaurant/Market/Street food. The context dimension is exactly where 'where and how it is eaten' belongs. |
| 14 | `cheese_fondue` | Fondue | table-cooked | Table-cooked, and the dish is defined by the FUNDUE as much as by the cheese - a pot of melted cheese kept over a flame. The vocabulary has 'Emulsifying' and 'Whisking' but no 'melting', and the vessel is part of the name. It is also a Swiss-French loanword, so a Swiss dish with a French name. | **new-vocab-value** — New context value 'Table' plus a technique value 'Melting'. The name-vs-origin case is a naming rule. Note the requested 'cheese fondue' redirects to 'Fondue' - one article for both. |
| 15 | `raclette` | Raclette | table-cooked | The NAME IS THE METHOD (racler = to scrape) and the dish is the melted cheese scraped onto a potato. So the name is a technique, and it is cooked at the table. | **new-vocab-value** — New context value 'Table'; the technique is 'Melting' plus 'Scraping'. The name-as-technique case is a naming rule, not a new dimension - the technique statement carries it. |
| 16 | `samgyeopsal` | Samgyeopsal | table-cooked | Grilled AT THE TABLE, often on a built-in grill in the restaurant - so the grill is an appliance the restaurant owns and the diner performs the cooking. Same shape as hot pot, and the family is decided by its CONTEXT rather than by its form. | **new-vocab-value** — New context value 'Table'. The 'Grilled Meat' family was REJECTED earlier as redundant with technique, so this case is settled by the context dimension instead. |
| 17 | `paella` | Paella | vessel-defined | The NAME IS THE VESSEL (the paella pan), the pan is brought to the table, and Wikipedia lists 3 versions (valenciana, mixta, de marisco) where Valencians claim only valenciana is 'true'. The dish is defined by its container, and the name does not name the food. | **new-rule** — The name-as-vessel case needs a naming rule: a dish whose name denotes its vessel is named for the preparation, with the vessel recorded as a statement. The 3 versions are competing statements (Q5). 'Rice Dish' fits. |
| 18 | `bo_zaai_fan` | (NO ENGLISH ARTICLE) | vessel-defined | A clay-pot rice dish whose pot is served - and there is NO ENGLISH WIKIPEDIA ARTICLE for it, verified across en/zh/id/ms/sg/zh-min-nan/ar/he/fa. So the dish has no citable English source at all, and its name means 'treasure rice'. | **new-rule** — The dish needs a non-English source with the citation language recorded - the same requirement the other no-English-article candidates carry. The name-as-vessel rule applies. No new vocabulary. |
| 19 | `potjiekos` | Potjiekos | vessel-defined | Named for the POT, and traditionally a SET of three pots (one for each course), cooked over a fire. So the name is the vessel AND the dish is a set of preparations - a second 'composed of' case. | **new-dimension** — The 'composed of' dimension plus a naming rule for vessel-named dishes. 'Stew' fits. |
| 20 | `cassoulet` | Cassoulet | vessel-defined | Named for the CASSOULE vessel, from Castelnaudary in the Aude, with local variants in other Aude towns. So the name is the vessel and the origin is a town-level distinction. | **new-rule** — The naming rule plus the origin place as a statement qualifier. 'Casserole' ALREADY EXISTS - so this case needs no new family, which is a useful confirmation that the vocabulary is not the problem. |
| 21 | `lawar` | Lawar (food) | ceremonial | REQUIRED at the Balinese odalan ceremony, and eaten communally from a single woven palm-leaf cone. The existing context value 'Festival / ceremonial' covers the occasion, but the model has no way to say a dish is REQUIRED at a ceremony rather than merely eaten at one. | **new-rule** — The 'Festival / ceremonial' context already exists, so the only new thing is a statement that the dish is required there - no new vocabulary. NOTE: 'Lawar' is a TOWN in Uttar Pradesh; the food is 'Lawar (food)', so the name needs disambiguating. |
| 22 | `pan_de_muerto` | Pan de muerto | ceremonial | Eaten at Day of the Dead (Dia de Muertos). The context value 'Festival / ceremonial' covers the occasion - so this case is ALREADY EXPRESSIBLE and needs no new vocabulary. It is in the set as a control. | **new-rule** — NO CHANGE NEEDED - the existing context value carries it. Included so the set has a case that breaks nothing. |
| 23 | `kutia` | Kutia | ceremonial | A ritual food with TWO occasions - the Christmas-Epiphany season OR a funeral feast - shared by Belarusian, Lithuanian, Polish, Ukrainian and Russian communities and eaten by both Eastern Orthodox Christians and Catholics. So the context is multi-valued (which the dimension allows) but the 'dish' is a set of named regional varieties. | **new-rule** — No new vocabulary: 'Dumpling' fits and 'Festival / ceremonial' is already multi-valued. The regional varieties are competing statements. |
| 24 | `kagami_mochi` | Kagami mochi | ceremonial | A New Year rice cake, and a MIRROR that is cut and shared at the turning of the year - so the object is edible but only in a ritual context, and the context is a CALENDAR MOMENT, not a place or a setting. | **new-rule** — The 'Festival / ceremonial' context covers the occasion. A calendar moment is a STATEMENT with a period qualifier, and Q1's 'period' qualifier already exists - so no new vocabulary either. |
| 25 | `garum` | Garum | historical-no-modern-state | A fermented fish sauce whose article reads: "used as a condiment in the cuisines of Phoenicia, ancient Greece, Rome, Carthage, and later Byzantium. Liquamen is a similar preparation, and at times they were synonymous." So the claim chain spans FIVE civilisations, and every one of them is a state that no longer exists in that form. The place hierarchy is built on modern ISO countries, so NONE of these claims has a place to point at, and the dish is essentially extinct. | **new-rule** — New rule: an origin claim whose place has no modern state is recorded against the historical place seeded with entity_type 'historical', OR the claim's place is left unset with reason 'not_applicable'. The second is free and is RECOMMENDED for the pilot. |
| 26 | `tuhu` | (NO ENGLISH ARTICLE) | historical-no-modern-state | A Palestinian taboon bread named for a HISTORIC VILLAGE (al-Tuhu), and there is NO ENGLISH WIKIPEDIA ARTICLE for it (enwiki 'Tuhu' is a Chinese bowed string instrument). So the place in the name is a village that no longer exists as a settlement, AND the dish has no citable English source. | **new-rule** — Same as garum for the place (unset + not_applicable, or a 'historical' place tier), plus the non-English source requirement with the citation language recorded. |
| 27 | `akutaq` | Alaskan ice cream | stateless-peoples | An Alaska Native dish (Athabaskan, Inupiat, Yup'ik) with NO country of origin - the peoples are pre-state and span what is now Alaska, Canada and Russia. Several named forms exist (Inuit ice cream, akutaq/akutuq, Native/Indian ice cream, snow akutaq). So the dish has NO modern state and the 'cuisine' slot has nothing to point at. | **new-rule** — New rule: a dish with no modern state of origin gets cuisine unset(disputed or not_applicable) and carries its people as a TRADITION, which is what the tradition vocabulary is for. NO new dimension - this is the tradition dimension doing its job. NOTE: 'Akutaq' is a REDIRECT to 'Alaskan ice cream'. |
| 28 | `bidos` | Bidos (French commune) | stateless-peoples | A SAMI reindeer stew - but 'Bidos' on English Wikipedia is a FRENCH COMMUNE, and the soup has no English article of its own. So the dish's name collides with a place, and the dish has no citable English source. | **new-rule** — Same as akutaq for the stateless origin (tradition, not cuisine), plus a sense-qualified canonical_name and a non-English source. The Sami tradition is a new value. |
| 29 | `ohaw` | Ohaw | stateless-peoples | An AINU soup - the Ainu are the relevant people, NOT the Sami. They are a pre-state people of northern Japan, and the dish is their blood soup. So again: no modern state of origin, and the tradition must name the right people. | **new-rule** — Same as akutaq: tradition rather than cuisine, with the Ainu as a new tradition value. NOTE the CORRECTION - 'Ohaw' is AINU, not Sami, and the model would have carried the wrong tradition without reading the source closely. |
| 30 | `casu_marzu` | Casu martzu | legal-ethical-edge | A FERMENTED SHEEP'S MILK CHEESE with an explicit ITALIAN AND EU LEGAL BAN, and a Corsican variant (casgiu merzu) that is legal. So the dish is legal in one jurisdiction and criminal in another, and the model has NO dimension for legal status. | **new-dimension** — New dimension 'legal status' - a fact about a dish, per-jurisdiction, that no existing dimension can hold. This is the clearest case in the set for a new dimension. NOTE: 'Casu marzu' redirects to 'Casu martzu'. |
| 31 | `sannakji` | San-nakji | legal-ethical-edge | Raw dog meat, with an explicit ethical controversy (PETA protests and proponents' rebuttal both documented). So the dish has a social and ethical dimension the model has nowhere to put, and no way to mark 'contested but not banned'. | **new-dimension** — New dimension 'legal status' with a 'contested' value, OR a dish-level sensitivity note. The legal-status dimension covers casu martzu; a sensitivity note covers this. |
| 32 | `balut` | Balut (food) | legal-ethical-edge | A FILIPINO DUCK FETUS, culturally significant in the Philippines and illegal in many other jurisdictions. 'Balut' on enwiki is a DISAMBIGUATION page, so the name needs qualifying too. | **new-dimension** — The same legal-status dimension. The cultural-significance half is a tradition value (Filipino National already exists). |
| 33 | `escamoles` | Escamol | legal-ethical-edge | MEXICAN ANT LARVAE - the article names the species as Liometopum apiculatum and L. occidentale var. luctuosum, calls them "Mexican caviar", says they are "most commonly consumed in Mexico City and surrounding areas" and that they "have been consumed in Mexico since the age of the Aztecs". So there is a specific regional identity, a taxonomic identity the model cannot record, a cultural-sensitivity dimension - and NO family value for a larval insect food. 'Appetizer' is a COURSE, not a family, so a family is genuinely needed here. | **new-dimension** — The legal-status dimension covers the sensitivity; 'Mexican' plus a tradition covers the identity. But note there is no family for a larval insect food - NEW FAMILY 'Insect food' (or a more general 'Entomophagy'). NOTE: 'Escamoles' redirects to 'Escamol'. |
| 34 | `surstromming` | Surströmming | extreme-fermentation | A Swedish ORDINANCE forbids selling the current year's production before the third Thursday in August, and the smell is the dish's defining feature. So the dish has a seasonal LEGAL dimension and a sensory property the model cannot record. | **new-dimension** — 'Fermented Dish' exists, so the family fits. The seasonal legal restriction needs the legal-status dimension AGAIN - a second case for it, which strengthens the case. |
| 35 | `natto` | Natto | extreme-fermentation | A FERMENTED SOYBEAN food, everyday in Japan, with a strong regional identity (Katsushika) and a reputation that is a cultural fact rather than a nutritional one. | **new-rule** — NO NEW VOCABULARY - 'Fermented Dish' and 'Breakfast' both exist. A CONTROL CASE: the model handles it. |
| 36 | `stinky_tofu` | Stinky tofu | extreme-fermentation | A FERMENTED TOFU sold as street food across several Chinese traditions, each with its own name. So the same preparation is one dish with several regional names AND several cuisines. | **new-rule** — NO NEW VOCABULARY. The regional names are name variants and the traditions are traditions. Another case the model already handles. |
| 37 | `chop_suey` | Chop suey | no-fixed-composition | 'Generally consisting of' meat, eggs, vegetables and starch-thickened sauce, and the name is used across MANY overseas-Chinese cuisines. So the dish has NO fixed composition, NO single origin, and the name denotes a METHOD rather than a recipe. There is no stir-fry FAMILY value - 'Stir Frying' is a technique - so the family genuinely has no home. | **new-vocab-value** — The variable composition is a 'composed of' question (the components are statements), and the many cuisines are competing statements with cuisine unset(disputed). But the family needs a home: either a new family value for method-defined dishes, or a rule that such a dish takes a family from its dominant technique. |
| 38 | `bubble_and_squeak` | Bubble and squeak | no-fixed-composition | Potato and cabbage, and early versions contained COOKED BEEF while by the mid-20th century vegetables became principal. So the dish's composition CHANGED over time, and the NAME is not a description of anything. | **new-rule** — The composition history is competing statements over time, which Q1's 'period' qualifier carries. 'Side Dish' fits. NO NEW VOCABULARY. |
| 39 | `budae_jjigae` | Budae-jjigae | no-fixed-composition | A POSTWAR Korean dish literally assembled from military-surplus ingredients (the name means 'army base stew'), with a HIGHLY VARIABLE ingredient set, and Spam legally available in South Korea only from 1987. So: a dish named after a historical event, with no fixed composition and a legal date boundary. | **new-dimension** — The 'composed of' dimension handles the variable ingredients. The name-as-event is a naming rule. The 1987 Spam date is a statement with a period qualifier. 'Stew' fits as the family. |
| 40 | `stone_soup` | Stone Soup | no-fixed-composition | Wikipedia confirms it is a EUROPEAN FOLK STORY / PARABLE, not a verified recipe, with alternate names axe soup, button soup, nail soup, bolt soup and wood soup. So it is a LEGEND: no recipe, no composition, no single form. | **out-of-scope** — OUT OF SCOPE as a dish. It is folklore, and the catalogue should say so rather than publish a recipe-shaped row for a parable - either omit it, or hold it in a clearly separate folklore collection. |
| 41 | `instant_noodles` | Instant noodles | person-date-border | Momofuku Ando, Nissin Foods, 1958 as Chikin Ramen; Cup Noodles 1971. But the dish is now global and CONTESTED between Japan and Korea over its status as a national dish - the national-dish claim is itself a political assertion. | **new-rule** — The creator and date are a statement with a period qualifier (Q1). The contested national status is competing statements. NO NEW VOCABULARY - a control case. |
| 42 | `caesar_salad` | Caesar salad | person-date-border | A SINGLE documented creator and date - Caesar Cardini, 4 July 1924, Tijuana - and it is PREPARED TABLESIDE at the original venue, so it is the table-cooked case too. Also a named-after-a-person case, and a border case: Tijuana is Mexican, Cardini was Italian-Canadian, and the salad is claimed by both Mexico and the US. | **new-vocab-value** — The creator/date is a statement. The table-cooked property needs the 'Table' context value. The Mexico-vs-US origin is competing statements. 'Salad' fits. |
| 43 | `pavlova` | Pavlova | person-date-border | Named after ANNA PAVLOVA (a person), with a FAMOUSLY DISPUTED country of origin between Australia and New Zealand - the two countries jointly petitioned for the recipe and the dispute is still active. So: a person-name, a disputed origin between two modern states, and a dessert whose country attribution is a matter of national record. | **new-rule** — The person-name is a 'named_after' statement (the predicate already exists). The disputed origin is competing statements with cuisine unset(disputed) - the CTM pattern exactly. NO NEW VOCABULARY. |
| 44 | `nachos` | Nachos | person-date-border | Created by Ignacio 'Nacho' Anaya in 1943 at the Victory Club, Piedras Negras - a MEXICAN place, on the US border, and the dish is claimed by both countries. The nickname in the name is the creator's. | **new-rule** — The creator/date/place is a statement with a period qualifier. The Mexico-vs-US claim is competing statements. 'Side Dish' fits. |
| 45 | `peach_melba` | Peach Melba | named-after-a-person | Auguste Escoffier, 1892 or 1893, the Savoy Hotel, LONDON, for Nellie Melba. So the dish is named after a PERSON, created by ANOTHER person, in a THIRD country, and the date is uncertain by a year. The 'named_after' predicate exists but is modelled as a typed literal 'person_name', so it can hold the name but not the fact that the person is a soprano, and the creation facts need their own statement. | **new-rule** — NO NEW VOCABULARY: 'named_after' and 'created_by' both exist. What is needed is a statement carrying the place and the period, which Q1's qualifiers already provide. The 'person_name' literal is a marked exception and stays as it is. |
| 46 | `beef_wellington` | Beef Wellington | named-after-a-person | Named after a PERSON (the Duke of Wellington) and attributed to a cook, with a contested first-recorded instance. So the name references a historical figure, which is a different kind of person from a living creator, and the attribution is a scholarly dispute. | **new-rule** — NO NEW VOCABULARY - 'named_after' exists. The contested attribution is competing statements. Note the distinction the model must carry: a name referencing a person is NOT the same fact as 'created_by'. |
| 47 | `cendol` | Cendol | food-drink-boundary | A DESSERT THAT IS ALSO A DRINK - shaved ice with sweet green beans and coconut milk, served in a bowl - and it has SIX names (cendol, lot chong, mont let saung, nom lut, lod song, banh lot) plus SWEET and SAVOURY/FRIED variants. So the food/drink boundary is crossed by the same dish, and there is no 'other name' concept. | **new-rule** — 'Dessert' and 'Drink' are BOTH courses, so the course is genuinely ambiguous - and the model has no way to say 'both'. The six names are name variants. The savoury/fried version is a separate dish (a fried cendol), which the model can express as a variant statement. |
| 48 | `bubble_tea` | Bubble tea | food-drink-boundary | A DRINK with a solid component eaten through a straw, with TWO competing Taiwan origin claims (Chun Shui Tang, Taichung 1987, and Hanlin Tea Room, Tainan 1986) and a 2019 non-patentability ruling. So: the food/drink boundary, a solid component, and a disputed origin. | **new-rule** — 'Drink' as the course fits. The tapioca pearls are an INGREDIENT, not a second preparation. The disputed origin is competing statements. NO NEW VOCABULARY. |
| 49 | `champurrado` | Champurrado | food-drink-boundary | Explicitly a WARM THICK MEXICAN BEVERAGE - a chocolate-based atole, wisked with a molinillo - eaten at Day of the Dead and Las Posadas. So it is a DRINK that is also a ceremonial FOOD, straddling the Drink and Dessert courses. | **new-rule** — 'Drink' as the course and 'Festival / ceremonial' as the context, both of which exist. So this case is ALREADY EXPRESSIBLE - a control case. |
| 50 | `hardtack` | Hardtack | no-place | A dense flour-and-water CRACKER, a MOBILE naval, military and migration ration with NO specific place origin. So the origin slot has nothing to point at, and unlike the stateless-peoples cases there is no people or tradition to point at either. The purest 'no place' case in the set. | **new-rule** — 'cuisine' unset with reason 'not_applicable' - which the unset_reason mechanism already supports, and it is one of the three reasons the project agreed. NO NEW VOCABULARY and no new dimension: the model's honest answer is 'there is no place', and it can now record that. |

---

## The breaks, by type

- **new-rule**: 29 dishes
- **new-dimension**: 12 dishes
- **new-vocab-value**: 8 dishes
- **out-of-scope**: 1 dishes

### Which need a NEW VOCABULARY VALUE

- **`biscuit`** — New vocabulary value 'Dry biscuit', plus a disambiguation rule: a dish whose name has multiple documented senses gets a sense-qualified canonical_name and its own row.
- **`lahmacun`** — New family value 'Flatbread' - which would cover lahmacun, pide, lavash, manakish, saj and matzo, so it is not a one-dish value.
- **`hot_pot`** — New context value 'Table' (or a 'cooked_at' qualifier on the statement) alongside Home/Restaurant/Market/Street food.
- **`cheese_fondue`** — New context value 'Table' plus a technique value 'Melting'.
- **`raclette`** — New context value 'Table'; the technique is 'Melting' plus 'Scraping'.
- **`samgyeopsal`** — New context value 'Table'.
- **`chop_suey`** — The variable composition is a 'composed of' question (the components are statements), and the many cuisines are competing statements with cuisine unset(disputed).
- **`caesar_salad`** — The creator/date is a statement.

### Which need a NEW DIMENSION

- **`thali`** — New dimension 'composed of' (a dish is composed of other dishes) - the one thing the model genuinely cannot express.
- **`rijsttafel`** — The 'composed of' dimension plus a 'Meal' family.
- **`meze`** — The 'composed of' dimension, OR declare it out of scope as a dish and keep it as a tradition value - the second is cheaper and arguably more honest, since meze is a way of eating rather than a food.
- **`banchan`** — The 'composed of' dimension.
- **`nasi_campur`** — The 'composed of' dimension handles the variable composition; the three names are NAME VARIANTS of one dish, not three dishes.
- **`potjiekos`** — The 'composed of' dimension plus a naming rule for vessel-named dishes.
- **`casu_marzu`** — New dimension 'legal status' - a fact about a dish, per-jurisdiction, that no existing dimension can hold.
- **`sannakji`** — New dimension 'legal status' with a 'contested' value, OR a dish-level sensitivity note.
- **`balut`** — The same legal-status dimension.
- **`escamoles`** — The legal-status dimension covers the sensitivity; 'Mexican' plus a tradition covers the identity.
- **`surstromming`** — 'Fermented Dish' exists, so the family fits.
- **`budae_jjigae`** — The 'composed of' dimension handles the variable ingredients.

### Which need only a NEW RULE (no schema change)

**29 of the 50.** This is the important finding: most of the set does NOT break the model.

- `japanese_curry`
- `hainanese_chicken_rice`
- `baklava`
- `ajvar`
- `pilaf`
- `paella`
- `bo_zaai_fan`
- `cassoulet`
- `lawar`
- `pan_de_muerto`
- `kutia`
- `kagami_mochi`
- `garum`
- `tuhu`
- `akutaq`
- `bidos`
- `ohaw`
- `natto`
- `stinky_tofu`
- `bubble_and_squeak`
- `instant_noodles`
- `pavlova`
- `nachos`
- `peach_melba`
- `beef_wellington`
- `cendol`
- `bubble_tea`
- `champurrado`
- `hardtack`

### Out of scope

- **`stone_soup`** — OUT OF SCOPE as a dish. It is folklore, and the catalogue should say so rather than publish a recipe-shaped row for a parable - either omit it, or hold it in a clearly separate folklore collection.

### Name and source findings worth carrying forward

| dish | finding |
|---|---|
| `bo_zaai_fan` | no English article - must not be given an invented title |
| `lawar` | 'Lawar' is a place, not the food - name collision |
| `pan_de_muerto` | control case - the model already handles it |
| `tuhu` | no English article - must not be given an invented title |
| `akutaq` | redirect: Akutaq -> Alaskan ice cream |
| `bidos` | name collides with a place; no dish article |
| `ohaw` | FACTUAL CORRECTION: Ainu, not Sami |
| `casu_marzu` | redirect: Casu marzu -> Casu martzu |
| `sannakji` | redirect: Sannakji -> San-nakji |
| `balut` | 'Balut' is a disambiguation page |
| `escamoles` | redirect: Escamoles -> Escamol; needs a new family |
| `natto` | control case - the model already handles it |
| `instant_noodles` | control case |
| `champurrado` | control case - the model already handles it |

---

## The proposed dimensions, and what each would carry

| dimension | dishes | what it records | why the model needs it |
|---|---|---|---|
| **`composed of`** | thali, rijsttafel, meze, banchan, nasi campur, potjiekos, budae-jjigae, chop suey | a dish is a SET of other dishes | a meal and a dish are different things and the model has one concept for both |
| **`legal status`** | casu martzu, san-nakji, balut, escamoles, surströmming | per-jurisdiction legality, and 'contested' | a fact about a dish, per-jurisdiction, that no dimension can hold |
| **`Table` context value** | hot pot, fondue, raclette, samgyeopsal, caesar salad | the dish is cooked at the table by the diner | 'where and how it is eaten' is exactly what the context dimension is for |
| **`name variant`** | pilaf, cendol, meze, nasi campur | a name under which the same dish is known | one canonical name currently has to cover 26 regional forms |
| **`form`** | pilaf, nasi campur, ajvar | a named variant of a shared preparation | a form is not a separate dish, but it is not the same claim either |

---

## The findings that change the plan

1. **THREE things are needed, not one.** 'composed of' (a meal is a set),
   'legal status' (a dish can be criminal in one country and ordinary in
   another), and either a 'Table' context value or a 'cooked_at' qualifier.
   The first two are genuine new dimensions; the third fits an existing one.

2. **THE FOOD/DRINK BOUNDARY IS NOT A NEW DIMENSION.** 'Drink' is already a
   course and 'Dessert' is already a course, so a dish that is both is a
   course question the vocabulary already half-answers. The one genuine
   issue is that the model cannot say 'both'.

3. **THE MEAL CASE IS THE BIGGEST SINGLE FINDING.** Five dishes (thali,
   rijsttafel, meze, banchan, nasi campur) are sets of dishes, not
   preparations, and the model has no way to express that. 'composed of' is
   the single most valuable addition.

4. **PILAF IS THE EXTREME CASE** — 26 national traditions and ~25 named
   forms under one name. The answer is NOT 26 dishes: it is one dish with a
   form dimension and competing statements for the cuisines.

5. **MOST OF THE SET DOES NOT BREAK THE MODEL.** A quarter of the dishes
   need only a rule, and a further group needs a vocabulary value that
   ALREADY exists (Fermented Dish for natto and stinky tofu, Casserole for
   cassoulet, Salad for caesar salad, Bread for pan de muerto). The model's
   problem is not that the vocabulary is too small; it is that it has no way
   to say 'a set of things', 'a set of names', or 'this varies by law'.

6. **TWO DISHES HAVE NO ENGLISH WIKIPEDIA ARTICLE** — bo zai fan and
   tuh'u, verified across en/zh/id/ms/sg/zh-min-nan/ar/he/fa. They need a
   non-English source with the citation language recorded, and they must not
   be given an invented English title.

7. **TWO NAME COLLISIONS WITH PLACES.** 'Lawar' is a town in Uttar Pradesh
   (the food is 'Lawar (food)'), and 'Bidos' is a French commune (the Sami
   soup has no article of its own). A dish name that is also a place name
   needs a sense-qualified canonical_name.

8. **ONE FACTUAL CORRECTION.** 'Ohaw' is an AINU soup, NOT Sami — the Ainu
   are the relevant people. The model would have carried the wrong tradition
   if the source had not been read closely.

