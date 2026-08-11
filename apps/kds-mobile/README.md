# ClickGarçom KDS Mobile

Aplicativo Expo/React Native voltado à operação de cozinha, bar e salão em tablets e celulares.

## Escopo da primeira versão

- Login com o mesmo JWT do Tenant Admin, guardado com `expo-secure-store`.
- Tela inicial operacional com resumo do turno, prioridades e atalhos por perfil.
- Estações de Cozinha e Bar conforme o perfil do usuário.
- Pedidos nos estados `PENDING`, `ACCEPTED` e `READY`.
- Detalhe de itens, opções e observações.
- Transições operacionais `ACCEPTED`, `READY` e `DELIVERED` pela API NestJS.
- Atualização em tempo real pelo WebSocket do Core Go e polling de segurança a cada 15 segundos.
- Painel do Salão para `ADMIN`, `MANAGER` e `WAITER`: entregas, novos atendimentos, contas, comandas, mesas e conversas.
- Comandas: abrir, lançar um item do cardápio e finalizar.
- Conversas: visualizar, responder e encerrar o atendimento.
- Configuração de estação e modo demonstração local.

Edição/anulação de lançamentos, documentos/reimpressão, portal do cliente, caixa e relatórios continuam no Tenant Admin web.

## Executar

```bash
npm install
npm start
```

Por padrão, o aplicativo aponta para o servidor público de teste:

```bash
https://clickgarcom.servicoswebia.com.br/admin/api/v1
wss://clickgarcom.servicoswebia.com.br/ws/kds
```

Para sobrescrever em desenvolvimento local, copie `.env.example` para `.env` e configure:

```bash
EXPO_PUBLIC_ADMIN_API_BASE_URL=http://localhost:3002/admin/api/v1
EXPO_PUBLIC_KDS_WS_URL=ws://localhost:8080/ws/kds
```

No desenvolvimento local, não use `localhost` em um tablet/celular: use o IP da máquina na rede local.
