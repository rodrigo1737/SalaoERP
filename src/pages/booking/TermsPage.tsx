import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TenantInfo {
  id: string;
  name: string;
}

const TermsPage: React.FC = () => {
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Termos de Uso</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <p className="text-muted-foreground mb-4">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e usar o sistema de agendamento online do {tenant.name}, você concorda em
            cumprir e ficar vinculado a estes Termos de Uso. Se você não concordar com qualquer
            parte destes termos, não poderá usar nossos serviços.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">2. Uso do Serviço</h2>
          <p>O sistema de agendamento permite que você:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Visualize os serviços e profissionais disponíveis</li>
            <li>Agende horários de forma online</li>
            <li>Gerencie seus agendamentos (visualizar, cancelar, remarcar)</li>
            <li>Mantenha um histórico de seus atendimentos</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">3. Cadastro e Conta</h2>
          <p>
            Para utilizar o serviço de agendamento, você deve fornecer informações verdadeiras,
            completas e atualizadas. Você é responsável por manter a confidencialidade de sua senha
            e por todas as atividades realizadas em sua conta.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">4. Agendamentos</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Os agendamentos estão sujeitos à disponibilidade</li>
            <li>
              Cancelamentos devem ser feitos com antecedência mínima de acordo com a política do
              estabelecimento
            </li>
            <li>
              O não comparecimento sem aviso prévio pode resultar em restrições para futuros
              agendamentos
            </li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">5. Preços e Pagamentos</h2>
          <p>
            Os preços exibidos são informativos e podem variar. O pagamento é realizado
            diretamente no estabelecimento, conforme as condições acordadas no momento do
            atendimento.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">6. Modificações</h2>
          <p>
            Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações
            entram em vigor imediatamente após a publicação. O uso continuado do serviço após as
            alterações constitui aceitação dos novos termos.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">7. Contato</h2>
          <p>
            Em caso de dúvidas sobre estes Termos de Uso, entre em contato diretamente com o{' '}
            {tenant.name}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsPage;
