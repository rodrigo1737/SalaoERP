import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, User, Star, Loader2 } from 'lucide-react';

interface TenantInfo {
  id: string;
  name: string;
}

const BookingHome: React.FC = () => {
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();
  const { user, loading } = useClientAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-foreground mb-4">
          Bem-vindo ao {tenant.name}
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Agende seus serviços de forma rápida e prática, 24 horas por dia.
        </p>
      </div>

      {/* Features */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="font-medium mb-1">Agende Online</h3>
            <p className="text-sm text-muted-foreground">
              Escolha o melhor horário para você
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <User className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="font-medium mb-1">Escolha o Profissional</h3>
            <p className="text-sm text-muted-foreground">
              Atendimento com quem você preferir
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="font-medium mb-1">Confirmação Imediata</h3>
            <p className="text-sm text-muted-foreground">
              Receba confirmação na hora
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Star className="h-10 w-10 mx-auto text-primary mb-3" />
            <h3 className="font-medium mb-1">Histórico Completo</h3>
            <p className="text-sm text-muted-foreground">
              Acompanhe todos seus agendamentos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-8 text-center">
          {user ? (
            <>
              <h2 className="text-xl font-semibold mb-4">Pronto para agendar?</h2>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" asChild>
                  <Link to="agendar">
                    <Calendar className="h-4 w-4 mr-2" />
                    Novo Agendamento
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="meus-agendamentos">Meus Agendamentos</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Comece agora!</h2>
              <p className="text-muted-foreground mb-4">
                Crie sua conta gratuitamente e agende em poucos minutos.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" asChild>
                  <Link to="cadastro">Criar Conta</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="login">Já tenho conta</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingHome;
