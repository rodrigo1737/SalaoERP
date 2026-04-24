import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TenantInfo {
  id: string;
  name: string;
}

const PrivacyPage: React.FC = () => {
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Política de Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <p className="text-muted-foreground mb-4">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">1. Informações Coletadas</h2>
          <p>Coletamos as seguintes informações quando você utiliza nosso sistema de agendamento:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Nome completo</li>
            <li>Endereço de e-mail</li>
            <li>Número de telefone/WhatsApp</li>
            <li>Data de nascimento (opcional)</li>
            <li>Histórico de agendamentos e serviços</li>
            <li>Preferências de profissionais e serviços</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">2. Como Usamos Suas Informações</h2>
          <p>Utilizamos suas informações para:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Processar e gerenciar seus agendamentos</li>
            <li>Enviar confirmações e lembretes de agendamentos</li>
            <li>Melhorar nossos serviços e experiência do usuário</li>
            <li>Entrar em contato quando necessário sobre seus agendamentos</li>
            <li>Manter histórico para sua conveniência</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">3. Compartilhamento de Dados</h2>
          <p>
            Suas informações pessoais não são vendidas ou compartilhadas com terceiros para fins de
            marketing. Compartilhamos dados apenas com:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>O estabelecimento {tenant.name} para prestação dos serviços</li>
            <li>Prestadores de serviços essenciais (como hospedagem de dados)</li>
            <li>Quando exigido por lei ou ordem judicial</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">4. Segurança dos Dados</h2>
          <p>
            Implementamos medidas de segurança técnicas e organizacionais para proteger suas
            informações pessoais contra acesso não autorizado, alteração, divulgação ou destruição.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">5. Seus Direitos</h2>
          <p>Você tem direito a:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Acessar suas informações pessoais</li>
            <li>Corrigir dados incorretos</li>
            <li>Solicitar a exclusão de seus dados</li>
            <li>Cancelar sua conta a qualquer momento</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-3">6. Cookies e Tecnologias</h2>
          <p>
            Utilizamos cookies e tecnologias similares para melhorar sua experiência, manter você
            conectado e analisar como nossos serviços são utilizados.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">7. Retenção de Dados</h2>
          <p>
            Mantemos suas informações enquanto sua conta estiver ativa ou conforme necessário para
            fornecer os serviços. Você pode solicitar a exclusão de sua conta e dados a qualquer
            momento.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">8. Alterações nesta Política</h2>
          <p>
            Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre
            alterações significativas por meio do e-mail cadastrado ou através de aviso em nosso
            sistema.
          </p>

          <h2 className="text-lg font-semibold mt-6 mb-3">9. Contato</h2>
          <p>
            Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato
            diretamente com o {tenant.name}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyPage;
