import express from "express";
import * as transactions from "../controllers/transactions.controller.js";
import { authenticateToken } from "../middlewares/index.js"; // Assuming you have this

const router = express.Router();

// Base Path: /api/transactions

router.post("/batch", authenticateToken, transactions.createBatch); // Handles Sales & Restock
router.get("/", authenticateToken, transactions.findAll); // ?action=out&startDate=...&endDate=...
router.get("/:transactionId", authenticateToken, transactions.findOne);
router.delete("/:transactionId", authenticateToken, transactions.remove);
router.delete("/item/:id", authenticateToken, transactions.removeItem);

export default router;