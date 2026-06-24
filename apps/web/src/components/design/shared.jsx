/* GUSTALE — shared data + helpers */

// Placeholder tile with a mono caption
function Placeholder({ label, h = 200, r = 5, t1 = '#E7DCC8', t2 = '#DCCFB4', style = {} }) {
  return (
    <div className="ph" style={{
      height: h, borderRadius: r,
      background: `repeating-linear-gradient(135deg, ${t1} 0 14px, ${t2} 14px 28px)`,
      ...style,
    }}>
      <span>{label}</span>
    </div>
  );
}

// 12 dishes — the dataset every browse mode renders.
const DISHES = [
  { id: 'tonkotsu', name: 'Tonkotsu Ramen', origin: 'Fukuoka', country: 'Japan', region: 'East Asia', type: 'noodle soup', variants: 24, lat: 33.6, lon: 130.4, updated: '2d', t1: '#E9D6C0', t2: '#DCC6A8',
    note: 'A milky pork-bone broth simmered for a day — Fukuoka’s answer to cold harbor mornings.',
    long: 'Born in the yatai street stalls of Hakata, tonkotsu turns humble pork bones into a broth so rich it clings to thin, firm noodles. Its spread north mirrors Japan’s rail lines.' },
  { id: 'mole', name: 'Mole Poblano', origin: 'Puebla', country: 'Mexico', region: 'Mesoamerica', type: 'sauce', variants: 11, lat: 19.0, lon: -98.2, updated: '5d', t1: '#E4D2BC', t2: '#D6C0A2',
    note: 'Chilies, chocolate, and a convent’s worth of spices, ground into a single dark sauce.',
    long: 'Legend places its invention in a Pueblan convent; history places it at the crossroads of Indigenous chilies and goods carried by trade. Dozens of ingredients, one velvet sauce.' },
  { id: 'shakshuka', name: 'Shakshuka', origin: 'Maghreb', country: 'Tunisia', region: 'North Africa', type: 'egg dish', variants: 17, lat: 36.8, lon: 10.2, updated: '1d', t1: '#E9D9C2', t2: '#DDC9AA',
    note: 'Eggs poached in a simmering pepper-and-tomato sauce, scooped up with bread.',
    long: 'A dish of the whole southern Mediterranean, claimed by many kitchens. Its name means “mixture” — peppers, tomatoes, and eggs, varied by every household and border it crosses.' },
  { id: 'ceviche', name: 'Ceviche', origin: 'Lima', country: 'Peru', region: 'Andes', type: 'cured raw fish', variants: 22, lat: -12.0, lon: -77.0, updated: '3d', t1: '#E6DAC6', t2: '#D8C9AE',
    note: 'Raw fish “cooked” in lime and chili — born of cold currents and citrus trade.',
    long: 'The Humboldt current gave Peru its fish; the Spanish brought citrus. Ceviche is the meeting point, cured in minutes and eaten the same hour it is caught.' },
  { id: 'injera', name: 'Injera', origin: 'Highlands', country: 'Ethiopia', region: 'East Africa', type: 'flatbread', variants: 6, lat: 9.0, lon: 38.7, updated: '6d', t1: '#E4D7C6', t2: '#D6C4AC',
    note: 'A spongy, fermented teff flatbread that doubles as both plate and utensil.',
    long: 'Fermented for days from tiny teff grains, injera is the table itself — stews are ladled on top, and the bread is torn to scoop them. Sour, airy, and unmistakably highland.' },
  { id: 'bibimbap', name: 'Bibimbap', origin: 'Jeonju', country: 'Korea', region: 'East Asia', type: 'rice bowl', variants: 9, lat: 35.8, lon: 127.1, updated: '4d', t1: '#E8D8C0', t2: '#DBC8A9',
    note: 'Rice crowned with seasoned vegetables, egg, and gochujang — mixed at the table.',
    long: 'A bowl built for balance: each vegetable seasoned on its own, arranged by color, then stirred into one. Jeonju’s version is the benchmark every other measures against.' },
  { id: 'khachapuri', name: 'Khachapuri', origin: 'Adjara', country: 'Georgia', region: 'Caucasus', type: 'filled bread', variants: 8, lat: 41.6, lon: 41.6, updated: '2d', t1: '#EADBC2', t2: '#DECDA9',
    note: 'A boat of bread filled with molten cheese, an egg cracked into the center.',
    long: 'Every Georgian region shapes it differently; Adjara’s is a glistening boat by the Black Sea, finished with butter and a runny yolk to stir through the cheese.' },
  { id: 'feijoada', name: 'Feijoada', origin: 'Rio', country: 'Brazil', region: 'South America', type: 'bean stew', variants: 6, lat: -22.9, lon: -43.2, updated: '7d', t1: '#E2D4BE', t2: '#D4C3A6',
    note: 'A slow black-bean stew of smoked and salted meats — Saturday in a pot.',
    long: 'Built from preservation and patience, feijoada gathers cuts that keep — smoked, salted, cured — over black beans, and gathers people around the long midday table.' },
  { id: 'adobo', name: 'Adobo', origin: 'Luzon', country: 'Philippines', region: 'Maritime SE Asia', type: 'braise', variants: 14, lat: 14.6, lon: 121.0, updated: '1d', t1: '#E9D7BE', t2: '#DDCBA8',
    note: 'Meat braised in vinegar, soy, and garlic — a preservation method turned national dish.',
    long: 'Before refrigeration, vinegar kept the day’s catch and meat. The Spanish gave the technique a name; Filipino kitchens made it the most-argued, best-loved dish in the islands.' },
  { id: 'pho', name: 'Phở', origin: 'Hanoi', country: 'Vietnam', region: 'Mainland SE Asia', type: 'noodle soup', variants: 12, lat: 21.0, lon: 105.8, updated: '3d', t1: '#E6D8BF', t2: '#D9C8A8',
    note: 'Clear beef broth, charred aromatics, rice noodles, a fistful of fresh herbs.',
    long: 'A northern morning bowl that traveled south and then across oceans. Its clarity is the craft — bones, charred ginger and onion, star anise, skimmed for hours.' },
  { id: 'tagine', name: 'Tagine', origin: 'Fes', country: 'Morocco', region: 'North Africa', type: 'slow stew', variants: 15, lat: 34.0, lon: -5.0, updated: '5d', t1: '#EAD9BF', t2: '#DECBA9',
    note: 'A conical clay pot that steams meat, fruit, and spice into tender submission.',
    long: 'The pot is the recipe: its cone catches steam and returns it, slow-cooking lamb with preserved lemon, olives, or apricot over coals across the Maghreb.' },
  { id: 'pierogi', name: 'Pierogi', origin: 'Kraków', country: 'Poland', region: 'Central Europe', type: 'dumpling', variants: 10, lat: 50.0, lon: 19.9, updated: '6d', t1: '#E7DAC4', t2: '#DACAAD',
    note: 'Half-moons of dough folded around potato, cheese, mushroom, or fruit.',
    long: 'One of a worldwide dumpling family, pierogi anchor the Central European table — boiled then pan-crisped, savory for supper and sweet for after.' },
];

