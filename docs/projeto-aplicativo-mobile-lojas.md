# Projeto: Aplicativos Mobile MultiSoluction

## Identificacao

- **Produto:** MultiSoluction ERP
- **Plataformas:** Android e iOS
- **Distribuicao:** Google Play e Apple App Store
- **Estrategia recomendada:** aplicativo unico, multi-tenant, construido com Capacitor sobre a aplicacao React/Vite existente
- **Status:** auditoria inicial e projeto tecnico; Capacitor ainda nao instalado
- **Identificador sugerido:** `br.com.multisoluction.erp`, sujeito a confirmacao antes da criacao dos aplicativos nas lojas

## Decisao Arquitetural

O aplicativo sera um unico produto MultiSoluction. Depois do login, o tenant, o pacote contratado, as permissoes e a identidade visual determinarao os modulos exibidos.

Nao sera criado um aplicativo diferente para cada cliente B2B no primeiro ciclo. Essa decisao reduz duplicacao, simplifica atualizacoes e evita uma familia de aplicativos quase identicos.

O frontend React/Vite continuara sendo a fonte principal da interface. O Capacitor gerara os projetos nativos Android e iOS e fornecera acesso aos recursos do aparelho. O backend, Supabase Auth, banco, RLS, Storage e Edge Functions continuara compartilhado com a versao web.

Nao configurar o aplicativo como simples navegador remoto apontando para a URL de producao. O bundle web compilado deve ser empacotado no aplicativo, enquanto dados e APIs permanecem remotos. Isso melhora inicializacao, versionamento e aderencia ao requisito de experiencia semelhante a aplicativo.

## Estado Atual do Repositorio

### Compatibilidades ja existentes

- React 18, TypeScript e Vite.
- `package.json`, `index.html` e saida de build compativel com o `webDir` do Capacitor.
- Layout geral com menu lateral adaptado para telas menores.
- Rotas identificaveis, como `/app/agenda` e `/app/settings`.
- Supabase Auth com sessao persistente e renovacao de token.
- PWA parcial com manifesto, modo standalone e service worker.
- Web Push com VAPID, preferencias por usuario, lembretes e resumo diario.
- Upload de imagens e planilhas pelo navegador.
- Paginas publicas de termos e privacidade para o autoatendimento.

### Lacunas antes das lojas

1. Nao existem dependencias, configuracao ou projetos nativos do Capacitor.
2. O push atual depende de `ServiceWorker`, `PushManager` e VAPID, que nao devem ser usados como canal nativo.
3. A sessao Supabase usa `localStorage`; o aplicativo deve avaliar um adaptador com armazenamento seguro do sistema para tokens.
4. Cadastro, recuperacao de senha e links usam `window.location.origin`, que no container nativo nao representa o dominio publico esperado.
5. Nao existem Universal Links/App Links nem tratamento de abertura por notificacao.
6. Nao existem estilos globais para `safe-area-inset-*`; cabecalho e menu podem colidir com notch e barras do sistema.
7. Existem fluxos dependentes de `window.open`, `window.print`, clipboard e downloads que precisam de adaptadores nativos.
8. Uploads via `<input type="file">` precisam de testes de permissao, camera, galeria e seletor de documentos.
9. Algumas telas densas usam tabelas, larguras fixas e agenda horizontal; exigem validacao em aparelhos reais.
10. Nao existe tratamento global de perda de conexao. O aplicativo sera online no primeiro MVP, mas deve informar indisponibilidade com clareza.
11. Os metadados atuais descrevem apenas salao e estetica; devem representar o ERP multi-segmento.
12. O icone SVG atual nao substitui os conjuntos de icones PNG exigidos pelas plataformas.
13. Nao existe fluxo geral de solicitacao de exclusao da conta dentro do produto.
14. Nao existem arquivos e declaracoes de privacidade especificos dos SDKs nativos.

## Resultado da Auditoria por Area

