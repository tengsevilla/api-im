-- 2026-07-17: Idempotency keys for batch transactions.
-- One row per processed batch; a client-supplied (or server-generated) refId
-- is inserted as the FIRST statement inside the batch DB transaction, so a
-- duplicate refId is rejected by the PK and a rolled-back batch frees the key.
CREATE TABLE transaction_batches (
  refId VARCHAR(64) NOT NULL,
  clientId VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (refId),
  KEY idx_client (clientId)
) ENGINE=InnoDB;
