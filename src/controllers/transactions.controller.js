import Transactions from "../models/transactions.model.js";
import logger from "../utils/logger.js";

const getClientId = (req) => req.headers['clientid'];

// ✅ HELPER: Consistent Response Format
const sendResponse = (res, status, data, message = "") => {
  res.status(status).json({
    status: status,
    message: message,
    data: data || null
  });
};

// 1. Create Batch (Sale or Restock)
export const createBatch = async (req, res) => {
  const clientId = getClientId(req);
  const payload = req.body;

  // Validation
  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    return sendResponse(res, 400, null, "Item list cannot be empty");
  }
  if (!['sale', 'restock'].includes(payload.event)) {
    return sendResponse(res, 400, null, "Invalid event type. Must be 'sale' or 'restock'");
  }

  logger.debug(`Controller: Processing batch [${payload.event}] for client: ${clientId}`);

  try {
    const result = await Transactions.processBatchTransaction(payload, clientId);
    sendResponse(res, result.status || 200, result.data, result.message);
  } catch (err) {
    logger.error(`Controller: createBatch Error - ${err.message}`);
    sendResponse(res, err.status || 500, null, err.message || "Transaction failed");
  }
};

// 2. Get All (with Filters)
export const findAll = async (req, res) => {
  const clientId = getClientId(req);

  // Extract filters from Query Params
  const { action, startDate, endDate } = req.query;

  // Validate required filters (Model SQL requires them)
  if (!action || !startDate || !endDate) {
    return sendResponse(res, 400, null, "Missing filters: action, startDate, and endDate are required");
  }

  logger.debug(`Controller: Fetching transactions (${action}) from ${startDate} to ${endDate}`);

  try {
    const query = {
      action: action, // 'in' or 'out'
      dateStart: startDate,
      dateEnd: endDate
    };

    const result = await Transactions.getAll(clientId, query);
    sendResponse(res, result.status || 200, result.data, result.message);
  } catch (err) {
    logger.error(`Controller: findAll Error - ${err.message}`);
    sendResponse(res, 500, null, "Internal server error");
  }
};

// 3. Find One (Detailed Receipt View)
export const findOne = async (req, res) => {
  const clientId = getClientId(req);
  const { transactionId } = req.params;

  logger.debug(`Controller: Fetching details for TRX: ${transactionId}`);

  try {
    const result = await Transactions.findById(transactionId, clientId);
    sendResponse(res, result.status || 200, result.data, result.message);
  } catch (err) {
    logger.error(`Controller: findOne Error - ${err.message}`);
    sendResponse(res, 500, null, "Internal server error");
  }
};

// 4. Delete Entire Transaction (Receipt)
export const remove = async (req, res) => {
  const clientId = getClientId(req);
  const { transactionId } = req.params;

  logger.debug(`Controller: Deleting TRX group: ${transactionId}`);

  try {
    const result = await Transactions.deleteById(transactionId, clientId);
    if (result.affectedRows === 0) {
      return sendResponse(res, 404, null, "Transaction not found");
    }
    sendResponse(res, 200, null, "Transaction deleted successfully");
  } catch (err) {
    logger.error(`Controller: remove Error - ${err.message}`);
    sendResponse(res, 500, null, "Internal server error");
  }
};

// 5. Delete Single Item from a Transaction
export const removeItem = async (req, res) => {
  const clientId = getClientId(req);
  const { id } = req.params; // logic ID (Primary Key of transactions table)

  logger.debug(`Controller: Deleting transaction row item: ${id}`);

  try {
    const result = await Transactions.deleteItemById(id, clientId);
    if (result.affectedRows === 0) {
      return sendResponse(res, 404, null, "Item log not found");
    }
    sendResponse(res, 200, null, "Item log deleted successfully");
  } catch (err) {
    logger.error(`Controller: removeItem Error - ${err.message}`);
    sendResponse(res, 500, null, "Internal server error");
  }
};