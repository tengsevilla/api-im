import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import db from '../src/models/index.js';

// Fixed test fixtures — everything is keyed to this clientId and removed in afterAll
const TEST_CLIENT_ID = 'test-client-vitest-0001';
const DEV_USER = 'kennethbistado';
const DEV_PASS = 'DevLogin123!';
const DATE = '2026-07-18 12:00:00';

const REF_SALE = 'vitest-ref-sale-0001';
const REF_OVER = 'vitest-ref-over-0001';
const REF_RESTOCK = 'vitest-ref-restock-01';
const REF_SINGLE = 'vitest-ref-single-01';

let token;
let itemA; // starts at qty 50
let itemB; // starts at qty 50

const cleanup = async () => {
    await db.query('DELETE FROM transactions WHERE clientId = ?', [TEST_CLIENT_ID]);
    await db.query('DELETE FROM transaction_batches WHERE clientId = ?', [TEST_CLIENT_ID]);
    await db.query('DELETE FROM inventory WHERE clientId = ?', [TEST_CLIENT_ID]);
    await db.query('DELETE FROM inventoryhistory WHERE clientId = ?', [TEST_CLIENT_ID]);
    await db.query('DELETE FROM account WHERE clientId = ?', [TEST_CLIENT_ID]);
    await db.query('DELETE FROM client WHERE clientId = ?', [TEST_CLIENT_ID]);
};

const getQty = async (id) => {
    const [rows] = await db.query('SELECT qty FROM inventory WHERE id = ?', [id]);
    return rows[0]?.qty;
};

const countTrxRows = async (refId) => {
    const [[{ n }]] = await db.query(
        'SELECT COUNT(*) AS n FROM transactions WHERE transactionId = ? AND clientId = ?',
        [refId, TEST_CLIENT_ID]
    );
    return n;
};

const batchRowExists = async (refId) => {
    const [rows] = await db.query('SELECT refId FROM transaction_batches WHERE refId = ?', [refId]);
    return rows.length > 0;
};

const postBatch = (body) =>
    request(app)
        .post('/api/transactions/batch')
        .set('Authorization', `Bearer ${token}`)
        .set('clientid', TEST_CLIENT_ID)
        .send(body);

const saleBody = (overrides = {}) => ({
    event: 'sale',
    customerName: 'Vitest Customer',
    date: DATE,
    items: [{ id: itemA, qty: 1, price: 10 }],
    ...overrides,
});

beforeAll(async () => {
    await cleanup(); // clear leftovers from any previously crashed run

    // Dedicated test client + 2 inventory rows with known stock
    await db.query(
        `INSERT INTO client (clientId, name, business_name, business_contact, business_address, business_tin, entities)
         VALUES (?, 'Vitest Test Client', 'Vitest Biz', '0000000000', 'Test Address', '000-000-000', 'Vitest Biz')`,
        [TEST_CLIENT_ID]
    );
    const [resA] = await db.query(
        `INSERT INTO inventory (type, itemName, itemType, qty, sell, srp, clientId)
         VALUES ('part', 'Vitest Item A', 'test', 50, 10.00, 12.00, ?)`,
        [TEST_CLIENT_ID]
    );
    itemA = resA.insertId;
    const [resB] = await db.query(
        `INSERT INTO inventory (type, itemName, itemType, qty, sell, srp, clientId)
         VALUES ('part', 'Vitest Item B', 'test', 50, 20.00, 24.00, ?)`,
        [TEST_CLIENT_ID]
    );
    itemB = resB.insertId;

    // Real login — auth middleware only verifies the JWT; data scoping comes from the clientid header
    const loginRes = await request(app)
        .post('/api/account/login')
        .set('Authorization', 'Basic ' + Buffer.from(`${DEV_USER}:${DEV_PASS}`).toString('base64'))
        .send({ rememberMe: false });

    expect(loginRes.status).toBe(200);
    expect(typeof loginRes.body.expires_in).toBe('number');
    expect(loginRes.body.expires_in).toBe(64800); // 18h in seconds
    token = loginRes.body.access_token;
});

afterAll(async () => {
    await cleanup();
    await db.end();
});

