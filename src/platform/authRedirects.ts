import { isNativeRuntime } from './runtime';

const DEFAULT_PUBLIC_APP_URL = 'https://multierp.multisoluction.com.br';

const normalizeBaseUrl = (value?: string) => {
  const normalized = value?.trim().replace(/\/+$/, '');
  return normalized || undefined;
};

const getBrowserOrigin = () => {
  if (typeof window === 'undefined') return undefined;
  if (!/^https?:$/.test(window.location.protocol)) return undefined;
  return window.location.origin;
};

export const getPublicAppUrl = () => (
  normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL)
  ?? getBrowserOrigin()
  ?? DEFAULT_PUBLIC_APP_URL
);

export const buildPublicAppUrl = (path = '/') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getPublicAppUrl()}/`).toString();
};

export const getAuthRedirectUrl = (path = '/') => {
  const nativeRedirect = normalizeBaseUrl(import.meta.env.VITE_NATIVE_AUTH_REDIRECT_URL);

  if (isNativeRuntime() && nativeRedirect) {
    const normalizedPath = path === '/' ? '' : path.replace(/^\//, '');
    return normalizedPath ? `${nativeRedirect}/${normalizedPath}` : nativeRedirect;
  }

  return buildPublicAppUrl(path);
};
