export type RuntimePlatform = 'web' | 'android' | 'ios';

type CapacitorBridge = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

const getCapacitorBridge = (): CapacitorBridge | undefined => {
  if (typeof window === 'undefined') return undefined;

  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
};

export const getRuntimePlatform = (): RuntimePlatform => {
  const platform = getCapacitorBridge()?.getPlatform?.();

  if (platform === 'android' || platform === 'ios') return platform;
  return 'web';
};

export const isNativeRuntime = () => {
  const bridge = getCapacitorBridge();
  return bridge?.isNativePlatform?.() ?? getRuntimePlatform() !== 'web';
};
