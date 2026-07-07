import { FileSpreadsheet } from 'lucide-react';

import { AppointmentImportSettings } from './AppointmentImportSettings';
import { ClientImportSettings } from './ClientImportSettings';
import { FinancialMovementImportSettings } from './FinancialMovementImportSettings';
import { LegacyHistoryImportSettings } from './LegacyHistoryImportSettings';
import { ProductStockImportSettings } from './ProductStockImportSettings';
import { ProfessionalImportSettings } from './ProfessionalImportSettings';
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
        <p className="mt-2 text-xs text-muted-foreground">
          Ordem sugerida: clientes, serviços, profissionais, agendamentos, histórico/comandas,
          estoque e movimentações financeiras.
        </p>
      </div>

      <Tabs defaultValue="clients" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="professionals">Profissionais</TabsTrigger>
          <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
          <TabsTrigger value="history">Histórico/Comandas</TabsTrigger>
          <TabsTrigger value="stock">Estoque</TabsTrigger>
          <TabsTrigger value="financial">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <ClientImportSettings />
        </TabsContent>

        <TabsContent value="services">
          <ServiceImportSettings />
        </TabsContent>

        <TabsContent value="professionals">
          <ProfessionalImportSettings />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentImportSettings />
        </TabsContent>

        <TabsContent value="history">
          <LegacyHistoryImportSettings />
        </TabsContent>

        <TabsContent value="stock">
          <ProductStockImportSettings />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialMovementImportSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