// macro-regions, ordered, for atlas grouping
const REGION_ORDER = ['East Asia', 'Mainland SE Asia', 'Maritime SE Asia', 'Andes', 'Mesoamerica', 'South America', 'North Africa', 'East Africa', 'Caucasus', 'Central Europe'];

const TRENDING = [
  { name: 'Oaxaca', place: 'Mexico', note: 'Smoke, chili & masa', t1: '#E6D2BA', t2: '#D8C2A2' },
  { name: 'Sichuan', place: 'China', note: 'Numbing, fragrant heat', t1: '#E4D4BE', t2: '#D6C4A6' },
  { name: 'Levant', place: 'Eastern Med.', note: 'Olive, lemon, char', t1: '#E9DCC4', t2: '#DCCDAC' },
  { name: 'Andhra', place: 'India', note: 'The hottest south', t1: '#E8D6BE', t2: '#DBC8A8' },
];

const CRAVINGS = ['Spicy', 'Fermented', 'Street food', 'Comfort', 'Citrus-bright', 'Smoky', 'Sweet-savory', 'Sour', 'Slow-cooked', 'Herbaceous'];

const COLLECTIONS = [
  ['Dishes', '14,283', 'cooked preparations & plated meals'],
  ['Ingredients', '9,612', 'raw and processed components'],
  ['Regions', '1,940', 'culinary territories, nested'],
  ['Techniques', '740', 'methods from braising to nixtamal'],
  ['Origins', '190', 'countries & contested homelands'],
  ['Producers', '5,118', 'makers, farms & appellations'],
];

Object.assign(window, { Placeholder, DISHES, REGION_ORDER, TRENDING, CRAVINGS, COLLECTIONS });
