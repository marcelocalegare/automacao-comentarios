# Comentário → DM com link (Instagram + Cloudflare Workers)

Quando alguém comenta uma palavra-chave num post, o Worker envia uma DM (private reply) com seu texto e link e, se você quiser, responde publicamente "Te mandei no direct!". Tudo no plano gratuito.

## 1. Configure as regras

Em `src/index.js`, edite o array `RULES`: palavras-chave, texto da DM, resposta pública e, se quiser, IDs de posts específicos.

## 2. Publique o Worker

```bash
npm install
npx wrangler login
npx wrangler secret put VERIFY_TOKEN   # invente um texto qualquer, ex.: meu-token-123
npx wrangler secret put APP_SECRET     # App Secret do app na Meta
npx wrangler secret put IG_TOKEN       # token de longa duração da conta IG
npx wrangler deploy
```

Anote a URL gerada (ex.: `https://insta-comment-dm.SEU-USUARIO.workers.dev`).

Recomendado: `npx wrangler kv namespace create SEEN`, depois descomente o bloco `kv_namespaces` no `wrangler.toml` com o id retornado e rode `npx wrangler deploy` de novo.

## 3. App na Meta

1. Converta o Instagram para conta **Profissional** (Business ou Creator).
2. Em developers.facebook.com, crie um app (tipo Business) e adicione o produto **Instagram** → "API setup with Instagram login".
3. Conecte sua conta IG e gere o **token de acesso**. Pegue também o **ID da conta IG** e coloque em `IG_USER_ID` no `wrangler.toml`.
4. Permissões necessárias: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.
5. **Webhooks**:
   - Callback URL: a URL do Worker
   - Verify token: o mesmo `VERIFY_TOKEN`
   - Assine o campo **comments**
6. Na conta do Instagram (app do celular), ative **Configurações → Mensagens → Permitir acesso às mensagens** (ferramentas conectadas).

Enquanto o app estiver em modo Desenvolvimento, só funciona com contas que têm papel no app (você e testadores). Para funcionar com qualquer pessoa, envie o app para **App Review** pedindo as permissões acima e mude para modo Live.

## 4. Teste

```bash
npm run logs   # mostra os logs em tempo real
```

Com outra conta (adicionada como testadora), comente a palavra-chave num post e veja a DM chegar.

## Robustez

- **Retry automático**: falhas de rede ou erro 5xx na Graph API são tentadas de novo (3x, com backoff). Erros 4xx (token inválido, já respondido, etc.) não são retentados.
- **Matching por palavra inteira**: as `keywords` usam fronteira de palavra (ex. "manda" não casa com "demanda"), em vez de simples substring.
- **Rate limit por usuário**: com o KV `SEEN` configurado, cada pessoa recebe no máximo 5 DMs por hora — contém loops de comentário/spam.
- **Logs estruturados em JSON** (`dm_sent`, `rate_limited`, `process_comment_failed`, `public_reply_failed`) — mais fácil de filtrar em `npm run logs`.

## 5. Painel de monitoramento (opcional)

Painel em `/dashboard` com DMs enviadas por dia, taxa de sucesso, bloqueios por rate limit e histórico de eventos — tudo no plano gratuito, usando D1.

```bash
npx wrangler d1 create insta-comment-dm-db
```

Cole o `database_id` retornado no `wrangler.toml` (descomente o bloco `[[d1_databases]]`) e rode:

```bash
npx wrangler d1 migrations apply insta-comment-dm-db --remote
npx wrangler secret put DASHBOARD_PASSWORD   # senha de acesso ao painel
npx wrangler deploy
```

Acesse `https://SEU-WORKER.workers.dev/dashboard` — o navegador vai pedir usuário (`admin`, ou o que você definir em `DASHBOARD_USER`) e a senha configurada (Basic Auth). Sem `DASHBOARD_PASSWORD` configurado, o painel e as rotas `/api/*` ficam bloqueados.

Sem o binding `DB`, o Worker continua funcionando normalmente (envio de DM, rate limit, dedup) — só o painel fica sem histórico.

## Limites do Instagram

- Uma private reply por comentário, e o comentário precisa ter até ~7 dias.
- Depois disso, só dá para mandar nova mensagem se a pessoa responder (janela de 24h).
- O token de longa duração expira em ~60 dias. Renove pelo endpoint `refresh_access_token`.
- Nomes de permissões e versão da API mudam com frequência. Confira a doc atual da Meta.
