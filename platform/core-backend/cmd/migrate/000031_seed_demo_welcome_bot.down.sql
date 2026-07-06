DELETE FROM bot_flow_definitions
WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid
  AND flow_key = 'welcome_menu'
  AND channel = 'whatsapp';
