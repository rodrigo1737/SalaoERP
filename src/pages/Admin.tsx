import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UserPlus, Shield, Loader2, Trash2, Edit } from 'lucide-react';
import { validatePassword, getPasswordRequirementsMessage } from '@/lib/passwordValidation';
import { getSupabaseErrorMessage } from '@/lib/supabaseErrors';

interface ProfessionalAccess {
  id: string;
  user_id: string | null;
  name: string;
  nickname: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_active: boolean;
  has_access: boolean;
  permissions: string[];
}

const PERMISSIONS = [
  { id: 'view_schedule', label: 'Visualizar Agenda' },
  { id: 'edit_schedule', label: 'Alterar Agendamentos' },
  { id: 'view_clients', label: 'Visualizar Clientes' },
  { id: 'view_commissions', label: 'Visualizar Comissões' },
  { id: 'manage_cash_flow', label: 'Gerenciar Caixa' },
];

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, tenantId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [professionals, setProfessionals] = useState<ProfessionalAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalAccess | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newProfessional, setNewProfessional] = useState({
    professionalId: '',
    email: '',
    password: '',
    permissions: [] as string[],
  });

  useEffect(() => {
    if (!authLoading && userRole !== 'admin') {
      toast({
        variant: "destructive",
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página",
      });
      navigate('/');
    }
  }, [userRole, authLoading, navigate, toast]);

  useEffect(() => {
    if (userRole === 'admin' && tenantId) {
      fetchProfessionals();
    }
  }, [userRole, tenantId]);

  const fetchProfessionals = async () => {
    if (!tenantId) {
      setProfessionals([]);
      setLoading(false);
      return;
    }

    try {
      const { data: professionalsData, error: professionalsError } = await supabase
        .from('professionals')
        .select('id, user_id, name, nickname, email, is_active, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('nickname');

      if (professionalsError) throw professionalsError;

      const professionalRows = professionalsData || [];
      const userIds = professionalRows
        .map((professional) => professional.user_id)
        .filter(Boolean) as string[];

      if (professionalRows.length === 0) {
        setProfessionals([]);
        setLoading(false);
        return;
      }

      const uniqueUserIds = Array.from(new Set(userIds));
      const [{ data: rolesData, error: rolesError }, { data: profilesData, error: profilesError }, { data: permissionsData, error: permissionsError }] = await Promise.all([
        uniqueUserIds.length
          ? supabase
              .from('user_roles')
              .select('user_id, role')
              .eq('role', 'professional')
              .eq('tenant_id', tenantId)
              .in('user_id', uniqueUserIds)
          : Promise.resolve({ data: [], error: null }),
        uniqueUserIds.length
          ? supabase
              .from('profiles')
              .select('id, email, full_name, created_at')
              .eq('tenant_id', tenantId)
              .in('id', uniqueUserIds)
          : Promise.resolve({ data: [], error: null }),
        uniqueUserIds.length
          ? supabase
              .from('user_permissions')
              .select('user_id, permission')
              .eq('tenant_id', tenantId)
              .in('user_id', uniqueUserIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (rolesError) throw rolesError;
      if (profilesError) throw profilesError;
      if (permissionsError) throw permissionsError;

      const professionalsWithPermissions = professionalRows.map((professional) => {
        const profile = profilesData?.find((item: any) => item.id === professional.user_id);
        const role = rolesData?.find((item: any) => item.user_id === professional.user_id);

        return {
          id: professional.id,
          user_id: professional.user_id,
          name: professional.name,
          nickname: professional.nickname,
          email: profile?.email || professional.email,
          full_name: profile?.full_name || professional.name,
          created_at: profile?.created_at || professional.created_at,
          is_active: professional.is_active,
          has_access: Boolean(professional.user_id && role),
          permissions: professional.user_id
            ? permissionsData
              ?.filter((permission: any) => permission.user_id === professional.user_id)
              .map((permission: any) => permission.permission) || []
            : [],
        };
      });

      setProfessionals(professionalsWithPermissions);
    } catch (error) {
      console.error('Error fetching professionals:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar os profissionais",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfessional = async () => {
    if (!tenantId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Tenant não identificado",
      });
      return;
    }

    const selectedOperationalProfessional = professionals.find((professional) => professional.id === newProfessional.professionalId);

    if (!selectedOperationalProfessional) {
      toast({
        variant: "destructive",
        title: "Profissional obrigatório",
        description: "Selecione um profissional cadastrado para criar o acesso",
      });
      return;
    }

    if (selectedOperationalProfessional.has_access || selectedOperationalProfessional.user_id) {
      toast({
        variant: "destructive",
        title: "Acesso já existente",
        description: "Este profissional já possui acesso ao sistema",
      });
      return;
    }

    if (!newProfessional.email || !newProfessional.password) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha email e senha",
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(newProfessional.password);
    if (!passwordValidation.valid) {
      toast({
        variant: "destructive",
        title: "Senha fraca",
        description: `Requisitos: ${passwordValidation.errors.join(', ')}`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-professional-access', {
        body: {
          tenantId,
          email: newProfessional.email,
          password: newProfessional.password,
          fullName: selectedOperationalProfessional.name,
          permissions: newProfessional.permissions,
        },
      });

      if (error || data?.error) {
        throw new Error(await getSupabaseErrorMessage(error, data, "Não foi possível adicionar o profissional"));
      }

      if (data?.userId) {
        const { error: linkError } = await supabase
          .from('professionals')
          .update({
            user_id: data.userId,
            email: newProfessional.email.trim().toLowerCase(),
          })
          .eq('id', selectedOperationalProfessional.id)
          .eq('tenant_id', tenantId);

        if (linkError) throw linkError;
      }

      toast({
        title: "Acesso criado",
        description: `${selectedOperationalProfessional.name} agora pode acessar o sistema`,
      });

      setNewProfessional({
        professionalId: '',
        email: '',
        password: '',
        permissions: [],
      });
      setIsAddDialogOpen(false);
      fetchProfessionals();
    } catch (error: any) {
      console.error('Error adding professional:', error);
      const message = await getSupabaseErrorMessage(error, undefined, "Não foi possível adicionar o profissional");
      toast({
        variant: "destructive",
        title: "Erro ao adicionar",
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedProfessional) return;

    setIsSubmitting(true);

    try {
      if (!selectedProfessional.user_id) throw new Error('Profissional sem acesso vinculado.');

      // Delete existing permissions
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedProfessional.user_id)
        .eq('tenant_id', tenantId);

      // Add new permissions
      if (selectedProfessional.permissions.length > 0) {
        const permissionsToInsert = selectedProfessional.permissions.map(permission => ({
          user_id: selectedProfessional.user_id!,
          permission: permission as 'view_schedule' | 'edit_schedule' | 'view_clients' | 'view_commissions' | 'manage_cash_flow',
          tenant_id: tenantId,
        }));

        const { error } = await supabase
          .from('user_permissions')
          .insert(permissionsToInsert);

        if (error) throw error;
      }

      toast({
        title: "Permissões atualizadas",
        description: "As permissões foram atualizadas com sucesso",
      });

      setIsEditDialogOpen(false);
      fetchProfessionals();
    } catch (error: any) {
      console.error('Error updating permissions:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível atualizar as permissões",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfessional = async (professional: ProfessionalAccess) => {
    if (!professional.user_id) return;

    if (!confirm(`Deseja remover o acesso de ${professional.name}?`)) {
      return;
    }

    try {
      const { error: permissionsError } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', professional.user_id)
        .eq('tenant_id', tenantId);

      if (permissionsError) throw permissionsError;

      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', professional.user_id)
        .eq('tenant_id', tenantId);

      if (roleError) throw roleError;

      const { error: unlinkError } = await supabase
        .from('professionals')
        .update({ user_id: null })
        .eq('id', professional.id)
        .eq('tenant_id', tenantId);

      if (unlinkError) throw unlinkError;

      toast({
        title: "Acesso removido",
        description: "O profissional permanece cadastrado, mas não acessa mais o sistema",
      });

      fetchProfessionals();
    } catch (error: any) {
      console.error('Error deleting professional:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível remover o profissional",
      });
    }
  };

  const toggleNewPermission = (permissionId: string) => {
    setNewProfessional(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const toggleEditPermission = (permissionId: string) => {
    if (!selectedProfessional) return;
    
    setSelectedProfessional(prev => prev ? ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId],
    }) : null);
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
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">
                Administração
              </h1>
              <p className="text-muted-foreground">
                Gerencie acessos e permissões dos profissionais cadastrados
              </p>
            </div>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Criar Acesso
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Acesso de Profissional</DialogTitle>
                <DialogDescription>
                  Selecione um profissional já cadastrado e defina suas permissões.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Profissional</Label>
                  <Select
                    value={newProfessional.professionalId}
                    onValueChange={(value) => {
                      const professional = professionals.find((item) => item.id === value);
                      setNewProfessional(prev => ({
                        ...prev,
                        professionalId: value,
                        email: professional?.email || prev.email,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar profissional sem acesso" />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals
                        .filter((professional) => !professional.has_access && !professional.user_id)
                        .map((professional) => (
                          <SelectItem key={professional.id} value={professional.id}>
                            {professional.nickname || professional.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newProfessional.email}
                    onChange={(e) => setNewProfessional(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newProfessional.password}
                    onChange={(e) => setNewProfessional(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={getPasswordRequirementsMessage()}
                  />
                  <p className="text-xs text-muted-foreground">{getPasswordRequirementsMessage()}</p>
                </div>

                <div className="space-y-3">
                  <Label>Permissões</Label>
                  {PERMISSIONS.map(permission => (
                    <div key={permission.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`new-${permission.id}`}
                        checked={newProfessional.permissions.includes(permission.id)}
                        onCheckedChange={() => toggleNewPermission(permission.id)}
                      />
                      <Label htmlFor={`new-${permission.id}`} className="font-normal cursor-pointer">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>

                <Button 
                  onClick={handleAddProfessional} 
                  className="w-full" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    'Criar Acesso'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Professionals Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Acessos de Profissionais
            </CardTitle>
            <CardDescription>
              Esta tela usa os mesmos profissionais do cadastro principal e mostra quem possui acesso ao sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {professionals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum profissional cadastrado</p>
                <p className="text-sm">Cadastre profissionais no menu Profissionais antes de liberar acessos.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {professionals.map(professional => (
                    <TableRow key={professional.id}>
                      <TableCell className="font-medium">
                        {professional.name}
                        <p className="text-xs font-normal text-muted-foreground">{professional.nickname}</p>
                      </TableCell>
                      <TableCell>{professional.email || '-'}</TableCell>
                      <TableCell>
                        {professional.has_access ? (
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
                          {!professional.has_access ? (
                            <span className="text-muted-foreground text-sm">-</span>
                          ) : professional.permissions.length === 0 ? (
                            <span className="text-muted-foreground text-sm">Nenhuma</span>
                          ) : (
                            professional.permissions.map(perm => {
                              const permInfo = PERMISSIONS.find(p => p.id === perm);
                              return (
                                <span
                                  key={perm}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                                >
                                  {permInfo?.label || perm}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {professional.has_access ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedProfessional(professional);
                                  setIsEditDialogOpen(true);
                                }}
                                title="Editar permissões"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteProfessional(professional)}
                                title="Remover acesso"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setNewProfessional({
                                  professionalId: professional.id,
                                  email: professional.email || '',
                                  password: '',
                                  permissions: ['view_schedule', 'view_commissions'],
                                });
                                setIsAddDialogOpen(true);
                              }}
                            >
                              Criar acesso
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Permissions Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Permissões</DialogTitle>
              <DialogDescription>
                {selectedProfessional?.full_name || selectedProfessional?.email}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <Label>Permissões</Label>
                {PERMISSIONS.map(permission => (
                  <div key={permission.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${permission.id}`}
                      checked={selectedProfessional?.permissions.includes(permission.id) || false}
                      onCheckedChange={() => toggleEditPermission(permission.id)}
                    />
                    <Label htmlFor={`edit-${permission.id}`} className="font-normal cursor-pointer">
                      {permission.label}
                    </Label>
                  </div>
                ))}
              </div>

              <Button 
                onClick={handleUpdatePermissions} 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Permissões'
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
