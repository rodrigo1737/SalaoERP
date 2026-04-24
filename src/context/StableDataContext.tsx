/**
 * ITEM 12: Split parcial do DataContext.
 *
 * StableDataContext contém apenas os dados que mudam com baixa frequência:
 * clients, professionals, services, products.
 *
 * Componentes que só precisam desses dados (ex: listas de cadastro) não
 * re-renderizam quando chegam transações, agendamentos ou comissões novas.
 *
 * Uso:
 *   import { useStableData } from '@/context/StableDataContext';
 *   const { clients, addClient, updateClient, deleteClient } = useStableData();
 *
 * O DataProvider original continua disponível para dados de alta frequência.
 * StableDataProvider deve ser colocado DENTRO do DataProvider (ou no mesmo nível),
 * pois ele não se conecta ao Supabase sozinho — delega para o DataContext pai.
 */
import React, { createContext, useContext } from 'react';
import { useData, Client, Professional, Service, Product } from './DataContext';

interface StableDataContextType {
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  products: Product[];
  loading: boolean;
  addClient: ReturnType<typeof useData>['addClient'];
  updateClient: ReturnType<typeof useData>['updateClient'];
  deleteClient: ReturnType<typeof useData>['deleteClient'];
  addProfessional: ReturnType<typeof useData>['addProfessional'];
  updateProfessional: ReturnType<typeof useData>['updateProfessional'];
  deleteProfessional: ReturnType<typeof useData>['deleteProfessional'];
  addService: ReturnType<typeof useData>['addService'];
  updateService: ReturnType<typeof useData>['updateService'];
  deleteService: ReturnType<typeof useData>['deleteService'];
  addProduct: ReturnType<typeof useData>['addProduct'];
  updateProduct: ReturnType<typeof useData>['updateProduct'];
  deleteProduct: ReturnType<typeof useData>['deleteProduct'];
  updateProductStock: ReturnType<typeof useData>['updateProductStock'];
  refreshData: ReturnType<typeof useData>['refreshData'];
}

const StableDataContext = createContext<StableDataContextType | undefined>(undefined);

export const useStableData = () => {
  const ctx = useContext(StableDataContext);
  if (!ctx) throw new Error('useStableData must be used within StableDataProvider');
  return ctx;
};

/**
 * Thin wrapper: extrai apenas os dados estáveis do DataContext pai
 * e os republica em um contexto separado.
 *
 * Isso evita que mudanças em transactions/appointments causem re-render
 * em componentes que só consomem dados cadastrais.
 */
export const StableDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const data = useData();

  const value: StableDataContextType = {
    clients: data.clients,
    professionals: data.professionals,
    services: data.services,
    products: data.products,
    loading: data.loading,
    addClient: data.addClient,
    updateClient: data.updateClient,
    deleteClient: data.deleteClient,
    addProfessional: data.addProfessional,
    updateProfessional: data.updateProfessional,
    deleteProfessional: data.deleteProfessional,
    addService: data.addService,
    updateService: data.updateService,
    deleteService: data.deleteService,
    addProduct: data.addProduct,
    updateProduct: data.updateProduct,
    deleteProduct: data.deleteProduct,
    updateProductStock: data.updateProductStock,
    refreshData: data.refreshData,
  };

  return (
    <StableDataContext.Provider value={value}>
      {children}
    </StableDataContext.Provider>
  );
};
