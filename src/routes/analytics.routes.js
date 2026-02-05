import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';
import { authenticateToken } from '../middlewares/index.js';

const router = Router();

// GET /api/analytics/dashboard
router.get('/dashboard', authenticateToken, analyticsController.getDashboardSummary);

// GET /api/analytics/reports
router.get('/reports', authenticateToken, analyticsController.getReports);

export default router;