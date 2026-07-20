# Base de Dados para Homologacao QA

## Objetivo

A massa `Anderson Restaurant` cobre os principais estados da operacao sem alterar outros tenants. Ela e idempotente: cada execucao remove e recria somente esse tenant, atualizando datas relativas para manter dashboards, SLA e relatorios relevantes.

```bash
make seed-qa
```

## Acesso

- Painel: `http://localhost:3004/login.html`
- Administrador: `admin.qa@clickgarcom.local`
- Senha comum dos usuarios QA: `Teste@123`
- Tenant ID: `550e8400-e29b-41d4-a716-446655440000`

Usuarios adicionais:

| Perfil | Login |
| --- | --- |
| Gerente | `gerente.qa@clickgarcom.local` |
| Garcom | `garcom.qa@clickgarcom.local` |
| Cozinha | `cozinha.qa@clickgarcom.local` |
| Bar | `bar.qa@clickgarcom.local` |
| Caixa | `caixa.qa@clickgarcom.local` |
| Inativo (login deve falhar) | `inativo.qa@clickgarcom.local` |

## Cobertura da Massa

| Area | Cenarios incluidos |
| --- | --- |
| Mesas | Disponivel, ocupada, reservada, limpeza e balcao |
| Solicitacao de mesa | Pendente, aprovada e rejeitada |
| Cardapio | Item simples, opcionais obrigatorios, adicionais, combo, estoque normal, baixo e zerado |
| Disponibilidade | Item ativo, desativado e restrito a janela de sabado |
| Qualidade do cadastro | Item sem custo, item gratuito e item sem imagem |
| KDS | Pendente recente, pendente atrasado, aceito atrasado, pronto, entregue e cancelado |
| Comandas | Aberta, aguardando pagamento, parcialmente paga, paga e fechada |
| Pagamentos | PIX pendente, confirmado, expirado, cancelado e cartao aprovado |
| Atendimento | Solicitacoes com prioridades 1 a 5 e chat aberto/fechado |
| Relatorios | Vendas distribuidas nos ultimos sete dias, margens e cancelamento |
| NPS | Promotor, neutro e detratores pendentes de tratamento |
| WhatsApp/carteira | Logs IN/OUT, envio falho, ciclos recebidos, cobertos, abertos e com divergencia |
| Auditoria | Login, criacao, reset de senha, desativacao e eventos de comanda |
| Bot | Duas versoes do flow de boas-vindas para diff e rollback |

## Casos Propositais

Estes registros nao representam falhas do seed:

- `Costela BBQ - estoque zerado` deve aparecer indisponivel por estoque.
- `Quatro Queijos - indisponivel` esta desativada manualmente.
- `Feijoada de Sabado` depende da janela de disponibilidade.
- `Frango Grelhado - sem custo` reduz a cobertura de custos do relatorio.
- `Agua da Casa - sem foto` valida o fallback visual e possui preco zero.
- `Pudim da Casa - estoque baixo` deve disparar o alerta de estoque baixo.
- O pedido da mesa 01 foi criado atrasado para evidenciar o SLA do KDS.
- Um log de mensagem `FAILED`, um NPS nota 1 e um ciclo de carteira `attention` alimentam as telas de confiabilidade.

## Imagens

As seis imagens autorais ficam em `apps/tenant-admin/web/public/assets/demo-menu`. O seed salva o caminho relativo `/assets/demo-menu/...`, que funciona no painel local e nao depende do ngrok. Quando o bot envia uma imagem pelo WhatsApp, o backend converte esse caminho para o dominio publico disponivel no momento.

Se o bot for enviar imagens pelo WhatsApp, o ngrok ou outro dominio HTTPS publico precisa estar ativo para a Meta conseguir baixar o arquivo. Nao e necessario recriar o cardapio quando o dominio do ngrok mudar.

Para recriar a massa:

```bash
make seed-qa
```

## Validacao Rapida

1. Entre como administrador e confirme os cards da home.
2. Abra `Cardapio` e filtre os estados de estoque e disponibilidade.
3. Abra o KDS e confirme pedidos de cozinha e bar, incluindo o atrasado.
4. Confira comandas, pagamentos, solicitacoes e chat.
5. Abra os relatorios de sete dias, NPS, carteira e auditoria.
6. Entre com cada perfil para validar permissoes e confirme que o usuario inativo nao autentica.
