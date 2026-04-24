import { useState } from 'react';
import { Plus, Trash2, Package, Scissors } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Service, Product } from '@/context/DataContext';

export interface BillItem {
  id: string;
  type: 'service' | 'product';
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  serviceId?: string;
  productId?: string;
}

interface BillItemsEditorProps {
  items: BillItem[];
  onItemsChange: (items: BillItem[]) => void;
  services: Service[];
  products: Product[];
  baseServiceName?: string;
  baseServiceValue?: number;
  onBaseServiceValueChange?: (value: number) => void;
}

export function BillItemsEditor({
  items,
  onItemsChange,
  services,
  products,
  baseServiceName,
  baseServiceValue,
  onBaseServiceValueChange,
}: BillItemsEditorProps) {
  const [newItemType, setNewItemType] = useState<'service' | 'product'>('service');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQty, setProductQty] = useState('1');

  const handleAddService = () => {
    if (!selectedServiceId) return;
    
    const service = services.find(s => s.id === selectedServiceId);
    if (!service) return;

    const newItem: BillItem = {
      id: crypto.randomUUID(),
      type: 'service',
      name: service.name,
      quantity: 1,
      unitPrice: service.default_price,
      total: service.default_price,
      serviceId: service.id,
    };

    onItemsChange([...items, newItem]);
    setSelectedServiceId('');
  };

  const handleAddProduct = () => {
    if (!selectedProductId) return;
    
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const qty = parseInt(productQty) || 1;

    const newItem: BillItem = {
      id: crypto.randomUUID(),
      type: 'product',
      name: product.name,
      quantity: qty,
      unitPrice: product.sale_price,
      total: qty * product.sale_price,
      productId: product.id,
    };

    onItemsChange([...items, newItem]);
    setSelectedProductId('');
    setProductQty('1');
  };

  const handleRemoveItem = (id: string) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const handleUpdateItemPrice = (id: string, newPrice: number) => {
    onItemsChange(
      items.map(item =>
        item.id === id
          ? { ...item, unitPrice: newPrice, total: item.quantity * newPrice }
          : item
      )
    );
  };

  const handleUpdateItemQty = (id: string, newQty: number) => {
    onItemsChange(
      items.map(item =>
        item.id === id
          ? { ...item, quantity: newQty, total: newQty * item.unitPrice }
          : item
      )
    );
  };

  const additionalTotal = items.reduce((sum, item) => sum + item.total, 0);
  const grandTotal = (baseServiceValue || 0) + additionalTotal;

  return (
    <div className="space-y-4">
      {/* Base service (editable value) */}
      {baseServiceName && (
        <div className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Scissors className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium truncate">{baseServiceName}</span>
            <span className="text-xs text-muted-foreground">(principal)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">R$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={baseServiceValue || 0}
              onChange={(e) => onBaseServiceValueChange?.(parseFloat(e.target.value) || 0)}
              className="w-24 h-8 text-right font-semibold"
            />
          </div>
        </div>
      )}

      {/* Additional items list */}
      {items.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Itens Adicionais</Label>
          {items.map(item => (
            <div key={item.id} className="p-3 rounded-lg border bg-background flex items-center gap-3">
              {item.type === 'service' ? (
                <Scissors className="w-4 h-4 text-primary" />
              ) : (
                <Package className="w-4 h-4 text-info" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.type === 'product' && (
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleUpdateItemQty(item.id, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-xs"
                    />
                  )}
                  <span className="text-xs text-muted-foreground">x</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => handleUpdateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                    className="w-24 h-7 text-xs"
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">R$ {item.total.toFixed(2)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleRemoveItem(item.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new item section */}
      <div className="space-y-3 p-3 rounded-lg border border-dashed">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={newItemType === 'service' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setNewItemType('service')}
          >
            <Scissors className="w-3 h-3 mr-1" />
            Serviço
          </Button>
          <Button
            type="button"
            variant={newItemType === 'product' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setNewItemType('product')}
          >
            <Package className="w-3 h-3 mr-1" />
            Produto
          </Button>
        </div>

        {newItemType === 'service' ? (
          <div className="flex gap-2">
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar serviço" />
              </SelectTrigger>
              <SelectContent>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} - R$ {s.default_price.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="icon"
              onClick={handleAddService}
              disabled={!selectedServiceId}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar produto" />
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter(p => p.is_active && p.type === 'revenda' && p.stock_quantity > 0)
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} - R$ {p.sale_price.toFixed(2)} ({p.stock_quantity} em estoque)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                placeholder="Qtd"
                value={productQty}
                onChange={(e) => setProductQty(e.target.value)}
                className="w-20"
              />
              <Button
                type="button"
                onClick={handleAddProduct}
                disabled={!selectedProductId}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Produto
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Totals */}
      <Separator />
      <div className="space-y-1">
        {items.length > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal adicionais:</span>
            <span>R$ {additionalTotal.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Total:</span>
          <span className="text-primary">R$ {grandTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
