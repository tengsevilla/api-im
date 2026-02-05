import Inventory from "../models/inventory.model.js";
import logger from "../utils/logger.js";

const getClientId = (req) => req.headers['clientid'];

// ✅ HELPER: Ensures strictly typed responses
const sendResponse = (res, status, data, message = "") => {
    res.status(status).json({
        status: status,
        message: message,
        data: data || null
    });
};

export const create = async (req, res) => {
    const clientId = getClientId(req);
    logger.debug(`Controller: Create request for clientId: ${clientId}`);

    if (!req.body || Object.keys(req.body).length === 0) {
        return sendResponse(res, 400, null, "Body content cannot be empty");
    }

    try {
        const inventory = new Inventory({
            ...req.body,
            clientId: clientId
        });

        // Model returns { status, data, message }
        const result = await Inventory.create(inventory, clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: Create Error - ${err.message}`);
        sendResponse(res, err.status || 500, null, err.message || "Internal server error");
    }
};

export const getAll = async (req, res) => {
    const clientId = getClientId(req);
    logger.debug(`Controller: Fetching all inventory for clientId: ${clientId}`);

    try {
        const result = await Inventory.getAll(clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: getAll Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};

export const getAllForDisplay = async (req, res) => {
    const clientId = getClientId(req);
    logger.debug(`Controller: Fetching display inventory for clientId: ${clientId}`);

    try {
        const result = await Inventory.getAllForDisplay(clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: getAllForDisplay Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};

export const update = async (req, res) => {
    const clientId = getClientId(req);
    const { id } = req.body;

    logger.debug(`Controller: Updating item ${id} for clientId: ${clientId}`);

    try {
        const updatedData = new Inventory({ ...req.body, clientId: clientId });
        const result = await Inventory.update(id, updatedData, clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: update Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};

export const updateQty = async (req, res) => {
    const clientId = getClientId(req);
    const { id, operator: rawOperator, qty } = req.body;
    const operator = (rawOperator === 'plus') ? "+" : "-";

    logger.debug(`Controller: Adjusting qty for item ${id} (clientId: ${clientId})`);

    try {
        const result = await Inventory.updateQty(id, { qty }, operator, clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: updateQty Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};

export const createHistory = async (req, res) => {
    const clientId = getClientId(req);
    try {
        const historyData = { ...req.body, clientId: clientId };
        const result = await Inventory.createHistory(historyData, clientId);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: createHistory Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};

export const getItemActivity = async (req, res) => {
    const clientId = getClientId(req);

    // ✅ FIX: Map 'itemId' (frontend query param) to 'id' (expected by model)
    const { id } = req.query;

    if (!id) {
        return sendResponse(res, 400, null, "Item ID is required");
    }

    try {
        const result = await Inventory.getItemActivity(clientId, id);
        sendResponse(res, result.status || 200, result.data, result.message);
    } catch (err) {
        logger.error(`Controller: getItemActivity Error - ${err.message}`);
        sendResponse(res, 500, null, "Internal server error");
    }
};