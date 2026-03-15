ALTER TABLE sale_overview
ADD COLUMN store TINYINT NOT NULL DEFAULT 0
CHECK (store IN (0, 1, 2, 3, 4, 5));

UPDATE sale_overview
SET store = 1;

ALTER TABLE sale_overview
MODIFY COLUMN store TINYINT NOT NULL DEFAULT 0,
ADD CONSTRAINT chk_store
CHECK (store IN (0, 1, 2, 3, 4, 5));

ALTER TABLE sale_overview
DROP CHECK chk_store,
ADD CONSTRAINT chk_store
CHECK (store IN (0, 1, 2, 3, 4, 5));
