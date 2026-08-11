# Piloto operacional do Delivery

## Escopo recomendado

Comece com um restaurante, uma área de até 5 km e no máximo dois entregadores.
Mantenha `auto_accept.enabled=false` nos dois primeiros turnos; depois habilite
o aceite automático somente com pagamento confirmado e capacidade limitada.

## Checklist antes do turno

- confirmar `settings.delivery.origin`, horário e área de atendimento;
- configurar `fees.mode=DISTANCE_BANDS` e revisar a última faixa como limite
  operacional, não como autorização para endereços fora da área;
- validar `DELIVERY_MAPS_PROVIDER`, timeout e fallback Haversine;
- validar `INTERNAL_SERVICE_TOKEN` e, se desejado, o
  `DELIVERY_REDIS_MAINTENANCE_URL`;
- criar um pedido de teste, retirar, acompanhar a localização e concluir com
  PIN incorreto e depois PIN correto;
- confirmar que o link público não exibe telefone, PIN, endereço completo ou
  localização após o terminal.

## Indicadores do piloto

Colete por turno: taxa de aceite automático, tempo de aceite, tempo total,
entregas sem ETA, falhas/retornos, overrides, tentativas de PIN, pontos de
localização rejeitados e mensagens WhatsApp pendentes. Interrompa o aceite
automático se houver três falhas de rota, divergência de taxa ou atraso de
notificação no mesmo turno.

## Encerramento diário

Execute o endpoint de manutenção em `dry_run`, revise credenciais e localização
e só então execute a limpeza. Compare o relatório com os pedidos do KDS e
registre exceções com motivo e evidência antes de liberar o próximo turno.
