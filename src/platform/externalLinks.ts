const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

export const openExternalUrl = (value: string) => {
  const url = new URL(value, window.location.href);

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Protocolo externo não permitido: ${url.protocol}`);
  }

  const openedWindow = window.open(url.toString(), '_blank', 'noopener,noreferrer');
  if (openedWindow) openedWindow.opener = null;
};