| Area | Situacao | Risco | Acao necessaria |
| --- | --- | --- | --- |
| Build React/Vite | Compativel em arquitetura | Baixo | Confirmar build com Node.js 22+ e configurar `webDir: "dist"` |
| Navegacao | Rotas web organizadas | Medio | Tratar botao voltar, inicializacao e deep links nativos |
| Layout geral | Parcialmente responsivo | Medio | Testar celular/tablet, teclado, notch, rolagem e orientacao |
| Agenda | Funcional, mas horizontal e densa | Alto | Validar toque, rolagem, dialogs e paisagem em aparelhos reais |
| Supabase Auth | Login por senha compativel | Alto | Adaptar armazenamento, callbacks, recuperacao e revogacao de sessao |
| RLS e permissoes | Permanecem aplicaveis | Medio | Nao usar o container nativo como autorizacao; manter RLS como fonte de verdade |
| Web Push | Funcional no navegador | Alto | Manter para web e criar canal nativo APNs/FCM separado |
| Uploads | Funcionais no navegador | Medio | Testar camera, fotos, arquivos, limites e permissoes nativas |
| Impressao e exportacao | Dependem de APIs web | Medio | Usar compartilhamento, visualizador e sistema de arquivos nativo quando necessario |
| Links externos | Dependem de `window.open` | Medio | Usar Browser/App Launcher e lista de dominios permitidos |
| Offline | Nao implementado | Medio | Exibir estado offline, impedir gravacoes incompletas e permitir nova tentativa segura |
| Privacidade das lojas | Incompleta | Alto | Inventario de dados, politica, exclusao de conta e formularios das lojas |
| Identidade visual | Parcial | Medio | Criar icones, splash, nome, descricao e imagens das lojas |

## Arquitetura Alvo

```text
src/
  platform/
    runtime.ts              # web, android ou ios
    authRedirects.ts        # URLs web e deep links
    notifications.ts        # contrato comum; adaptadores web e nativo
    externalLinks.ts        # navegador, WhatsApp e links do sistema
    files.ts                # compartilhar, abrir e salvar arquivos
    secureSessionStorage.ts # adaptador de sessao revisado

Web/PWA
  manifest + service worker + Web Push/VAPID

Android/iOS
  Capacitor + plugins nativos + FCM/APNs

Supabase
  Auth + RLS + tabelas de preferencias + dispositivos nativos + Edge Functions
```

Componentes de negocio nao devem importar plugins Capacitor diretamente. Eles devem consumir a camada `src/platform/`, permitindo que o mesmo fluxo funcione na web e nos aplicativos.

## Autenticacao e Sessao

### Estado atual

O login interno usa e-mail e senha. Esse fluxo pode continuar com `supabase-js` dentro do Capacitor. Os pontos que usam `window.location.origin` nao podem ser mantidos sem diferenciacao de plataforma.

### Implementacao proposta

- Manter a URL HTTPS publica como `SITE_URL` do Supabase.
- Registrar URLs adicionais para Android/iOS e homologacao.
- Preferir Universal Links/App Links HTTPS para abrir o aplicativo.
- Manter um esquema customizado somente como fallback controlado.
- Criar uma pagina web intermediaria para confirmacao e recuperacao, evitando problemas com leitores de e-mail que antecipam links.
- Implementar parser unico para login, recuperacao de senha e convite.
- Remover tokens de URLs, logs e mensagens de erro.
- Avaliar adaptador de armazenamento seguro em Keychain no iOS e Keystore no Android.
- No logout, revogar/desativar o token push do aparelho e encerrar a sessao Supabase.
- Manter autorizacao em RLS/RPC; biometria local apenas desbloqueia a sessao do aparelho e nao concede permissoes.

## Notificacoes Nativas

### Canais

- Web/PWA continua usando `push_subscriptions` e VAPID.
- Android usa Firebase Cloud Messaging.
- iOS usa Apple Push Notification Service, diretamente ou por integracao revisada com FCM.
- Preferencias funcionais continuam em `user_notification_preferences`.

### Nova tabela proposta

`native_push_devices`:

