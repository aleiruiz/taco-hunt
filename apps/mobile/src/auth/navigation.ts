import type { Href } from "expo-router";

// Only known product routes can be an auth return destination. Never return to
// another auth form (or accept an external/protocol-relative URL).
export function authDestination(value: string | string[] | undefined): Href {
  if (typeof value !== "string" || /[\\\r\n#]/.test(value)) return "/";
  const path = value.split("?")[0];
  if (
    ["/", "/my-tacos", "/settings", "/propose", "/retos", "/review/new", "/review/edit"].includes(
      path,
    ) ||
    /^\/spot\/[a-zA-Z0-9-]+$/.test(path)
  )
    return value as Href;
  return "/";
}

/**
 * Builds the URL path of a stack route from its expo-router name and params, e.g.
 * `spot/[id]` + `{ id: "abc" }` → `/spot/abc` and `index` → `/`.
 */
export function stackRoutePath(name: string, params?: object): string {
  const values = (params ?? {}) as Record<string, unknown>;
  const path = name
    .split("/")
    .filter((segment) => segment !== "index")
    .map((segment) => segment.replace(/^\[(\w+)\]$/, (_, key: string) => String(values[key] ?? "")))
    .join("/");
  return `/${path}`;
}

export function reviewReturnTo(
  path: "/review/new" | "/review/edit",
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  return `${path}?${query.toString()}`;
}
