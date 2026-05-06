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
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Key, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSupabaseErrorMessage } from '@/lib/supabaseErrors';
import { validatePassword } from '@/lib/passwordValidation';

interface Tenant {
  id: string;
  name: string;
}

interface TenantAdmin {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface TenantAdminsDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenantAdminsDialog({ tenant, open, onOpenChange }: TenantAdminsDialogProps) {
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<TenantAdmin | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);

  const fetchAdmins = async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-tenant-admins', {
        body: { action: 'list', tenantId: tenant.id }
      });

      if (error || data?.error) {
        toast.error(await getSupabaseErrorMessage(error, data, 'Erro ao carregar administradores'));
        return;
      }

      setAdmins(data?.admins || []);
    } catch (error) {
      console.error('Error fetching admins:', error);
      toast.error(await getSupabaseErrorMessage(error, undefined, 'Erro ao carregar administradores'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && tenant) {
      fetchAdmins();
      setSelectedAdmin(null);
      setNewPassword('');
      setPasswordReset(false);
    }
  }, [open, tenant]);

  const handleResetPassword = async () => {
    if (!selectedAdmin || !newPassword) {
      toast.error('Preencha a nova senha');
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      toast.error('A nova senha não atende aos requisitos.', {
        description: passwordValidation.errors.join(', '),
      });
      return;
    }

    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-tenant-admins', {
        body: { 
          action: 'reset_password', 
          tenantId: tenant?.id,
          userId: selectedAdmin.id, 
          newPassword 
        }
      });

      if (error || data?.error) {
        toast.error(await getSupabaseErrorMessage(error, data, 'Erro ao alterar senha'));
        return;
      }

      setPasswordReset(true);
      toast.success('Senha alterada com sucesso!');
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(await getSupabaseErrorMessage(error, undefined, 'Erro ao alterar senha'));
    } finally {
      setResettingPassword(false);
    }
  };

  const handleClose = () => {
    setSelectedAdmin(null);
    setNewPassword('');
    setPasswordReset(false);
    onOpenChange(false);
  };

  const handleSelectAdmin = (admin: TenantAdmin) => {
    setSelectedAdmin(admin);
    setNewPassword('');
    setPasswordReset(false);
  };

  const handleClearSelection = () => {
    setSelectedAdmin(null);
    setNewPassword('');
    setPasswordReset(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Administradores - {tenant?.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : selectedAdmin ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                ← Voltar para lista
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                <span className="font-medium">Alterar senha de:</span>
              </div>
              <p className="text-sm text-muted-foreground">{selectedAdmin.email}</p>
              {selectedAdmin.full_name && (
                <p className="text-sm">{selectedAdmin.full_name}</p>
              )}
            </div>

            {passwordReset ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Senha alterada com sucesso!</span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nova Senha</Label>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm flex-1">
                      {newPassword}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(newPassword);
                        toast.success('Senha copiada!');
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Guarde esta senha em local seguro e envie para o administrador.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha *</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite a nova senha"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleClearSelection}>
                    Cancelar
                  </Button>
                  <Button onClick={handleResetPassword} disabled={resettingPassword || !newPassword}>
                    {resettingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Alterando...
                      </>
                    ) : (
                      'Alterar Senha'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {admins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum administrador cadastrado para este cliente</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">{admin.email}</TableCell>
                      <TableCell>{admin.full_name || '-'}</TableCell>
                      <TableCell>
                        {admin.last_sign_in_at
                          ? format(new Date(admin.last_sign_in_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : 'Nunca'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectAdmin(admin)}
                          className="gap-1"
                        >
                          <Key className="w-3 h-3" />
                          Alterar Senha
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
