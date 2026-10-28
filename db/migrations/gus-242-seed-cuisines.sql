-- =====================================================================
-- GUS-242 step 1d — the national cuisine values.
--
-- Source: en.wikipedia 'Category:Cuisine by country' — 190 branches,
-- of which 22 are by-AXIS branches (Breads, Condiments, Desserts, Rice
-- dishes, ...) and 4 are not cuisines at all (National dishes, Prepared
-- foods by country and main ingredient, Sauces by origin, Cuisine by
-- country subdivision). Those 26 are EXCLUDED: an axis is a dish-type
-- dimension, not a cuisine.
--
-- 31 of the 190 already exist. This adds the remaining 156, so the
-- catalogue ends with one national cuisine per country.
--
-- SLUG AND DISPLAY NAME are the BARE DEMONYM ('indonesian' /
-- 'Indonesian'), matching the 31 existing rows. Wikipedia's 'Indonesian
-- cuisine' is the SOURCE LIST, not the stored form. Other locales go in
-- dish_cuisine_translations.
--
-- The descriptions are OUR OWN one-liners, not Wikipedia's wording —
-- Wikipedia text is CC BY-SA, and identifiers are facts but prose is not
-- free to copy.
--
-- Northern Cyprus is seeded with a NULL country reference: it is a
-- recognised region, not a separate state.
--
-- Generated 2026-10-28T05:49:33Z
-- =====================================================================

BEGIN;

-- The country reference, so a cuisine can be tied to its country.
-- It is a REFERENCE, not a foreign key: the cuisine vocabulary is
-- national-by-convention, and a cuisine whose country row is absent
-- (Northern Cyprus) is still a valid value.
ALTER TABLE dish_cuisines
  ADD COLUMN IF NOT EXISTS country_code text;

