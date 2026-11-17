# Incidente Google OAuth na importação de pedidos

Verificação de 17/11/2026 para o projeto `zanelli/pcp` na Vercel. A correção está na branch local `fix/google-oauth-importacao`.

## Evidência e causa

- No painel da Vercel, as variáveis de projeto `GOOGLE_CLIENT_ID`, `GOOGLE_REFRESH_TOKEN` e `GOOGLE_DRIVE_FOLDER_ID` aparecem em Production. `GOOGLE_CLIENT_SECRET` não aparece na lista de variáveis de projeto. Nenhum valor foi aberto ou copiado. [Variáveis do projeto](https://vercel.com/zanelli/pcp/settings/environment-variables)
- A ausência do segredo impediria a troca de token em uma nova execução com essa configuração. O código original valida as variáveis antes do POST e repassa `error_description` ao navegador quando o Google recusa a troca. A mensagem relatada, “Google OAuth: Bad Request”, não identifica o status HTTP ou o código OAuth. A consulta ao painel de logs não forneceu esses campos do incidente. A configuração do deployment que atendeu a solicitação precisa ser verificada, inclusive a existência de uma variável compartilhada vinculada. [Logs do projeto](https://vercel.com/zanelli/pcp/logs)
- O Google Cloud abriu sem projeto selecionado. O vínculo entre o refresh token e o OAuth Client ID, possíveis revogação e expiração, a situação do consentimento, a habilitação das APIs e o acesso à pasta seguem sem confirmação. Aplicações externas em Testing que usam escopos de Drive ou Sheets podem receber refresh tokens com validade de sete dias. [Regras de expiração do Google OAuth](https://developers.google.com/identity/protocols/oauth2#expiration)

## Diagnóstico administrativo

Configure `GOOGLE_DIAGNOSTIC_ADMIN_ID` com o UUID Auth de um ADMIN ativo já vinculado ao perfil do ambiente. O servidor verifica o UUID configurado e o vínculo antes de chamar o Google. Configure `GOOGLE_DIAGNOSTIC_SHEET_ID` com o ID de uma planilha sintética já existente e compartilhada com a conta da integração. O diagnóstico consulta apenas metadados da pasta e da planilha e informa se a pasta aceita novos arquivos. A etapa de escrita sintética é registrada como pendente e pode ser executada pelo fluxo de homologação abaixo.

Em uma sessão ADMIN autenticada no ambiente em diagnóstico, execute no console da própria aplicação. `authPayload()` usa a sessão atual e o console recebe somente o resultado sanitizado.

```js
google.script.run
  .withSuccessHandler(result => console.table(result))
  .withFailureHandler(error => console.error(error.message))
  .diagnosticarIntegracaoGoogle(authPayload());
```

Em logs de servidor, filtre por `google_integration_failure` e pela referência exibida para obter `stage`, `code` e `httpStatus`. Em `invalid_client`, valide ID e segredo do mesmo cliente. Em `invalid_grant`, verifique se o token foi emitido para esse cliente, se a autorização foi revogada ou se expirou. Para `unauthorized_client` e `access_denied`, confira consentimento, conta autorizada e política do Workspace. `SERVICE_DISABLED` indica API desabilitada e `ACCESS_TOKEN_SCOPE_INSUFFICIENT` indica falta de escopo. HTTP 429, falhas de rede e 5xx recebem a orientação de tentar novamente. [Erros do servidor OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Erros da API Drive](https://developers.google.com/workspace/drive/api/guides/handle-errors)

## Recuperação e implantação sob aprovação

1. No Google Cloud, identifique o projeto que contém o Client ID já usado pela integração. Confirme o cliente ativo, o estado da tela de consentimento, Drive API e Sheets API. Confira se a conta autorizada pode adicionar arquivos à pasta do ambiente.
2. Se faltar o segredo, configure na Vercel o segredo correspondente ao mesmo cliente. Se a troca retornar `invalid_grant`, obtenha um refresh token por um fluxo OAuth de servidor com o mesmo cliente e redirect URI autorizado, `access_type=offline` e, para solicitar novo consentimento, `prompt=consent`. Use a conta de integração e confirme os escopos necessários para converter, editar, exportar e gerenciar os arquivos. Aplique os valores diretamente no painel protegido da Vercel, no ambiente autorizado. [Fluxo OAuth de servidor do Google](https://developers.google.com/identity/protocols/oauth2/web-server)
3. Após aprovação, disponibilize a branch em um ambiente isolado com Supabase de homologação, conta e pasta Drive isoladas e planilha de diagnóstico sintética. Configure os valores para esse ambiente antes do deployment. Rode o diagnóstico e confira OAuth, Drive e Sheets individualmente.
4. Pela interface, importe um XLSX sintético com valor financeiro identificável, como `R$ 999,00`. Confira os dados interpretados e as quantidades. Abra o PDF com um usuário de teste, confirme o link e confira visualmente e por busca textual que o valor não aparece. Use **Voltar** sem confirmar e confira que nenhum pedido foi persistido. O fluxo atual de cancelamento retorna ao upload e pode manter o PDF temporário no Drive.
5. Refaça a análise e confirme o pedido apenas no Supabase isolado. Abra o PDF final pelo pedido gravado e confira a etapa inicial e as quantidades. Teste uma configuração OAuth inválida no ambiente isolado e verifique se, após restaurar a configuração, a análise funciona e o erro anterior continua localizável pela referência.
6. Após a homologação, obtenha aprovação para revisar o merge e implantar em Production. Confirme a configuração do ambiente de produção antes de publicar. A análise de `6599 MIDAS.xlsx` exige autorização específica e confirmação final pelo usuário.

## Verificação local

`node --test --test-isolation=none` passou com 10 testes. O teste de importação monta um XLSX sintético, simula a recusa OAuth e a recuperação, verifica a limpeza da faixa financeira antes da exportação e verifica o envio do PDF simulado. Outro teste verifica que o diagnóstico recusa UUID e perfil não autorizados. `node scripts/build.mjs` concluiu o build. A inspeção de um PDF real, a escrita no Drive e a persistência em Supabase isolado dependem da homologação.
