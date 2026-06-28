// apps/web/src/types/map.ts

/**
 * Properties for a GeoJSON feature representing a food region.
 * This aligns with the schema defined in `docs/gis-workflow.md`.
 */
export interface FoodRegionProperties {
  region_id: string;
  name: string;
  type: 'cultural' | 'geographic' | 'culinary' | 'historical' | 'diaspora' | 'trade_route';
  country_codes: string;
  confidence: 'high' | 'medium' | 'low' | 'disputed' | 'conceptual';
  source: string;
  notes?: string;
}

/**
 * A GeoJSON Feature specifically for food regions.
 */
export type FoodRegionFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, FoodRegionProperties>;

/**
 * The data structure for a single dish point on the map,
 * as returned by the `/api/dishes/map` endpoint.
 */
export interface DishMapPoint {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  lat: number;
  lng: number;
  region: {
    name: string;
    localName: string | null;
    isoCode: string | null;
  };
}
