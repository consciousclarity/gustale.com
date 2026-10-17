# Gustale Image Style Guide

> **Audience:** every batch of 10 dishes (and any one-off dish image) generated for Gustale. Strictly follow this spec — the lead reviewer rejects any image that violates it.

## Source of truth

Every image is an **AI illustration labeled as such on the page** (front-end renders the `credit` field as a figcaption under both the hero and the gallery lightbox; see `DishCoverHero.tsx` line 96 and `DishGallery.tsx` lightbox figcaption). Real photos (Wikimedia Commons or contributor-submitted) take priority when available. AI fills the gap.

## Fixed art direction (every dish, every time)

| Axis | Spec |
|---|---|
| **Genre** | Editorial food photography. Magazine-quality, never painterly or illustrated. |
| **Lighting** | Natural daylight only. Soft window light from camera-left, gentle shadow on camera-right. No studio strobes, no coloured gels, no dramatic rim-light. |
| **Subject** | The dish itself, plated as it is authentically served in its region of origin. Realistic portion size (a single serving, not a banquet platter). |
| **Serveware** | Authentic regional serveware: clay/earthenware for South-East Asian dishes, ceramic for Mediterranean, lacquerware for East Asian, etc. No white china, no generic restaurant plates, no modern designer ceramics unless that's the authentic style. |
| **Background** | Calm, neutral, slightly desaturated. Solid wood, neutral linen, pale stone, or out-of-focus kitchen counter. Never a busy environment, never a restaurant scene, never a backdrop with branding or text. |
| **Composition** | 3/4 angle, slight overhead, 50–85mm equivalent. Subject occupies ~60% of frame. Shallow depth of field (f/2.8–f/4 look). Rule of thirds. |
| **People** | No people. No hands holding cutlery. No chef in the frame. No diners in the background. |
| **Text** | No text. No words on signage in the background. No chalkboard menus. No overlays. |
| **Logos** | No brand logos. No branded packaging. No product placements. |
| **Garnishes** | Only authentic regional garnishes that belong in the recipe. No micro-herbs, no edible flowers, no gold leaf, no fusion-style "elevated" garnishes that wouldn't be on a home-cooked version. |
| **Color treatment** | Warm, slightly muted. Avoid over-saturated HDR. Think Saveur / Bon Appétit / Cibo magazine covers, not Instagram. |
| **AI artifacts to reject** | Distorted hands, melted cutlery, extra fingers, asymmetric eyes (in any case, no people so mostly N/A), food that defies physics (floating garnishes, sauce pouring in zero gravity), ingredient substitutions that contradict the recipe (e.g. mozzarella on a "Greek" dish). |

## Prompt construction rules

1. **Build the prompt from the dish's verified ingredients + description, NEVER the name alone.** Example: for "Nasi Goreng" the prompt should be: "Indonesian fried rice with kecap manis, garlic, shallots, bird's eye chili, fried shallot garnish, served on a banana leaf with a side of acar and krupuk, on a ceramic plate on a teak wood table" — NOT just "Nasi Goreng".
2. Include:
   - The dish's principal ingredients (2–6)
   - The region (e.g. "Javanese", "Bali", "Minang")
   - The serveware and the surface
   - The lighting ("natural window light from left, soft shadow right")
   - The composition ("3/4 angle, shallow depth of field, magazine editorial food photography")
3. Exclude:
   - The dish name itself (forces the model to construct from ingredients)
   - Any text/logo descriptors
   - "Delicious", "tasty", "yummy" — empty adjectives
   - Hyperbole ("perfect", "amazing", "incredible")
4. Negative prompt: "no text, no logos, no people, no hands, no cutlery distortion, no floating objects, no modern minimalist plating, no fusion garnishes, no white plates unless authentic to the cuisine".

## Generation & QA workflow (per dish)

1. Generate **2–4 candidates** with different seeds at the highest resolution the model supports.
2. For each candidate, run a vision check against the ingredient list:
   - Are the principal ingredients visible and identifiable?
   - Is the serveware authentic for the region?
   - Are the AI-artifact rejection criteria satisfied?
3. **Reject** any candidate that:
   - Shows the wrong dish (cross-check against the recipe)
   - Shows clear AI artifacts (melted cutlery, impossible food, extra fingers)
   - Violates any rule above
4. If **none** of the candidates pass, regenerate (different seeds). **Do not publish a weak one.** It is better to leave a dish with no cover than with a wrong cover.
5. The selected candidate becomes the `cover` media attachment.

## Storage & derivatives

- Store the **original** (highest-resolution export) in MinIO bucket `gustale-media`, key `dishes/<slug>/cover-original.<ext>`.
- Generate a **WebP derivative** at 1600px wide (keep under 400KB), store as `dishes/<slug>/cover.webp`.
- Generate a **thumbnail** at 400px wide for list views, store as `dishes/<slug>/cover-thumb.webp`.
- All three files referenced by the API; the front-end picks the appropriate size for the viewport.

## Media metadata & credit (visible on the page)

Every `media` row must have:
- `alt_text`: a 1-sentence description ("Indonesian fried rice with fried shallot garnish on a banana leaf, served on ceramic").
- `credit`: `"AI illustration — MiniMax <model>, <YYYY-MM-DD>"` (where `<model>` is the actual model name; never write a model name you didn't use). If the model in use is **not** MiniMax (e.g. Flux Dev, SDXL), the credit is `"AI illustration — <model>, <YYYY-MM-DD>"` and we update the `AI_MODEL` constant in the generator script.
- `license`: `"AI-generated"` (a new value distinct from CC-BY-*).
- `source_url`: optional, points to the generation run log if persistent.
- `uploaded_by`: the contributor account that ran the generation.

The front-end already renders `credit` and `license` in both the hero figcaption and the gallery lightbox, so this metadata is **automatically visible** on the page next to the image.

## Cost tracking (per batch)

Every batch log records:
- Model name and revision
- Number of candidates generated per dish
- Number of candidates rejected per dish (and the rejection reason: wrong-dish, AI artifact, serveware mismatch, etc.)
- Per-image cost (cents or API credits)
- Total batch cost

The batch report includes this breakdown so cost trends are visible over time.

## Open questions to resolve before batch 1

1. **Which image generation model?** Per the user, the model must be **MiniMax image generation, highest quality**. The `gustale` profile currently has only text inference providers (`minimax-oauth`, `minimax`) and `MINIMAX_API_KEY` is a text key. No MiniMax image endpoint is configured. The `comfyui` skill is available but only provides local/Comfy-Cloud paths (no MiniMax). This needs an answer before batch 1 can start.
2. **Where do generated images live during the SAMPLES review step?** Per the user's instruction, batch 1 images are placed in `SAMPLES` (presumably a MinIO prefix or a public path) and the URLs are sent back to Alejandro for visual check. The exact bucket and ACL need to be confirmed.
3. **What's the per-batch budget cap?** 10 dishes × 4 candidates = 40 generations. If the chosen model is per-image, that's a non-trivial spend. Cap needed.
