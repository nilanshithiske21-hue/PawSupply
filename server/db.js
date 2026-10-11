import mysql from "mysql2/promise";
import { createHash, timingSafeEqual } from "node:crypto";

let pool;
let schemaPromise;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("database_not_configured");
  if (!pool) {
    // The managed DATABASE_URL includes its required TLS query settings; pass the URI
    // intact so mysql2 applies the platform-provided SSL configuration.
    pool = mysql.createPool(process.env.DATABASE_URL);
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const database = getPool();
      await database.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id CHAR(36) NOT NULL,
          email VARCHAR(254) NOT NULL,
          full_name VARCHAR(120) NOT NULL,
          phone VARCHAR(24) NOT NULL,
          stripe_customer_id VARCHAR(255) NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY uq_customers_email (email),
          UNIQUE KEY uq_customers_stripe_id (stripe_customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await database.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id CHAR(36) NOT NULL,
          customer_id CHAR(36) NOT NULL,
          payment_method ENUM('stripe', 'upi') NOT NULL,
          status ENUM('checkout_created', 'processing', 'pending_verification', 'paid', 'payment_failed', 'cancelled', 'review_required') NOT NULL,
          currency CHAR(3) NOT NULL DEFAULT 'INR',
          subtotal_minor BIGINT UNSIGNED NOT NULL,
          tax_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
          shipping_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
          discount_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
          total_minor BIGINT UNSIGNED NOT NULL,
          line_items_json JSON NOT NULL,
          shipping_address_json JSON NOT NULL,
          upi_reference VARCHAR(80) NULL,
          stripe_session_id VARCHAR(255) NULL,
          stripe_payment_intent_id VARCHAR(255) NULL,
          stripe_customer_id VARCHAR(255) NULL,
          receipt_token_hash CHAR(64) NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          paid_at DATETIME(3) NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_orders_stripe_session (stripe_session_id),
          UNIQUE KEY uq_orders_payment_intent (stripe_payment_intent_id),
          KEY idx_orders_customer_created (customer_id, created_at),
          CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await database.query(`
        CREATE TABLE IF NOT EXISTS stripe_events (
          event_id VARCHAR(255) NOT NULL,
          event_type VARCHAR(120) NOT NULL,
          processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      return true;
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function pingDatabase() {
  await getPool().query("SELECT 1");
  return true;
}

export async function createCustomerAndOrder({ customer, order }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      "SELECT id, stripe_customer_id FROM customers WHERE email = ? LIMIT 1 FOR UPDATE",
      [customer.email],
    );
    let customerId;
    let stripeCustomerId = null;
    if (existingRows.length > 0) {
      customerId = existingRows[0].id;
      stripeCustomerId = existingRows[0].stripe_customer_id;
      await connection.execute(
        "UPDATE customers SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [customer.name, customer.phone, customerId],
      );
    } else {
      customerId = customer.id;
      await connection.execute(
        "INSERT INTO customers (id, email, full_name, phone) VALUES (?, ?, ?, ?)",
        [customerId, customer.email, customer.name, customer.phone],
      );
    }

    await connection.execute(
      `INSERT INTO orders (
        id, customer_id, payment_method, status, currency, subtotal_minor, tax_minor,
        shipping_minor, discount_minor, total_minor, line_items_json,
        shipping_address_json, upi_reference, receipt_token_hash
      ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        order.id,
        customerId,
        order.paymentMethod,
        order.status,
        order.subtotalMinor,
        order.taxMinor,
        order.shippingMinor,
        order.totalMinor,
        JSON.stringify(order.items),
        JSON.stringify(customer.address),
        order.upiReference || null,
        order.receiptTokenHash,
      ],
    );
    await connection.commit();
    return { customerId, stripeCustomerId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getCustomerById(customerId) {
  const [rows] = await getPool().execute(
    "SELECT id, email, full_name, phone, stripe_customer_id FROM customers WHERE id = ? LIMIT 1",
    [customerId],
  );
  return rows[0] || null;
}

export async function saveStripeCustomerId(customerId, stripeCustomerId) {
  await getPool().execute(
    "UPDATE customers SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
    [stripeCustomerId, customerId],
  );
}

export async function saveStripeSession(orderId, sessionId, stripeCustomerId) {
  await getPool().execute(
    "UPDATE orders SET stripe_session_id = ?, stripe_customer_id = ? WHERE id = ? AND payment_method = 'stripe'",
    [sessionId, stripeCustomerId, orderId],
  );
}

export async function updateOrderStatus(orderId, status) {
  await getPool().execute(
    "UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ('paid', 'review_required')",
    [status, orderId],
  );
}

export async function getOrderById(orderId) {
  const [rows] = await getPool().execute(
    `SELECT o.*, c.email AS customer_email, c.full_name AS customer_name, c.phone AS customer_phone
     FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
  return rows[0] || null;
}

export async function verifyReceiptToken(orderId, token) {
  const [rows] = await getPool().execute(
    "SELECT receipt_token_hash FROM orders WHERE id = ? LIMIT 1",
    [orderId],
  );
  if (!rows[0] || typeof token !== "string" || token.length < 30 || token.length > 100) return false;
  const expected = Buffer.from(rows[0].receipt_token_hash, "hex");
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
    schemaPromise = undefined;
  }
}
