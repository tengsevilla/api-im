import { Router } from 'express';
import { create, getAll, update } from '../controllers/client.controller.js';
import { authenticateToken } from '../middlewares/index.js';

const router = Router();

// Create new Client
router.post('/', authenticateToken, create);

// Get ALL Clients
router.get('/', authenticateToken, getAll);

// Update specific Client by ID
router.put('/:clientId', authenticateToken, update);

export default router;