- `id`
- `tenant_id`
- `user_id`
- `platform`: `android` ou `ios`
- `provider`: `fcm` ou `apns`
- `device_token`
- `device_installation_id`
- `app_version`
- `device_model`, minimizado e opcional
- `last_seen_at`
- `revoked_at`
- `created_at` e `updated_at`

Requisitos:

- Um usuario pode ter mais de um aparelho.
- Um token nao pode permanecer associado simultaneamente a usuarios diferentes.
- O frontend cadastra ou revoga apenas o proprio aparelho.
- Leitura ampla dos tokens fica bloqueada para usuarios autenticados.
- Edge Functions usam credenciais do provedor apenas no servidor.
- Tokens invalidos devem ser revogados automaticamente.
- Entregas continuam idempotentes para evitar notificacao duplicada.
- O clique da notificacao abre uma rota permitida, sem aceitar URL arbitraria do payload.
- Mensagens na tela bloqueada devem respeitar a minimizacao de dados, especialmente nos pacotes clinicos.

## Recursos Nativos do Primeiro MVP

Para que o produto ofereca experiencia propria de aplicativo:

1. Push nativo de agenda e resumo diario.
2. Deep link para agenda, configuracoes e item autorizado.
3. Biometria para desbloquear uma sessao ja autenticada, quando suportada.
4. Armazenamento seguro de credenciais de sessao.
5. Indicacao de conectividade e recuperacao de falhas.
6. Integracao correta com teclado, status bar e safe areas.
7. Abertura de WhatsApp e links externos pelo sistema.
8. Compartilhamento ou abertura nativa de relatorios e documentos.
9. Camera/galeria para fotos autorizadas.
10. Splash screen, icone e identidade MultiSoluction.

O primeiro MVP nao tera sincronizacao offline de dados operacionais. Operacoes de escrita exigirao conexao e deverao apresentar estado de envio, sucesso ou falha de forma inequivoca.

## Compatibilidade de Interface

### Ajustes globais

- Adicionar `viewport-fit=cover`.
- Criar utilitarios para `env(safe-area-inset-top/right/bottom/left)`.
- Preferir `100dvh` ao uso indiscriminado de `100vh` em telas com teclado.
- Garantir alvos de toque adequados e foco visivel.
- Fechar drawers e dialogs corretamente com botao voltar.
- Impedir zoom involuntario em inputs sem bloquear acessibilidade.
- Definir estrategia de orientacao: retrato por padrao, com paisagem permitida para agenda e relatorios largos.

### Telas prioritarias para teste

1. Login e recuperacao de senha.
2. Dashboard.
3. Agenda e detalhe do agendamento.
4. Clientes e upload de foto.
5. Profissionais e servicos.
6. Configuracoes de notificacao.
7. Caixa e gestao financeira.
8. Relatorios, impressao e exportacao.
9. Administracao de usuarios.
10. Modulos de Estetica, Limpeza, Psicologia e Psicopedagogia conforme liberados.

## Privacidade e Seguranca

- Publicar politica de privacidade geral da plataforma em URL estavel.
- Informar dados coletados pelo aplicativo e por SDKs de terceiros.
- Criar fluxo de solicitacao de exclusao de conta dentro do aplicativo.
- Separar exclusao da identidade de usuario da retencao legal de documentos fiscais ou clinicos.
- Registrar finalidade, prazo e resultado da solicitacao.
- Nao incluir `service_role`, chave APNs, credencial FCM ou segredo VAPID no bundle.
- Usar somente chave publicavel do Supabase no cliente e manter RLS ativa.
- Revisar logs nativos para impedir e-mail, token, prontuario ou payload sensivel.
- Ocultar conteudo sensivel no seletor de aplicativos e capturas quando o modulo clinico justificar essa protecao.
- Definir politica para aparelhos comprometidos, sessao expirada e perda do dispositivo.
- Testar acesso cruzado entre tenants tanto no navegador quanto nos aplicativos.

## Contas e Materiais Necessarios

### Apple

