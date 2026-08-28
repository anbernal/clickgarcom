/*
 * Massa idempotente para testar Agenda & Serviços como um salão de cabelo.
 *
 * Ela usa o tenant QA existente, só atualiza registros com ids determinísticos
 * deste cenário e não remove pedidos, Delivery, clientes ou outros módulos.
 */
const { Client } = require('pg');
const { v5: uuidv5 } = require('uuid');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TENANT_ID = process.env.QA_TENANT_ID || process.env.DEFAULT_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000';
const UUID_NAMESPACE = '2dce370d-915e-5d81-966f-4540dac5f143';
const id = (kind, key) => uuidv5(`salon-appointments-demo:${kind}:${key}`, UUID_NAMESPACE);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((result, line) => {
    const value = line.trim(); const separator = value.indexOf('=');
    if (!value || value.startsWith('#') || separator < 0) return result;
    result[value.slice(0, separator).trim()] = value.slice(separator + 1).trim();
    return result;
  }, {});
}

const fileEnv = {
  ...loadEnvFile(path.join(REPO_ROOT, '.env')),
  ...loadEnvFile(path.join(REPO_ROOT, 'platform', 'core-backend', '.env')),
  ...loadEnvFile(path.join(__dirname, '.env')),
};
const env = (key, fallback = '') => process.env[key] || fileEnv[key] || fallback;
const client = new Client({
  host: env('DATABASE_HOST', 'localhost'), port: Number(env('DATABASE_PORT', '5432')),
  user: env('DATABASE_USER', 'postgres'), password: env('DATABASE_PASSWORD', 'postgres123'),
  database: env('DATABASE_NAME', 'clickgarcom_db'),
  ssl: env('DATABASE_SSL_MODE') === 'require' ? { rejectUnauthorized: false } : false,
});

const services = [
  ['corte-feminino', 'Corte feminino', 'Cortes & finalização', 'Análise de estilo, corte e finalização.', 75, 10, 89, 'AUTO_CONFIRM', '#d95670', '✂'],
  ['corte-masculino', 'Corte masculino', 'Cortes & finalização', 'Corte personalizado e acabamento.', 45, 10, 55, 'AUTO_CONFIRM', '#3478b8', '✂'],
  ['escova', 'Escova e finalização', 'Cortes & finalização', 'Lavagem, escova e acabamento profissional.', 50, 10, 69, 'AUTO_CONFIRM', '#3d78cc', '≈'],
  ['coloracao', 'Coloração completa', 'Colorização', 'Diagnóstico de cor, aplicação e tratamento.', 180, 20, 259, 'MANUAL_APPROVAL', '#8057bf', '◐'],
  ['hidratacao', 'Hidratação profunda', 'Tratamentos', 'Cuidado nutritivo para restaurar os fios.', 75, 10, 119, 'AUTO_CONFIRM', '#208b72', '✦'],
  ['manicure', 'Manicure', 'Unhas', 'Cuidado completo e esmaltação.', 45, 5, 45, 'AUTO_CONFIRM', '#d17d31', '◇'],
];

const professionals = [
  ['ana', 'Ana Martins', 'Cabeleireira especialista', 'AM', '#d95670', ['corte-feminino', 'corte-masculino', 'escova', 'hidratacao'], { MON: ['09:00', '18:00'], TUE: ['09:00', '18:00'], WED: ['09:00', '18:00'], THU: ['09:00', '18:00'], FRI: ['09:00', '18:00'], SAT: ['09:00', '15:00'] }],
  ['luiza', 'Luiza Costa', 'Colorista', 'LC', '#8057bf', ['coloracao', 'hidratacao', 'escova'], { TUE: ['10:00', '19:00'], WED: ['10:00', '19:00'], THU: ['10:00', '19:00'], FRI: ['10:00', '19:00'], SAT: ['09:00', '16:00'] }],
  ['bia', 'Beatriz Santos', 'Manicure', 'BS', '#d17d31', ['manicure'], { MON: ['09:00', '17:00'], TUE: ['09:00', '17:00'], WED: ['09:00', '17:00'], THU: ['09:00', '17:00'], FRI: ['09:00', '17:00'], SAT: ['09:00', '15:00'] }],
];

function nextWeekday(from, weekday, occurrence = 0) {
  const date = new Date(from); date.setHours(12, 0, 0, 0);
  const delta = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta + occurrence * 7);
  return date;
}
function dateValue(value) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function localDateTime(date, time) { return new Date(`${dateValue(date)}T${time}:00-03:00`); }
function plusMinutes(value, minutes) { return new Date(value.getTime() + minutes * 60_000); }

