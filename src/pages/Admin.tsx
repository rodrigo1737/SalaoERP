import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Loader2, Shield, ShieldPlus, ShieldMinus, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { validatePassword, getPasswordRequirementsMessage } from '@/lib/passwordValidation';
import { getSupabaseErrorMessage } from '@/lib/supabaseErrors';
import { CleaningStaffPermissions } from '@/components/cleaning/CleaningStaffPermissions';

type AccessRole = 'none' | 'owner' | 'admin' | 'professional' | 'staff';
type AccessPresetId = 'reception' | 'professional' | 'financial' | 'custom';
type PermissionId =
  | 'view_schedule'
  | 'view_all_schedule'
  | 'edit_schedule'
  | 'view_clients'
  | 'close_bill'
  | 'refund_bill'
  | 'view_commissions'
  | 'manage_cash_flow'
  | 'view_financial_history'
  | 'reverse_financial_entries';
type NewAccessType = 'professional' | 'staff';

interface InternalAccessRow {
  rowId: string;
  professionalId: string | null;
  userId: string | null;
  name: string;
  nickname: string | null;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  isActive: boolean;
  hasAccess: boolean;
  permissions: PermissionId[];
  role: AccessRole;
  isOwner: boolean;
  professionalType: 'owner' | 'employee' | 'freelancer' | null;
}

const PERMISSIONS: { id: PermissionId; label: string }[] = [
  { id: 'view_schedule', label: 'Visualizar Agenda' },
  { id: 'view_all_schedule', label: 'Visualizar Agenda de Todos' },
  { id: 'edit_schedule', label: 'Alterar Agendamentos' },
  { id: 'view_clients', label: 'Visualizar Clientes' },
  { id: 'close_bill', label: 'Receber e Encerrar Comanda' },
  { id: 'refund_bill', label: 'Estornar Pagamento e Reabrir Comanda' },
  { id: 'view_commissions', label: 'Visualizar Comissões' },
  { id: 'manage_cash_flow', label: 'Operar Caixa do Dia' },
  { id: 'view_financial_history', label: 'Visualizar Gestão Financeira' },
  { id: 'reverse_financial_entries', label: 'Estornos e Ajustes Financeiros' },
];

const ACCESS_PROFILES: { id: AccessPresetId; label: string; description: string; permissions: PermissionId[] }[] = [
  {
    id: 'reception',
    label: 'Recepção',
    description: 'Agenda completa, clientes, comandas e operação diária do caixa.',
    permissions: ['view_schedule', 'view_all_schedule', 'edit_schedule', 'view_clients', 'close_bill', 'manage_cash_flow'],
  },
  {
    id: 'professional',
    label: 'Profissional',
    description: 'Agenda própria e visualização das próprias comissões.',
    permissions: ['view_schedule', 'view_commissions'],
  },
  {
    id: 'financial',
    label: 'Financeiro',
    description: 'Histórico financeiro, vales, sangrias, estornos e regularizações retroativas.',
    permissions: ['view_clients', 'view_all_schedule', 'refund_bill', 'view_commissions', 'manage_cash_flow', 'view_financial_history', 'reverse_financial_entries'],
  },
  {
    id: 'custom',
    label: 'Personalizado',
    description: 'Defina manualmente as permissões abaixo.',
    permissions: [],
  },
];

const getPresetPermissions = (presetId: AccessPresetId) => (
  ACCESS_PROFILES.find((profile) => profile.id === presetId)?.permissions ?? []
);

const deriveAccessRole = (
  roleRows: string[],
  isOwner: boolean,
  professionalType: InternalAccessRow['professionalType'],
): AccessRole => {
  if (isOwner || (roleRows.includes('admin') && professionalType === 'owner')) return 'owner';
  if (roleRows.includes('admin')) return 'admin';
  if (roleRows.includes('staff')) return 'staff';
  if (roleRows.includes('professional')) return 'professional';
  return 'none';
};

const roleLabels: Record<AccessRole, string> = {
  none: 'Sem acesso',
  owner: 'Owner',
  admin: 'Administrador',
  professional: 'Profissional',
  staff: 'Equipe interna',
};

