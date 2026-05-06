import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { toast } from 'sonner';

export interface Supplier {
  id: string;
  name: string;
  trade_name?: string;
  cnpj?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  contact_name?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: 'purchase' | 'sale' | 'adjustment' | 'service_consumption' | 'return' | 'loss';
  quantity: number;
  unit_price?: number;
  total_value?: number;
  previous_stock: number;
  new_stock: number;
  supplier_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  batch_number?: string;
  expiry_date?: string;
  appointment_id?: string;
  transaction_id?: string;
  reason?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

interface PurchaseItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  batch_number?: string;
  expiry_date?: string;
}

interface PurchaseData {
  supplier_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  notes?: string;
  items: PurchaseItem[];
}

export interface ServiceProduct {
  id: string;
  service_id: string;
  product_id: string;
  quantity: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  product?: {
    id: string;
    name: string;
    unit: string;
    stock_quantity: number;
  };
}

interface StockContextType {
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  serviceProducts: ServiceProduct[];
  loading: boolean;
  
  // Suppliers
  addSupplier: (supplier: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>) => Promise<Supplier | null>;
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>;
  
  // Stock movements
  registerPurchase: (data: PurchaseData) => Promise<void>;
  registerSale: (productId: string, quantity: number, unitPrice: number, transactionId?: string) => Promise<void>;
  adjustStock: (productId: string, quantity: number, reason: string, type: 'adjustment' | 'loss') => Promise<void>;
  registerServiceConsumption: (serviceId: string, appointmentId: string) => Promise<void>;
  
  // Service products (insumos por serviço)
  getServiceProducts: (serviceId: string) => ServiceProduct[];
  saveServiceProducts: (serviceId: string, items: { product_id: string; quantity: number; notes?: string }[]) => Promise<void>;
  
