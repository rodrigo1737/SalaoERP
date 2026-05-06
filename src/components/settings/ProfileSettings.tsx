import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { validatePassword, getPasswordRequirementsMessage } from '@/lib/passwordValidation';

export function ProfileSettings() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const handleSaveName = async () => {
    if (!fullName.trim()) { toast.error('Informe o nome completo.'); return; }
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
      if (error) throw error;
      // Atualizar tabela profiles
      await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user!.id);
      toast.success('Nome atualizado!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar nome.';
      toast.error(msg);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { toast.error('Informe a senha atual.'); return; }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem.'); return; }
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      toast.error('A nova senha não atende aos requisitos.', {
        description: validation.errors.join(', ') || getPasswordRequirementsMessage(),
      });
      return;
    }

    setSavingPw(true);
    try {
      // Reautentica para verificar senha atual
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (signInError) { toast.error('Senha atual incorreta.'); return; }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar senha.';
      toast.error(msg);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Informações pessoais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Informações Pessoais
          </CardTitle>
          <CardDescription>Atualize seu nome de exibição</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email ?? ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado aqui.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>
          <Button onClick={handleSaveName} disabled={savingName}>
            {savingName ? 'Salvando...' : 'Salvar nome'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Alterar senha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Alterar Senha
          </CardTitle>
          <CardDescription>Use uma senha forte com pelo menos 8 caracteres</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPw">Senha atual</Label>
            <div className="relative">
              <Input
                id="currentPw"
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Senha atual"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrentPw(v => !v)}
              >
                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPw">Nova senha</Label>
            <div className="relative">
              <Input
                id="newPw"
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nova senha"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNewPw(v => !v)}
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPw">Confirmar nova senha</Label>
            <Input
              id="confirmPw"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={savingPw}>
            {savingPw ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
