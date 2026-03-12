import type { CorsOptions } from 'cors';

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');

const configuredOrigins = Array.from(
  new Set(
    [process.env.FRONTEND_URL, process.env.FRONTEND_URLS]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(','))
      .map(normalizeOrigin)
      .filter(Boolean)
  )
);

const isPrivateIpv4Host = (hostname: string) => {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
};

const isAllowedByHost = (hostname: string) => {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || isPrivateIpv4Host(hostname);
};

export const isAllowedCorsOrigin = (origin?: string | null) => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (configuredOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(normalizedOrigin);
    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    return isAllowedByHost(hostname);
  } catch {
    return false;
  }
};

export const corsOriginValidator = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void
) => {
  callback(null, isAllowedCorsOrigin(origin));
};

export const expressCorsOptions: CorsOptions = {
  origin: corsOriginValidator,
  credentials: true,
};

export const socketCorsOptions = {
  origin: corsOriginValidator,
  credentials: true,
};