describe('POST /api/transactions/batch', () => {
    it('1. valid sale decrements stock and logs transaction rows', async () => {
        const res = await postBatch(saleBody({
            refId: REF_SALE,
            items: [
                { id: itemA, qty: 5, price: 10 },
                { id: itemB, qty: 3, price: 20 },
            ],
        }));

        expect(res.status).toBe(200);
        expect(res.body.data.refId).toBe(REF_SALE);
        expect(await getQty(itemA)).toBe(45);
        expect(await getQty(itemB)).toBe(47);
        expect(await countTrxRows(REF_SALE)).toBe(2);
    });

    it('2. oversell returns 400 and rolls the whole batch back', async () => {
        const res = await postBatch(saleBody({
            refId: REF_OVER,
            items: [
                { id: itemA, qty: 1, price: 10 },     // would succeed alone
                { id: itemB, qty: 9999, price: 20 },  // oversell — must roll back both
            ],
        }));

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Insufficient stock');
        expect(await getQty(itemA)).toBe(45); // unchanged
        expect(await getQty(itemB)).toBe(47); // unchanged
        expect(await countTrxRows(REF_OVER)).toBe(0);
        expect(await batchRowExists(REF_OVER)).toBe(false); // rollback freed the key
    });

    it('3. replay with same refId returns duplicate:true and stock moved only once', async () => {
        const res = await postBatch(saleBody({
            refId: REF_SALE,
            items: [
                { id: itemA, qty: 5, price: 10 },
                { id: itemB, qty: 3, price: 20 },
            ],
        }));

        expect(res.status).toBe(200);
        expect(res.body.data.duplicate).toBe(true);
        expect(await getQty(itemA)).toBe(45); // moved once, not twice
        expect(await getQty(itemB)).toBe(47);
        expect(await countTrxRows(REF_SALE)).toBe(2);
    });

    it('4a. rejects qty 0', async () => {
        const res = await postBatch(saleBody({ items: [{ id: itemA, qty: 0, price: 10 }] }));
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('qty');
    });

    it('4b. rejects qty -5', async () => {
        const res = await postBatch(saleBody({ items: [{ id: itemA, qty: -5, price: 10 }] }));
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('qty');
    });

    it('4c. rejects non-numeric price', async () => {
        const res = await postBatch(saleBody({ items: [{ id: itemA, qty: 1, price: 'abc' }] }));
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('price');
    });

    it('4d. rejects invalid refId format', async () => {
        const res = await postBatch(saleBody({ refId: 'bad_ref!!' }));
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid refId');
        expect(await getQty(itemA)).toBe(45); // unchanged
    });

    it('5. restock increments stock', async () => {
        const res = await postBatch({
            event: 'restock',
            customerName: 'Supplier',
            date: DATE,
            refId: REF_RESTOCK,
            items: [{ id: itemA, qty: 10, price: 8 }],
        });

        expect(res.status).toBe(200);
        expect(await getQty(itemA)).toBe(55);
    });
});

describe('DELETE /api/transactions', () => {
    it('6. deleting a transaction group restores stock and removes the batches row', async () => {
        const res = await request(app)
            .delete(`/api/transactions/${REF_SALE}`)
            .set('Authorization', `Bearer ${token}`)
            .set('clientid', TEST_CLIENT_ID);

        expect(res.status).toBe(200);
        expect(await getQty(itemA)).toBe(60); // 55 + 5 restored
        expect(await getQty(itemB)).toBe(50); // 47 + 3 restored
        expect(await countTrxRows(REF_SALE)).toBe(0);
        expect(await batchRowExists(REF_SALE)).toBe(false);
    });

    it('7. deleting the last item row restores stock and removes the batches row', async () => {
        // Single-item sale so its one row is the "last row" of the receipt
        const saleRes = await postBatch(saleBody({
            refId: REF_SINGLE,
            items: [{ id: itemB, qty: 4, price: 20 }],
        }));
        expect(saleRes.status).toBe(200);
        expect(await getQty(itemB)).toBe(46);

        const [[row]] = await db.query(
            'SELECT id FROM transactions WHERE transactionId = ? AND clientId = ?',
            [REF_SINGLE, TEST_CLIENT_ID]
        );

        const res = await request(app)
            .delete(`/api/transactions/item/${row.id}`)
            .set('Authorization', `Bearer ${token}`)
            .set('clientid', TEST_CLIENT_ID);

        expect(res.status).toBe(200);
        expect(await getQty(itemB)).toBe(50); // restored
        expect(await countTrxRows(REF_SINGLE)).toBe(0);
        expect(await batchRowExists(REF_SINGLE)).toBe(false);
    });
});
