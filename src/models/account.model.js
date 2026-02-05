import sql from "./index.js";
import logger from "../utils/logger.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from 'uuid';

const Account = function (data) {
    this.username = data.username;
    this.password = data.password;
    this.name = data.name;
    this.clientId = data.clientId;
    this.role = data.role;
    this.date_created = data.date_created;
};

// 1. Create Account (Registration)
Account.create = async (newData) => {
    try {
        logger.debug(`Model: Creating new account for username: ${newData.username}`);

        if (!newData.clientId) {
            newData.clientId = uuidv4();
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newData.password, salt);
        newData.password = hash;

        const [res] = await sql.query("INSERT INTO account SET ?", [newData]);

        delete newData.password;
        return { clientId: newData.clientId, ...newData, status: 200 };
    } catch (err) {
        logger.error(`Model Error (Account.create): ${err.message}`);
        if (err.code === 'ER_DUP_ENTRY') {
            throw { message: "Username already exists", status: 409 };
        }
        throw { message: err.sqlMessage, status: 500 };
    }
};

// 2. Login Logic
Account.login = async (decodedAuth) => {
    try {
        const [username, plainPassword] = decodedAuth.split(':');
        logger.debug(`Model: Login attempt for username: ${username}`);

        const query = `SELECT clientId, name, username, password, role, date_created FROM account WHERE username = ?`;
        const [rows] = await sql.query(query, [username]);

        if (rows.length === 0) {
            return { status: 404, message: `Username not found` };
        }

        const user = rows[0];

        const match = await bcrypt.compare(plainPassword, user.password);
        if (!match) {
            logger.warn(`Model: Invalid password attempt for ${username}`);
            return { status: 401, message: 'Invalid password' };
        }

        delete user.password;
        return { status: 200, data: user };
    } catch (err) {
        logger.error(`Model Error (Account.login): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// 3. Update Account (Name & Password)
Account.update = async (clientId, data) => {
    try {
        logger.debug(`Model: Updating account/client profile for ${clientId}`);

        // --- A. Update ACCOUNT Table (Name & Password) ---
        let accountQuery = "UPDATE account SET name = ?";
        let accountParams = [data.name];

        if (data.password && data.password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(data.password, salt);
            accountQuery += ", password = ?";
            accountParams.push(hash);
        }

        accountQuery += " WHERE clientId = ?";
        accountParams.push(clientId);

        // --- B. Update CLIENT Table (Entities) ---
        let clientQuery = "";
        let clientParams = [];

        if (data.entities && Array.isArray(data.entities)) {
            // Convert Array ["A", "B"] -> String "A,B"
            const entitiesString = data.entities.join(',');

            clientQuery = "UPDATE client SET entities = ? WHERE clientId = ?";
            clientParams = [entitiesString, clientId];
        }

        // --- Execute Updates ---
        // We use Promise.all to run them in parallel (if both are needed)
        const promises = [];

        // Always run account update (since 'name' is usually required or present)
        promises.push(sql.query(accountQuery, accountParams));

        // Only run client update if entities were provided
        if (clientQuery) {
            promises.push(sql.query(clientQuery, clientParams));
        }

        const results = await Promise.all(promises);

        // Check the result of the Account update (index 0)
        const [accountRes] = results[0];

        if (accountRes.affectedRows === 0) {
            return { message: "Account not found", status: 404 };
        }

        return {
            clientId: clientId,
            name: data.name,
            entities: data.entities, // Echo back the array for the frontend
            message: "Profile updated successfully",
            status: 200
        };

    } catch (err) {
        logger.error(`Model Error (Account.update): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// 4. Get Account Details (Merged with Client Info)
Account.getAccountDetails = async (clientId) => {
    try {
        logger.debug(`Model: Fetching profile details for ${clientId}`);

        // ✅ FIX: Column names aligned with CREATE TABLE `client` schema
        const query = `
            SELECT 
                a.clientId,
                a.username,
                a.name AS accountName,
                a.role,
                a.date_created,
                c.business_name AS businessName,       -- DB: business_name
                c.business_address AS businessAddress, -- DB: business_address
                c.business_contact AS businessContact, -- DB: business_contact
                c.business_tin AS businessTin,         -- DB: business_tin (Added if needed)
                c.entities                             -- DB: entities
            FROM account a
            LEFT JOIN client c ON a.clientId = c.clientId
            WHERE a.clientId = ?
        `;

        const [rows] = await sql.query(query, [clientId]);

        if (rows.length === 0) {
            return { status: 404, message: "Account not found" };
        }

        return { status: 200, data: rows[0] };

    } catch (err) {
        logger.error(`Model Error (Account.getDetails): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

export default Account;