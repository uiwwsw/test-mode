export const parseInputList = (value: readonly string[] | string) =>
  (typeof value === "string" ? value.split(/[;,]/) : [...value])
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizePath = (path: string) => {
  const trimmed = path.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const base =
      typeof window === "undefined"
        ? "https://test-mode.invalid"
        : window.location.origin;
    const parsedUrl = new URL(trimmed, base);

    return parsedUrl.pathname || "/";
  } catch {
    const withoutHash = trimmed.split("#")[0] ?? trimmed;
    const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;

    return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  }
};
