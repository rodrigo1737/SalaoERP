import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Clock,
  MoreVertical,
  Filter,
  Users,
  Globe,
  Info,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Service, ServiceProfessional } from '@/context/DataContext';
import { useStableData } from '@/context/StableDataContext';
import { useStock } from '@/context/StockContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ServiceProductsEditor } from './ServiceProductsEditor';
import {
  CadastroPageSize,
  CadastroViewMode,
  ListViewControls,
  resolvePageSize,
} from '@/components/common/ListViewControls';

const serviceCategories = ['Cabelo', 'Unhas', 'Estética', 'Maquiagem', 'Outros'];

const priceTypes = [
  { value: 'fixed', label: 'Fixo' },
  { value: 'variable', label: 'Variável' },
  { value: 'starting_at', label: 'A partir de' },
];

interface ProfessionalCommission {
  professional_id: string;
  enabled: boolean;
  commission_rate: string;
  assistant_commission_rate: string;
  duration_minutes: string;
}

interface ServiceProductItem {
  product_id: string;
  quantity: number;
  notes?: string;
}

const DEFAULT_PAGE_SIZE: CadastroPageSize = 20;

export function ServicesList() {
  const { services, professionals, addService, updateService, deleteService, refreshData } = useStableData();
  const { saveServiceProducts } = useStock();
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('service');
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<CadastroViewMode>('cards');
  const [pageSize, setPageSize] = useState<CadastroPageSize>(DEFAULT_PAGE_SIZE);

  // Form state - Service tab
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDuration, setFormDuration] = useState('60');
  const [formBreakTime, setFormBreakTime] = useState('0');
  const [formAllowOnline, setFormAllowOnline] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formPriceType, setFormPriceType] = useState<'fixed' | 'variable' | 'starting_at'>('fixed');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('0');
  const [formReturnDays, setFormReturnDays] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Form state - Commissions tab
  const [professionalCommissions, setProfessionalCommissions] = useState<ProfessionalCommission[]>([]);

  // Form state - Service products (insumos)
  const [serviceProductItems, setServiceProductItems] = useState<ServiceProductItem[]>([]);

  // Load existing service_professionals when editing
  useEffect(() => {
    if (editingService && isDialogOpen) {
      loadServiceProfessionals(editingService.id);
    }
  }, [editingService, isDialogOpen]);

  const loadServiceProfessionals = async (serviceId: string) => {
    const { data } = await supabase
      .from('service_professionals')
      .select('*')
      .eq('service_id', serviceId)
      .eq('tenant_id', tenantId);

    const existingMap = new Map(data?.map(sp => [sp.professional_id, sp]) || []);

    const commissions = professionals.map(prof => {
      const existing = existingMap.get(prof.id);
      return {
        professional_id: prof.id,
        enabled: !!existing,
        commission_rate: existing?.commission_rate?.toString() || '50',
        assistant_commission_rate: existing?.assistant_commission_rate?.toString() || '0',
        duration_minutes: existing?.duration_minutes?.toString() || '',
      };
    });

    setProfessionalCommissions(commissions);
  };

  const initializeProfessionalCommissions = () => {
    const commissions = professionals.map(prof => ({
      professional_id: prof.id,
      enabled: false,
      commission_rate: '50',
      assistant_commission_rate: '0',
      duration_minutes: '',
    }));
    setProfessionalCommissions(commissions);
  };

  const filteredServices = services.filter(service => {
    const matchesSearch = service.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const resolvedPageSize = resolvePageSize(pageSize, filteredServices.length);
  const pagedServices = pageSize === 'all'
    ? filteredServices
    : filteredServices.slice((page - 1) * resolvedPageSize, page * resolvedPageSize);
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / resolvedPageSize));

  const groupedServices = pagedServices.reduce((acc, service) => {
    const cat = service.category || 'Outros';
    if (!acc[cat]) {
      acc[cat] = [];
    }
    acc[cat].push(service);
    return acc;
  }, {} as Record<string, Service[]>);

  const openNewService = () => {
    setEditingService(null);
    setFormName('');
    setFormCategory('');
    setFormDuration('60');
    setFormBreakTime('0');
    setFormAllowOnline(false);
    setFormDescription('');
    setFormPriceType('fixed');
    setFormPrice('');
    setFormCostPrice('0');
    setFormReturnDays('');
    setFormActive(true);
    setActiveTab('service');
    initializeProfessionalCommissions();
    setServiceProductItems([]);
    setIsDialogOpen(true);
  };

  const openEditService = (service: Service) => {
    setEditingService(service);
    setFormName(service.name);
    setFormCategory(service.category || '');
    setFormDuration(service.duration_minutes.toString());
    setFormBreakTime(service.break_time_minutes?.toString() || '0');
    setFormAllowOnline(service.allow_online_booking || false);
    setFormDescription(service.description || '');
    setFormPriceType(service.price_type || 'fixed');
    setFormPrice(service.default_price.toString());
    setFormCostPrice(service.cost_price?.toString() || '0');
    setFormReturnDays(service.suggested_return_days?.toString() || '');
    setFormActive(service.is_active);
    setActiveTab('service');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName || !formCategory || !formPrice) return;

    setIsSubmitting(true);

    try {
      let serviceId: string;

      if (editingService) {
        await updateService(editingService.id, {
          name: formName,
          category: formCategory,
          duration_minutes: parseInt(formDuration),
          break_time_minutes: parseInt(formBreakTime),
          allow_online_booking: formAllowOnline,
          description: formDescription || undefined,
          price_type: formPriceType,
          default_price: parseFloat(formPrice),
          cost_price: parseFloat(formCostPrice),
          suggested_return_days: formReturnDays ? parseInt(formReturnDays) : undefined,
          is_active: formActive,
        });
        serviceId = editingService.id;
      } else {
        const newService = await addService({
          name: formName,
          category: formCategory,
          duration_minutes: parseInt(formDuration),
          break_time_minutes: parseInt(formBreakTime),
          allow_online_booking: formAllowOnline,
          description: formDescription || undefined,
          price_type: formPriceType,
          default_price: parseFloat(formPrice),
          cost_price: parseFloat(formCostPrice),
          suggested_return_days: formReturnDays ? parseInt(formReturnDays) : undefined,
          is_active: formActive,
        });
        if (!newService) throw new Error('Failed to create service');
        serviceId = newService.id;
      }

      // Save professional commissions
      const enabledCommissions = professionalCommissions.filter(pc => pc.enabled);

      // Delete existing and insert new
      await supabase
        .from('service_professionals')
        .delete()
        .eq('service_id', serviceId)
        .eq('tenant_id', tenantId);

      if (enabledCommissions.length > 0) {
        const { error } = await supabase.from('service_professionals').insert(
          enabledCommissions.map(pc => ({
            service_id: serviceId,
            professional_id: pc.professional_id,
            commission_rate: parseFloat(pc.commission_rate),
            assistant_commission_rate: parseFloat(pc.assistant_commission_rate),
            duration_minutes: pc.duration_minutes ? parseInt(pc.duration_minutes) : null,
            tenant_id: tenantId,
          }))
        );

        if (error) {
          console.error('Error saving professional commissions:', error);
        }
      }

      // Save service products (insumos)
      await saveServiceProducts(serviceId, serviceProductItems);

      await refreshData();
      toast({ 
        title: editingService ? "Serviço atualizado" : "Serviço cadastrado", 
        description: editingService ? "Dados salvos com sucesso" : `${formName} foi adicionado` 
      });
      setIsDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateProfessionalCommission = (professionalId: string, field: keyof ProfessionalCommission, value: any) => {
    setProfessionalCommissions(prev => 
      prev.map(pc => 
        pc.professional_id === professionalId ? { ...pc, [field]: value } : pc
      )
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const getPriceTypeLabel = (type: string) => {
    return priceTypes.find(p => p.value === type)?.label || 'Fixo';
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, pageSize, viewMode]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Serviços
          </h1>
          <p className="text-muted-foreground mt-1">
            {services.filter(s => s.is_active).length} serviços ativos
          </p>
        </div>
        <Button onClick={openNewService}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Serviço
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar serviço..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {serviceCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ListViewControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        totalItems={filteredServices.length}
        shownItems={pagedServices.length}
      />

      {/* Services by Category */}
      {Object.keys(groupedServices).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum serviço cadastrado</p>
          <p className="text-sm">Clique em "Novo Serviço" para adicionar</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="space-y-8">
          {Object.entries(groupedServices).map(([category, categoryServices], categoryIndex) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: categoryIndex * 0.1 }}
            >
              <h2 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                {category}
                <span className="text-sm font-normal text-muted-foreground">
                  ({categoryServices.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryServices.map((service) => (
                  <Card 
                    key={service.id} 
                    className={`p-5 border-0 shadow-md hover:shadow-lg transition-all ${!service.is_active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{service.name}</h3>
                          {service.allow_online_booking && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Globe className="w-4 h-4 text-primary" />
                                </TooltipTrigger>
                                <TooltipContent>Agendamento online</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {service.category}
                          </Badge>
                          {service.price_type !== 'fixed' && (
                            <Badge variant="outline" className="text-xs">
                              {getPriceTypeLabel(service.price_type)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditService(service)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingService(service)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{service.duration_minutes} min</span>
                          {service.break_time_minutes > 0 && (
                            <span className="text-xs">(+{service.break_time_minutes} folga)</span>
                          )}
                        </div>
                        <p className="text-xl font-bold text-primary">
                          {service.price_type === 'starting_at' && 'A partir de '}
                          {formatCurrency(service.default_price)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="hidden md:table-cell">Duração</TableHead>
                {viewMode === 'detailed' && (
                  <>
                    <TableHead className="hidden lg:table-cell">Preço</TableHead>
                    <TableHead className="hidden lg:table-cell">Online</TableHead>
                    <TableHead className="hidden xl:table-cell">Status</TableHead>
                  </>
                )}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedServices.map((service) => (
                <TableRow key={service.id} className={!service.is_active ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{service.name}</p>
                      {viewMode === 'compact' && (
                        <p className="text-xs text-muted-foreground md:hidden">
                          {service.category || 'Outros'} · {formatCurrency(service.default_price)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{service.category || 'Outros'}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {service.duration_minutes} min
                    {service.break_time_minutes > 0 ? ` + ${service.break_time_minutes}` : ''}
                  </TableCell>
                  {viewMode === 'detailed' && (
                    <>
                      <TableCell className="hidden font-medium lg:table-cell">
                        {service.price_type === 'starting_at' && 'A partir de '}
                        {formatCurrency(service.default_price)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {service.allow_online_booking ? 'Sim' : 'Não'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <Badge variant={service.is_active ? 'success' : 'secondary'}>
                          {service.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditService(service)} title="Editar serviço">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeletingService(service)}
                        title="Excluir serviço"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

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

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deletingService} onOpenChange={open => !open && setDeletingService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço <strong>{deletingService?.name}</strong> será removido. Agendamentos existentes não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteService(deletingService!.id); setDeletingService(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Service Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingService ? 'Editar Serviço' : 'Novo Serviço'}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="service">Serviço</TabsTrigger>
              <TabsTrigger value="commissions">
                <Users className="w-4 h-4 mr-2" />
                Comissões
              </TabsTrigger>
              <TabsTrigger value="supplies">
                Insumos
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="service" className="space-y-4 py-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="name">Nome do Serviço *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Corte Feminino"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">Duração (min)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="15"
                      step="15"
                      value={formDuration}
                      onChange={(e) => setFormDuration(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="breakTime" className="flex items-center gap-1">
                      Folga necessária
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-3 h-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>Intervalo entre agendamentos</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="breakTime"
                        type="number"
                        min="0"
                        step="5"
                        value={formBreakTime}
                        onChange={(e) => setFormBreakTime(e.target.value)}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-6">
                    <Checkbox 
                      id="allowOnline" 
                      checked={formAllowOnline}
                      onCheckedChange={(checked) => setFormAllowOnline(checked === true)}
                    />
                    <Label htmlFor="allowOnline" className="cursor-pointer">
                      Permitir Agendamento Online
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    placeholder="Descrição do serviço..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo valor</Label>
                    <Select value={formPriceType} onValueChange={(v) => setFormPriceType(v as 'fixed' | 'variable' | 'starting_at')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priceTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Valor cobrado *</Label>
                    <div className="flex gap-1 items-center">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="costPrice">Custo do serviço</Label>
                    <div className="flex gap-1 items-center">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input
                        id="costPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={formCostPrice}
                        onChange={(e) => setFormCostPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="returnDays">Sugerir retorno</Label>
                    <div className="flex gap-1 items-center">
                      <Input
                        id="returnDays"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={formReturnDays}
                        onChange={(e) => setFormReturnDays(e.target.value)}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">dias</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <Label htmlFor="active" className="cursor-pointer">Serviço Ativo</Label>
                  <Switch
                    id="active"
                    checked={formActive}
                    onCheckedChange={setFormActive}
                  />
                </div>
              </TabsContent>

              <TabsContent value="commissions" className="py-4 mt-0">
                <p className="text-sm text-muted-foreground mb-4">
                  Informe a comissão dos profissionais que realizam o serviço
                </p>
                
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left w-8"></th>
                        <th className="p-3 text-left font-medium text-sm">Nome</th>
                        <th className="p-3 text-center font-medium text-sm w-24">Comissão</th>
                        <th className="p-3 text-center font-medium text-sm w-24">Comissão Assistente</th>
                        <th className="p-3 text-center font-medium text-sm w-24">Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {professionalCommissions.map((pc) => {
                        const professional = professionals.find(p => p.id === pc.professional_id);
                        if (!professional) return null;
                        
                        return (
                          <tr key={pc.professional_id} className="border-t">
                            <td className="p-3">
                              <Checkbox
                                checked={pc.enabled}
                                onCheckedChange={(checked) => 
                                  updateProfessionalCommission(pc.professional_id, 'enabled', checked)
                                }
                              />
                            </td>
                            <td className="p-3">
                              <span className={pc.enabled ? 'font-medium' : 'text-muted-foreground'}>
                                {professional.name}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="w-16 h-8 text-center"
                                  value={pc.commission_rate}
                                  onChange={(e) => 
                                    updateProfessionalCommission(pc.professional_id, 'commission_rate', e.target.value)
                                  }
                                  disabled={!pc.enabled}
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="w-16 h-8 text-center"
                                  value={pc.assistant_commission_rate}
                                  onChange={(e) => 
                                    updateProfessionalCommission(pc.professional_id, 'assistant_commission_rate', e.target.value)
                                  }
                                  disabled={!pc.enabled}
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  className="w-16 h-8 text-center"
                                  placeholder=""
                                  value={pc.duration_minutes}
                                  onChange={(e) => 
                                    updateProfessionalCommission(pc.professional_id, 'duration_minutes', e.target.value)
                                  }
                                  disabled={!pc.enabled}
                                />
                                <span className="text-sm text-muted-foreground">min</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="supplies" className="py-4 mt-0">
                <p className="text-sm text-muted-foreground mb-4">
                  Vincule produtos de uso interno que são consumidos ao realizar este serviço.
                  O estoque será baixado automaticamente ao finalizar o atendimento.
                </p>
                
                <ServiceProductsEditor 
                  serviceId={editingService?.id} 
                  onChange={setServiceProductItems}
                />
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formName || !formCategory || !formPrice || isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
