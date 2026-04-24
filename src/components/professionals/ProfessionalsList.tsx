import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit2,
  MoreVertical,
  Mail,
  Lock,
  UserCheck,
  Camera,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Professional } from '@/context/DataContext';
import { useStableData } from '@/context/StableDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { validatePassword, getPasswordRequirementsMessage } from '@/lib/passwordValidation';

const professionalTypes = [
  { value: 'owner', label: 'Proprietário' },
  { value: 'employee', label: 'Funcionário' },
  { value: 'freelancer', label: 'Autônomo' },
];

const specialtyTypes = [
  { value: 'cabeleireira', label: 'Cabeleireira' },
  { value: 'barbeiro', label: 'Barbeiro' },
  { value: 'manicure', label: 'Manicure' },
  { value: 'pedicure', label: 'Pedicure' },
  { value: 'esteticista', label: 'Esteticista' },
  { value: 'maquiadora', label: 'Maquiadora' },
  { value: 'designer_sobrancelhas', label: 'Designer de Sobrancelhas' },
  { value: 'massagista', label: 'Massagista' },
  { value: 'depiladora', label: 'Depiladora' },
  { value: 'podologa', label: 'Podóloga' },
  { value: 'outro', label: 'Outro' },
];

const PAGE_SIZE = 20;

