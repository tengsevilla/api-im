import sql from "./index.js";
import logger from '../utils/logger.js';
import moment from 'moment';

export const getDashboardStats = async (clientId, lowStockThreshold = 10) => {
    try {
        // --- 1. Calculate Date Ranges with Moment ---

        // This Month: Start of 1st day to End of last day
        const currentMonthStart = moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const currentMonthEnd = moment().endOf('month').format('YYYY-MM-DD HH:mm:ss');

        // Last Month: Start of 1st day to End of last day
        const lastMonthStart = moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const lastMonthEnd = moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD HH:mm:ss');

        // --- 2. Define Queries ---

        // 1. Inventory Summary
        const qInventory = `
            SELECT COUNT(*) as total_products, SUM(qty) as total_stocks 
            FROM inventory 
            WHERE clientId = ?`;

        // 2. Services Summary
        const qServices = `
            SELECT COUNT(*) as total_services 
            FROM service 
            WHERE clientId = ?`;

        // 3. Transactions (This Month)
        // Using BETWEEN is safe now because moment gives us '2026-02-28 23:59:59'
        const qSalesCurrent = `
            SELECT 
                COUNT(DISTINCT transactionId) as total_no_of_sales,
                SUM(qty) as total_items_sold, 
                SUM(totalPrice) as total_sales 
            FROM transactions 
            WHERE clientId = ? 
            AND action = 'out' 
            AND transactionDate BETWEEN ? AND ?`;

        // 4. Transactions (Last Month)
        const qSalesLastMonth = `
            SELECT 
                COUNT(DISTINCT transactionId) as total_no_of_sales,
                SUM(totalPrice) as total_sales 
            FROM transactions 
            WHERE clientId = ? 
            AND action = 'out' 
            AND transactionDate BETWEEN ? AND ?`;

        // 5. Low Stock List
        const qLowStock = `
            SELECT type, itemName, itemType, tags, qty 
            FROM inventory 
            WHERE clientId = ? AND qty <= ? 
            ORDER BY qty ASC`;

        // 6. Leaderboard (Overall)
        const qLeaderboard = `
            SELECT 
                i.itemName, 
                i.itemType, 
                SUM(t.qty) as total_qty_sold, 
                SUM(t.totalPrice) as total_revenue
            FROM transactions t
            JOIN inventory i ON t.itemId = i.id
            WHERE t.clientId = ? 
            AND t.action = 'out'
            GROUP BY t.itemId
            ORDER BY total_qty_sold DESC
            LIMIT 10`;

        const qSalesTrend = `
            SELECT 
                DATE_FORMAT(transactionDate, '%Y-%m-%d') as date,
                SUM(totalPrice) as total
            FROM transactions 
            WHERE clientId = ? 
            AND action = 'out'
            AND transactionDate BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(transactionDate, '%Y-%m-%d')
            ORDER BY date ASC`;
        // const qSalesTrend = `
        //     SELECT 
        //         DATE_FORMAT(transactionDate, '%Y-%m-%d') as date,
        //         SUM(totalPrice) as total
        //     FROM transactions 
        //     WHERE clientId = ? 
        //     AND action = 'out'
        //     AND transactionDate BETWEEN '2026-01-01 00:00:00' AND '2026-01-31 23:59:59'
        //     GROUP BY DATE_FORMAT(transactionDate, '%Y-%m-%d')
        //     ORDER BY date ASC`;

        // --- 3. Execute Queries ---
        const [
            [invStats],
            [servStats],
            [salesCurrent],
            [salesLast],
            [lowStockList],
            [leaderboard],
            [salesTrend] // <--- Add this result
        ] = await Promise.all([
            sql.query(qInventory, [clientId]),
            sql.query(qServices, [clientId]),
            // Pass the Moment variables into the params array
            sql.query(qSalesCurrent, [clientId, currentMonthStart, currentMonthEnd]),
            sql.query(qSalesLastMonth, [clientId, lastMonthStart, lastMonthEnd]),
            sql.query(qLowStock, [clientId, lowStockThreshold]),
            sql.query(qLeaderboard, [clientId]),
            sql.query(qSalesTrend, [clientId, currentMonthStart, currentMonthEnd]) // <--- Add this query
            //  sql.query(qSalesTrend, [clientId]) // <--- Add this query
        ]);

        return {
            inventory: {
                total_products: invStats?.[0]?.total_products || 0,
                total_stocks: invStats?.[0]?.total_stocks || 0
            },
            service: {
                total_services: servStats?.[0]?.total_services || 0
            },
            sales: {
                period: "This Month",
                total_transactions: salesCurrent?.[0]?.total_no_of_sales || 0,
                total_items_sold: salesCurrent?.[0]?.total_items_sold || 0,
                total_revenue: salesCurrent?.[0]?.total_sales || 0,
                last_month_revenue: salesLast?.[0]?.total_sales || 0,
                last_month_transactions: salesLast?.[0]?.total_no_of_sales || 0
            },
            low_stock: lowStockList || [],
            top_products: leaderboard || [],
            sales_trend: salesTrend || [] // <--- Add to return object
        };

    } catch (err) {
        logger.error(`SQL Error (getDashboardStats): ${err.sqlMessage || err.message}`);
        throw err;
    }
};

