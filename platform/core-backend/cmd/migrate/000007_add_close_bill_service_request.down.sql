DROP INDEX IF EXISTS idx_service_requests_tab_status;

DELETE FROM service_requests
 WHERE request_type = 'CLOSE_BILL';

ALTER TABLE service_requests
    DROP CONSTRAINT IF EXISTS valid_request_type;

ALTER TABLE service_requests
    ADD CONSTRAINT valid_request_type
    CHECK (request_type IN ('ICE', 'CUTLERY', 'NAPKIN', 'CALL_WAITER', 'ISSUE', 'OTHER'));
