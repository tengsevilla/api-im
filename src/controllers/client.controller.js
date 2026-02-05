import Client from "../models/client.model.js";
import logger from "../utils/logger.js";

// 1. Create a New Client (Superadmin)
export const create = async (req, res) => {
    logger.debug("Controller: Superadmin creating new client...");

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).send({ message: "Content cannot be empty!" });
    }

    try {
        const data = await Client.create(req.body);
        logger.info(`Controller: New Client created successfully [ID: ${data.clientId}]`);
        res.status(201).send(data);
    } catch (err) {
        logger.error(`Controller Error (Client.create): ${err.message}`);
        res.status(err.status || 500).send({ message: err.message || "Internal server error" });
    }
};

// 2. Get All Clients (Superadmin Dashboard)
export const getAll = async (req, res) => {
    logger.debug("Controller: Fetching all clients for Superadmin");

    try {
        const data = await Client.getAll();

        if (data.status === 404) {
            return res.status(200).send({ message: "No clients found", data: [] });
        }

        res.status(200).send(data);
    } catch (err) {
        logger.error(`Controller Error (Client.getAll): ${err.message}`);
        res.status(500).send({ message: "Internal server error" });
    }
};

// 3. Update Specific Client
export const update = async (req, res) => {
    const { clientId } = req.params;
    logger.debug(`Controller: Updating profile for Client ID: ${clientId}`);

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).send({ message: "Data to update can not be empty!" });
    }

    try {
        const data = await Client.update(clientId, req.body);
        res.status(data.status || 200).send(data);
    } catch (err) {
        logger.error(`Controller Error (Client.update): ${err.message}`);
        res.status(err.status || 500).send({ message: "Internal server error" });
    }
};