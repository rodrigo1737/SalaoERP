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
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UserPlus, Shield, Loader2, Trash2, Edit } from 'lucide-react';
import { validatePassword, getPasswordRequirementsMessage } from '@/lib/passwordValidation';
import { getSupabaseErrorMessage } from '@/lib/supabaseErrors';

interface Professional {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
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
  
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newProfessional, setNewProfessional] = useState({
    email: '',
    password: '',
    fullName: '',
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
      // Get all profiles with professional role
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'professional')
        .eq('tenant_id', tenantId);

      if (rolesError) throw rolesError;

      const professionalIds = rolesData?.map(r => r.user_id) || [];

      if (professionalIds.length === 0) {
        setProfessionals([]);
        setLoading(false);
        return;
      }

      // Get profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', professionalIds)
        .eq('tenant_id', tenantId);

      if (profilesError) throw profilesError;

      // Get permissions for these users
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('user_permissions')
        .select('user_id, permission')
        .in('user_id', professionalIds)
        .eq('tenant_id', tenantId);

      if (permissionsError) throw permissionsError;

      // Combine data
      const professionalsWithPermissions = profilesData?.map(profile => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        permissions: permissionsData
          ?.filter(p => p.user_id === profile.id)
          .map(p => p.permission) || [],
      })) || [];

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

    if (!newProfessional.email || !newProfessional.password || !newProfessional.fullName) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha todos os campos",
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
          fullName: newProfessional.fullName,
          permissions: newProfessional.permissions,
        },
      });

      if (error || data?.error) {
        throw new Error(await getSupabaseErrorMessage(error, data, "Não foi possível adicionar o profissional"));
      }

      toast({
        title: "Profissional adicionado",
        description: `${newProfessional.fullName} foi cadastrado com sucesso`,
      });

      setNewProfessional({
        email: '',
        password: '',
        fullName: '',
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
      // Delete existing permissions
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedProfessional.id)
        .eq('tenant_id', tenantId);

      // Add new permissions
      if (selectedProfessional.permissions.length > 0) {
        const permissionsToInsert = selectedProfessional.permissions.map(permission => ({
          user_id: selectedProfessional.id,
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

  const handleDeleteProfessional = async (professional: Professional) => {
    if (!confirm(`Deseja remover ${professional.full_name || professional.email}?`)) {
      return;
    }

    try {
      // Remove role (this will cascade permissions via FK)
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', professional.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      toast({
        title: "Profissional removido",
        description: "O profissional foi removido com sucesso",
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
                Gerencie profissionais e permissões
              </p>
            </div>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Profissional
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar Profissional</DialogTitle>
                <DialogDescription>
                  Cadastre um novo profissional e defina suas permissões
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={newProfessional.fullName}
                    onChange={(e) => setNewProfessional(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Nome do profissional"
                  />
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
                    'Cadastrar Profissional'
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
              Profissionais Cadastrados
            </CardTitle>
            <CardDescription>
              Lista de profissionais e suas permissões no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {professionals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum profissional cadastrado</p>
                <p className="text-sm">Clique em "Novo Profissional" para adicionar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {professionals.map(professional => (
                    <TableRow key={professional.id}>
                      <TableCell className="font-medium">
                        {professional.full_name || '-'}
                      </TableCell>
                      <TableCell>{professional.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {professional.permissions.length === 0 ? (
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedProfessional(professional);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteProfessional(professional)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