function automationDefinition() {
  return {
    triggers: {
      BOOKING_CONFIRMED: [
        { id: 'salon-confirmation', type: 'MESSAGE', title: 'Confirmação e agradecimento', text: 'Olá, {cliente}! ✂️\n\nSeu agendamento de {serviço} está confirmado para {data}, às {hora}, com {profissional}.\n\nObrigada pelo contato e pela preferência. Será um prazer receber você no {estabelecimento}!', buttonLabel: 'Ver agendamento', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
        { id: 'salon-confirmation-stop', type: 'STOP', title: 'Encerrar fluxo' },
      ],
      BOOKING_REQUESTED: [
        { id: 'salon-request', type: 'MESSAGE', title: 'Solicitação recebida', text: 'Olá, {cliente}! Recebemos seu pedido de horário para {serviço}, em {data}, às {hora}. A equipe vai conferir a agenda e avisar você por aqui.\n\nObrigada pela preferência!', buttonLabel: 'Ver solicitação', expectedAction: 'OPEN_MANAGE_BOOKING', enabled: true },
        { id: 'salon-request-stop', type: 'STOP', title: 'Encerrar fluxo' },
      ],
      BOOKING_CANCELED: [
        { id: 'salon-canceled', type: 'MESSAGE', title: 'Cancelamento', text: 'Olá, {cliente}. Seu agendamento de {serviço}, previsto para {data}, foi cancelado. Quando quiser, você pode escolher um novo horário.', buttonLabel: 'Agendar novamente', expectedAction: 'OPEN_BOOKING', enabled: true },
        { id: 'salon-canceled-stop', type: 'STOP', title: 'Encerrar fluxo' },
      ],
      BOOKING_REMINDER_DUE: [], BOOKING_RESCHEDULED: [], BOOKING_REJECTED: [],
    },
  };
}

async function updateTenantSettings() {
  const result = await client.query('SELECT settings FROM tenants WHERE id=$1 FOR UPDATE', [TENANT_ID]);
  if (!result.rows.length) throw new Error(`Tenant QA ${TENANT_ID} não encontrado.`);
  const raw = result.rows[0].settings;
  const settings = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  settings.appointments = {
    ...(settings.appointments || {}), enabled: true, permanent: true, enabled_at: new Date().toISOString(), disabled_at: null,
    industry_profile: 'SALON', timezone: 'America/Sao_Paulo', min_notice_hours: 2, max_advance_days: 60,
    allow_customer_cancellation: true, cancellation_limit_hours: 6, default_reminder_hours: 24,
  };
  await client.query('UPDATE tenants SET settings=$2, is_open=true, updated_at=NOW() WHERE id=$1', [TENANT_ID, JSON.stringify(settings)]);
}

async function seedServices() {
  for (const [key, name] of services) {
    await client.query(
      `INSERT INTO appointment_service_categories (id,tenant_id,name,display_order,active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (tenant_id, lower(name)) DO UPDATE SET display_order=EXCLUDED.display_order,active=true,updated_at=NOW()`,
      [id('category', name), TENANT_ID, name === 'Corte feminino' ? 'Cortes & finalização' : services.find((item) => item[0] === key)[2], services.findIndex((item) => item[0] === key) + 1],
    );
  }
  const categories = await client.query('SELECT id,name FROM appointment_service_categories WHERE tenant_id=$1', [TENANT_ID]);
  const categoryByName = new Map(categories.rows.map((row) => [row.name, row.id]));
  for (const [key, name, category, description, duration, buffer, price, mode, color, icon] of services) {
    await client.query(
      `INSERT INTO appointment_services (id,tenant_id,category_id,name,description,icon,color,duration_minutes,buffer_minutes,price,confirmation_mode,min_notice_minutes,max_advance_days,active,display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,120,60,true,$12)
       ON CONFLICT (id) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,description=EXCLUDED.description,icon=EXCLUDED.icon,color=EXCLUDED.color,duration_minutes=EXCLUDED.duration_minutes,buffer_minutes=EXCLUDED.buffer_minutes,price=EXCLUDED.price,confirmation_mode=EXCLUDED.confirmation_mode,min_notice_minutes=120,max_advance_days=60,active=true,display_order=EXCLUDED.display_order,updated_at=NOW()`,
      [id('service', key), TENANT_ID, categoryByName.get(category), name, description, icon, color, duration, buffer, price, mode, services.findIndex((item) => item[0] === key) + 1],
    );
  }
}

async function seedProfessionals() {
  const weekday = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  for (const [key, name, role, initials, color, serviceKeys, schedule] of professionals) {
    const professionalId = id('professional', key);
    await client.query(
      `INSERT INTO appointment_professionals (id,tenant_id,name,role_label,initials,color,concurrency_limit,active)
       VALUES ($1,$2,$3,$4,$5,$6,1,true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,role_label=EXCLUDED.role_label,initials=EXCLUDED.initials,color=EXCLUDED.color,concurrency_limit=1,active=true,updated_at=NOW()`,
      [professionalId, TENANT_ID, name, role, initials, color],
    );
    await client.query('DELETE FROM appointment_service_professionals WHERE tenant_id=$1 AND professional_id=$2', [TENANT_ID, professionalId]);
    for (const serviceKey of serviceKeys) await client.query(
      'INSERT INTO appointment_service_professionals (tenant_id,service_id,professional_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [TENANT_ID, id('service', serviceKey), professionalId],
    );
    await client.query('DELETE FROM appointment_availability_rules WHERE tenant_id=$1 AND professional_id=$2', [TENANT_ID, professionalId]);
    for (const [day, range] of Object.entries(schedule)) await client.query(
      'INSERT INTO appointment_availability_rules (id,tenant_id,professional_id,weekday,start_time,end_time,timezone,active) VALUES ($1,$2,$3,$4,$5,$6,$7,true)',
      [id('availability', `${key}:${day}`), TENANT_ID, professionalId, weekday[day], range[0], range[1], 'America/Sao_Paulo'],
    );
  }
}

async function seedAppointments() {
  const monday = nextWeekday(new Date(), 1, 1);
  const seed = [
    ['mariana', 0, '09:00', 'corte-feminino', 'ana', 'Mariana Silva', '11900000001', 'CONFIRMED'],
    ['carla', 0, '11:00', 'coloracao', 'luiza', 'Carla Ribeiro', '11900000002', 'PENDING_APPROVAL'],
    ['patricia', 1, '10:30', 'hidratacao', 'ana', 'Patrícia Melo', '11900000003', 'CONFIRMED'],
    ['fernanda', 2, '14:00', 'escova', 'luiza', 'Fernanda Souza', '11900000004', 'CHECKED_IN'],
    ['bianca', 3, '13:30', 'manicure', 'bia', 'Bianca Alves', '11900000005', 'CONFIRMED'],
    ['juliana', 4, '09:30', 'corte-masculino', 'ana', 'Juliana Freitas', '11900000006', 'CONFIRMED'],
  ];
  for (const [index, [key, offset, time, serviceKey, professionalKey, customer, phone, status]] of seed.entries()) {
    const service = services.find((item) => item[0] === serviceKey);
    const professional = professionals.find((item) => item[0] === professionalKey);
    const date = new Date(monday); date.setDate(date.getDate() + offset);
    const start = localDateTime(date, time); const end = plusMinutes(start, service[4] + service[5]);
    await client.query(
      `INSERT INTO appointments (id,tenant_id,service_id,professional_id,display_code,customer_name,customer_phone,service_name_snapshot,professional_name_snapshot,duration_minutes_snapshot,price_snapshot,confirmation_mode,source,status,start_at,end_at,timezone,consent_at,version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SEED',$13,$14,$15,'America/Sao_Paulo',NOW(),1)
       ON CONFLICT (id) DO UPDATE SET service_id=EXCLUDED.service_id,professional_id=EXCLUDED.professional_id,display_code=EXCLUDED.display_code,customer_name=EXCLUDED.customer_name,customer_phone=EXCLUDED.customer_phone,service_name_snapshot=EXCLUDED.service_name_snapshot,professional_name_snapshot=EXCLUDED.professional_name_snapshot,duration_minutes_snapshot=EXCLUDED.duration_minutes_snapshot,price_snapshot=EXCLUDED.price_snapshot,confirmation_mode=EXCLUDED.confirmation_mode,status=EXCLUDED.status,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,timezone=EXCLUDED.timezone,updated_at=NOW()`,
      [id('appointment', key), TENANT_ID, id('service', serviceKey), id('professional', professionalKey), `SAL${String(index + 1).padStart(3, '0')}`, customer, phone, service[1], professional[1], service[4], service[6], service[7], status, start, end],
    );
  }
}

async function seedAutomation() {
  const definition = automationDefinition();
  await client.query(`UPDATE appointment_automation_versions SET status='ARCHIVED',updated_at=NOW() WHERE tenant_id=$1 AND status='PUBLISHED'`, [TENANT_ID]);
  await client.query(
    `INSERT INTO appointment_automation_versions (id,tenant_id,status,version,definition,published_at)
     VALUES ($1,$2,'PUBLISHED',1,$3::jsonb,NOW())
     ON CONFLICT (tenant_id,version) DO UPDATE SET status='PUBLISHED',definition=EXCLUDED.definition,published_at=NOW(),updated_at=NOW()`,
    [id('automation', 'salon-v1'), TENANT_ID, JSON.stringify(definition)],
  );
}

async function printSummary() {
  const result = await client.query(
    `SELECT t.name,t.slug,
       (SELECT count(*)::int FROM appointment_services WHERE tenant_id=t.id AND active) services,
       (SELECT count(*)::int FROM appointment_professionals WHERE tenant_id=t.id AND active) professionals,
       (SELECT count(*)::int FROM appointments WHERE tenant_id=t.id AND source='SEED') appointments
       FROM tenants t WHERE t.id=$1`, [TENANT_ID],
  );
  console.table(result.rows);
}

async function main() {
  await client.connect();
  try {
    await client.query('BEGIN');
    await updateTenantSettings(); await seedServices(); await seedProfessionals(); await seedAppointments(); await seedAutomation();
    await client.query('COMMIT'); await printSummary();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(`Falha ao preparar a massa de salão: ${error.message}`); process.exitCode = 1; });