export const getReportData = async (clientId, startDate, endDate) => {
    try {
        // Ensure dates are present before querying
        if (!startDate || !endDate) {
            throw new Error("Start Date and End Date are required");
        }

        const params = [clientId, startDate, endDate];

        // 1. QUERY: Detailed List (Table Data)
        const qList = `
            SELECT 
                t.transactionId,
                MAX(t.transactionDate) as date,
                MAX(t.customerName) as customer,  -- ✅ FIX: Used customerName with MAX()
                CASE 
                    WHEN MAX(t.action) = 'out' THEN 'Sale' -- ✅ FIX: Added MAX() for SQL Strict Mode
                    WHEN MAX(t.action) = 'in' THEN 'Restocked'
                    ELSE MAX(t.action) 
                END as tag,
                SUM(t.qty) as total_items,
                SUM(t.totalPrice) as total_amount,
                GROUP_CONCAT(i.itemName SEPARATOR ', ') as items_summary
            FROM transactions t
            LEFT JOIN inventory i ON t.itemId = i.id
            WHERE t.clientId = ? 
            AND t.transactionDate BETWEEN ? AND ?
            GROUP BY t.transactionId
            ORDER BY date DESC`;

        // 2. QUERY: Raw Daily Aggregates
        const qDailyStats = `
            SELECT 
                DATE_FORMAT(transactionDate, '%Y-%m-%d') as date,
                SUM(CASE WHEN action = 'out' THEN totalPrice ELSE 0 END) as revenue,
                SUM(CASE WHEN action = 'out' THEN qty ELSE 0 END) as sold,
                SUM(CASE WHEN action = 'in' THEN qty ELSE 0 END) as restocked
            FROM transactions
            WHERE clientId = ? 
            AND transactionDate BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(transactionDate, '%Y-%m-%d')
            ORDER BY date ASC`;

        const [[listRows], [dailyRows]] = await Promise.all([
            sql.query(qList, params),
            sql.query(qDailyStats, params)
        ]);

        // 3. PROCESSING
        const salesChart = dailyRows.map(row => ({
            date: row.date,
            revenue: Number(row.revenue)
        }));

        const qtyChart = dailyRows.map(row => ({
            date: row.date,
            sold: Number(row.sold),
            restocked: Number(row.restocked)
        }));

        return {
            list: listRows,
            sales_chart: salesChart,
            qty_chart: qtyChart
        };

    } catch (err) {
        console.error(`SQL Error (getReportData): ${err.sqlMessage || err.message}`);
        throw err;
    }
};