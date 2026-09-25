import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/platform/connectivity';

export function ConnectivityBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="connectivity-banner fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-lg"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      Sem conexão. Consultas podem estar desatualizadas e novos lançamentos devem aguardar a internet voltar.
    </div>
  );
}
