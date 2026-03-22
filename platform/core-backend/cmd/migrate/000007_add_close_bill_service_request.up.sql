ALTER TABLE service_requests
    DROP CONSTRAINT IF EXISTS valid_request_type;

ALTER TABLE service_requests
    ADD CONSTRAINT valid_request_type
    CHECK (request_type IN ('ICE', 'CUTLERY', 'NAPKIN', 'CALL_WAITER', 'CLOSE_BILL', 'ISSUE', 'OTHER'));

CREATE INDEX IF NOT EXISTS idx_service_requests_tab_status
    ON service_requests(tenant_id, tab_id, status);
