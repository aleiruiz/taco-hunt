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