  refreshStock: () => Promise<void>;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export const useStock = () => {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
};

export const StockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, tenantId, isSuperAdmin, canModify } = useAuth();
  const { products, refreshData } = useData();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [serviceProducts, setServiceProducts] = useState<ServiceProduct[]>([]);

  const fetchStockData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const [suppliersRes, movementsRes, serviceProductsRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('service_products').select(`
          *,
          product:products(id, name, unit, stock_quantity)
        `),
      ]);

      setSuppliers((suppliersRes.data as Supplier[]) || []);
      setStockMovements((movementsRes.data as StockMovement[]) || []);
      setServiceProducts((serviceProductsRes.data as ServiceProduct[]) || []);
    } catch (error) {
      console.error('Error fetching stock data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, [user]);

  const refreshStock = async () => {
    await fetchStockData();
  };

  // Supplier actions
  const addSupplier = async (supplierData: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>) => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return null;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return null;
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...supplierData, tenant_id: tenantId })
      .select()
      .single();

    if (error) {
      console.error('Error adding supplier:', error);
      return null;
    }

    await refreshStock();
    return data as Supplier;
  };

  const updateSupplier = async (id: string, data: Partial<Supplier>) => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return;
    }
    await supabase.from('suppliers').update(data).eq('id', id);
    await refreshStock();
  };

  // Stock movement actions
  const registerPurchase = async (purchaseData: PurchaseData) => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return;
    }

    // Process each item
    for (const item of purchaseData.items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) continue;

      const previousStock = product.stock_quantity;
      const newStock = previousStock + item.quantity;

      // Create stock movement
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: item.product_id,
        movement_type: 'purchase',
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_value: item.quantity * item.unit_price,
        previous_stock: previousStock,
        new_stock: newStock,
        supplier_id: purchaseData.supplier_id,
        invoice_number: purchaseData.invoice_number,
        invoice_date: purchaseData.invoice_date,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        notes: purchaseData.notes,
        created_by: user?.id,
      });

      // Update product stock and last purchase info
      await supabase.from('products').update({
        stock_quantity: newStock,
        last_purchase_price: item.unit_price,
        last_purchase_date: new Date().toISOString(),
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        supplier_id: purchaseData.supplier_id,
      }).eq('id', item.product_id);
    }

    await refreshStock();
    await refreshData();
  };

  const registerSale = async (productId: string, quantity: number, unitPrice: number, transactionId?: string) => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
      toast.error('Produto não encontrado');
      return;
    }

    if (product.stock_quantity < quantity) {
      toast.error('Estoque insuficiente');
      return;
    }

    const previousStock = product.stock_quantity;
    const newStock = previousStock - quantity;

    // Create stock movement
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: productId,
      movement_type: 'sale',
      quantity: -quantity,
      unit_price: unitPrice,
      total_value: quantity * unitPrice,
      previous_stock: previousStock,
      new_stock: newStock,
      transaction_id: transactionId,
      created_by: user?.id,
    });

    // Update product stock
    await supabase.from('products').update({
      stock_quantity: newStock,
    }).eq('id', productId);

    await refreshStock();
    await refreshData();
  };

  const adjustStock = async (productId: string, quantity: number, reason: string, type: 'adjustment' | 'loss') => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
      toast.error('Produto não encontrado');
      return;
    }

    const previousStock = product.stock_quantity;
    const newStock = previousStock + quantity;

    if (newStock < 0) {
      toast.error('Estoque não pode ficar negativo');
      return;
    }

    // Create stock movement
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: productId,
      movement_type: type,
      quantity: quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      reason: reason,
      created_by: user?.id,
    });

    // Update product stock
    await supabase.from('products').update({
      stock_quantity: newStock,
    }).eq('id', productId);

    await refreshStock();
    await refreshData();
  };

  // Get service products (insumos vinculados a um serviço)
  const getServiceProducts = (serviceId: string): ServiceProduct[] => {
    return serviceProducts.filter(sp => sp.service_id === serviceId);
  };

  // Save service products (insumos por serviço)
  const saveServiceProducts = async (serviceId: string, items: { product_id: string; quantity: number; notes?: string }[]) => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return;
    }

    // Delete existing and insert new
    await supabase
      .from('service_products')
      .delete()
      .eq('service_id', serviceId)
      .eq('tenant_id', tenantId);

    if (items.length > 0) {
      await supabase.from('service_products').insert(
        items.map(item => ({
          tenant_id: tenantId,
          service_id: serviceId,
          product_id: item.product_id,
          quantity: item.quantity,
          notes: item.notes,
        }))
      );
    }

    await refreshStock();
  };

  // Register service consumption (baixa de insumos ao finalizar serviço)
  const registerServiceConsumption = async (serviceId: string, appointmentId: string) => {
    if (!canModify()) return;
    if (!tenantId && !isSuperAdmin) return;

    // Get service products for this service
    const serviceItems = serviceProducts.filter(sp => sp.service_id === serviceId);
    
    if (serviceItems.length === 0) return;

    // Process each product consumption
    for (const item of serviceItems) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) continue;

      const quantity = Number(item.quantity);
      if (quantity <= 0) continue;

      const previousStock = product.stock_quantity;
      const newStock = Math.max(0, previousStock - quantity);

      // Create stock movement for service consumption
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: item.product_id,
        movement_type: 'service_consumption',
        quantity: -quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        appointment_id: appointmentId,
        notes: `Consumo automático - Serviço`,
        created_by: user?.id,
      });

      // Update product stock
      await supabase.from('products').update({
        stock_quantity: newStock,
      }).eq('id', item.product_id);
    }

    await refreshStock();
    await refreshData();
  };

  return (
    <StockContext.Provider value={{
      suppliers,
      stockMovements,
      serviceProducts,
      loading,
      addSupplier,
      updateSupplier,
      registerPurchase,
      registerSale,
      adjustStock,
      registerServiceConsumption,
      getServiceProducts,
      saveServiceProducts,
      refreshStock,
    }}>
      {children}
    </StockContext.Provider>
  );
};
