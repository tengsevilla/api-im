import jwt from 'jsonwebtoken';
import Account from '../models/account.model.js';
import logger from "../utils/logger.js";

const getClientId = (req) => req.headers['clientid'];

// 1. Login Controller
export const login = async (req, res) => {
    try {
        const encodedAuth = req.headers.authorization;
        const { rememberMe } = req.body || {};

        logger.debug(`Controller: Login attempt (Remember Me: ${rememberMe})`);

        if (!encodedAuth) {
            return res.status(401).json({ message: "No credentials provided" });
        }

        const tokenString = encodedAuth.startsWith('Basic ')
            ? encodedAuth.split(' ')[1]
            : encodedAuth;

        const decodedAuth = Buffer.from(tokenString, 'base64').toString();

        // Call Model
        const result = await Account.login(decodedAuth);

        if (result.status !== 200) {
            logger.warn(`Controller: Login failed - ${result.message}`);
            return res.status(result.status).json(result);
        }

        const user = result.data;

        // Dynamic Expiration Logic
        const tokenLife = rememberMe ? '14d' : '18h';

        // Sign the token with 'clientId' (Primary Key)
        const accessToken = jwt.sign(
            { id: user.clientId, username: user.username, role: user.role },
            process.env.ACCESS_TOKEN,
            { expiresIn: tokenLife }
        );

        logger.info(`Controller: Login successful for user: ${user.username}`);

        return res.status(200).json({
            status: 200,
            data: user,
            access_token: accessToken,
            expires_in: tokenLife
        });

    } catch (error) {
        logger.error(`Controller Error (login): ${error.message}`);
        return res.status(500).json({ message: error.message || 'Login error' });
    }
};

// 2. Create Account
export const create = async (req, res) => {
    logger.debug("Controller: Request to register new account");

    if (!req.body || !req.body.username || !req.body.password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    try {
        const data = await Account.create(req.body);

        logger.info(`Controller: Account created successfully [ID: ${data.clientId}]`);
        return res.status(data.status || 201).json(data);
    } catch (error) {
        logger.error(`Controller Error (create): ${error.message}`);
        return res.status(error.status || 500).json({ message: error.message });
    }
};

// 3. Update Account (Profile, Password, Entities)
export const update = async (req, res) => {
    const clientId = getClientId(req);
    logger.debug(`Controller: Update request for account ${clientId}`);

    if (!clientId) {
        return res.status(400).json({ message: "Missing clientId header" });
    }

    try {
        // req.body now contains { name, password, entities: [...] }
        const data = await Account.update(clientId, req.body);
        return res.status(data.status || 200).json(data);
    } catch (error) {
        logger.error(`Controller Error (update): ${error.message}`);
        return res.status(error.status || 500).json({ message: error.message });
    }
};

// 4. Get Account Details (Merged Profile)
// ✅ NEW: Replaces getAccountSummary
export const getAccountDetails = async (req, res) => {
    const clientId = getClientId(req);
    logger.debug(`Controller: Fetching full profile for ${clientId}`);

    if (!clientId) {
        return res.status(400).json({ message: "Missing clientId header" });
    }

    try {
        const data = await Account.getAccountDetails(clientId);

        // Data contains: { accountName, businessName, entities, ... }
        return res.status(data.status || 200).json({
            status: 200,
            data: data.data
        });
    } catch (error) {
        logger.error(`Controller Error (getAccountDetails): ${error.message}`);
        return res.status(500).json({
            message: error.message || "Error retrieving account details."
        });
    }
};