- Conta Apple Developer de organizacao.
- Entidade juridica, dominio corporativo, autenticacao em dois fatores e D-U-N-S.
- App ID/Bundle ID definitivo.
- Certificados, perfis, chave APNs e acesso ao App Store Connect.
- Politica de privacidade, URL de suporte, descricao e classificacao etaria.
- Credenciais de homologacao para revisao, sem dados reais sensiveis.
- Icones, splash e capturas de tela.
- Declaracoes de privacidade do aplicativo e dos SDKs.

### Google

- Conta Play Console de organizacao e verificacao empresarial.
- D-U-N-S e dados publicos de contato exigidos.
- Package name definitivo.
- App signing e chave de upload protegida.
- Projeto Firebase e `google-services.json` por ambiente.
- Politica de privacidade e formulario Data Safety.
- Classificacao de conteudo, categoria e capturas de tela.
- AAB assinado e faixa de testes fechados antes da producao.
- Target SDK vigente na data de cada envio.

## Ambientes e Identificadores

Separar pelo menos:

| Ambiente | Bundle/package sugerido | Backend |
| --- | --- | --- |
| Homologacao | `br.com.multisoluction.erp.staging` | projeto Supabase de homologacao |
| Producao | `br.com.multisoluction.erp` | projeto Supabase de producao |

Credenciais, chaves, arquivos Firebase, URLs e dominios associados nao devem ser reutilizados inadvertidamente entre ambientes.

## Plano de Implementacao

### Fase 0 - Decisoes e contas

- Confirmar nome publico e identificadores definitivos.
- Confirmar conta empresarial que aparecera como publicadora.
- Obter ou validar D-U-N-S.
- Criar contas Apple Developer e Google Play de organizacao.
- Definir politica de privacidade, suporte e exclusao de conta.

### Fase 1 - Preparacao web

- Criar camada `src/platform/`.
- Corrigir callbacks de autenticacao por ambiente.
- Implementar safe areas, altura dinamica e estado offline.
- Adaptar links externos, impressao, exportacao e clipboard.
- Revisar as telas prioritarias em larguras de celular e tablet.
- Manter a versao web funcional e sem regressao.

### Fase 2 - Fundacao Capacitor

- Validar Node.js e ferramentas exigidas pela versao atual do Capacitor.
- Instalar `@capacitor/core`, CLI, Android e iOS.
- Criar `capacitor.config.ts` com `webDir: "dist"`.
- Gerar projetos `android/` e `ios/`.
- Configurar status bar, splash, teclado, rede, browser e app lifecycle.
- Gerar icones e recursos nativos.

### Fase 3 - Auth e links

- Configurar Universal Links, App Links e fallback customizado.
- Atualizar URLs permitidas no Supabase Auth.
- Implementar callback e recuperacao de senha.
- Implementar armazenamento revisado da sessao.
- Validar renovacao, expiracao, logout e troca de usuario.

### Fase 4 - Push nativo

- Criar tabela e RLS de dispositivos nativos.
- Configurar APNs e FCM.
- Implementar registro, renovacao e revogacao de tokens.
- Adaptar a Edge Function para os tres canais.
- Implementar abertura segura da rota ao tocar na notificacao.
- Testar foreground, background, aplicativo encerrado e token expirado.

### Fase 5 - Homologacao

- Android interno e faixa fechada no Google Play.
- iOS em aparelhos registrados e TestFlight.
- Testes funcionais, seguranca, desempenho e acessibilidade.
- Testes com dois tenants e varios perfis.
- Validar comportamento em rede lenta, sem rede e retomada do aplicativo.

### Fase 6 - Publicacao

- Finalizar textos, imagens, classificacoes e formularios de privacidade.
- Fornecer conta de demonstracao para revisao.
- Enviar Android e iOS.
- Tratar eventuais apontamentos das lojas.
- Monitorar falhas, versoes, tokens push e feedback apos a liberacao.

## Criterios de Aceite do MVP

