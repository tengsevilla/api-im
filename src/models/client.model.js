import sql from "./index.js";
import logger from "../utils/logger.js";
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator

// Constructor
const Client = function (data) {
    this.clientId = data.clientId;
    this.name = data.name;
    this.business_name = data.business_name;
    this.business_contact = data.business_contact;
    this.business_address = data.business_address;
    this.business_tin = data.business_tin;
    // date_added is handled automatically by the database
};

// Create: Create a new Business Profile (Superadmin Action)
Client.create = async (newData) => {
    try {
        // Generate a new unique ID for this client
        const newClientId = uuidv4();

        logger.debug(`Model: Superadmin creating new client with ID: ${newClientId}`);

        // Assign the generated ID to the data object
        newData.clientId = newClientId;

        const [res] = await sql.query("INSERT INTO client SET ?", [newData]);

        // Return the auto-generated GUID so the Superadmin knows the ID of the new tenant
        return { clientId: newClientId, ...newData, status: 200 };
    } catch (err) {
        logger.error(`Model Error (Client.create): ${err.message}`);

        if (err.code === 'ER_DUP_ENTRY') {
            throw { message: "Business profile or ID already exists.", status: 409 };
        }
        throw { message: err.sqlMessage, status: 500 };
    }
};
// Add this to your client.model.js file
Client.getAll = async () => {
    try {
        logger.debug(`Model: Fetching all business profiles`);
        const [res] = await sql.query("SELECT * FROM client ORDER BY date_added DESC");

        if (res.length === 0) {
            return { message: "No clients found", status: 404, data: [] };
        }

        return { data: res, status: 200 };
    } catch (err) {
        logger.error(`Model Error (Client.getAll): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

// Update: Modify Business Details (Admin updating a specific client)
Client.update = async (clientId, data) => {
    try {
        logger.debug(`Model: Updating business profile for clientId: ${clientId}`);

        const query = `
            UPDATE client 
            SET name = ?, business_name = ?, business_contact = ?, business_address = ?, business_tin = ?
            WHERE clientId = ?`;

        const [res] = await sql.query(query, [
            data.name,
            data.business_name,
            data.business_contact,
            data.business_address,
            data.business_tin,
            clientId
        ]);

        if (res.affectedRows === 0) {
            return { message: "Business profile not found or no changes made", status: 404 };
        }

        return { clientId: clientId, ...data, status: 200 };
    } catch (err) {
        logger.error(`Model Error (Client.update): ${err.message}`);
        throw { message: err.sqlMessage, status: 500 };
    }
};

export default Client;