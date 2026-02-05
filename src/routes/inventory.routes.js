import { authenticateToken } from '../middlewares/index.js';
import * as inventory from "../controllers/inventory.controller.js";
import express from 'express';

const router = express.Router();

// Create a new item
// Final path: POST /api/inventory
router.post("/", authenticateToken, inventory.create);

// Retrieve All
// Final path: GET /api/inventory
router.get("/", authenticateToken, inventory.getAll);

// Retrieve All for public/display
// Final path: GET /api/inventory/display
router.get("/display", inventory.getAllForDisplay);

// Update an item
// Final path: PUT /api/inventory
router.put("/", authenticateToken, inventory.update);

// Update quantity only
// Final path: PUT /api/inventory/updateqty
router.put("/updateqty", authenticateToken, inventory.updateQty);

// Create history entry
// Final path: POST /api/inventory/history
router.post("/history", authenticateToken, inventory.createHistory);

// Retrieve inventory history
// Final path: GET /api/inventory/activity
router.get("/activity", authenticateToken, inventory.getItemActivity);

export default router;