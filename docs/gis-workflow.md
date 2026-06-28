# QGIS 4.0 Workflow for Gustale Food Regions

This document outlines the process for creating, editing, and exporting geographic data for the Gustale project using QGIS 4.0. QGIS is a powerful, free, and open-source Geographic Information System.

**IMPORTANT:** QGIS is an **offline authoring tool**, not a runtime dependency. It is not, and should not be, installed on the production server. The workflow is to prepare data in QGIS and export web-optimized assets that are committed to the git repository.

## 1. Purpose

The goal is to create and maintain polygon layers representing cultural, historical, and culinary regions that do not strictly follow political borders. These regions allow Gustale to model food geography with the nuance it deserves (e.g., "The Levant," "Nusantara," "Alpine cuisine").

## 2. Setup

1.  **Install QGIS:** Download and install the latest version of QGIS 4.0 from the official QGIS website.
2.  **Base Layers:** It is recommended to use a base layer like Natural Earth data (Admin 0 - Countries, Admin 1 - States/Provinces) for geographic context.

## 3. Workflow

### Step 1: Create or Edit Polygons

1.  Create a new Polygon Layer in QGIS (`Layer > Create Layer > New GeoPackage Layer...` or `New Shapefile Layer...`).
2.  Define the required attributes for the layer (see section 4).
3.  Draw or edit polygons to represent the desired food region. These can be hand-drawn based on historical maps or other sources, or derived from existing administrative boundaries.
4.  Ensure polygons are valid and do not have self-intersections.

### Step 2: Simplify Geometry

Web maps require lightweight, optimized geometries. Complex, high-resolution polygons will degrade performance.

1.  Use the **Simplify** tool (`Vector > Geometry Tools > Simplify`).
2.  Simplify the geometry using a tolerance appropriate for a global web map (e.g., `0.01` degrees). The goal is to reduce the number of vertices while preserving the general shape.
3.  Visually inspect the result to ensure it's an acceptable representation.

### Step 3: Validate Attributes

For each polygon feature, fill in the required attribute data. See the schema below. Consistency is key.

### Step 4: Export to GeoJSON

1.  Right-click the simplified layer in the Layers panel.
2.  Select `Export > Save Features As...`.
3.  **Format:** Select `GeoJSON`.
4.  **File name:** Save the file to the appropriate location within the Gustale repository, e.g., `apps/web/public/data/regions/`.
5.  **CRS:** Ensure the Coordinate Reference System is `EPSG:4326 - WGS 84`. This is the standard for web mapping.
6.  **Decimal Precision:** Set coordinate precision to `6` to reduce file size.
7.  Click OK.

### Step 5: Commit

The exported GeoJSON file is a project asset. Commit it to the git repository so it can be deployed with the website.

## 4. Required Attributes Schema

Each polygon feature in the GeoJSON file **must** have the following properties:

| Property | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `region_id` | `string` | A unique, stable, slug-like identifier for the region. | `levant` |
| `name` | `string` | The common, human-readable name of the region. | `The Levant` |
| `type` | `string` | The kind of region. Enum: `cultural`, `geographic`, `culinary`, `historical`, `diaspora`, `trade_route`. | `historical` |
| `country_codes` | `string` | A comma-separated list of ISO 3166-1 alpha-2 codes for countries this region primarily intersects with. | `SY,LB,JO,PS,IL` |
| `confidence` | `string` | An editorial assessment of the boundary's certainty. Enum: `high`, `medium`, `low`, `disputed`, `conceptual`. | `medium` |
| `source` | `string` | A brief citation or URL for the source used to draw the boundary. | `Wikipedia` |
| `notes` | `string` | Optional editorial notes about the region's definition or boundaries. | `Boundary is approximate and represents historical context.` |

## 5. Future Evolution: Vector Tiles

For performance at scale (hundreds or thousands of complex polygons), the project can evolve to use vector tiles. QGIS can also be used to generate `.mbtiles` files, which can then be served either by a simple tile server or a third-party service. The initial workflow, however, will use simple GeoJSON files for their simplicity and ease of integration.
