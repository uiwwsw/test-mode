const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const parseStoredPaths = (value: string | null | undefined) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export const readCookieValue = (cookieHeader: string, name: string) => {
  const rawValue =
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? "";

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
};

export const writeCookie = (
  name: string,
  paths: readonly string[],
  maxAgeSeconds = DEFAULT_COOKIE_MAX_AGE_SECONDS,
) => {
  if (typeof document === "undefined") {
    return;
  }

  try {
    document.cookie = [
      `${name}=${encodeURIComponent(JSON.stringify(paths))}`,
      "path=/",
      `max-age=${maxAgeSeconds}`,
      "samesite=lax",
    ].join("; ");
  } catch {
    // Sandboxed browsers can disable cookies; in-memory controls still work.
  }
};

export const readBrowserStorage = (key: string): string | null | undefined => {
  try {
    return typeof window === "undefined"
      ? undefined
      : window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
};

export const writeBrowserStorage = (key: string, value: string | null) => {
  try {
    if (typeof window === "undefined") return false;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage is best effort (e.g. blocked access or an exhausted quota).
    return false;
  }
};
