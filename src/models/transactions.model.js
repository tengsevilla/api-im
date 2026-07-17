import sql from "./index.js";
import logger from "../utils/logger.js";

// Constructor
const Transactions = function (data) {
    this.clientId = data.clientId;
    this.transactionId = data.transactionId;
    this.itemId = data.itemId;
    this.qty = data.qty;
    this.totalPrice = data.totalPrice;
    this.customerName = data.customerName;
    this.transactionDate = data.transactionDate;
    this.action = data.action;
};

// Create: Handles both Restock (IN) and Sales (OUT) in batches
Transactions.processBatchTransaction = async (payload, clientId) => {
    let connection;
    try {
        // ✅ Idempotency: accept an optional client-supplied refId
        if (payload.refId !== undefined && !/^[A-Za-z0-9-]{8,64}$/.test(payload.refId)) {
            throw { message: "Invalid refId format. Expected 8-64 alphanumeric/dash characters.", status: 400 };
        }

        connection = await sql.getConnection();
        await connection.beginTransaction();

        const isRestock = payload.event === 'restock';
        const operator = isRestock ? '+' : '-';
        const action = isRestock ? 'in' : 'out';

        logger.debug(`Model: Processing batch [${payload.event}] for client: ${clientId} (${payload.items.length} items)`);

        // ✅ NEW: Generate Custom ID (YYYYMMDD-TIME-ALPHANUM8)
        const dateObj = new Date();

        // 1. Date: YYYYMMDD
        const dateStr = dateObj.toISOString().slice(0, 10).replace(/-/g, "");

        // 2. Time: HHMMSS (UTC)
        // Note: Using UTC ensures consistency across servers.
        const timeStr = dateObj.toISOString().slice(11, 19).replace(/:/g, "");

        // 3. Random: 8 Alphanumeric Characters
        // .padEnd(8, 'X') ensures we always get 8 chars even if the random number is short
        const random8 = Math.random().toString(36).substring(2, 10).toUpperCase().padEnd(8, 'X');

        // Final Format: 20260203-090633-A1B2C3D4
        // Client-supplied refId wins (idempotency); server-generated is the backward-compat fallback
        const refId = payload.refId || `${dateStr}-${timeStr}-${random8}`;

        // ✅ Idempotency guard: FIRST statement inside the transaction.
        // A duplicate refId hits the PK; a rolled-back batch frees the key so retries work.
        try {
            await connection.query(
                "INSERT INTO transaction_batches (refId, clientId) VALUES (?, ?)",
                [refId, clientId]
            );
        } catch (insertErr) {
            if (insertErr.code === 'ER_DUP_ENTRY') {
                await connection.rollback();
                logger.debug(`Model: Duplicate batch refId ${refId} — skipping`);
                return {
                    status: 200,
                    message: "Transaction already processed",
                    data: { refId, duplicate: true }
                };
            }
            throw insertErr;
        }

        // Sort by id ascending so concurrent batches lock rows in the same order (deadlock avoidance)
        const items = [...payload.items].sort((a, b) => a.id - b.id);

        // Iterate through items
        for (const item of items) {

            // --- STEP A: Update Stock ---
            // Sales must not oversell: the qty >= ? guard makes the decrement conditional
            const updateQuery = isRestock
                ? `UPDATE inventory
                   SET qty = qty + ?
                   WHERE id = ? AND clientId = ?`
                : `UPDATE inventory
                   SET qty = qty - ?
                   WHERE id = ? AND clientId = ? AND qty >= ?`;

            const updateParams = isRestock
                ? [item.qty, item.id, clientId]
                : [item.qty, item.id, clientId, item.qty];

            const [updateRes] = await connection.query(updateQuery, updateParams);

            if (updateRes.affectedRows === 0) {
                if (isRestock) {
                    throw { message: `Item ID ${item.id} not found or access denied.`, status: 400 };
                }
                // Distinguish "missing item" from "insufficient stock"
                const [checkRows] = await connection.query(
                    "SELECT itemName, qty FROM inventory WHERE id = ? AND clientId = ?",
                    [item.id, clientId]
                );
                if (checkRows.length === 0) {
                    throw { message: `Item ID ${item.id} not found or access denied.`, status: 400 };
                }
                throw {
                    message: `Insufficient stock for "${checkRows[0].itemName}". Available: ${checkRows[0].qty}, requested: ${item.qty}.`,
                    status: 400
                };
            }

            // --- STEP B: Log Transaction ---
            const logQuery = `
                INSERT INTO transactions 
                (transactionId, itemId, action, qty, totalPrice, transactionDate, clientId, customerName)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const lineTotal = Number(item.price) * item.qty;

            await connection.query(logQuery, [
                refId,              // Shared Batch ID
                item.id,
                action,
                item.qty,
                lineTotal,
                payload.date,
                clientId,
                payload.customerName
            ]);
        }

        await connection.commit();

        return {
            status: 200,
            message: `${isRestock ? 'Restock' : 'Sale'} processed successfully`,
            data: {
                refId,
                event: payload.event,
                itemCount: payload.items.length
            }
        };

    } catch (err) {
        if (connection) await connection.rollback();

        logger.error(`Model Error (processBatchTransaction): ${err.message}`);
        const status = err.status || (err.message.includes("not found") ? 400 : 500);
        throw { message: err.message, status: status };
    } finally {
        if (connection) connection.release();
    }
};

// GetAll: Filtered by clientId, date range, and optionally action
Transactions.getAll = async (clientId, query) => {
    try {
        logger.debug(`Model: Fetching transactions for client: ${clientId}`);

        // 1. Start with Base Query (Required filters)
        // Note: I used 'customer' instead of 'customerName' to match your create function schema
        let sqlQuery = `
            SELECT transactionId, transactionDate, SUM(qty) as qty, 
                   SUM(totalPrice) as totalPrice, customer, action
            FROM transactions
            WHERE clientId = ? AND transactionDate BETWEEN ? AND ?`;

        // 2. Initialize Params
        const params = [clientId, query.dateStart, query.dateEnd];

        // 3. Dynamic Filter: Add 'action' only if it exists
        if (query.action) {
            sqlQuery += " AND action = ?";
            params.push(query.action);
        }

        // 4. Append Grouping & Sorting
        sqlQuery += `
            GROUP BY transactionId
            ORDER BY transactionDate DESC`;

        // 5. Execute
        const [res] = await sql.query(sqlQuery, params);

        if (res.length === 0) {
            return { message: "No transactions found", status: 200, data: [] };
        }
        return { data: res, status: 200 };

    } catch (err) {
        logger.error(`Model Error (getAll): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// FindById: Detailed view scoped to clientId
Transactions.findById = async (transactionId, clientId) => {
    try {
        logger.debug(`Model: Finding detailed transaction: ${transactionId} for client: ${clientId}`);

        // ✅ ADDED: t.action (Required for UI logic)
        const sqlQuery = `
            SELECT t.id, t.transactionId, t.itemId, t.transactionDate, 
                   t.qty, t.totalPrice, t.customerName, t.action,
                   (t.totalPrice / NULLIF(t.qty, 0)) AS unitPrice, 
                   i.type, i.itemType, i.itemName
            FROM transactions t
            LEFT JOIN inventory i ON t.itemId = i.id
            WHERE t.transactionId = ? AND t.clientId = ?`;

        const [rows] = await sql.query(sqlQuery, [transactionId, clientId]);

        if (rows.length === 0) {
            return { message: "Transaction not found", status: 404, data: null };
        }

        // ✅ DATA TRANSFORMATION
        // We take the "Header" info from the first row, and sum up the totals
        const header = rows[0];

        // Calculate total batch value
        const totalBatchValue = rows.reduce((acc, row) => acc + Number(row.totalPrice), 0);

        const formattedData = {
            transactionId: header.transactionId,
            transactionDate: header.transactionDate,
            customer: header.customerName,
            action: header.action,
            totalPrice: totalBatchValue,
            items: rows.map(row => ({
                id: row.id,
                itemName: row.itemName || "Unknown Item", // Handle deleted items
                itemType: row.itemType || "Unknown Type",
                qty: row.qty,
                price: row.unitPrice || 0,
                subtotal: row.totalPrice
            }))
        };

        return { data: formattedData, status: 200 };

    } catch (err) {
        logger.error(`Model Error (findById): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// Delete: Transaction Group (And Reverses Inventory Impact)
Transactions.deleteById = async (transactionId, clientId) => {
    let connection;
    try {
        connection = await sql.getConnection();
        await connection.beginTransaction();

        // 1. Fetch all rows of the group first (to know what to undo), locking them
        const [rows] = await connection.query(
            "SELECT itemId, qty, action FROM transactions WHERE transactionId = ? AND clientId = ? FOR UPDATE",
            [transactionId, clientId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return { message: "Transaction not found or access denied", status: 200, affectedRows: 0 };
        }

        // 2. Reverse inventory impact per row
        // 'out' (Sale) → ADD stock back (+); 'in' (Restock) → REMOVE stock (-), guarded
        for (const row of rows) {
            if (row.action === 'out') {
                await connection.query(
                    "UPDATE inventory SET qty = qty + ? WHERE id = ? AND clientId = ?",
                    [row.qty, row.itemId, clientId]
                );
            } else {
                const [updRes] = await connection.query(
                    "UPDATE inventory SET qty = qty - ? WHERE id = ? AND clientId = ? AND qty >= ?",
                    [row.qty, row.itemId, clientId, row.qty]
                );
                if (updRes.affectedRows === 0) {
                    throw { message: `Cannot reverse restock for item ${row.itemId}: stock already sold.`, status: 400 };
                }
            }
        }

        // 3. Delete the transaction rows
        const [delRes] = await connection.query(
            "DELETE FROM transactions WHERE transactionId = ? AND clientId = ?",
            [transactionId, clientId]
        );

        // 4. Free the idempotency key (0 rows is fine — old transactions predate the table)
        await connection.query(
            "DELETE FROM transaction_batches WHERE refId = ? AND clientId = ?",
            [transactionId, clientId]
        );

        await connection.commit();

        return { affectedRows: delRes.affectedRows, status: 200 };
    } catch (err) {
        if (connection) await connection.rollback();
        logger.error(`Model Error (deleteById): ${err.message}`);
        throw { message: err.sqlMessage || err.message, status: err.status || 500 };
    } finally {
        if (connection) connection.release();
    }
};

// Delete: Single Item Row (And Reverses Inventory Impact)
Transactions.deleteItemById = async (id, clientId) => {
    let connection;
    try {
        connection = await sql.getConnection();
        await connection.beginTransaction();

        // 1. Fetch the transaction details first (to know what to undo)
        const [rows] = await connection.query(
            "SELECT transactionId, itemId, qty, action FROM transactions WHERE id = ? AND clientId = ?",
            [id, clientId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return { message: "Item log not found or access denied", status: 404, affectedRows: 0 };
        }

        const { transactionId, itemId, qty, action } = rows[0];

        // 2. Determine Reverse Operator (Undo Logic)
        // If action was 'out' (Sale), we ADD stock back (+)
        // If action was 'in' (Restock), we REMOVE stock (-)
        const operator = action === 'out' ? '+' : '-';

        logger.debug(`Model: Undoing TRX item ${id} (${action} ${qty}). Adjusting Inventory ${itemId} by ${operator}${qty}`);

        // 3. Update Inventory
        // We use the determined operator to reverse the stock change.
        // Reversing a restock (-) is guarded so stock can never go negative.
        if (operator === '-') {
            const [updRes] = await connection.query(
                `UPDATE inventory SET qty = qty - ? WHERE id = ? AND clientId = ? AND qty >= ?`,
                [qty, itemId, clientId, qty]
            );
            if (updRes.affectedRows === 0) {
                throw { message: `Cannot reverse restock for item ${itemId}: stock already sold.`, status: 400 };
            }
        } else {
            await connection.query(
                `UPDATE inventory SET qty = qty + ? WHERE id = ? AND clientId = ?`,
                [qty, itemId, clientId]
            );
        }

        // 4. Delete the Transaction Record
        const [delRes] = await connection.query(
            "DELETE FROM transactions WHERE id = ? AND clientId = ?",
            [id, clientId]
        );

        // 5. If that was the last row of the group, free the idempotency key
        // (0 rows is fine — old transactions predate the table)
        const [[{ remaining }]] = await connection.query(
            "SELECT COUNT(*) AS remaining FROM transactions WHERE transactionId = ? AND clientId = ?",
            [transactionId, clientId]
        );
        if (remaining === 0) {
            await connection.query(
                "DELETE FROM transaction_batches WHERE refId = ? AND clientId = ?",
                [transactionId, clientId]
            );
        }

        await connection.commit();

        return {
            affectedRows: delRes.affectedRows,
            status: 200,
            message: "Transaction item deleted and inventory stock reversed"
        };

    } catch (err) {
        if (connection) await connection.rollback();
        logger.error(`Model Error (deleteItemById): ${err.message}`);
        throw { message: err.sqlMessage || err.message, status: err.status || 500 };
    } finally {
        if (connection) connection.release();
    }
};

export default Transactions;