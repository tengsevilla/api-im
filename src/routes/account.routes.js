import { Router } from 'express';
import * as accountController from '../controllers/account.controller.js';
// ✅ Import the security middleware
import { authenticateToken } from '../middlewares/index.js';

const router = Router();

// --- PUBLIC ROUTES ---
// Login (No token needed)
router.post('/login', accountController.login);

// Register (No token needed)
// You can use '/' or '/register' depending on your API style preference
router.post('/', accountController.create);

// --- PROTECTED ROUTES ---
// Update Profile (Requires Token)
router.put('/', authenticateToken, accountController.update);

// ✅ NEW: Get Full Account Details (Requires Token)
// Replaces the old 'summary' route
router.get('/details', authenticateToken, accountController.getAccountDetails);

export default router;