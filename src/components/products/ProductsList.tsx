import { useEffect, useState } from 'react';
import { useStableData } from '@/context/StableDataContext';
import { useStock } from '@/context/StockContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Package,
  Edit,
  AlertTriangle,
  ShoppingBag,
  Wrench,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/context/DataContext';
import {
  CadastroPageSize,
  ListViewControls,
  resolvePageSize,
} from '@/components/common/ListViewControls';

const productCategories = [
  'Cabelos',
  'Coloração',
  'Tratamento',
  'Finalizadores',
  'Shampoo',
  'Condicionador',
  'Máscaras',
  'Óleos',
  'Escovas e Pentes',
  'Acessórios',
  'Descartáveis',
  'Outros',
];

const DEFAULT_PAGE_SIZE: CadastroPageSize = 20;

export function ProductsList() {
  const { products, addProduct, updateProduct, deleteProduct, loading } = useStableData();
  const { adjustStock, loading: stockLoading } = useStock();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState('');
  const [stockOperation, setStockOperation] = useState<'add' | 'remove'>('add');
  const [stockReason, setStockReason] = useState('');
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<CadastroPageSize>(DEFAULT_PAGE_SIZE);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    sku: '',
    barcode: '',
    cost_price: '',
    sale_price: '',
    stock_quantity: '',
    min_stock: '5',
    unit: 'un',
    type: 'revenda' as 'revenda' | 'uso_interno',
    is_active: true,
  });

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || product.type === filterType;
    return matchesSearch && matchesType;
  });

  const resolvedPageSize = resolvePageSize(pageSize, filteredProducts.length);
  const pagedProducts = pageSize === 'all'
    ? filteredProducts
    : filteredProducts.slice((page - 1) * resolvedPageSize, page * resolvedPageSize);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / resolvedPageSize));
  const lowStockProducts = products.filter(p => p.stock_quantity <= (p.min_stock || 5) && p.is_active);
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock_quantity * p.cost_price), 0);
  const totalSaleValue = products.reduce((sum, p) => sum + (p.stock_quantity * p.sale_price), 0);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterType, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      sku: '',
      barcode: '',
      cost_price: '',
      sale_price: '',
      stock_quantity: '',
      min_stock: '5',
      unit: 'un',
      type: 'revenda',
      is_active: true,
    });
    setEditingProduct(null);
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        category: product.category || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        cost_price: product.cost_price.toString(),
        sale_price: product.sale_price.toString(),
        stock_quantity: product.stock_quantity.toString(),
        min_stock: (product.min_stock || 5).toString(),
        unit: product.unit || 'un',
        type: product.type,
        is_active: product.is_active,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.sale_price) {
      toast.error('Preencha o nome e o preço de venda');
      return;
    }

    const productData = {
      name: formData.name,
      description: formData.description || undefined,
      category: formData.category || undefined,
      sku: formData.sku || undefined,
      barcode: formData.barcode || undefined,
      cost_price: parseFloat(formData.cost_price) || 0,
      sale_price: parseFloat(formData.sale_price),
      stock_quantity: parseInt(formData.stock_quantity) || 0,
      min_stock: parseInt(formData.min_stock) || 5,
      unit: formData.unit,
      type: formData.type,
      is_active: formData.is_active,
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('Produto atualizado com sucesso!');
      } else {
        await addProduct(productData);
        toast.success('Produto cadastrado com sucesso!');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Erro ao salvar produto');
    }
  };

  const handleOpenStockDialog = (product: Product) => {
    setStockProduct(product);
    setStockAdjustment('');
    setStockOperation('add');
    setStockReason('');
    setIsStockDialogOpen(true);
  };

  const handleStockAdjustment = async () => {
    if (!stockProduct || !stockAdjustment) return;

    const adjustment = parseInt(stockAdjustment);
    if (isNaN(adjustment) || adjustment <= 0) {
      toast.error('Quantidade inválida');
      return;
    }

    if (!stockReason.trim()) {
      toast.error('Informe o motivo do ajuste');
      return;
    }

    const quantity = stockOperation === 'add' ? adjustment : -adjustment;
    const type = stockOperation === 'remove' ? 'loss' : 'adjustment';

    try {
      await adjustStock(stockProduct.id, quantity, stockReason, type);
      toast.success(`Estoque ${stockOperation === 'add' ? 'adicionado' : 'removido'} com sucesso!`);
      setIsStockDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao ajustar estoque');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground">Gerencie seu catálogo de produtos</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Nome do Produto *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Shampoo Profissional 1L"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição detalhada do produto"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v as 'revenda' | 'uso_interno' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenda">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4" />
                          Revenda
                        </div>
                      </SelectItem>
                      <SelectItem value="uso_interno">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4" />
                          Uso Interno
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData({ ...formData, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {productCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Código interno"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">Código de Barras</Label>
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="EAN/GTIN"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cost_price">Preço de Custo</Label>
                  <Input
                    id="cost_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sale_price">Preço de Venda *</Label>
                  <Input
                    id="sale_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sale_price}
                    onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                    placeholder="0,00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock_quantity">Quantidade em Estoque</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    min="0"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min_stock">Estoque Mínimo</Label>
                  <Input
                    id="min_stock"
                    type="number"
                    min="0"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Unidade</Label>
                  <Select
                    value={formData.unit}
                    onValueChange={(v) => setFormData({ ...formData, unit: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="un">Unidade (un)</SelectItem>
                      <SelectItem value="ml">Mililitro (ml)</SelectItem>
                      <SelectItem value="l">Litro (L)</SelectItem>
                      <SelectItem value="g">Grama (g)</SelectItem>
                      <SelectItem value="kg">Kilograma (kg)</SelectItem>
                      <SelectItem value="cx">Caixa (cx)</SelectItem>
                      <SelectItem value="pct">Pacote (pct)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="is_active">Produto ativo</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingProduct ? 'Salvar Alterações' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Produtos</p>
                <p className="text-2xl font-bold">{products.length}</p>
              </div>
              <Package className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? 'border-warning' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estoque Baixo</p>
                <p className="text-2xl font-bold text-warning">{lowStockProducts.length}</p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${lowStockProducts.length > 0 ? 'text-warning' : 'text-muted opacity-50'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor em Estoque</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(totalStockValue)}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor de Venda</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalSaleValue)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Card className="border-warning bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-warning">
              <AlertTriangle className="w-4 h-4" />
              Produtos com Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.slice(0, 10).map((product) => (
                <Badge key={product.id} variant="outline" className="border-warning text-warning">
                  {product.name} ({product.stock_quantity} {product.unit})
                </Badge>
              ))}
              {lowStockProducts.length > 10 && (
                <Badge variant="outline">+{lowStockProducts.length - 10} outros</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou código de barras..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="revenda">Revenda</SelectItem>
            <SelectItem value="uso_interno">Uso Interno</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ListViewControls
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        totalItems={filteredProducts.length}
        shownItems={pagedProducts.length}
      />

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                  </TableCell>
                </TableRow>
              ) : (
                pagedProducts.map((product) => (
                  <TableRow key={product.id} className={!product.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          product.type === 'revenda' ? 'bg-primary/10' : 'bg-info/10'
                        }`}>
                          {product.type === 'revenda' ? (
                            <ShoppingBag className="w-5 h-5 text-primary" />
                          ) : (
                            <Wrench className="w-5 h-5 text-info" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={product.type === 'revenda' ? 'default' : 'secondary'}>
                        {product.type === 'revenda' ? 'Revenda' : 'Uso Interno'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {product.category || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(product.cost_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(product.sale_price)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Badge 
                          variant={product.stock_quantity <= (product.min_stock || 5) ? 'destructive' : 'outline'}
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => handleOpenStockDialog(product)}
                        >
                          {product.stock_quantity} {product.unit}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenStockDialog(product)}
                          title="Ajustar estoque"
                        >
                          <Package className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(product)}
                          title="Editar produto"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingProduct(product)}
                          title="Excluir produto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stock Adjustment Dialog */}
      <AlertDialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajustar Estoque</AlertDialogTitle>
            <AlertDialogDescription>
              {stockProduct?.name} - Estoque atual: {stockProduct?.stock_quantity} {stockProduct?.unit}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant={stockOperation === 'add' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setStockOperation('add')}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
              <Button
                variant={stockOperation === 'remove' ? 'destructive' : 'outline'}
                className="flex-1"
                onClick={() => setStockOperation('remove')}
              >
                <TrendingDown className="w-4 h-4 mr-2" />
                Remover
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={stockAdjustment}
                onChange={(e) => setStockAdjustment(e.target.value)}
                placeholder="Quantidade a ajustar"
              />
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder={stockOperation === 'remove' 
                  ? 'Ex: Perda, quebra, uso interno, vencimento...'
                  : 'Ex: Contagem física, ajuste de inventário...'}
                rows={2}
              />
            </div>
            {stockAdjustment && stockProduct && (
              <p className="text-sm text-muted-foreground">
                Novo estoque: {stockOperation === 'add' 
                  ? stockProduct.stock_quantity + parseInt(stockAdjustment || '0')
                  : stockProduct.stock_quantity - parseInt(stockAdjustment || '0')
                } {stockProduct.unit}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleStockAdjustment}
              disabled={!stockReason.trim() || !stockAdjustment}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Paginação */}
      {pageSize !== 'all' && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Confirmação de exclusão de produto */}
      <AlertDialog open={!!deletingProduct} onOpenChange={open => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto <strong>{deletingProduct?.name}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteProduct(deletingProduct!.id); setDeletingProduct(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