- O mesmo usuario acessa web, Android e iOS com as mesmas permissoes.
- Tenant A nunca acessa dados do tenant B.
- Login, renovacao e logout funcionam apos fechar e reabrir o aplicativo.
- Recuperacao de senha abre o destino correto.
- Push funciona em Android e iOS com o aplicativo aberto, em segundo plano e encerrado, conforme limites da plataforma.
- O clique no push abre somente uma rota autorizada.
- Web Push atual continua funcional.
- Agenda e dialogs funcionam em retrato e paisagem sem perda de acao.
- Teclado nao encobre o campo ou botao principal.
- Upload de foto e documento funciona em aparelhos reais.
- A perda de conexao nao gera duplicidade nem falsa confirmacao.
- Tokens e segredos nao aparecem no bundle ou nos logs.
- Exclusao de conta pode ser solicitada pelo aplicativo.
- Politica de privacidade e declaracoes das lojas correspondem ao comportamento real.
- Build de producao e reproduzivel e assinado pelas contas da organizacao.

## Matriz Minima de Testes

| Plataforma | Cenarios minimos |
| --- | --- |
| Web desktop | Chrome, Safari e fluxo atual sem regressao |
| PWA Android | instalacao, Web Push e abertura de rota |
| PWA iOS | instalacao pela tela inicial e Web Push |
| Android nativo | login, push, voltar, arquivos, camera, background e retomada |
| iPhone nativo | login, APNs, deep link, arquivos, camera, background e retomada |
| Tablet Android/iPad | sidebar, agenda, dialogs, orientacao e teclado |

Executar os testes com owner, administrador, profissional e equipe interna, incluindo dois tenants distintos e pelo menos um usuario com mais de um aparelho.

## Riscos Principais

1. Publicar apenas um WebView remoto e sofrer rejeicao ou experiencia inferior.
2. Reutilizar VAPID como se fosse token nativo.
3. Expor credenciais APNs/FCM no frontend.
4. Quebrar recuperacao de senha por usar origem `capacitor://localhost`.
5. Armazenar sessao sensivel sem avaliar protecao nativa.
6. Abrir URLs arbitrarias recebidas em notificacoes.
7. Declarar coleta de dados de forma incompleta nas lojas.
8. Misturar homologacao e producao.
9. Nao tratar token push apos logout, troca de usuario ou reinstalacao.
10. Gerar divergencia entre a versao web e o bundle publicado.
11. Manter telas importantes apenas utilizaveis em desktop.
12. Publicar aplicativos separados e quase identicos para cada tenant.

## Pendencias de Decisao

1. Confirmar o nome publico: **MultiSoluction ERP** ou outro nome.
2. Confirmar o identificador definitivo antes do primeiro envio.
3. Definir a entidade juridica publicadora e validar D-U-N-S.
4. Definir se o primeiro beta atendera somente equipe interna ou tambem clientes finais.
5. Definir quais modulos entrarao na primeira versao das lojas.
6. Definir se biometria entra no primeiro beta ou na versao seguinte.
7. Definir quem administrara certificados, chaves, contas e renovacoes.

## Proximo Passo Executavel

Depois da aprovacao deste projeto, executar a Fase 1 sem instalar dependencias nativas: criar a camada de plataforma, corrigir os redirects, introduzir safe areas e estado de conectividade, e gerar uma lista objetiva de telas que ainda falham em celular/tablet.

Somente apos essa preparacao e a confirmacao do nome e do identificador definitivo deve-se instalar o Capacitor e gerar os projetos Android/iOS.

## Referencias Oficiais

- [Capacitor - instalacao em aplicacao web existente](https://capacitorjs.com/docs/getting-started)
- [Capacitor - Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Capacitor - Deep Links](https://capacitorjs.com/docs/guides/deep-links)
- [Supabase - Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase - Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Apple - App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple - App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Google Play - Target API](https://developer.android.com/google/play/requirements/target-sdk)
- [Google Play - Tipos de conta](https://support.google.com/googleplay/android-developer/answer/13634885)
