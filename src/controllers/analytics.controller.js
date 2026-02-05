import * as AnalyticsModel from '../models/analytics.model.js';
import logger from '../utils/logger.js';

export const getDashboardSummary = async (req, res) => {
    const clientId = req.headers['clientid'];
    const lowStockThreshold = req.query.lowStock || 10;

    try {
        if (!clientId) {
            logger.warn('Dashboard Request missing Client ID');
            return res.status(400).json({ message: "Client ID required" });
        }

        logger.debug(`Fetching dashboard stats for client: ${clientId} (LowStock < ${lowStockThreshold})`);

        const data = await AnalyticsModel.getDashboardStats(clientId, lowStockThreshold);

        logger.info(`Dashboard data served for client: ${clientId}`);

        res.status(200).json({
            status: 200,
            message: "Dashboard data fetched successfully",
            data: data
        });

    } catch (error) {
        logger.error(`Dashboard Controller Error: ${error.message}`);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getReports = async (req, res) => {
    const clientId = req.headers['clientid'];
    // ✅ FIX 1: Removed 'type' (Model doesn't use it, it returns a fixed structure)
    const { dateStart, dateEnd } = req.query;

    try {
        if (!clientId) {
            return res.status(400).json({ message: "Client ID required" });
        }

        logger.debug(`Generating analytics report for client: ${clientId} [${dateStart} to ${dateEnd}]`);

        // ✅ FIX 2: Correct Model Signature (clientId, startDate, endDate)
        const data = await AnalyticsModel.getReportData(clientId, dateStart, dateEnd);

        // ✅ FIX 3: Check 'data.list.length' because 'data' is now an object { list, charts... }
        logger.info(`Report generated successfully. Rows: ${data.list ? data.list.length : 0}`);

        res.status(200).json({
            status: 200,
            message: "Report data fetched successfully",
            data: data
        });
    } catch (error) {
        logger.error(`Report Generation Error: ${error.message}`);
        res.status(500).json({ message: "Error fetching report" });
    }
};