const roleBadgeClasses: Record<AccessRole, string> = {
  none: 'bg-muted text-muted-foreground',
  owner: 'bg-primary text-primary-foreground',
  admin: 'bg-primary/10 text-primary',
  professional: 'bg-emerald-100 text-emerald-700',
  staff: 'bg-amber-100 text-amber-700',
};

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, tenantId, user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [internalUsers, setInternalUsers] = useState<InternalAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState<InternalAccessRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAccess, setNewAccess] = useState({
    accessType: 'professional' as NewAccessType,
    professionalId: '',
    fullName: '',
    email: '',
    password: '',
    profilePreset: 'professional' as AccessPresetId,
    permissions: getPresetPermissions('professional'),
  });

  useEffect(() => {
    if (!authLoading && userRole !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar esta página.',
      });
      navigate('/');
    }
  }, [authLoading, navigate, toast, userRole]);

  const fetchInternalUsers = useCallback(async () => {
    if (!tenantId) {
      setInternalUsers([]);
      setLoading(false);
      return;
    }

    try {
      const [
        { data: professionalsData, error: professionalsError },
        { data: profilesData, error: profilesError },
        { data: rolesData, error: rolesError },
        { data: permissionsData, error: permissionsError },
      ] = await Promise.all([
        supabase
          .from('professionals')
          .select('id, user_id, name, nickname, email, is_active, created_at, type')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('nickname'),
        supabase
          .from('profiles')
          .select('id, email, full_name, created_at, is_owner')
          .eq('tenant_id', tenantId),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('tenant_id', tenantId),
        supabase
          .from('user_permissions')
          .select('user_id, permission')
          .eq('tenant_id', tenantId),
      ]);

      if (professionalsError) throw professionalsError;
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      if (permissionsError) throw permissionsError;

      const professionalRows = professionalsData ?? [];
      const profileRows = profilesData ?? [];
      const roleRows = rolesData ?? [];
      const permissionRows = permissionsData ?? [];

      const professionalByUserId = new Map<string, typeof professionalRows[number]>();
      professionalRows.forEach((professional) => {
        if (professional.user_id) {
          professionalByUserId.set(professional.user_id, professional);
        }
      });

      const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
      const rolesByUserId = new Map<string, string[]>();
      const permissionsByUserId = new Map<string, PermissionId[]>();

      roleRows.forEach((role) => {
        const current = rolesByUserId.get(role.user_id) ?? [];
        current.push(role.role);
        rolesByUserId.set(role.user_id, current);
      });

      permissionRows.forEach((permission) => {
        const current = permissionsByUserId.get(permission.user_id) ?? [];
        current.push(permission.permission as PermissionId);
        permissionsByUserId.set(permission.user_id, current);
      });

      const userIds = new Set<string>([
        ...profileRows.map((profile) => profile.id),
        ...professionalRows.map((professional) => professional.user_id).filter(Boolean) as string[],
        ...roleRows.map((role) => role.user_id),
      ]);

      const resolvedRows: InternalAccessRow[] = Array.from(userIds).map((userId) => {
        const profile = profileById.get(userId);
        const professional = professionalByUserId.get(userId) ?? null;
        const roles = rolesByUserId.get(userId) ?? [];
        const permissions = permissionsByUserId.get(userId) ?? [];
        const role = deriveAccessRole(roles, Boolean(profile?.is_owner), professional?.type ?? null);

        return {
          rowId: `user:${userId}`,
          professionalId: professional?.id ?? null,
          userId,
          name: professional?.name ?? profile?.full_name ?? profile?.email ?? 'Usuário interno',
          nickname: professional?.nickname ?? null,
          email: profile?.email ?? professional?.email ?? null,
          fullName: profile?.full_name ?? professional?.name ?? null,
          createdAt: profile?.created_at ?? professional?.created_at ?? new Date().toISOString(),
          isActive: professional?.is_active ?? true,
          hasAccess: roles.length > 0,
          permissions,
          role,
          isOwner: Boolean(profile?.is_owner),
          professionalType: professional?.type ?? null,
        };
      });

      const unlinkedProfessionals: InternalAccessRow[] = professionalRows
        .filter((professional) => !professional.user_id)
        .map((professional) => ({
          rowId: `professional:${professional.id}`,
          professionalId: professional.id,
          userId: null,
          name: professional.name,
          nickname: professional.nickname,
          email: professional.email ?? null,
          fullName: professional.name,
          createdAt: professional.created_at,
          isActive: professional.is_active,
          hasAccess: false,
          permissions: [],
          role: 'none',
          isOwner: professional.type === 'owner',
          professionalType: professional.type,
        }));

      const rows = [...resolvedRows, ...unlinkedProfessionals].sort((first, second) => {
        if (first.role === 'owner' && second.role !== 'owner') return -1;
        if (first.role !== 'owner' && second.role === 'owner') return 1;
        return first.name.localeCompare(second.name, 'pt-BR');
      });

      setInternalUsers(rows);
    } catch (error) {
      console.error('Error fetching internal users:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os usuários internos.',
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    if (userRole === 'admin' && tenantId) {
      fetchInternalUsers();
    }
  }, [fetchInternalUsers, tenantId, userRole]);

  const resetNewAccess = (accessType: NewAccessType = 'professional') => {
    const preset = accessType === 'staff' ? 'reception' : 'professional';
    setNewAccess({
      accessType,
      professionalId: '',
      fullName: '',
      email: '',
      password: '',
      profilePreset: preset,
      permissions: [...getPresetPermissions(preset)],
    });
  };

  const openCreateForProfessional = (row: InternalAccessRow) => {
    setNewAccess({
      accessType: 'professional',
      professionalId: row.professionalId ?? '',
      fullName: row.name,
      email: row.email ?? '',
      password: '',
      profilePreset: 'professional',
      permissions: [...getPresetPermissions('professional')],
    });
    setIsAddDialogOpen(true);
  };

  const applyPreset = (presetId: AccessPresetId, mode: 'new' | 'edit') => {
    const permissions = [...getPresetPermissions(presetId)];
    if (mode === 'new') {
      setNewAccess((prev) => ({
        ...prev,
        profilePreset: presetId,
        permissions,
      }));
      return;
    }

    setSelectedAccess((prev) => prev ? ({
      ...prev,
      permissions,
    }) : null);
  };

  const toggleNewPermission = (permissionId: PermissionId) => {
    setNewAccess((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((permission) => permission !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const toggleEditPermission = (permissionId: PermissionId) => {
    setSelectedAccess((prev) => prev ? ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((permission) => permission !== permissionId)
        : [...prev.permissions, permissionId],
    }) : null);
  };

  const handleAddAccess = async () => {
    if (!tenantId) return;

    const normalizedEmail = newAccess.email.trim().toLowerCase();
    const passwordValidation = validatePassword(newAccess.password);
    if (!normalizedEmail || !newAccess.password) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Preencha email e senha para liberar o acesso.',
      });
      return;
    }

    if (!passwordValidation.valid) {
      toast({
        variant: 'destructive',
        title: 'Senha fraca',
        description: `Requisitos: ${passwordValidation.errors.join(', ')}`,
      });
      return;
    }

    let fullName = newAccess.fullName.trim();
    let professionalId: string | undefined;

    if (newAccess.accessType === 'professional') {
      const professional = internalUsers.find((row) => row.professionalId === newAccess.professionalId);
      if (!professional?.professionalId) {
        toast({
          variant: 'destructive',
          title: 'Profissional obrigatório',
          description: 'Selecione um profissional cadastrado para criar o acesso.',
        });
        return;
      }

      if (professional.hasAccess || professional.userId) {
        toast({
          variant: 'destructive',
          title: 'Acesso já existente',
          description: 'Este profissional já possui login cadastrado.',
        });
        return;
      }

      fullName = professional.name;
      professionalId = professional.professionalId;
    } else if (!fullName) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome do usuário interno.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-professional-access', {
        body: {
          tenantId,
          email: normalizedEmail,
          password: newAccess.password,
          fullName,
          permissions: newAccess.permissions,
          role: newAccess.accessType === 'staff' ? 'staff' : 'professional',
          professionalId,
        },
      });

      if (error || data?.error) {
        throw new Error(await getSupabaseErrorMessage(error, data, 'Não foi possível criar o acesso'));
      }

      toast({
        title: 'Acesso criado',
        description: newAccess.accessType === 'staff'
          ? `${fullName} agora pode acessar o sistema como equipe interna.`
          : `${fullName} agora pode acessar o sistema como profissional.`,
      });

      resetNewAccess();
      setIsAddDialogOpen(false);
      await fetchInternalUsers();
    } catch (error: any) {
      console.error('Error creating access:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao criar acesso',
        description: error.message || 'Não foi possível criar o acesso.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!tenantId || !selectedAccess?.userId) return;

    if (selectedAccess.isOwner || selectedAccess.role === 'owner' || selectedAccess.role === 'admin') {
      toast({
        variant: 'destructive',
        title: 'Acesso protegido',
        description: 'O perfil de owner/administrador principal não pode ser alterado por esta tela.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const nextPermissions = [...new Set(selectedAccess.permissions)];

      if (nextPermissions.length > 0) {
        const { error: upsertError } = await supabase
          .from('user_permissions')
          .upsert(
            nextPermissions.map((permission) => ({
              user_id: selectedAccess.userId!,
              tenant_id: tenantId,
              permission,
            })),
            { onConflict: 'user_id,tenant_id,permission' },
          );

        if (upsertError) throw upsertError;
      }

      const permissionsToRemove = PERMISSIONS
        .map(({ id }) => id)
        .filter((permission) => !nextPermissions.includes(permission));

      if (permissionsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('user_permissions')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('user_id', selectedAccess.userId)
          .in('permission', permissionsToRemove);

        if (deleteError) throw deleteError;
      }

      toast({
        title: 'Permissões atualizadas',
        description: 'As permissões foram salvas com sucesso.',
      });

      setIsEditDialogOpen(false);
      await fetchInternalUsers();
    } catch (error: any) {
      console.error('Error updating permissions:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar as permissões.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccess = async (row: InternalAccessRow) => {
    if (!tenantId || !row.userId) return;

    if (row.isOwner || row.role === 'owner' || row.role === 'admin') {
      toast({
        variant: 'destructive',
        title: 'Acesso protegido',
        description: 'O owner/administrador principal não pode ser removido por esta tela.',
      });
      return;
    }

    if (!confirm(`Deseja remover o acesso de ${row.name}?`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('remove-professional-access', {
        body: {
          tenantId,
          professionalId: row.professionalId,
          userId: row.userId,
          role: row.role === 'staff' ? 'staff' : 'professional',
        },
      });

      if (error || data?.error) {
        throw new Error(await getSupabaseErrorMessage(error, data, 'Não foi possível remover o acesso'));
      }

      toast({
        title: 'Acesso removido',
        description: data?.accountDeleted
          ? 'O login foi removido e a conta foi encerrada.'
          : 'O vínculo de acesso foi removido. A conta foi preservada porque ainda existe outro vínculo.',
      });

      await fetchInternalUsers();
    } catch (error: any) {
      console.error('Error deleting access:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível remover o acesso.',
      });
    }
  };

  const handlePromoteToAdmin = async (row: InternalAccessRow) => {
    if (!tenantId || !row.userId) return;
    if (!confirm(`Promover ${row.name} a administrador? Ele passará a ter acesso administrativo total.`)) return;
    try {
      const { error } = await supabase.rpc('set_tenant_admin_role', {
        _tenant_id: tenantId,
        _target_user_id: row.userId,
        _make_admin: true,
      });
      if (error) throw error;
      toast({ title: 'Promovido a administrador', description: `${row.name} agora é administrador.` });
      await fetchInternalUsers();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível promover.' });
    }
  };

  const handleDemoteAdmin = async (row: InternalAccessRow) => {
    if (!tenantId || !row.userId) return;
    if (row.userId === user?.id) {
      toast({ variant: 'destructive', title: 'Operação bloqueada', description: 'Você não pode rebaixar a si mesmo.' });
      return;
    }
    if (!confirm(`Rebaixar ${row.name}? Ele deixará de ser administrador (mantém o vínculo profissional/interno, se houver).`)) return;
    try {
      const { error } = await supabase.rpc('set_tenant_admin_role', {
        _tenant_id: tenantId,
        _target_user_id: row.userId,
        _make_admin: false,
      });
      if (error) throw error;
      toast({ title: 'Administrador rebaixado', description: `${row.name} não é mais administrador.` });
      await fetchInternalUsers();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível rebaixar.' });
    }
  };

  const handleResetPassword = async (row: InternalAccessRow) => {
    if (!row.email) {
      toast({ variant: 'destructive', title: 'Sem e-mail', description: 'Este acesso não tem e-mail cadastrado para envio do link.' });
      return;
    }
    if (!confirm(`Enviar link de redefinição de senha para ${row.email}?`)) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(row.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({ title: 'Link enviado', description: `Um link de redefinição foi enviado para ${row.email}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível enviar o link.' });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userRole !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl p-6">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Administração</h1>
              <p className="text-muted-foreground">
                Gerencie owners, profissionais e usuários internos como recepção e financeiro.
              </p>
            </div>
          </div>

          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetNewAccess();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => resetNewAccess()}>
                <UserPlus className="mr-2 h-4 w-4" />
                Criar Acesso
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
              <DialogHeader className="border-b px-6 pt-6 pb-4">
                <DialogTitle>Criar acesso interno</DialogTitle>
                <DialogDescription>
                  Profissionais podem ter login vinculado à própria agenda. Recepção e financeiro podem existir sem vínculo com profissional.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="space-y-3">
                  <Label>Tipo de acesso</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        newAccess.accessType === 'professional'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                      onClick={() => setNewAccess((prev) => ({
                        ...prev,
                        accessType: 'professional',
                        professionalId: '',
                        fullName: '',
                        profilePreset: 'professional',
                        permissions: [...getPresetPermissions('professional')],
                      }))}
                    >
                      <div className="text-sm font-medium text-foreground">Profissional</div>
                      <div className="text-xs text-muted-foreground">Vinculado ao cadastro operacional.</div>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        newAccess.accessType === 'staff'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                      onClick={() => setNewAccess((prev) => ({
                        ...prev,
                        accessType: 'staff',
                        professionalId: '',
                        fullName: '',
                        profilePreset: 'reception',
                        permissions: [...getPresetPermissions('reception')],
                      }))}
                    >
                      <div className="text-sm font-medium text-foreground">Equipe interna</div>
                      <div className="text-xs text-muted-foreground">Recepção, financeiro ou acesso administrativo interno.</div>
                    </button>
                  </div>
                </div>

                {newAccess.accessType === 'professional' ? (
                  <div className="space-y-2">
                    <Label>Profissional</Label>
                    <Select
                      value={newAccess.professionalId}
                      onValueChange={(value) => {
                        const professional = internalUsers.find((row) => row.professionalId === value);
                        setNewAccess((prev) => ({
                          ...prev,
                          professionalId: value,
                          fullName: professional?.name ?? '',
                          email: professional?.email ?? prev.email,
                          profilePreset: 'professional',
                          permissions: [...getPresetPermissions('professional')],
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar profissional sem acesso" />
                      </SelectTrigger>
                      <SelectContent>
                        {internalUsers
                          .filter((row) => row.professionalId && !row.hasAccess && !row.userId)
                          .map((row) => (
                            <SelectItem key={row.professionalId!} value={row.professionalId!}>
                              {row.nickname || row.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="staff-name">Nome</Label>
                    <Input
                      id="staff-name"
                      value={newAccess.fullName}
                      onChange={(event) => setNewAccess((prev) => ({ ...prev, fullName: event.target.value }))}
                      placeholder="Nome do usuário interno"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="internal-email">Email</Label>
                  <Input
                    id="internal-email"
                    type="email"
                    value={newAccess.email}
                    onChange={(event) => setNewAccess((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="email@empresa.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="internal-password">Senha</Label>
                  <Input
                    id="internal-password"
                    type="password"
                    value={newAccess.password}
                    onChange={(event) => setNewAccess((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder={getPasswordRequirementsMessage()}
                  />
                  <p className="text-xs text-muted-foreground">{getPasswordRequirementsMessage()}</p>
                </div>

                <div className="space-y-3">
                  <Label>Perfil de acesso</Label>
                  <div className="grid gap-2">
                    {ACCESS_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          newAccess.profilePreset === profile.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/40'
                        }`}
                        onClick={() => applyPreset(profile.id, 'new')}
                      >
                        <div className="text-sm font-medium text-foreground">{profile.label}</div>
                        <div className="text-xs text-muted-foreground">{profile.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Permissões</Label>
                  {PERMISSIONS.map((permission) => (
                    <div key={permission.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`new-${permission.id}`}
                        checked={newAccess.permissions.includes(permission.id)}
                        onCheckedChange={() => toggleNewPermission(permission.id)}
                      />
                      <Label htmlFor={`new-${permission.id}`} className="font-normal cursor-pointer">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t px-6 py-4">
                <Button onClick={handleAddAccess} className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    'Criar acesso'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Usuários internos
            </CardTitle>
            <CardDescription>
              Owners ficam protegidos. Profissionais enxergam apenas a própria agenda e as próprias comissões. Recepção pode operar sem vínculo com profissional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {internalUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum usuário interno encontrado.</p>
                <p className="text-sm">Cadastre profissionais ou crie um acesso interno para recepção/financeiro.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const groupOrder: Record<string, number> = { admins: 0, professionals: 1, staff: 2 };
                    const groupLabel: Record<string, string> = {
                      admins: 'Owners e Administradores',
                      professionals: 'Profissionais',
                      staff: 'Equipe interna',
                    };
                    const groupOf = (r: InternalAccessRow) =>
                      (r.role === 'owner' || r.role === 'admin' || r.isOwner)
                        ? 'admins'
                        : (r.professionalId ? 'professionals' : 'staff');
                    const ordered = [...internalUsers].sort((a, b) => groupOrder[groupOf(a)] - groupOrder[groupOf(b)]);
                    let lastGroup = '';
                    return ordered.map((row) => {
                    const isProtected = row.role === 'owner' || row.role === 'admin' || row.isOwner;
                    const canManage = row.hasAccess && !isProtected && !!row.userId;
                    const group = groupOf(row);
                    const showHeader = group !== lastGroup;
                    lastGroup = group;
                    return (
                      <React.Fragment key={row.rowId}>
                        {showHeader && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {groupLabel[group]}
                            </TableCell>
                          </TableRow>
                        )}
                      <TableRow>
                        <TableCell className="font-medium">
                          {row.name}
                          <p className="text-xs font-normal text-muted-foreground">
                            {row.nickname || row.fullName || '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${roleBadgeClasses[row.role]}`}>
                            {roleLabels[row.role]}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.professionalId
                            ? `${row.professionalType === 'owner' ? 'Profissional proprietário' : 'Profissional operacional'}`
                            : 'Sem vínculo com profissional'}
                        </TableCell>
                        <TableCell>{row.email || '-'}</TableCell>
                        <TableCell>
                          {row.hasAccess ? (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              Com acesso
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Sem acesso
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {!row.hasAccess ? (
                              <span className="text-sm text-muted-foreground">-</span>
                            ) : row.role === 'owner' || row.role === 'admin' ? (
                              <span className="text-sm text-muted-foreground">Acesso administrativo total</span>
                            ) : row.permissions.length === 0 ? (
                              <span className="text-sm text-muted-foreground">Nenhuma</span>
                            ) : (
                              row.permissions.map((permission) => (
                                <span
                                  key={`${row.rowId}-${permission}`}
                                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                                >
                                  {PERMISSIONS.find((item) => item.id === permission)?.label || permission}
                                </span>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canManage ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedAccess(row);
                                    setIsEditDialogOpen(true);
                                  }}
                                  title="Editar permissões"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-primary hover:text-primary"
                                  onClick={() => handlePromoteToAdmin(row)}
                                  title="Promover a administrador"
                                >
                                  <ShieldPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResetPassword(row)}
                                  title="Enviar link de redefinição de senha"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteAccess(row)}
                                  title="Remover acesso"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : row.role === 'admin' && !row.isOwner && row.userId ? (
                              // Administrador (não-owner): pode ser rebaixado ou ter a senha resetada.
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResetPassword(row)}
                                  title="Enviar link de redefinição de senha"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDemoteAdmin(row)}
                                  title="Rebaixar administrador"
                                >
                                  <ShieldMinus className="h-4 w-4" />
                                </Button>
                              </>
                            ) : row.role === 'none' && row.professionalId ? (
                              <Button variant="outline" size="sm" onClick={() => openCreateForProfessional(row)}>
                                Criar acesso
                              </Button>
                            ) : row.isOwner || row.role === 'owner' ? (
                              <span className="text-xs text-muted-foreground">Owner protegido</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      </React.Fragment>
                    );
                    });
                  })()}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="mt-8">
          <CleaningStaffPermissions />
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
            <DialogHeader className="border-b px-6 pt-6 pb-4">
              <DialogTitle>Editar permissões</DialogTitle>
              <DialogDescription>
                {selectedAccess?.fullName || selectedAccess?.email || selectedAccess?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="space-y-3">
                <Label>Perfis rápidos</Label>
                <div className="grid gap-2">
                  {ACCESS_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        selectedAccess?.permissions.join('|') === profile.permissions.join('|')
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                      onClick={() => applyPreset(profile.id, 'edit')}
                    >
                      <div className="text-sm font-medium text-foreground">{profile.label}</div>
                      <div className="text-xs text-muted-foreground">{profile.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Permissões</Label>
                {PERMISSIONS.map((permission) => (
                  <div key={permission.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${permission.id}`}
                      checked={selectedAccess?.permissions.includes(permission.id) || false}
                      onCheckedChange={() => toggleEditPermission(permission.id)}
                    />
                    <Label htmlFor={`edit-${permission.id}`} className="font-normal cursor-pointer">
                      {permission.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t px-6 py-4">
              <Button onClick={handleUpdatePermissions} className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar permissões'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Admin;
