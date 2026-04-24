import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Search, 
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Package,
  Filter
} from 'lucide-react';
import { useStock } from '@/context/StockContext';
import { useData } from '@/context/DataContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const movementTypeLabels: Record<string, { label: string; color: string; icon: 'up' | 'down' | 'neutral' }> = {
  purchase: { label: 'Compra', color: 'bg-success/10 text-success', icon: 'up' },
  sale: { label: 'Venda', color: 'bg-primary/10 text-primary', icon: 'down' },
  adjustment: { label: 'Ajuste', color: 'bg-warning/10 text-warning', icon: 'neutral' },
  service_consumption: { label: 'Consumo Serviço', color: 'bg-secondary/10 text-secondary-foreground', icon: 'down' },
  return: { label: 'Devolução', color: 'bg-muted/50 text-muted-foreground', icon: 'up' },
  loss: { label: 'Perda/Quebra', color: 'bg-destructive/10 text-destructive', icon: 'down' },
};

export function StockMovements() {
  const { stockMovements, suppliers, loading: stockLoading } = useStock();
  const { products, loading: dataLoading } = useData();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');

  const filteredMovements = stockMovements.filter(movement => {
    const product = products.find(p => p.id === movement.product_id);
    const matchesSearch = 
      product?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movement.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movement.batch_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || movement.movement_type === filterType;
    const matchesProduct = filterProduct === 'all' || movement.product_id === filterProduct;
    return matchesSearch && matchesType && matchesProduct;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getMovementIcon = (type: string) => {
    const config = movementTypeLabels[type] || movementTypeLabels.adjustment;
    switch (config.icon) {
      case 'up':
        return <ArrowUpCircle className="w-5 h-5 text-success" />;
      case 'down':
        return <ArrowDownCircle className="w-5 h-5 text-destructive" />;
      default:
        return <RefreshCw className="w-5 h-5 text-warning" />;
    }
  };

  const loading = stockLoading || dataLoading;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Stats
  const totalPurchases = stockMovements
    .filter(m => m.movement_type === 'purchase')
    .reduce((sum, m) => sum + (m.total_value || 0), 0);
  const totalSales = stockMovements
    .filter(m => m.movement_type === 'sale')
    .reduce((sum, m) => sum + (m.total_value || 0), 0);
  const entriesCount = stockMovements.filter(m => ['purchase', 'return'].includes(m.movement_type)).length;
  const exitsCount = stockMovements.filter(m => ['sale', 'service_consumption', 'loss'].includes(m.movement_type)).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Movimentações</h1>
        <p className="text-muted-foreground">Histórico de entradas e saídas do estoque</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Movimentações</p>
                <p className="text-2xl font-bold">{stockMovements.length}</p>
              </div>
              <Package className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entradas</p>
                <p className="text-2xl font-bold text-success">{entriesCount}</p>
              </div>
              <ArrowUpCircle className="w-8 h-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saídas</p>
                <p className="text-2xl font-bold text-destructive">{exitsCount}</p>
              </div>
              <ArrowDownCircle className="w-8 h-8 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Compras</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(totalPurchases)}</p>
              </div>
              <Package className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar por produto, NF, lote..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            <SelectItem value="purchase">Compra</SelectItem>
            <SelectItem value="sale">Venda</SelectItem>
            <SelectItem value="adjustment">Ajuste</SelectItem>
            <SelectItem value="service_consumption">Consumo Serviço</SelectItem>
            <SelectItem value="loss">Perda/Quebra</SelectItem>
            <SelectItem value="return">Devolução</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProduct} onValueChange={setFilterProduct}>
          <SelectTrigger className="w-[200px]">
            <Package className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Produtos</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Quantidade</TableHead>
                <TableHead className="text-center">Estoque Ant.</TableHead>
                <TableHead className="text-center">Novo Estoque</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>NF/Lote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhuma movimentação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.map((movement) => {
                  const product = products.find(p => p.id === movement.product_id);
                  const typeConfig = movementTypeLabels[movement.movement_type] || movementTypeLabels.adjustment;
                  const supplier = movement.supplier_id ? suppliers.find(s => s.id === movement.supplier_id) : null;
                  
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMovementIcon(movement.movement_type)}
                          <div>
                            <p className="text-sm font-medium">
                              {format(new Date(movement.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(movement.created_at), 'HH:mm', { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={typeConfig.color}>
                          {typeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {product?.name || 'Produto não encontrado'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={movement.quantity > 0 ? 'text-success' : 'text-destructive'}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {movement.previous_stock}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {movement.new_stock}
                      </TableCell>
                      <TableCell className="text-right">
                        {movement.unit_price ? formatCurrency(movement.unit_price) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {movement.total_value ? formatCurrency(movement.total_value) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {movement.invoice_number && (
                            <p>NF: {movement.invoice_number}</p>
                          )}
                          {movement.batch_number && (
                            <p>Lote: {movement.batch_number}</p>
                          )}
                          {supplier && (
                            <p className="text-muted-foreground">{supplier.trade_name || supplier.name}</p>
                          )}
                          {movement.reason && (
                            <p className="text-muted-foreground italic">{movement.reason}</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
