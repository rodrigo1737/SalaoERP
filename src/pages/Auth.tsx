import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "Senha deve ter no mínimo 6 caracteres" }),
});

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const { user, signIn, loading } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = loginSchema.safeParse(loginData);
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

    setIsLoading(true);
    const { error } = await signIn(loginData.email, loginData.password);
    setIsLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials" 
          ? "Email ou senha incorretos" 
          : error.message,
      });
    } else {
      toast({
        title: "Bem-vindo!",
        description: "Login realizado com sucesso",
      });
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 bg-slate-950 flex flex-col justify-center px-8 sm:px-16 lg:px-24 py-12 relative z-10">
        <div className="max-w-md w-full mx-auto">
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-10 text-center">
            Faça seu Login<span className="text-primary">.</span>
          </h1>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Username Field */}
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-white/80 text-sm">
                Usuário
              </Label>
              <Input
                id="login-email"
                type="email"
                className="h-14 bg-slate-900/80 border-slate-700/50 text-white placeholder:text-slate-500 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
              />
              {errors.email && (
                <p className="text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-white/80 text-sm">
                Senha
              </Label>
              <Input
                id="login-password"
                type="password"
                className="h-14 bg-slate-900/80 border-slate-700/50 text-white placeholder:text-slate-500 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              />
              {errors.password && (
                <p className="text-sm text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Login Button - Gradient */}
            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-semibold rounded-full bg-gradient-to-r from-blue-600 via-primary to-teal-400 hover:from-blue-500 hover:via-primary/90 hover:to-teal-300 text-white shadow-lg shadow-primary/30 transition-all duration-300 mt-4" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-12 text-center">
          <p className="text-white/40 text-sm">
            {new Date().getFullYear()} | Desenvolvido por{' '}
            <span className="text-white/60 hover:text-white transition-colors cursor-pointer underline underline-offset-4">
              MLTSoluction
            </span>
          </p>
        </div>
      </div>

      {/* Right Side - Decorative */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden">
        {/* Gradient overlay for smooth transition from left side */}
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-slate-950 to-transparent z-10" />
        
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-950" />
        
        {/* Decorative Elements */}
        <div className="absolute inset-0">
          {/* Large gradient orb */}
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-teal-500/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-blue-400/10 rounded-full blur-2xl" />
          
          {/* Stars effect */}
          <div className="absolute inset-0 opacity-50">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  opacity: Math.random() * 0.7 + 0.3,
                }}
              />
            ))}
          </div>
        </div>

        {/* Logo/Brand overlay - more visible */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-6xl font-display font-bold drop-shadow-2xl tracking-wide text-slate-300">
              MLTSoluction
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-primary to-teal-400 mx-auto mt-4 rounded-full" />
            <p className="text-white/60 text-xl mt-4 font-light tracking-wider">
              Sistema de Gestão
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
