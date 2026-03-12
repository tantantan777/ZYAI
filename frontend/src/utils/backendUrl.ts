const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getDefaultBackendOrigin = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:3000`;
};

export const getBackendOrigin = () => {
  const configuredOrigin = import.meta.env.VITE_BACKEND_ORIGIN?.trim();
  return trimTrailingSlash(configuredOrigin || getDefaultBackendOrigin());
};

export const getApiBaseUrl = () => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  return trimTrailingSlash(configuredApiBaseUrl || `${getBackendOrigin()}/api`);
};