export function ProfessionalsList() {
  const { professionals, addProfessional, updateProfessional, deleteProfessional } = useStableData();
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formType, setFormType] = useState<'owner' | 'employee' | 'freelancer'>('employee');
  const [formSpecialty, setFormSpecialty] = useState('cabeleireira');
  const [formActive, setFormActive] = useState(true);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [createAccess, setCreateAccess] = useState(false);
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [deletingProfessional, setDeletingProfessional] = useState<Professional | null>(null);
  const [page, setPage] = useState(1);

  const openNewProfessional = () => {
    setEditingProfessional(null);
    setFormName('');
    setFormNickname('');
    setFormType('employee');
    setFormSpecialty('cabeleireira');
    setFormActive(true);
    setFormEmail('');
    setFormPassword('');
    setCreateAccess(false);
    setFormPhotoUrl(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setIsDialogOpen(true);
  };

  const openEditProfessional = (professional: Professional) => {
    setEditingProfessional(professional);
    setFormName(professional.name);
    setFormNickname(professional.nickname);
    setFormType(professional.type);
    setFormSpecialty((professional as any).specialty || 'cabeleireira');
    setFormActive(professional.is_active);
    setFormEmail(professional.email || '');
    setFormPassword('');
    setCreateAccess(false);
    setFormPhotoUrl(professional.photo_url || null);
    setPhotoFile(null);
    setPhotoPreview(professional.photo_url || null);
    setIsDialogOpen(true);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Erro", description: "A imagem deve ter no máximo 2MB" });
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({ variant: "destructive", title: "Erro", description: "Selecione um arquivo de imagem válido" });
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormPhotoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadPhoto = async (professionalId: string): Promise<string | null> => {
    if (!photoFile) return formPhotoUrl;

    setIsUploadingPhoto(true);
    try {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${professionalId}-${Date.now()}.${fileExt}`;
      const filePath = `${tenantId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('professional-photos')
        .upload(filePath, photoFile, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({ variant: "destructive", title: "Erro ao fazer upload", description: uploadError.message });
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('professional-photos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!formName || !formNickname) return;
    if (createAccess && (!formEmail || !formPassword)) {
      toast({ variant: "destructive", title: "Erro", description: "Email e senha são obrigatórios para criar acesso" });
      return;
    }
    if (createAccess) {
      const passwordValidation = validatePassword(formPassword);
      if (!passwordValidation.valid) {
        toast({ 
          variant: "destructive", 
          title: "Senha fraca", 
          description: `Requisitos: ${passwordValidation.errors.join(', ')}` 
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let userId: string | undefined;

      // Create user account if access is enabled
      if (createAccess && formEmail && formPassword && !editingProfessional?.user_id) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formEmail,
          password: formPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: formName,
            },
          },
        });

        if (authError) {
          toast({ variant: "destructive", title: "Erro ao criar usuário", description: authError.message });
          setIsSubmitting(false);
          return;
        }

        userId = authData.user?.id;

        if (userId && tenantId) {
          // Add professional role with tenant_id
          await supabase.from('user_roles').insert({
            user_id: userId,
            role: 'professional',
            tenant_id: tenantId,
          });

          // Add permissions for schedule and commissions with tenant_id
          await supabase.from('user_permissions').insert([
            { user_id: userId, permission: 'view_schedule', tenant_id: tenantId },
            { user_id: userId, permission: 'view_commissions', tenant_id: tenantId },
          ]);

          // Update profile with tenant_id
          await supabase.from('profiles').update({ tenant_id: tenantId }).eq('id', userId);
        }
      }

      if (editingProfessional) {
        // Upload photo if new file selected
        const photoUrl = await uploadPhoto(editingProfessional.id);
        
        await updateProfessional(editingProfessional.id, {
          name: formName,
          nickname: formNickname,
          type: formType,
          specialty: formSpecialty,
          email: formEmail || undefined,
          is_active: formActive,
          photo_url: photoUrl || undefined,
        });
        toast({ title: "Profissional atualizado", description: "Dados salvos com sucesso" });
      } else {
        // First create professional without photo
        const newProfessional = await addProfessional({
          name: formName,
          nickname: formNickname,
          type: formType,
          specialty: formSpecialty,
          email: formEmail || undefined,
          user_id: userId,
          is_active: formActive,
        });

        // Then upload photo if selected
        if (newProfessional && photoFile) {
          const photoUrl = await uploadPhoto(newProfessional.id);
          if (photoUrl) {
            await updateProfessional(newProfessional.id, { photo_url: photoUrl });
          }
        }
        
        if (createAccess) {
          toast({ title: "Profissional cadastrado", description: `${formNickname} pode acessar com ${formEmail}` });
        } else {
          toast({ title: "Profissional cadastrado", description: `${formNickname} foi adicionado` });
        }
      }

      setIsDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Profissionais
          </h1>
          <p className="text-muted-foreground mt-1">
            {professionals.filter(p => p.is_active).length} profissionais ativos de {professionals.length}
          </p>
        </div>
        <Button onClick={openNewProfessional}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Profissional
        </Button>
      </div>

      {/* Professionals Grid */}
      {professionals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum profissional cadastrado</p>
          <p className="text-sm">Clique em "Novo Profissional" para adicionar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professionals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((professional, index) => (
            <motion.div
              key={professional.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`p-5 border-0 shadow-md hover:shadow-lg transition-all ${!professional.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-14 h-14 rounded-2xl shadow-glow">
                      <AvatarImage src={professional.photo_url || undefined} alt={professional.name} />
                      <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-xl font-bold text-primary-foreground">
                        {professional.nickname.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-foreground">{professional.name}</h3>
                      <p className="text-sm text-primary font-medium">{professional.nickname}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="secondary" className="capitalize text-xs">
                          {professionalTypes.find(t => t.value === professional.type)?.label}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-xs">
                          {specialtyTypes.find(s => s.value === professional.specialty)?.label || 'Cabeleireira'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditProfessional(professional)}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeletingProfessional(professional)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>


                <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <div className="flex items-center gap-2">
                    {professional.user_id && (
                      <Badge variant="outline" className="text-xs">
                        <UserCheck className="w-3 h-3 mr-1" />
                        Acesso
                      </Badge>
                    )}
                    <Badge variant={professional.is_active ? 'success' : 'secondary'}>
                      {professional.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {Math.ceil(professionals.length / PAGE_SIZE) > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {Math.ceil(professionals.length / PAGE_SIZE)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(Math.ceil(professionals.length / PAGE_SIZE), p + 1))} disabled={page === Math.ceil(professionals.length / PAGE_SIZE)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deletingProfessional} onOpenChange={open => !open && setDeletingProfessional(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir profissional?</AlertDialogTitle>
            <AlertDialogDescription>
              O profissional <strong>{deletingProfessional?.name}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteProfessional(deletingProfessional!.id); setDeletingProfessional(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Professional Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Photo Upload Section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="w-24 h-24 rounded-2xl border-2 border-dashed border-primary/30">
                  <AvatarImage src={photoPreview || undefined} alt="Foto do profissional" />
                  <AvatarFallback className="rounded-2xl bg-secondary text-2xl font-bold text-muted-foreground">
                    {formNickname ? formNickname.charAt(0).toUpperCase() : <Camera className="w-8 h-8" />}
                  </AvatarFallback>
                </Avatar>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
              >
                <Camera className="w-4 h-4 mr-2" />
                {photoPreview ? 'Alterar Foto' : 'Adicionar Foto'}
              </Button>
              <p className="text-xs text-muted-foreground">Máximo 2MB (JPG, PNG)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                placeholder="Nome completo"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Apelido (exibido na agenda) *</Label>
              <Input
                id="nickname"
                placeholder="Ex: Ana, Ju, Fer..."
                value={formNickname}
                onChange={(e) => setFormNickname(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as 'owner' | 'employee' | 'freelancer')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {professionalTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Especialidade</Label>
              <Select value={formSpecialty} onValueChange={setFormSpecialty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {specialtyTypes.map((specialty) => (
                    <SelectItem key={specialty.value} value={specialty.value}>
                      {specialty.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <Label htmlFor="active" className="cursor-pointer">Profissional Ativo</Label>
              <Switch
                id="active"
                checked={formActive}
                onCheckedChange={setFormActive}
              />
            </div>

            {/* Access Section - Only for new professionals or those without user_id */}
            {!editingProfessional?.user_id && (
              <div className="space-y-3 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-primary" />
                    <Label htmlFor="createAccess" className="cursor-pointer font-medium">
                      Criar acesso ao sistema
                    </Label>
                  </div>
                  <Switch
                    id="createAccess"
                    checked={createAccess}
                    onCheckedChange={setCreateAccess}
                  />
                </div>
                
                {createAccess && (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-muted-foreground">
                      O profissional terá acesso para ver sua agenda e comissões
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email de acesso *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@exemplo.com"
                          className="pl-10"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder={getPasswordRequirementsMessage()}
                          className="pl-10"
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{getPasswordRequirementsMessage()}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {editingProfessional?.user_id && (
              <div className="p-3 rounded-lg bg-success-soft flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-success" />
                <span className="text-sm text-success">Possui acesso ao sistema</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!formName || !formNickname || isSubmitting}>
                {isSubmitting ? 'Salvando...' : editingProfessional ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
