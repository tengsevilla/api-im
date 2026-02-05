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
        const refId = `${dateStr}-${timeStr}-${random8}`;

        // Iterate through items
        for (const item of payload.items) {

            // --- STEP A: Update Stock ---
            const updateQuery = `
                UPDATE inventory 
                SET qty = qty ${operator} ? 
                WHERE id = ? AND clientId = ?
            `;

            const [updateRes] = await connection.query(updateQuery, [
                item.qty,
                item.id,
                clientId
            ]);

            if (updateRes.affectedRows === 0) {
                throw new Error(`Item ID ${item.id} not found or access denied.`);
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
        const status = err.message.includes("not found") ? 400 : 500;
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

// Delete: Transaction Group
Transactions.deleteById = async (transactionId, clientId) => {
    try {
        const [res] = await sql.query("DELETE FROM transactions WHERE transactionId = ? AND clientId = ?", [transactionId, clientId]);

        if (res.affectedRows === 0) {
            return { message: "Transaction not found or access denied", status: 200, affectedRows: 0 };
        }
        return { affectedRows: res.affectedRows, status: 200 };
    } catch (err) {
        logger.error(`Model Error (deleteById): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
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
            "SELECT itemId, qty, action FROM transactions WHERE id = ? AND clientId = ?",
            [id, clientId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return { message: "Item log not found or access denied", status: 404, affectedRows: 0 };
        }

        const { itemId, qty, action } = rows[0];

        // 2. Determine Reverse Operator (Undo Logic)
        // If action was 'out' (Sale), we ADD stock back (+)
        // If action was 'in' (Restock), we REMOVE stock (-)
        const operator = action === 'out' ? '+' : '-';

        logger.debug(`Model: Undoing TRX item ${id} (${action} ${qty}). Adjusting Inventory ${itemId} by ${operator}${qty}`);

        // 3. Update Inventory
        // We use the determined operator to reverse the stock change
        await connection.query(
            `UPDATE inventory SET qty = qty ${operator} ? WHERE id = ? AND clientId = ?`,
            [qty, itemId, clientId]
        );

        // 4. Delete the Transaction Record
        const [delRes] = await connection.query(
            "DELETE FROM transactions WHERE id = ? AND clientId = ?",
            [id, clientId]
        );

        await connection.commit();

        return {
            affectedRows: delRes.affectedRows,
            status: 200,
            message: "Transaction item deleted and inventory stock reversed"
        };

    } catch (err) {
        if (connection) await connection.rollback();
        logger.error(`Model Error (deleteItemById): ${err.message}`);
        throw { message: err.sqlMessage || err.message, status: 500 };
    } finally {
        if (connection) connection.release();
    }
};

export default Transactions;