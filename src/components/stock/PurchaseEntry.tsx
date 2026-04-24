import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus, 
  Trash2, 
  Package,
  FileText,
  Calendar,
  ShoppingCart
} from 'lucide-react';
import { toast } from 'sonner';
import { useStock } from '@/context/StockContext';
import { useData, Product } from '@/context/DataContext';
import { format } from 'date-fns';

interface PurchaseItem {
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  total: number;
  batch_number?: string;
  expiry_date?: string;
}

export function PurchaseEntry() {
  const { suppliers, registerPurchase, loading: stockLoading } = useStock();
  const { products, loading: dataLoading } = useData();
  
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  
  const [selectedProduct, setSelectedProduct] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemUnitPrice, setItemUnitPrice] = useState('');
  const [itemBatch, setItemBatch] = useState('');
  const [itemExpiry, setItemExpiry] = useState('');

  const activeProducts = products.filter(p => p.is_active);
  const activeSuppliers = suppliers.filter(s => s.is_active);

  const handleAddItem = () => {
    if (!selectedProduct || !itemQuantity || !itemUnitPrice) {
      toast.error('Preencha produto, quantidade e valor unitário');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    const quantity = parseInt(itemQuantity);
    const unitPrice = parseFloat(itemUnitPrice);

    if (quantity <= 0 || unitPrice <= 0) {
      toast.error('Quantidade e valor devem ser maiores que zero');
      return;
    }

    const newItem: PurchaseItem = {
      product_id: selectedProduct,
      product,
      quantity,
      unit_price: unitPrice,
      total: quantity * unitPrice,
      batch_number: itemBatch || undefined,
      expiry_date: itemExpiry || undefined,
    };

    setItems([...items, newItem]);
    
    // Reset item form
    setSelectedProduct('');
    setItemQuantity('');
    setItemUnitPrice('');
    setItemBatch('');
    setItemExpiry('');
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setItemUnitPrice(product.cost_price.toString());
    }
  };

  const totalValue = items.reduce((sum, item) => sum + item.total, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item');
      return;
    }

    try {
      await registerPurchase({
        supplier_id: supplierId || undefined,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        notes: notes || undefined,
        items: items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
        })),
      });

      toast.success('Entrada de estoque registrada com sucesso!');
      
      // Reset form
      setSupplierId('');
      setInvoiceNumber('');
      setInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
      setNotes('');
      setItems([]);
    } catch (error) {
      toast.error('Erro ao registrar entrada');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const loading = stockLoading || dataLoading;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Entrada de Estoque</h1>
        <p className="text-muted-foreground">Registre compras e entradas de produtos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Purchase Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Dados da Compra
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={supplierId || 'none'} onValueChange={(v) => setSupplierId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (sem fornecedor)</SelectItem>
                  {activeSuppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.trade_name || supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Número da Nota Fiscal</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="NF-e ou pedido"
              />
            </div>

            <div className="space-y-2">
              <Label>Data da Compra</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações da compra"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Add Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Adicionar Produtos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2 lg:col-span-1">
                <Label>Produto *</Label>
                <Select value={selectedProduct} onValueChange={handleProductSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label>Valor Unitário *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemUnitPrice}
                  onChange={(e) => setItemUnitPrice(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label>Lote</Label>
                <Input
                  value={itemBatch}
                  onChange={(e) => setItemBatch(e.target.value)}
                  placeholder="Número do lote"
                />
              </div>

              <div className="space-y-2">
                <Label>Validade</Label>
                <Input
                  type="date"
                  value={itemExpiry}
                  onChange={(e) => setItemExpiry(e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button onClick={handleAddItem} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Items Table */}
            {items.length > 0 && (
              <div className="mt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Qtd</TableHead>
                      <TableHead className="text-right">Valor Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {item.product?.name || 'Produto não encontrado'}
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                        <TableCell>{item.batch_number || '-'}</TableCell>
                        <TableCell>
                          {item.expiry_date ? format(new Date(item.expiry_date), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary and Submit */}
      {items.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex gap-8">
                <div>
                  <p className="text-sm text-muted-foreground">Itens</p>
                  <p className="text-2xl font-bold">{items.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Quantidade Total</p>
                  <p className="text-2xl font-bold">{totalItems}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalValue)}</p>
                </div>
              </div>
              
              <Button size="lg" onClick={handleSubmit}>
                <ShoppingCart className="w-5 h-5 mr-2" />
                Registrar Entrada
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
