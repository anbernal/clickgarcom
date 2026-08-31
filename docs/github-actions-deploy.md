# GitHub Actions: CI e deploy

O repositório agora possui dois workflows:

- `CI`: executa build das APIs, testes de agenda e `go test` em pull requests e nos pushes de `main`/`feature/delivery-v2`.
- `Deploy produção`: publica por SSH no servidor quando há push em `main` ou quando executado manualmente em **Actions → Deploy produção → Run workflow**.

## Secrets necessários

Cadastre em **Settings → Secrets and variables → Actions → New repository secret**. Para reduzir o escopo, recomenda-se criar também um Environment chamado `production` e cadastrar os secrets nele.

| Secret | Valor |
| --- | --- |
| `DEPLOY_HOST` | Host ou IP SSH do servidor |
| `DEPLOY_PORT` | Porta SSH; opcional, padrão `22` |
| `DEPLOY_USER` | Usuário do deploy |
| `DEPLOY_SSH_KEY` | Chave privada SSH do usuário de deploy |
| `DEPLOY_KNOWN_HOSTS` | Saída validada de `ssh-keyscan -H host`; opcional, mas recomendada |
| `DEPLOY_PATH` | Diretório do checkout no servidor |
| `DEPLOY_HEALTH_URL` | URL pública HTTPS do endpoint `/admin/api/health` |

O usuário SSH precisa conseguir executar Docker e o checkout no `DEPLOY_PATH` precisa ter `origin` apontando para este repositório. O workflow busca a mesma referência que disparou a execução, executa as migrações e atualiza os serviços de aplicação sem alterar os arquivos `.env` do servidor.

O deploy usa `start-first` somente quando configurado pelo ambiente Docker; o compose existente continua sendo a fonte da configuração de produção. Antes de habilitar o primeiro deploy automático, execute-o manualmente e confirme os serviços em **Actions**.
