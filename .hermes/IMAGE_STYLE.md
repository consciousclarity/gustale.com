# Gustale Image Style — "Documentary field photography"

> Binding spec for every dish image (AI-generated or real). Owner decision 2026-10-17.
> Supersedes the earlier "editorial magazine" spec. Any image that breaks a rule below is rejected, however pretty.

## The idea
Every dish is photographed the way a food anthropologist would find it: **where it is actually eaten, as it is actually served** — a warung table, a street stall, a home kitchen, an izakaya counter, a taverna. Calm, honest, credible. Not a restaurant shoot, not a recipe blog, not Instagram.

## Constant across all dishes (makes 121 images one collection)
| Axis | Rule |
|---|---|
| Angle | Seated diner's view, 25–40° above the table (image-01 tends to drift low; accept 25°+). Never flat-lay, never table-level hero shot. |
| Framing | One serving, dish centred, filling ~55–65% of frame, so a centred square crop works for cards. |
| Format | Generate 1536×1024 (3:2). Publish WebP only: 1536w (dish page) and 800w (cards/lists). Target < 200 KB. JPG master stays private. |
| Light | Soft natural daylight (open shopfront, window, overcast outdoors). Never flash, studio light, dramatic rim light or hard spotlight. |
| Colour | Neutral-warm, true-to-life, gently muted. No HDR, no oversaturation, no teal-orange grade. |
| Focus | Dish sharp edge-to-edge; background softly out of focus but recognisable (moderate depth of field, ~f/4). |
| Lens look | 35–40mm, candid, slightly imperfect — a real photo, not a render. |

## Varies by dish (this is the authenticity)
- **Setting** true to where the dish is eaten: Indonesian warung (formica/plain wood table, glass of es teh), Indian home or dhaba (steel thali, steel tumbler), Japanese counter or shokudō (lacquer tray, wooden counter), Greek taverna (paper tablecloth), etc.
- **Serveware** that locals actually use: enamel or melamine plate, banana leaf, clay pot, steel thali, bamboo steamer, donburi bowl.
- **Real portions and real mess**: sauce edges, a crumb, a drip — food about to be eaten, not arranged.
- **Traditional accompaniments only** (krupuk, sambal, acar, chutney, pickles, rice) — only if they are actually served with that dish.

## Accuracy first
Every prompt starts with the dish's **defining visual feature** — the thing a local checks first:
gado-gado = peanut sauce poured over everything; rawon = near-black kluwek broth; rendang = dry, dark, caramelised, almost no sauce; babi guling = blistered, puffed crackling; masala dosa = large thin golden crêpe, crisp, folded over potato masala; tonkotsu ramen = opaque creamy white broth.
If that feature is wrong or missing, the image is rejected.

## Lessons from the 2026-10-17 test sheet
- Name what the dish is NOT when the model confuses it (masala dosa: "thin crisp wafer-like crepe, nothing like bread or roti"). Round 1 gave 3 parathas; round 2 fixed it.
- Check background objects for text (a tumbler with lettering = reject).
- Reject toppings the prompt did not ask for (minced meat on ramen, orange threads on rendang).
- Approved references: rendang-3, masala-dosa-v2-3, ramen-japanese-1 (in .hermes/SAMPLES/style-test-2026-10-17/).

## Prompt template
```
Candid documentary photo of a real serving of <dish as locals know it>, as eaten at <real setting, region>:
<defining visual feature, described concretely>. <Key components in real proportions and real colours>.
Served on/in <authentic serveware>, on <real surface>, <one or two true background details, softly out of focus>.
Soft natural daylight from <source>, viewed from about 40 degrees above, 35mm lens, moderate depth of field.
Everyday unstyled plating, slightly messy edges, true-to-life colours, realistic textures.
No food styling, no non-traditional garnish, no studio lighting, no text, no logos, no people, no hands.
```
Build it from the dish's **verified** ingredients and description — never the name alone. Max 1500 characters.

## Hard no's
People, hands, faces · text, signage, logos, branded packaging · overhead flat-lays · glossy magazine/studio look · fake steam · microgreens, edible flowers, gold leaf, fusion garnish · ingredients that are not in the dish · Western serveware for non-Western dishes (and vice versa).

## Quality gate (per dish)
1. Generate 4 candidates (`minimax-image --n 4`).
2. Vision-check each against: defining feature, components, serveware/setting, hard no's, AI artifacts (melted cutlery, impossible food, warped plates).
3. Pick the best; if none passes, rewrite the prompt and regenerate — never publish "close enough".
4. Owner reviews batches until he says otherwise.

## Credit (always visible on the page)
`AI illustration · MiniMax image-01 · <YYYY-MM-DD>` — rendered as figcaption on hero and gallery.
Real photos (Wikimedia Commons, contributors) keep priority when they exist and keep their own license credit.
