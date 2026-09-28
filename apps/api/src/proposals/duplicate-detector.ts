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

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}

export function classifyDuplicate(inputName: string, candidateName: string): DuplicateMatch {
  return normalizeName(inputName) === normalizeName(candidateName) ? "strong" : "nearby";
}

export function duplicateCandidateSql(): string {
  return `
    select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,
      (6371000 * 2 * asin(sqrt(least(1,
        power(sin(radians(latitude::float8-$1::float8)/2),2) +
        cos(radians($1::float8))*cos(radians(latitude::float8))*
        power(sin(radians(longitude::float8-$2::float8)/2),2)
      ))))::int as "distanceMeters"
    from app_private.spots
    where status='approved'
      and latitude between $1::numeric-0.001 and $1::numeric+0.001
      and longitude between $2::numeric-0.001 and $2::numeric+0.001
      and 6371000 * 2 * asin(sqrt(least(1,
        power(sin(radians(latitude::float8-$1::float8)/2),2) +
        cos(radians($1::float8))*cos(radians(latitude::float8))*
        power(sin(radians(longitude::float8-$2::float8)/2),2)
      ))) <= 100
    order by "distanceMeters",name
    limit 10`;
}
