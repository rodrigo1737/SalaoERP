const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer | null) => {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const supportsWebPush = () => (
  'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

export const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isStandaloneWebApp = () => (
  window.matchMedia('(display-mode: standalone)').matches
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
);

export const getPushRegistration = async () => {
  if (!supportsWebPush()) throw new Error('Este navegador não oferece suporte a notificações push.');
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
};

export const getCurrentPushSubscription = async () => {
  if (!supportsWebPush()) return null;
  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
};

export const createPushSubscription = async (vapidPublicKey: string) => {
  if (!vapidPublicKey) throw new Error('A chave pública de notificações não foi configurada.');
  const registration = await getPushRegistration();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('A permissão para notificações não foi concedida.');

  const existing = await registration.pushManager.getSubscription();
  return existing ?? registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
};

export const serializePushSubscription = (subscription: PushSubscription) => ({
  endpoint: subscription.endpoint,
  p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
  auth_key: arrayBufferToBase64Url(subscription.getKey('auth')),
});
