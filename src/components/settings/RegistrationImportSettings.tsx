import { FileSpreadsheet } from 'lucide-react';

import { ClientImportSettings } from './ClientImportSettings';
import { ServiceImportSettings } from './ServiceImportSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function RegistrationImportSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-display font-bold text-foreground">
          <FileSpreadsheet className="h-5 w-5" />
          Importadores de Cadastro
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rotinas de importação em planilha para cadastros do cliente logado
        </p>
      </div>

      <Tabs defaultValue="clients" className="space-y-6">
        <TabsList>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <ClientImportSettings />
        </TabsContent>

        <TabsContent value="services">
          <ServiceImportSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
