import { useState, useEffect } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useData, Product } from '@/context/DataContext';
import { useStock, ServiceProduct } from '@/context/StockContext';
import { Badge } from '@/components/ui/badge';

interface ServiceProductItem {
  product_id: string;
  quantity: number;
  notes?: string;
}

interface ServiceProductsEditorProps {
  serviceId?: string;
  onChange?: (items: ServiceProductItem[]) => void;
}

export function ServiceProductsEditor({ serviceId, onChange }: ServiceProductsEditorProps) {
  const { products } = useData();
  const { getServiceProducts } = useStock();
  const [items, setItems] = useState<ServiceProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Filtrar apenas produtos do tipo uso_interno
  const internalProducts = products.filter(p => p.is_active && p.type === 'uso_interno');

  // Carregar itens existentes quando serviceId muda
  useEffect(() => {
    if (serviceId) {
      const existingItems = getServiceProducts(serviceId);
      const loadedItems = existingItems.map(sp => ({
        product_id: sp.product_id,
        quantity: Number(sp.quantity),
        notes: sp.notes,
      }));
      setItems(loadedItems);
    } else {
      setItems([]);
    }
  }, [serviceId, getServiceProducts]);

  // Notificar mudanças
  useEffect(() => {
    onChange?.(items);
  }, [items, onChange]);

  const handleAddItem = () => {
    if (!selectedProductId) return;
    
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Verificar se já existe
    if (items.some(i => i.product_id === selectedProductId)) {
      // Atualizar quantidade
      setItems(prev => prev.map(i => 
        i.product_id === selectedProductId 
          ? { ...i, quantity: i.quantity + parseFloat(quantity) }
          : i
      ));
    } else {
      setItems(prev => [...prev, {
        product_id: selectedProductId,
        quantity: parseFloat(quantity) || 1,
      }]);
    }

    setSelectedProductId('');
    setQuantity('1');
  };

  const handleRemoveItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    setItems(prev => prev.map(i => 
      i.product_id === productId ? { ...i, quantity: newQuantity } : i
    ));
  };

  const getProductInfo = (productId: string) => {
    return products.find(p => p.id === productId);
  };

  if (internalProducts.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhum produto de uso interno cadastrado</p>
        <p className="text-xs mt-1">Cadastre produtos com tipo "Uso Interno" para vincular aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Insumos Consumidos</Label>
        <Badge variant="outline" className="text-xs">
          {items.length} item(s)
        </Badge>
      </div>

      {/* Lista de itens */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(item => {
            const product = getProductInfo(item.product_id);
            if (!product) return null;
            
            return (
              <div key={item.product_id} className="flex items-center gap-3 p-3 rounded-lg border bg-background">
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.unit}</p>
                </div>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => handleUpdateQuantity(item.product_id, parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 text-sm text-center"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => handleRemoveItem(item.product_id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Adicionar novo item */}
      <div className="space-y-2 p-3 rounded-lg border border-dashed">
        <Label className="text-xs text-muted-foreground">Adicionar Insumo</Label>
        <div className="flex gap-2">
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecionar produto..." />
            </SelectTrigger>
            <SelectContent>
              {internalProducts
                .filter(p => !items.some(i => i.product_id === p.id))
                .map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} ({product.stock_quantity} {product.unit})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Qtd"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleAddItem}
            disabled={!selectedProductId}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Estes insumos serão baixados automaticamente do estoque ao finalizar o serviço.
        </p>
      )}
    </div>
  );
}