-- The new values.
INSERT INTO dish_cuisines (id, slug, name, description, country_code)
SELECT v.id, v.slug, v.name, v.description, v.country_code
FROM (VALUES
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:afghan'::text), 'afghan', 'Afghan', 'The national culinary tradition of Afghan (AF).', 'AF'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:albanian'::text), 'albanian', 'Albanian', 'The national culinary tradition of Albanian (AL).', 'AL'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:algerian'::text), 'algerian', 'Algerian', 'The national culinary tradition of Algerian (DZ).', 'DZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:andorran'::text), 'andorran', 'Andorran', 'The national culinary tradition of Andorran (AD).', 'AD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:angolan'::text), 'angolan', 'Angolan', 'The national culinary tradition of Angolan (AO).', 'AO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:antigua-and-barbuda'::text), 'antigua-and-barbuda', 'Antigua and Barbuda', 'The national culinary tradition of Antigua and Barbuda (AG).', 'AG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:armenian'::text), 'armenian', 'Armenian', 'The national culinary tradition of Armenian (AM).', 'AM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:australian'::text), 'australian', 'Australian', 'The national culinary tradition of Australian (AU).', 'AU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:azerbaijani'::text), 'azerbaijani', 'Azerbaijani', 'The national culinary tradition of Azerbaijani (AZ).', 'AZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bahamian'::text), 'bahamian', 'Bahamian', 'The national culinary tradition of Bahamian (BS).', 'BS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bahraini'::text), 'bahraini', 'Bahraini', 'The national culinary tradition of Bahraini (BH).', 'BH'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bangladeshi'::text), 'bangladeshi', 'Bangladeshi', 'The national culinary tradition of Bangladeshi (BD).', 'BD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:barbadian'::text), 'barbadian', 'Barbadian', 'The national culinary tradition of Barbadian (BB).', 'BB'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:belarusian'::text), 'belarusian', 'Belarusian', 'The national culinary tradition of Belarusian (BY).', 'BY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:belgian'::text), 'belgian', 'Belgian', 'The national culinary tradition of Belgian (BE).', 'BE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:belizean'::text), 'belizean', 'Belizean', 'The national culinary tradition of Belizean (BZ).', 'BZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:beninese'::text), 'beninese', 'Beninese', 'The national culinary tradition of Beninese (BJ).', 'BJ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bhutanese'::text), 'bhutanese', 'Bhutanese', 'The national culinary tradition of Bhutanese (BT).', 'BT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bolivian'::text), 'bolivian', 'Bolivian', 'The national culinary tradition of Bolivian (BO).', 'BO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bosnia-and-herzegovina'::text), 'bosnia-and-herzegovina', 'Bosnia and Herzegovina', 'The national culinary tradition of Bosnia and Herzegovina (BA).', 'BA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:botswana'::text), 'botswana', 'Botswana', 'The national culinary tradition of Botswana (BW).', 'BW'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:british'::text), 'british', 'British', 'The national culinary tradition of British (GB).', 'GB'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bruneian'::text), 'bruneian', 'Bruneian', 'The national culinary tradition of Bruneian (BN).', 'BN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:bulgarian'::text), 'bulgarian', 'Bulgarian', 'The national culinary tradition of Bulgarian (BG).', 'BG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:burkinabe'::text), 'burkinabe', 'Burkinabe', 'The national culinary tradition of Burkinabe (BF).', 'BF'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:burmese'::text), 'burmese', 'Burmese', 'The national culinary tradition of Burmese (MM).', 'MM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:burundian'::text), 'burundian', 'Burundian', 'The national culinary tradition of Burundian (BI).', 'BI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:cambodian'::text), 'cambodian', 'Cambodian', 'The national culinary tradition of Cambodian (KH).', 'KH'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:cameroonian'::text), 'cameroonian', 'Cameroonian', 'The national culinary tradition of Cameroonian (CM).', 'CM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:cape-verdean'::text), 'cape-verdean', 'Cape Verdean', 'The national culinary tradition of Cape Verdean (CV).', 'CV'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:chadian'::text), 'chadian', 'Chadian', 'The national culinary tradition of Chadian (TD).', 'TD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:chilean'::text), 'chilean', 'Chilean', 'The national culinary tradition of Chilean (CL).', 'CL'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:costa-rican'::text), 'costa-rican', 'Costa Rican', 'The national culinary tradition of Costa Rican (CR).', 'CR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:croatian'::text), 'croatian', 'Croatian', 'The national culinary tradition of Croatian (HR).', 'HR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:cuban'::text), 'cuban', 'Cuban', 'The national culinary tradition of Cuban (CU).', 'CU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:cypriot'::text), 'cypriot', 'Cypriot', 'The national culinary tradition of Cypriot (CY).', 'CY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:czech'::text), 'czech', 'Czech', 'The national culinary tradition of Czech (CZ).', 'CZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:danish'::text), 'danish', 'Danish', 'The national culinary tradition of Danish (DK).', 'DK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:democratic-republic-of-the-congo'::text), 'democratic-republic-of-the-congo', 'Democratic Republic of the Congo', 'The national culinary tradition of Democratic Republic of the Congo (CD).', 'CD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:djiboutian'::text), 'djiboutian', 'Djiboutian', 'The national culinary tradition of Djiboutian (DJ).', 'DJ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:dominica'::text), 'dominica', 'Dominica', 'The national culinary tradition of Dominica (DM).', 'DM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:dominican-republic'::text), 'dominican-republic', 'Dominican Republic', 'The national culinary tradition of Dominican Republic (DO).', 'DO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:dutch'::text), 'dutch', 'Dutch', 'The national culinary tradition of Dutch (NL).', 'NL'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:ecuadorian'::text), 'ecuadorian', 'Ecuadorian', 'The national culinary tradition of Ecuadorian (EC).', 'EC'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:egyptian'::text), 'egyptian', 'Egyptian', 'The national culinary tradition of Egyptian (EG).', 'EG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:emirati'::text), 'emirati', 'Emirati', 'The national culinary tradition of Emirati (AE).', 'AE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:eritrean'::text), 'eritrean', 'Eritrean', 'The national culinary tradition of Eritrean (ER).', 'ER'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:estonian'::text), 'estonian', 'Estonian', 'The national culinary tradition of Estonian (EE).', 'EE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:fijian'::text), 'fijian', 'Fijian', 'The national culinary tradition of Fijian (FJ).', 'FJ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:finnish'::text), 'finnish', 'Finnish', 'The national culinary tradition of Finnish (FI).', 'FI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:gabonese'::text), 'gabonese', 'Gabonese', 'The national culinary tradition of Gabonese (GA).', 'GA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:gambian'::text), 'gambian', 'Gambian', 'The national culinary tradition of Gambian (GM).', 'GM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:georgian'::text), 'georgian', 'Georgian', 'The national culinary tradition of Georgian (GE).', 'GE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:german'::text), 'german', 'German', 'The national culinary tradition of German (DE).', 'DE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:ghanaian'::text), 'ghanaian', 'Ghanaian', 'The national culinary tradition of Ghanaian (GH).', 'GH'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:grenadian'::text), 'grenadian', 'Grenadian', 'The national culinary tradition of Grenadian (GD).', 'GD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:guatemalan'::text), 'guatemalan', 'Guatemalan', 'The national culinary tradition of Guatemalan (GT).', 'GT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:guinean'::text), 'guinean', 'Guinean', 'The national culinary tradition of Guinean (GN).', 'GN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:guyanese'::text), 'guyanese', 'Guyanese', 'The national culinary tradition of Guyanese (GY).', 'GY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:haitian'::text), 'haitian', 'Haitian', 'The national culinary tradition of Haitian (HT).', 'HT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:honduran'::text), 'honduran', 'Honduran', 'The national culinary tradition of Honduran (HN).', 'HN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:icelandic'::text), 'icelandic', 'Icelandic', 'The national culinary tradition of Icelandic (IS).', 'IS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:iranian'::text), 'iranian', 'Iranian', 'The national culinary tradition of Iranian (IR).', 'IR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:iraqi'::text), 'iraqi', 'Iraqi', 'The national culinary tradition of Iraqi (IQ).', 'IQ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:irish'::text), 'irish', 'Irish', 'The national culinary tradition of Irish (IE).', 'IE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:ivorian'::text), 'ivorian', 'Ivorian', 'The national culinary tradition of Ivorian (CI).', 'CI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:jamaican'::text), 'jamaican', 'Jamaican', 'The national culinary tradition of Jamaican (JM).', 'JM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:kazakh'::text), 'kazakh', 'Kazakh', 'The national culinary tradition of Kazakh (KZ).', 'KZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:kenyan'::text), 'kenyan', 'Kenyan', 'The national culinary tradition of Kenyan (KE).', 'KE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:kosovan'::text), 'kosovan', 'Kosovan', 'The national culinary tradition of Kosovan (XK).', 'XK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:kuwaiti'::text), 'kuwaiti', 'Kuwaiti', 'The national culinary tradition of Kuwaiti (KW).', 'KW'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:kyrgyz'::text), 'kyrgyz', 'Kyrgyz', 'The national culinary tradition of Kyrgyz (KG).', 'KG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:lao'::text), 'lao', 'Lao', 'The national culinary tradition of Lao (LA).', 'LA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:latvian'::text), 'latvian', 'Latvian', 'The national culinary tradition of Latvian (LV).', 'LV'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:liberian'::text), 'liberian', 'Liberian', 'The national culinary tradition of Liberian (LR).', 'LR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:libyan'::text), 'libyan', 'Libyan', 'The national culinary tradition of Libyan (LY).', 'LY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:liechtenstein'::text), 'liechtenstein', 'Liechtenstein', 'The national culinary tradition of Liechtenstein (LI).', 'LI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:lithuanian'::text), 'lithuanian', 'Lithuanian', 'The national culinary tradition of Lithuanian (LT).', 'LT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:luxembourg'::text), 'luxembourg', 'Luxembourg', 'The national culinary tradition of Luxembourg (LU).', 'LU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:macedonian'::text), 'macedonian', 'Macedonian', 'The national culinary tradition of Macedonian (MK).', 'MK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:malagasy'::text), 'malagasy', 'Malagasy', 'The national culinary tradition of Malagasy (MG).', 'MG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:malawian'::text), 'malawian', 'Malawian', 'The national culinary tradition of Malawian (MW).', 'MW'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:malaysian'::text), 'malaysian', 'Malaysian', 'The national culinary tradition of Malaysian (MY).', 'MY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:maldivian'::text), 'maldivian', 'Maldivian', 'The national culinary tradition of Maldivian (MV).', 'MV'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:malian'::text), 'malian', 'Malian', 'The national culinary tradition of Malian (ML).', 'ML'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:maltese'::text), 'maltese', 'Maltese', 'The national culinary tradition of Maltese (MT).', 'MT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:mauritanian'::text), 'mauritanian', 'Mauritanian', 'The national culinary tradition of Mauritanian (MR).', 'MR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:mauritian'::text), 'mauritian', 'Mauritian', 'The national culinary tradition of Mauritian (MU).', 'MU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:moldovan'::text), 'moldovan', 'Moldovan', 'The national culinary tradition of Moldovan (MD).', 'MD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:monegasque'::text), 'monegasque', 'Monegasque', 'The national culinary tradition of Monegasque (MC).', 'MC'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:mongolian'::text), 'mongolian', 'Mongolian', 'The national culinary tradition of Mongolian (MN).', 'MN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:montenegrin'::text), 'montenegrin', 'Montenegrin', 'The national culinary tradition of Montenegrin (ME).', 'ME'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:namibian'::text), 'namibian', 'Namibian', 'The national culinary tradition of Namibian (NA).', 'NA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:nauruan'::text), 'nauruan', 'Nauruan', 'The national culinary tradition of Nauruan (NR).', 'NR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:nepalese'::text), 'nepalese', 'Nepalese', 'The national culinary tradition of Nepalese (NP).', 'NP'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:new-zealand'::text), 'new-zealand', 'New Zealand', 'The national culinary tradition of New Zealand (NZ).', 'NZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:nicaraguan'::text), 'nicaraguan', 'Nicaraguan', 'The national culinary tradition of Nicaraguan (NI).', 'NI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:nigerien'::text), 'nigerien', 'Nigerien', 'The national culinary tradition of Nigerien (NE).', 'NE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:north-korean'::text), 'north-korean', 'North Korean', 'The national culinary tradition of North Korean (KP).', 'KP'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:northern-cyprus'::text), 'northern-cyprus', 'Northern Cyprus', 'A regional culinary tradition (Northern Cyprus), not a separate national cuisine.', NULL),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:norwegian'::text), 'norwegian', 'Norwegian', 'The national culinary tradition of Norwegian (NO).', 'NO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:omani'::text), 'omani', 'Omani', 'The national culinary tradition of Omani (OM).', 'OM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:pakistani'::text), 'pakistani', 'Pakistani', 'The national culinary tradition of Pakistani (PK).', 'PK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:palestinian'::text), 'palestinian', 'Palestinian', 'The national culinary tradition of Palestinian (PS).', 'PS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:panamanian'::text), 'panamanian', 'Panamanian', 'The national culinary tradition of Panamanian (PA).', 'PA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:papua-new-guinean'::text), 'papua-new-guinean', 'Papua New Guinean', 'The national culinary tradition of Papua New Guinean (PG).', 'PG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:paraguayan'::text), 'paraguayan', 'Paraguayan', 'The national culinary tradition of Paraguayan (PY).', 'PY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:qatari'::text), 'qatari', 'Qatari', 'The national culinary tradition of Qatari (QA).', 'QA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:republic-of-the-congo'::text), 'republic-of-the-congo', 'Republic of the Congo', 'The national culinary tradition of Republic of the Congo (CG).', 'CG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:romanian'::text), 'romanian', 'Romanian', 'The national culinary tradition of Romanian (RO).', 'RO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:russian'::text), 'russian', 'Russian', 'The national culinary tradition of Russian (RU).', 'RU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:rwandan'::text), 'rwandan', 'Rwandan', 'The national culinary tradition of Rwandan (RW).', 'RW'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:s-o-tom-and-pr-ncipe'::text), 's-o-tom-and-pr-ncipe', 'São Tomé and Príncipe', 'The national culinary tradition of São Tomé and Príncipe (ST).', 'ST'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:saint-kitts-and-nevis'::text), 'saint-kitts-and-nevis', 'Saint Kitts and Nevis', 'The national culinary tradition of Saint Kitts and Nevis (KN).', 'KN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:saint-lucian'::text), 'saint-lucian', 'Saint Lucian', 'The national culinary tradition of Saint Lucian (LC).', 'LC'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:saint-vincent-and-the-grenadines'::text), 'saint-vincent-and-the-grenadines', 'Saint Vincent and the Grenadines', 'The national culinary tradition of Saint Vincent and the Grenadines (VC).', 'VC'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:salvadoran'::text), 'salvadoran', 'Salvadoran', 'The national culinary tradition of Salvadoran (SV).', 'SV'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:sammarinese'::text), 'sammarinese', 'Sammarinese', 'The national culinary tradition of Sammarinese (SM).', 'SM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:samoan'::text), 'samoan', 'Samoan', 'The national culinary tradition of Samoan (WS).', 'WS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:saudi-arabian'::text), 'saudi-arabian', 'Saudi Arabian', 'The national culinary tradition of Saudi Arabian (SA).', 'SA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:senegalese'::text), 'senegalese', 'Senegalese', 'The national culinary tradition of Senegalese (SN).', 'SN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:serbian'::text), 'serbian', 'Serbian', 'The national culinary tradition of Serbian (RS).', 'RS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:seychellois'::text), 'seychellois', 'Seychellois', 'The national culinary tradition of Seychellois (SC).', 'SC'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:sierra-leonean'::text), 'sierra-leonean', 'Sierra Leonean', 'The national culinary tradition of Sierra Leonean (SL).', 'SL'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:slovak'::text), 'slovak', 'Slovak', 'The national culinary tradition of Slovak (SK).', 'SK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:slovenian'::text), 'slovenian', 'Slovenian', 'The national culinary tradition of Slovenian (SI).', 'SI'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:solomon-islands'::text), 'solomon-islands', 'Solomon Islands', 'The national culinary tradition of Solomon Islands (SB).', 'SB'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:somali'::text), 'somali', 'Somali', 'The national culinary tradition of Somali (SO).', 'SO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:south-african'::text), 'south-african', 'South African', 'The national culinary tradition of South African (ZA).', 'ZA'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:south-korean'::text), 'south-korean', 'South Korean', 'The national culinary tradition of South Korean (KR).', 'KR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:south-sudanese'::text), 'south-sudanese', 'South Sudanese', 'The national culinary tradition of South Sudanese (SS).', 'SS'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:sri-lankan'::text), 'sri-lankan', 'Sri Lankan', 'The national culinary tradition of Sri Lankan (LK).', 'LK'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:sudanese'::text), 'sudanese', 'Sudanese', 'The national culinary tradition of Sudanese (SD).', 'SD'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:surinamese'::text), 'surinamese', 'Surinamese', 'The national culinary tradition of Surinamese (SR).', 'SR'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:swedish'::text), 'swedish', 'Swedish', 'The national culinary tradition of Swedish (SE).', 'SE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:swiss'::text), 'swiss', 'Swiss', 'The national culinary tradition of Swiss (CH).', 'CH'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:syrian'::text), 'syrian', 'Syrian', 'The national culinary tradition of Syrian (SY).', 'SY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:taiwanese'::text), 'taiwanese', 'Taiwanese', 'The national culinary tradition of Taiwanese (TW).', 'TW'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:tajik'::text), 'tajik', 'Tajik', 'The national culinary tradition of Tajik (TJ).', 'TJ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:tanzanian'::text), 'tanzanian', 'Tanzanian', 'The national culinary tradition of Tanzanian (TZ).', 'TZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:the-central-african-republic'::text), 'the-central-african-republic', 'the Central African Republic', 'The national culinary tradition of the Central African Republic (CF).', 'CF'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:timor-leste'::text), 'timor-leste', 'Timor-Leste', 'The national culinary tradition of Timor-Leste (TL).', 'TL'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:togolese'::text), 'togolese', 'Togolese', 'The national culinary tradition of Togolese (TG).', 'TG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:tongan'::text), 'tongan', 'Tongan', 'The national culinary tradition of Tongan (TO).', 'TO'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:trinidad-and-tobago'::text), 'trinidad-and-tobago', 'Trinidad and Tobago', 'The national culinary tradition of Trinidad and Tobago (TT).', 'TT'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:tunisian'::text), 'tunisian', 'Tunisian', 'The national culinary tradition of Tunisian (TN).', 'TN'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:turkmen'::text), 'turkmen', 'Turkmen', 'The national culinary tradition of Turkmen (TM).', 'TM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:tuvaluan'::text), 'tuvaluan', 'Tuvaluan', 'The national culinary tradition of Tuvaluan (TV).', 'TV'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:ugandan'::text), 'ugandan', 'Ugandan', 'The national culinary tradition of Ugandan (UG).', 'UG'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:uruguayan'::text), 'uruguayan', 'Uruguayan', 'The national culinary tradition of Uruguayan (UY).', 'UY'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:uzbekistani'::text), 'uzbekistani', 'Uzbekistani', 'The national culinary tradition of Uzbekistani (UZ).', 'UZ'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:vanuatuan'::text), 'vanuatuan', 'Vanuatuan', 'The national culinary tradition of Vanuatuan (VU).', 'VU'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:venezuelan'::text), 'venezuelan', 'Venezuelan', 'The national culinary tradition of Venezuelan (VE).', 'VE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:yemeni'::text), 'yemeni', 'Yemeni', 'The national culinary tradition of Yemeni (YE).', 'YE'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:zambian'::text), 'zambian', 'Zambian', 'The national culinary tradition of Zambian (ZM).', 'ZM'),
  (uuid_generate_v5(uuid_nil(), 'urn:gustale:cuisine:zimbabwean'::text), 'zimbabwean', 'Zimbabwean', 'The national culinary tradition of Zimbabwean (ZW).', 'ZW')
) AS v(id, slug, name, description, country_code)
WHERE NOT EXISTS (SELECT 1 FROM dish_cuisines c WHERE c.slug = v.slug);

