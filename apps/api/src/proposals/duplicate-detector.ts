export type DuplicateMatch = "strong" | "nearby";

export type DuplicateCandidate = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  match: DuplicateMatch;
};

/** Normalizes a spot name by removing accents, lowercasing, and collapsing whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}

/** Classifies an already nearby candidate as strong when normalized names match. */
export function classifyDuplicate(inputName: string, candidateName: string): DuplicateMatch {
  return normalizeName(inputName) === normalizeName(candidateName) ? "strong" : "nearby";
}

/**
 * Builds a query for up to ten approved spots within 100 meters of a search center.
 * Bind $1 to the normalized name, $2 to latitude, and $3 to longitude in degrees.
 * Results prioritize matching names, then distance and name.
 */
export function duplicateCandidateSql(): string {
  return `
    select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,
      (6371000 * 2 * asin(sqrt(least(1,
        power(sin(radians(latitude::float8-$2::float8)/2),2) +
        cos(radians($2::float8))*cos(radians(latitude::float8))*
        power(sin(radians(longitude::float8-$3::float8)/2),2)
      ))))::int as "distanceMeters"
    from app_private.spots
    where status='approved'
      and latitude between $2::numeric-0.001 and $2::numeric+0.001
      and longitude between $3::numeric-0.002 and $3::numeric+0.002
      and 6371000 * 2 * asin(sqrt(least(1,
        power(sin(radians(latitude::float8-$2::float8)/2),2) +
        cos(radians($2::float8))*cos(radians(latitude::float8))*
        power(sin(radians(longitude::float8-$3::float8)/2),2)
      ))) <= 100
    order by (normalized_name = $1) desc,"distanceMeters",name
    limit 10`;
}
