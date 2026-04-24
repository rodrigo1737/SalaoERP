import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Building2, Users, AlertTriangle, CheckCircle, Lock, Eye, Shield, Trash2, UserPlus, Play, Pause, KeyRound, Globe, Copy, ExternalLink } from 'lucide-react';
import { TenantAdminsDialog } from './TenantAdminsDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
  cnpj: string | null;
  cpf: string | null;
  payment_method: 'pix' | 'boleto' | 'cartao' | 'transferencia';
  subscription_due_date: string | null;
  status: 'active' | 'readonly' | 'blocked';
  booking_slug: string | null;
  created_at: string;
  updated_at: string;
}

interface SuperAdmin {
  id: string;
  email: string;
  created_at: string;
}

const paymentMethodLabels: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  cartao: 'Cartão',
  transferencia: 'Transferência',
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  readonly: 'Somente Leitura',
  blocked: 'Bloqueado',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-700',
  readonly: 'bg-yellow-500/20 text-yellow-700',
  blocked: 'bg-red-500/20 text-red-700',
};

export function TenantsList() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSuperAdmins, setLoadingSuperAdmins] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuperAdminDialogOpen, setIsSuperAdminDialogOpen] = useState(false);
  const [isCreateAdminDialogOpen, setIsCreateAdminDialogOpen] = useState(false);
  const [isAdminsDialogOpen, setIsAdminsDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [selectedTenantForAdmin, setSelectedTenantForAdmin] = useState<Tenant | null>(null);
  const [selectedTenantForAdmins, setSelectedTenantForAdmins] = useState<Tenant | null>(null);
  const [newSuperAdminEmail, setNewSuperAdminEmail] = useState('');
  const [addingSuperAdmin, setAddingSuperAdmin] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [createdAdminInfo, setCreatedAdminInfo] = useState<{ email: string; password: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    cpf: '',
    payment_method: 'pix' as 'pix' | 'boleto' | 'cartao' | 'transferencia',
    subscription_due_date: '',
    status: 'active' as 'active' | 'readonly' | 'blocked',
    booking_slug: '',
  });

  const generateBookingSlug = (name: string, id: string) => {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    return `${slug}-${id.substring(0, 8)}`;
  };

  const getBookingUrl = (slug: string) => {
    return `${window.location.origin}/b/${slug}`;
  };

  const copyBookingLink = (slug: string) => {
    navigator.clipboard.writeText(getBookingUrl(slug));
    toast.success('Link copiado!');
  };

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants((data as unknown as Tenant[]) || []);
    } catch (error) {
      console.error('Error fetching tenants:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuperAdmins = async () => {
    setLoadingSuperAdmins(true);
    try {
      const { data, error } = await supabase
        .from('super_admins')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setSuperAdmins(data || []);
    } catch (error) {
      console.error('Error fetching super admins:', error);
      toast.error('Erro ao carregar super admins');
    } finally {
      setLoadingSuperAdmins(false);
    }
  };

  const handleAddSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = newSuperAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Email inválido');
      return;
    }

    setAddingSuperAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-super-admins', {
        body: { action: 'add', email }
      });

      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Super admin adicionado com sucesso!');
      setNewSuperAdminEmail('');
      setIsSuperAdminDialogOpen(false);
      fetchSuperAdmins();
    } catch (error) {
      console.error('Error adding super admin:', error);
      toast.error('Erro ao adicionar super admin');
    } finally {
      setAddingSuperAdmin(false);
    }
  };

  const handleRemoveSuperAdmin = async (email: string) => {
    if (!confirm(`Deseja realmente remover ${email} como super admin?`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-super-admins', {
        body: { action: 'remove', email }
      });

      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Super admin removido com sucesso!');
      fetchSuperAdmins();
    } catch (error) {
      console.error('Error removing super admin:', error);
      toast.error('Erro ao remover super admin');
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchSuperAdmins();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    try {
      const tenantData = {
        name: formData.name.trim(),
        cnpj: formData.cnpj.trim() || null,
        cpf: formData.cpf.trim() || null,
        payment_method: formData.payment_method,
        subscription_due_date: formData.subscription_due_date || null,
        status: formData.status,
        booking_slug: formData.booking_slug.trim() || null,
      };

      if (editingTenant) {
        // Se o slug está vazio e estamos ativando, gerar automaticamente
        if (!tenantData.booking_slug && formData.booking_slug === '') {
          tenantData.booking_slug = generateBookingSlug(formData.name, editingTenant.id);
        }
        
        const { error } = await supabase
          .from('tenants')
          .update(tenantData)
          .eq('id', editingTenant.id);

        if (error) throw error;
        toast.success('Cliente atualizado com sucesso!');
      } else {
        // Para novo tenant, primeiro criar sem slug, depois atualizar com slug gerado
        const { data: newTenant, error } = await supabase
          .from('tenants')
          .insert([{ ...tenantData, booking_slug: null }])
          .select()
          .single();

        if (error) throw error;

        // Gerar e atualizar o slug com o ID do tenant
        if (newTenant) {
          const generatedSlug = generateBookingSlug(formData.name, newTenant.id);
          await supabase
            .from('tenants')
            .update({ booking_slug: generatedSlug })
            .eq('id', newTenant.id);
        }
        
        toast.success('Cliente cadastrado com sucesso!');
        
        // Abrir dialog para criar admin do novo tenant
        if (newTenant) {
          setSelectedTenantForAdmin(newTenant as unknown as Tenant);
          setAdminCredentials({
            email: '',
            password: '',
            name: '',
          });
          setCreatedAdminInfo(null);
          setIsCreateAdminDialogOpen(true);
        }
      }

      setIsDialogOpen(false);
      resetForm();
      fetchTenants();
    } catch (error) {
      console.error('Error saving tenant:', error);
      toast.error('Erro ao salvar cliente');
    }
  };

  const handleCreateTenantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTenantForAdmin) return;
    
    if (!adminCredentials.email.trim() || !adminCredentials.password) {
      toast.error('Email e senha são obrigatórios');
      return;
    }

    if (adminCredentials.password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setCreatingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-tenant-admin', {
        body: {
          tenantId: selectedTenantForAdmin.id,
          adminEmail: adminCredentials.email.trim().toLowerCase(),
          adminPassword: adminCredentials.password,
          adminName: adminCredentials.name.trim() || undefined,
        }
      });

      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setCreatedAdminInfo({
        email: adminCredentials.email.trim().toLowerCase(),
        password: adminCredentials.password,
      });
      
      toast.success('Administrador criado com sucesso!');
    } catch (error) {
      console.error('Error creating tenant admin:', error);
      toast.error('Erro ao criar administrador');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleCloseAdminDialog = () => {
    setIsCreateAdminDialogOpen(false);
    setSelectedTenantForAdmin(null);
    setAdminCredentials({ email: '', password: '', name: '' });
    setCreatedAdminInfo(null);
  };

  const handleOpenCreateAdminForTenant = (tenant: Tenant) => {
    setSelectedTenantForAdmin(tenant);
    setAdminCredentials({ email: '', password: '', name: '' });
    setCreatedAdminInfo(null);
    setIsCreateAdminDialogOpen(true);
  };

  const handleOpenAdminsDialog = (tenant: Tenant) => {
    setSelectedTenantForAdmins(tenant);
    setIsAdminsDialogOpen(true);
  };

  const handleQuickStatusChange = async (tenant: Tenant, newStatus: 'active' | 'readonly' | 'blocked') => {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ status: newStatus })
        .eq('id', tenant.id);

      if (error) throw error;
      
      const statusMessage = {
        active: 'ativado',
        readonly: 'colocado em modo somente leitura',
        blocked: 'bloqueado'
      };
      
      toast.success(`Cliente ${tenant.name} foi ${statusMessage[newStatus]} com sucesso!`);
      fetchTenants();
    } catch (error) {
      console.error('Error updating tenant status:', error);
      toast.error('Erro ao alterar status do cliente');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      cnpj: '',
      cpf: '',
      payment_method: 'pix',
      subscription_due_date: '',
      status: 'active',
      booking_slug: '',
    });
    setEditingTenant(null);
  };

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name,
      cnpj: tenant.cnpj || '',
      cpf: tenant.cpf || '',
      payment_method: tenant.payment_method,
      subscription_due_date: tenant.subscription_due_date || '',
      status: tenant.status,
      booking_slug: tenant.booking_slug || '',
    });
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'readonly':
        return <Eye className="w-4 h-4" />;
      case 'blocked':
        return <Lock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const activeCount = tenants.filter(t => t.status === 'active').length;
  const readonlyCount = tenants.filter(t => t.status === 'readonly').length;
  const blockedCount = tenants.filter(t => t.status === 'blocked').length;

  const expiringTenants = tenants.filter(t => {
    if (!t.subscription_due_date) return false;
    const dueDate = new Date(t.subscription_due_date);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 7 && daysUntilDue >= 0 && t.status === 'active';
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Clientes B2B
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os clientes da sua plataforma
          </p>
        </div>
      </div>

      <Tabs defaultValue="tenants" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tenants" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="superadmins" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Super Admins
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="shadow-glow">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingTenant ? 'Editar Cliente' : 'Novo Cliente'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome da empresa"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <Input
                        id="cnpj"
                        value={formData.cnpj}
                        onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Forma de Pagamento</Label>
                      <Select
                        value={formData.payment_method}
                        onValueChange={(value) => setFormData({ ...formData, payment_method: value as typeof formData.payment_method })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subscription_due_date">Vencimento</Label>
                      <Input
                        id="subscription_due_date"
                        type="date"
                        value={formData.subscription_due_date}
                        onChange={(e) => setFormData({ ...formData, subscription_due_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as typeof formData.status })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="readonly">Somente Leitura</SelectItem>
                        <SelectItem value="blocked">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booking_slug" className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Link de Agendamento Online
                    </Label>
                    {editingTenant && formData.booking_slug ? (
                      <div className="flex items-center gap-2">
                        <Input
                          id="booking_slug"
                          value={formData.booking_slug}
                          onChange={(e) => setFormData({ ...formData, booking_slug: e.target.value })}
                          placeholder="slug-do-salao"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => copyBookingLink(formData.booking_slug)}
                          title="Copiar link"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => window.open(getBookingUrl(formData.booking_slug), '_blank')}
                          title="Abrir link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        O link será gerado automaticamente ao cadastrar o cliente.
                      </p>
                    )}
                    {editingTenant && formData.booking_slug && (
                      <p className="text-xs text-muted-foreground">
                        {getBookingUrl(formData.booking_slug)}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      {editingTenant ? 'Salvar' : 'Cadastrar'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tenants.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ativos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Somente Leitura</CardTitle>
                <Eye className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{readonlyCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bloqueados</CardTitle>
                <Lock className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{blockedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Expiring Warning */}
          {expiringTenants.length > 0 && (
            <Card className="border-yellow-500/50 bg-yellow-500/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-700">
                  <AlertTriangle className="h-4 w-4" />
                  Assinaturas Próximas do Vencimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-yellow-700">
                  {expiringTenants.map(t => (
                    <div key={t.id} className="flex justify-between py-1">
                      <span>{t.name}</span>
                      <span>Vence em: {format(new Date(t.subscription_due_date!), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tenants Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ/CPF</TableHead>
                    <TableHead>Link Online</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum cliente cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell>
                          {tenant.cnpj || tenant.cpf || '-'}
                        </TableCell>
                        <TableCell>
                          {tenant.booking_slug ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => copyBookingLink(tenant.booking_slug!)}
                                title="Copiar link"
                              >
                                <Copy className="w-3 h-3 mr-1" />
                                Copiar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => window.open(getBookingUrl(tenant.booking_slug!), '_blank')}
                                title="Abrir link"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>{paymentMethodLabels[tenant.payment_method]}</TableCell>
                        <TableCell>
                          {tenant.subscription_due_date
                            ? format(new Date(tenant.subscription_due_date), 'dd/MM/yyyy', { locale: ptBR })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[tenant.status]}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(tenant.status)}
                              {statusLabels[tenant.status]}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Quick status actions */}
                            {tenant.status !== 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuickStatusChange(tenant, 'active')}
                                title="Ativar Cliente"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            {tenant.status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuickStatusChange(tenant, 'blocked')}
                                title="Bloquear Cliente"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Lock className="w-4 h-4" />
                              </Button>
                            )}
                            {tenant.status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuickStatusChange(tenant, 'readonly')}
                                title="Modo Somente Leitura"
                                className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAdminsDialog(tenant)}
                              title="Ver Administradores"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenCreateAdminForTenant(tenant)}
                              title="Criar Administrador"
                            >
                              <UserPlus className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(tenant)}
                              title="Editar Cliente"
                            >
                              <Pencil className="w-4 h-4" />
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
        </TabsContent>

        <TabsContent value="superadmins" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Super Administradores</h2>
              <p className="text-sm text-muted-foreground">
                Usuários com acesso total à plataforma
              </p>
            </div>
            <Dialog open={isSuperAdminDialogOpen} onOpenChange={setIsSuperAdminDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-glow">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo Super Admin
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Super Admin</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddSuperAdmin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="superAdminEmail">Email *</Label>
                    <Input
                      id="superAdminEmail"
                      type="email"
                      value={newSuperAdminEmail}
                      onChange={(e) => setNewSuperAdminEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      O email deve corresponder a uma conta existente no sistema
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsSuperAdminDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={addingSuperAdmin}>
                      {addingSuperAdmin ? 'Adicionando...' : 'Adicionar'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingSuperAdmins ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Adicionado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {superAdmins.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhum super admin cadastrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      superAdmins.map((admin) => (
                        <TableRow key={admin.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-primary" />
                              {admin.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(admin.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveSuperAdmin(admin.email)}
                              disabled={superAdmins.length === 1}
                              title={superAdmins.length === 1 ? 'Não é possível remover o último super admin' : 'Remover super admin'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Sobre Super Admins
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• Super admins têm acesso total a todos os tenants e funcionalidades</p>
              <p>• Podem criar, editar e gerenciar todos os clientes B2B</p>
              <p>• Apenas super admins podem adicionar ou remover outros super admins</p>
              <p>• O último super admin não pode ser removido</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para criar admin do tenant */}
      <Dialog open={isCreateAdminDialogOpen} onOpenChange={(open) => !open && handleCloseAdminDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdAdminInfo ? 'Credenciais do Administrador' : 'Criar Administrador'}
            </DialogTitle>
          </DialogHeader>

          {createdAdminInfo ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-sm text-green-700 font-medium mb-2">
                  ✓ Administrador criado com sucesso!
                </p>
                <p className="text-xs text-muted-foreground">
                  Guarde estas credenciais em local seguro. A senha não poderá ser recuperada.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tenant</Label>
                  <p className="font-medium">{selectedTenantForAdmin?.name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm flex-1">
                      {createdAdminInfo.email}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(createdAdminInfo.email);
                        toast.success('Email copiado!');
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Senha</Label>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm flex-1">
                      {createdAdminInfo.password}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(createdAdminInfo.password);
                        toast.success('Senha copiada!');
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleCloseAdminDialog}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateTenantAdmin} className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{selectedTenantForAdmin?.name}</p>
                <p className="text-xs text-muted-foreground">
                  Crie as credenciais de acesso para o administrador deste cliente
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminName">Nome do Administrador</Label>
                <Input
                  id="adminName"
                  value={adminCredentials.name}
                  onChange={(e) => setAdminCredentials({ ...adminCredentials, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email *</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={adminCredentials.email}
                  onChange={(e) => setAdminCredentials({ ...adminCredentials, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">Senha *</Label>
                <Input
                  id="adminPassword"
                  type="text"
                  value={adminCredentials.password}
                  onChange={(e) => setAdminCredentials({ ...adminCredentials, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  A senha será exibida apenas uma vez após a criação
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAdminDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={creatingAdmin}>
                  {creatingAdmin ? 'Criando...' : 'Criar Administrador'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para ver/gerenciar admins do tenant */}
      <TenantAdminsDialog
        tenant={selectedTenantForAdmins}
        open={isAdminsDialogOpen}
        onOpenChange={setIsAdminsDialogOpen}
      />
    </div>
  );
}
