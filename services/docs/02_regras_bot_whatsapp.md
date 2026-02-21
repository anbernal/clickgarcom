# Motor de Regras: Bot de WhatsApp e Máquina de Estados

O **Go-Core Worker** é responsável por consumir os eventos (`whatsapp.messages`) provindos da API de mensageria e traduzi-los em Ações e Estados dentro de uma `Session` de comunicação.

## 1. Gestão da Sessão (`Session`)
Uma Sessão representa a jornada atual do cliente com o estabelecimento.
- **Identificação Única**: A chave da Sessão é composta por `[Telefone do Usuário] + [Tenant ID]`.
- **Duração e Limpeza**: As sessões podem ter um Tempo de Vida e expiram/são reiniciadas se o ciclo não for concluído em tempo hábil.
- **Transições de Estado (`Session.TransitionTo`)**: A alteração de estado só ocorre se for válida para o macroprocesso do negócio.

## 2. Mapa de Estados (State Machine)
1. **`WELCOME` (Bem-Vindo)**:
   - Estado default na primeira interação do cliente em um novo ciclo.
   - Fornece opções iniciais (ex: "Ver o cardápio no momento?").

2. **`MAIN_MENU` (Menu Principal)**:
   - Estado reativo com o catálogo de opções do restaurante (Ver Menu, Fazer Pedido, Ver Conta, Chamar Garçom, etc.)

3. **`WAITING_TABLE_CONFIRMATION` (Aguardando Confirmação de Pessoas - Fluxo QR Code)**:
   - Estado disparado após o cliente mandar via link ou QR a string `"Mesa [Nº]"`.
   - Regra: O cliente deve fornecer apenas um número inteiro `(PaxCount > 0)` representando quantas pessoas estarão na mesa.

4. **`WAITING_ADMIN_APPROVAL` (Aguardando Aprovação do Estabelecimento)**:
   - Estado intermediário em que o cliente **não consegue progredir**.
   - As entradas do usuário (exceto cancelamento via "0") são amigavelmente ignoradas até que o painel do Garçom (`admin.table.events`) dispare o evento assíncrono de Aprovação.

5. **`ORDERING` e Estados de Cardápio**:
   - `SELECTING_QTY` (Aguardando Qtd.): Após acessar o ID de um `MenuItem`.
   - `ADDING_NOTES` (Aguardando Observações): Se o usuário informar detalhes do prato (ex: Sem Ceba).
   - `CONFIRMING_ORDER` (Confirmação): O Bot revisa os itens escolhidos e exige um "Sim/Não" do cliente para fechar e enviar o pedido para a Cozinha.

6. **`VIEWING_TAB` (Visualizando Comanda)**:
   - Estado informativo gerado durante o processamento do subtotal.

## 3. Comportamentos Notáveis e Tolerância a Falhas
- **Regex e Parse Int**: O bot deve suportar descrições vagas. Se o usuário mandar "Eu quero duas águas", o fluxo semântico ou numérico extrai o correspondente do estado de seleção de quantidade.
- **Comandos de Escape**: Expressões padronizadas de recuo como `0`, `"cancelar"`, ou `"sair"` devem ser perfeitamente lidas para devolver a Sessão ao `MAIN_MENU` sem bloquear o fluxo lógico e liberar instâncias residuais da tabela da memória.
