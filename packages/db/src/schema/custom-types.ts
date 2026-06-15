import { customType } from 'drizzle-orm/pg-core';

/**
 * PostGIS geometry/geography type for Drizzle ORM.
 * Stores as EWKT (Extended Well-Known Text) for round-tripping.
 * Use: `geometry('centroid', { srid: 4326 })` in schema definitions.
 */
export const geometry = <TName extends string = string>(
  name: TName,
  options: { srid?: number; type?: 'geometry' | 'geography' } = {}
) =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      const type = options.type ?? 'geometry';
      const srid = options.srid ? `,${options.srid}` : '';
      return `${type}(Geometry,${srid.replace(',', '')})`;
    },
    toDriver(value: string): string {
      return value;
    },
    fromDriver(value: string): string {
      return value;
    },
  })(name);
