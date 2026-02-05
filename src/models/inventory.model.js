import sql from "./index.js";
import logger from "../utils/logger.js";

const Inventory = function (data) {
    this.clientId = data.clientId;
    this.type = data.type;
    this.itemName = data.itemName;
    this.itemType = data.itemType;
    this.qty = data.qty;
    this.sell = data.sell;
    this.srp = data.srp;
    this.tags = data.tags;
};

// Create: Wrapped result in 'data'
Inventory.create = async (newData, clientId) => {
    try {
        newData.clientId = clientId;
        logger.debug(`Model: Creating inventory item [${newData.itemName}] for client: ${clientId}`);

        const [res] = await sql.query("INSERT INTO inventory SET ?", [newData]);

        // ✅ FIX: Structure matches { status, data }
        return {
            status: 200,
            data: { id: res.insertId, ...newData }
        };
    } catch (err) {
        logger.error(`Model Error (create): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

Inventory.getAll = async (clientId) => {
    try {
        logger.debug(`Model: Fetching all inventory for client: ${clientId}`);
        const [res] = await sql.query("SELECT * FROM inventory WHERE clientId = ?", [clientId]);

        if (res.length === 0) {
            return { message: "No content found", status: 200, data: [] };
        }
        return { status: 200, data: res };
    } catch (err) {
        logger.error(`Model Error (getAll): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

Inventory.getAllForDisplay = async (clientId) => {
    try {
        logger.debug(`Model: Fetching display inventory for client: ${clientId}`);
        const query = `
            SELECT CONCAT(itemType, ' - ', itemName) AS itemDetails, qty 
            FROM inventory WHERE clientId = ?`;

        const [res] = await sql.query(query, [clientId]);

        if (res.length === 0) {
            return { message: "No content found", status: 200, data: [] };
        }
        return { status: 200, data: res };
    } catch (err) {
        logger.error(`Model Error (getAllForDisplay): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// Update: Wrapped result in 'data'
Inventory.update = async (id, data, clientId) => {
    try {
        logger.debug(`Model: Updating item ${id} for client: ${clientId}`);
        const query = `
            UPDATE inventory 
            SET type = ?, itemName = ?, itemType = ?, sell = ?, srp = ?, tags = ? 
            WHERE id = ? AND clientId = ?`;

        const [res] = await sql.query(query, [
            data.type, data.itemName, data.itemType,
            data.sell, data.srp, data.tags, id, clientId
        ]);

        if (res.affectedRows === 0) {
            return { message: "Item not found or access denied", status: 200, data: null };
        }

        // ✅ FIX: Consistent structure
        return {
            status: 200,
            data: { id, ...data }
        };
    } catch (err) {
        logger.error(`Model Error (update): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// UpdateQty: Wrapped result in 'data'
Inventory.updateQty = async (id, data, operator, clientId) => {
    try {
        logger.debug(`Model: Adjusting qty for item ${id} (client: ${clientId})`);

        const query = `UPDATE inventory SET qty = qty ${operator} ? WHERE id = ? AND clientId = ?`;
        const [res] = await sql.query(query, [data.qty, id, clientId]);

        if (res.affectedRows === 0) {
            return { message: "Item not found or access denied", status: 200, data: null };
        }

        // ✅ FIX: Consistent structure
        return {
            status: 200,
            data: { id, ...data }
        };
    } catch (err) {
        logger.error(`Model Error (updateQty): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// CreateHistory: Wrapped result in 'data'
Inventory.createHistory = async (historyData, clientId) => {
    try {

        historyData.clientId = clientId;
        delete historyData.last_updated; // Safer to try both if unsure of upstream format
        delete historyData.date_created;
        const [res] = await sql.query("INSERT INTO inventoryhistory SET ?", [historyData]);

        // ✅ FIX: Consistent structure
        return {
            status: 200,
            data: { id: res.insertId, ...historyData }
        };
    } catch (err) {
        logger.error(`Model Error (createHistory): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// getItemActivity: Matches Controller Perfectly
Inventory.getItemActivity = async (clientId, itemId) => {
    try {
        logger.debug(`Model: Fetching full activity for item ${itemId} (client: ${clientId})`);

        // 1. Current Item (The "Live" version)
        const itemQuery = `SELECT * FROM inventory WHERE clientId = ? AND id = ?`;

        // 2. Transactions
        const transactionsQuery = `
            SELECT * FROM transactions 
            WHERE clientId = ? AND itemId = ? 
            ORDER BY transactionDate DESC`;

        // 3. History (Past versions)
        const historyQuery = `
            SELECT * FROM inventoryhistory 
            WHERE clientId = ? AND id = ? 
            ORDER BY date_created DESC`;

        const [itemResult, transactionsResult, historyResult] = await Promise.all([
            sql.query(itemQuery, [clientId, itemId]),
            sql.query(transactionsQuery, [clientId, itemId]),
            sql.query(historyQuery, [clientId, itemId])
        ]);

        const currentItem = itemResult[0][0] || null;
        const transactions = transactionsResult[0] || [];
        const pastHistory = historyResult[0] || [];

        // ✅ MERGE LOGIC:
        // We create a unified history list.
        // Index 0 is ALWAYS the current live item.
        let fullHistory = [...pastHistory];

        if (currentItem) {
            // We ensure the current item has a 'date_created' field (defaulting to Now)
            // so it doesn't break any date sorting logic in your UI.
            const liveVersion = {
                ...currentItem,
                isCurrent: true, // Flag for UI styling (e.g., highlight this row)
                date_created: currentItem.updated_at || new Date()
            };

            // Push to the FRONT of the array
            fullHistory.unshift(liveVersion);
        }

        return {
            status: 200,
            data: {
                transactions: transactions,
                history: fullHistory // Contains [Current Item, ...Old Versions]
            }
        };

    } catch (err) {
        logger.error(`Model Error (getItemActivity): ${err.message}`);
        throw { message: err.sqlMessage || err.message, status: 500 };
    }
};

export default Inventory;