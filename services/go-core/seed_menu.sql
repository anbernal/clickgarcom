-- ============================================
-- SEED DATA - CARDÁPIO DE TESTE
-- ============================================

-- Limpar dados antigos (se existir)
DELETE FROM menu_items WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
DELETE FROM menu_categories WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- ============================================
-- CATEGORIAS
-- ============================================

INSERT INTO menu_categories (id, tenant_id, name, description, display_order, active, created_at, updated_at)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Bebidas', 'Bebidas geladas e quentes', 1, true, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000002', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Pratos Principais', 'Pratos quentes da cozinha', 2, true, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000003', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sobremesas', 'Doces e sobremesas', 3, true, NOW(), NOW());

-- ============================================
-- BEBIDAS (BAR)
-- ============================================

INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, destination, prep_time_minutes, available, display_order, created_at, updated_at)
VALUES 
    ('20000000-0000-0000-0000-000000000001', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000001', 'Coca-Cola Lata', 'Refrigerante 350ml', 5.00, 'BAR', 2, true, 1, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000002', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000001', 'Guaraná Lata', 'Refrigerante 350ml', 5.00, 'BAR', 2, true, 2, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000003', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000001', 'Água Mineral', 'Água sem gás 500ml', 3.50, 'BAR', 1, true, 3, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000004', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000001', 'Suco Natural', 'Laranja, limão ou abacaxi', 8.00, 'BAR', 5, true, 4, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000005', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000001', 'Cerveja Heineken', 'Long neck 330ml', 12.00, 'BAR', 2, true, 5, NOW(), NOW());

-- ============================================
-- PRATOS PRINCIPAIS (KITCHEN)
-- ============================================

INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, destination, prep_time_minutes, available, display_order, created_at, updated_at)
VALUES 
    ('20000000-0000-0000-0000-000000000006', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000002', 'Hambúrguer Artesanal', 'Pão, carne 180g, queijo, bacon', 28.00, 'KITCHEN', 20, true, 1, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000007', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000002', 'Pizza Margherita', 'Molho, mussarela, tomate, manjericão', 45.00, 'KITCHEN', 25, true, 2, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000008', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000002', 'Filé à Parmegiana', 'Filé, molho, queijo, arroz e fritas', 38.00, 'KITCHEN', 30, true, 3, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000009', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000002', 'Batata Frita', 'Porção grande com cheddar e bacon', 22.00, 'KITCHEN', 15, true, 4, NOW(), NOW());

-- ============================================
-- SOBREMESAS (KITCHEN)
-- ============================================

INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, destination, prep_time_minutes, available, display_order, created_at, updated_at)
VALUES 
    ('20000000-0000-0000-0000-000000000010', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000003', 'Petit Gateau', 'Bolo de chocolate com sorvete', 18.00, 'KITCHEN', 12, true, 1, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000011', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000003', 'Brownie', 'Brownie com sorvete e calda', 15.00, 'KITCHEN', 10, true, 2, NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000012', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '10000000-0000-0000-0000-000000000003', 'Sorvete', '2 bolas (sabores variados)', 12.00, 'KITCHEN', 5, true, 3, NOW(), NOW());

-- ============================================
-- VERIFICAÇÃO
-- ============================================

SELECT 'Categorias criadas:' as info, COUNT(*) as total FROM menu_categories WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
SELECT 'Itens criados:' as info, COUNT(*) as total FROM menu_items WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
