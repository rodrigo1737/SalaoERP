# Auditoria Mobile e Tablet - Fase 1

## Escopo validado

Esta auditoria cobre a preparacao web anterior ao Capacitor. Ela nao altera a regra de negocio nem transforma tabelas densas em outra interface. A agenda horizontal foi preservada conforme a decisao anterior de retornar essa tela ao comportamento original.

## Entregue nesta fase

- Camada `src/platform/` para runtime, redirects, conectividade, links externos e clipboard.
- Redirects de confirmacao e redefinicao de senha independentes de `window.location.origin`.
- URL publica configuravel por `VITE_PUBLIC_APP_URL`.
- Deep link nativo reservado em `VITE_NATIVE_AUTH_REDIRECT_URL`, ainda desativado ate a configuracao de App Links/Universal Links.
- `viewport-fit=cover`, safe areas, altura dinamica `100dvh` e ajuste do menu lateral em aparelhos com notch.
- Aviso global quando o aparelho fica offline, sem prometer que uma gravacao foi concluida.
- Links de WhatsApp e agendamento publico centralizados em adaptadores que poderao receber a implementacao Capacitor.
- TypeScript validado com Node.js 22.

## Matriz de telas para aparelhos reais

| Prioridade | Tela/fluxo | Situacao encontrada | Validacao necessaria |
| --- | --- | --- | --- |
| P0 | Login, confirmacao e recuperacao | Redirect centralizado; deep link nativo ainda depende das contas Apple/Google | Abrir links com app encerrado, em segundo plano e sem app instalado |
| P0 | Agenda | Grade horizontal minima de 800 px foi mantida intencionalmente | Testar arraste horizontal, toque, dialogs, retrato e paisagem sem perda de acao |
| P0 | Novo/editar agendamento e comanda | Dialog extenso e operacoes financeiras/estoque criticas | Testar teclado, scroll, fechamento, repeticao por rede instavel e idempotencia |
| P0 | Notificacoes | Web Push continua separado do futuro push nativo | Testar web atual e, depois, foreground/background/app encerrado com APNs/FCM |
| P1 | Equipe e acessos | Tabela com sete colunas e dialogs altos | Confirmar scroll horizontal, botoes de acao e teclado em 360 px |
| P1 | Gestao financeira | Filtros, abas, cards e tabelas densas | Testar 360/390/430 px, tablet retrato e paisagem, sem corte de valores |
| P1 | Historico do cliente | Varias tabelas dentro de dialog | Confirmar scroll vertical/horizontal independente e fechamento pelo botao voltar |
| P1 | Produtos, estoque e entradas | Tabelas largas e entrada com varias colunas | Validar edicao sem perder campos e sem envio duplicado ao reconectar |
| P1 | Relatorios e exportacao | Graficos, abas e impressao web | Definir compartilhamento/arquivo nativo antes do beta |
| P2 | Clientes B2B e administradores | Tabelas largas; uso restrito a super admin | Testar principalmente em tablet; celular pode manter scroll horizontal |
| P2 | Agendamento publico | Layout ja responsivo | Testar teclado, selecao de data/hora e retorno do navegador |

## Criterios para concluir a Fase 1

1. Nenhum fluxo web atual perde navegacao, autenticacao ou permissao.
2. O conteudo nao fica sob notch, barra de status ou indicador inferior.
3. O teclado nao oculta o campo ativo nem o botao principal.
4. A perda de rede exibe aviso e nao produz confirmacao falsa.
5. A agenda permanece utilizavel com scroll horizontal e orientacao paisagem.
6. Tabelas largas possuem scroll contido e nao aumentam a largura da pagina inteira.
7. Links externos, copia e redirects passam somente pela camada de plataforma.
8. Os testes sao repetidos com owner, administrador, profissional e equipe interna.

## Bloqueios para a Fase 2

Antes de gerar `android/` e `ios/`, confirmar:

- Nome publico definitivo do aplicativo.
- Bundle/package definitivo de producao e homologacao.
- Entidade juridica publicadora.
- Contas Apple Developer e Google Play de organizacao.
- Se o primeiro beta sera interno ou disponibilizado tambem a clientes finais.