-- The 31 PRE-EXISTING cuisines also need their country reference, since
-- the column is new. They are matched on the bare demonym against the
-- seeded country names, and the handful that do not match (a demonym
-- that is not the country name) are left NULL rather than guessed.
UPDATE dish_cuisines c
   SET country_code = v.country_code
  FROM (VALUES
  ('american', 'US'),
  ('argentine', 'AR'),
  ('austrian', 'AT'),
  ('brazilian', 'BR'),
  ('canadian', 'CA'),
  ('chinese', 'CN'),
  ('colombian', 'CO'),
  ('ethiopian', 'ET'),
  ('filipino', 'PH'),
  ('french', 'FR'),
  ('greek', 'GR'),
  ('hungarian', 'HU'),
  ('indian', 'IN'),
  ('indonesian', 'ID'),
  ('israeli', 'IL'),
  ('italian', 'IT'),
  ('japanese', 'JP'),
  ('jordanian', 'JO'),
  ('korean', 'KR'),
  ('lebanese', 'LB'),
  ('mexican', 'MX'),
  ('moroccan', 'MA'),
  ('nigerian', 'NG'),
  ('peruvian', 'PE'),
  ('polish', 'PL'),
  ('portuguese', 'PT'),
  ('spanish', 'ES'),
  ('thai', 'TH'),
  ('turkish', 'TR'),
  ('ukrainian', 'UA'),
  ('vietnamese', 'VN')
) AS v(slug, country_code)
 WHERE c.slug = v.slug AND c.country_code IS NULL;

-- ---------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------
\echo ''
\echo '=== the cuisine vocabulary ==='
SELECT count(*) AS cuisines,
       count(*) FILTER (WHERE country_code IS NOT NULL) AS with_country,
       count(*) FILTER (WHERE country_code IS NULL) AS without_country
FROM dish_cuisines;

\echo '=== the cuisines with no country row ==='
SELECT slug, name FROM dish_cuisines WHERE country_code IS NULL
ORDER BY slug;

\echo '=== the newly added ones, by first letter ==='
SELECT left(slug, 1) AS letter, count(*) FROM dish_cuisines
WHERE country_code IS NOT NULL GROUP BY 1 ORDER BY 1;

\echo '=== no cuisine name is the Wikipedia form ==='
SELECT count(*) AS names_ending_in_cuisine
FROM dish_cuisines WHERE name ~ ' cuisine$';

COMMIT;
