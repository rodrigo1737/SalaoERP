import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router-dom';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

interface TenantInfo {
  id: string;
  name: string;
}

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const ClientLogin: React.FC = () => {
  const navigate = useNavigate();
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();
  const { user, signIn, loading: authLoading } = useClientAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('../agendar');
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    const { error } = await signIn(formData.email, formData.password);

    setIsSubmitting(false);

    if (error) {
      toast.error('Erro ao entrar', {
        description:
          error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos'
            : error.message,
      });
    } else {
      toast.success('Bem-vindo!');
      navigate('../agendar');
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Entrar</CardTitle>
          <CardDescription>
            Acesse sua conta para agendar em {tenant.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="seu@email.com"
                autoComplete="email"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder="Sua senha"
                autoComplete="current-password"
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>

            {/* Signup Link */}
            <p className="text-center text-sm text-muted-foreground">
              Não tem uma conta?{' '}
              <Link to="../cadastro" className="text-primary hover:underline font-medium">
                Cadastre-se
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientLogin;
