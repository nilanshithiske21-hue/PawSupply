import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import {
  calculateTotals,
  currency,
  productById,
} from "../shared/products.js";
import {
  createCustomerAndOrder,
  getCustomerById,
  getOrderById,
  getPool,
  saveStripeCustomerId,
  saveStripeSession,
  updateOrderStatus,
  verifyReceiptToken,
} from "./db.js";

const MAX_BODY_BYTES = 32 * 1024;
const allowedOrigins = new Set([
  "https://8328-ie3209vsozw50woujgegy-fc3519e4.sg2.manus.computer",
  "https://petnova-aw5hb6uk.manus.space",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  response.end(payload);
}

async function readRawBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError(413, "body_too_large", "Request is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const raw = await readRawBody(request);
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("bad_json_shape");
    return value;
  } catch {
    throw new ApiError(400, "invalid_json", "Please check the checkout details and try again.");
  }
}

function getStripe({ allowLive = false } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ApiError(503, "stripe_not_ready", "Secure card checkout is not ready yet.");
  if (!allowLive && key.startsWith("sk_live_")) {
    throw new ApiError(409, "live_payments_disabled", "Stripe live checkout is disabled while PawSupply is using demo/test pricing.");
  }
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
}

function safeOrigin(request, requestedOrigin) {
  const browserOrigin = request.headers.origin;
  const raw = typeof requestedOrigin === "string" ? requestedOrigin : browserOrigin;
  if (!raw || typeof raw !== "string") throw new ApiError(403, "origin_required", "Checkout must be opened from PawSupply.");
  let origin;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("invalid_origin");
    }
    origin = parsed.origin;
  } catch {
    throw new ApiError(403, "origin_invalid", "Checkout could not confirm the store address.");
  }
  if (!allowedOrigins.has(origin)) throw new ApiError(403, "origin_not_allowed", "Checkout could not confirm the store address.");
  if (browserOrigin && browserOrigin !== origin) throw new ApiError(403, "origin_mismatch", "Checkout could not confirm the store address.");
  return origin;
}

function normalizeCustomer(input) {
  if (!input || typeof input !== "object") throw new ApiError(400, "customer_missing", "Enter your delivery and contact details.");
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").trim().replace(/[\s()-]/g, "");
  const addressInput = input.address && typeof input.address === "object" ? input.address : {};
  const address = {
    line1: String(addressInput.line1 || "").trim(),
    line2: String(addressInput.line2 || "").trim(),
    city: String(addressInput.city || "").trim(),
    state: String(addressInput.state || "").trim(),
    postalCode: String(addressInput.postalCode || "").trim(),
    country: "IN",
  };
  if (name.length < 2 || name.length > 120) throw new ApiError(400, "name_invalid", "Enter a name between 2 and 120 characters.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "email_invalid", "Enter a valid email address.");
  if (!/^\+?\d{10,15}$/.test(phone)) throw new ApiError(400, "phone_invalid", "Enter a valid phone number, including country code if needed.");
  if (address.line1.length < 4 || address.line1.length > 180 || address.line2.length > 180) throw new ApiError(400, "address_invalid", "Enter a valid delivery address.");
  if (address.city.length < 2 || address.city.length > 100 || address.state.length < 2 || address.state.length > 100) throw new ApiError(400, "region_invalid", "Enter a valid city and state.");
  if (!/^\d{6}$/.test(address.postalCode)) throw new ApiError(400, "postal_invalid", "Enter a valid six-digit India PIN code.");
  return { id: randomUUID(), name, email, phone, address };
}

function normalizeCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) throw new ApiError(400, "cart_invalid", "Your bag is empty or invalid.");
  try {
    return calculateTotals(input);
  } catch {
    throw new ApiError(400, "cart_invalid", "Your bag contains an invalid item or quantity.");
  }
}

function createReceiptToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createStripeCustomer(stripe, customerRecord, customer) {
  const stripePayload = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: {
      line1: customer.address.line1,
      ...(customer.address.line2 ? { line2: customer.address.line2 } : {}),
      city: customer.address.city,
      state: customer.address.state,
      postal_code: customer.address.postalCode,
      country: "IN",
    },
    metadata: { user_id: customerRecord.id },
  };
  if (customerRecord.stripe_customer_id) {
    return stripe.customers.update(customerRecord.stripe_customer_id, stripePayload);
  }
  const stripeCustomer = await stripe.customers.create(stripePayload, {
    idempotencyKey: `pawsupply-customer-${customerRecord.id}`,
  });
  await saveStripeCustomerId(customerRecord.id, stripeCustomer.id);
  return stripeCustomer;
}

async function createStripeCheckout(request, response) {
  const body = await readJsonBody(request);
  const customer = normalizeCustomer(body.customer);
  const totals = normalizeCart(body.cart);
  const origin = safeOrigin(request, body.origin);
  const orderId = randomUUID();
  const receiptToken = createReceiptToken();
  const receiptTokenHash = hashToken(receiptToken);
  const customerRecord = await createCustomerAndOrder({
    customer,
    order: {
      id: orderId,
      paymentMethod: "stripe",
      status: "checkout_created",
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      shippingMinor: totals.shippingMinor,
      totalMinor: totals.totalMinor,
      items: totals.items,
      receiptTokenHash,
    },
  });

  try {
    const stripe = getStripe();
    const stripeCustomer = await createStripeCustomer(stripe, {
      id: customerRecord.customerId,
      stripe_customer_id: customerRecord.stripeCustomerId,
    }, customer);
    const metadata = {
      order_id: orderId,
      user_id: customerRecord.customerId,
      customer_email: customer.email,
      customer_name: customer.name,
    };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomer.id,
      client_reference_id: customerRecord.customerId,
      line_items: totals.items.map((item) => {
        const product = productById.get(item.id);
        return {
          price_data: {
            currency,
            unit_amount: item.unitPriceMinor,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
          quantity: item.quantity,
        };
      }),
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/?order_id=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}#/receipt`,
      cancel_url: `${origin}/#/shop?payment=cancelled&order_id=${encodeURIComponent(orderId)}`,
    }, { idempotencyKey: `pawsupply-checkout-${orderId}` });
    if (!session.url) throw new Error("checkout_url_missing");
    await saveStripeSession(orderId, session.id, stripeCustomer.id);
    sendJson(response, 201, {
      orderId,
      receiptToken,
      checkoutUrl: session.url,
      status: "checkout_created",
    });
  } catch (error) {
    await updateOrderStatus(orderId, "payment_failed").catch(() => {});
    if (error instanceof ApiError) throw error;
    console.error("[payments] Stripe Checkout session could not be created", error?.type || error?.code || "stripe_error");
    throw new ApiError(502, "stripe_checkout_failed", "Stripe could not start checkout. Please check your details and try again.");
  }
}

async function createUpiOrder(request, response) {
  const body = await readJsonBody(request);
  safeOrigin(request, body.origin);
  const customer = normalizeCustomer(body.customer);
  const totals = normalizeCart(body.cart);
  const reference = String(body.upiReference || "").trim();
  if (!/^[A-Za-z0-9-]{6,40}$/.test(reference)) {
    throw new ApiError(400, "upi_reference_invalid", "Enter the UPI transaction reference from your payment app.");
  }
  const orderId = randomUUID();
  const receiptToken = createReceiptToken();
  await createCustomerAndOrder({
    customer,
    order: {
      id: orderId,
      paymentMethod: "upi",
      status: "pending_verification",
      subtotalMinor: totals.subtotalMinor,
      taxMinor: 0,
      shippingMinor: 0,
      totalMinor: totals.subtotalMinor,
      items: totals.items,
      receiptTokenHash: hashToken(receiptToken),
      upiReference: reference,
    },
  });
  sendJson(response, 201, { orderId, receiptToken, status: "pending_verification" });
}

function safeJson(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return value ?? [];
}

function orderDto(row) {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.payment_method,
    currency: row.currency,
    subtotalMinor: Number(row.subtotal_minor),
    taxMinor: Number(row.tax_minor),
    shippingMinor: Number(row.shipping_minor),
    discountMinor: Number(row.discount_minor),
    totalMinor: Number(row.total_minor),
    items: safeJson(row.line_items_json),
    shippingAddress: safeJson(row.shipping_address_json),
    upiReference: row.payment_method === "upi" ? row.upi_reference : null,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    paidAt: row.paid_at ? (row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at)) : null,
  };
}

function bearerToken(request) {
  const value = request.headers.authorization || "";
  const match = value.match(/^Bearer ([A-Za-z0-9_-]{30,100})$/);
  return match?.[1] || "";
}

function tokenMatches(expectedHash, token) {
  if (!expectedHash || !token) return false;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getAuthorizedOrder(orderId, token) {
  const row = await getOrderById(orderId);
  if (!row || !tokenMatches(row.receipt_token_hash, token)) return null;
  return row;
}

async function sendReceipt(request, response, orderId) {
  const row = await getAuthorizedOrder(orderId, bearerToken(request));
  if (!row) throw new ApiError(404, "order_not_found", "Order not found on this device.");
  sendJson(response, 200, { order: orderDto(row) });
}

async function lookupOrders(request, response) {
  const body = await readJsonBody(request);
  const entries = Array.isArray(body.orders) ? body.orders.slice(0, 20) : [];
  const authorized = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || typeof entry.token !== "string") continue;
    const row = await getAuthorizedOrder(entry.id, entry.token);
    if (row) authorized.push(orderDto(row));
  }
  sendJson(response, 200, { orders: authorized });
}

async function cancelOrder(request, response) {
  const body = await readJsonBody(request);
  if (typeof body.orderId !== "string") throw new ApiError(400, "order_id_invalid", "Order not found.");
  const row = await getAuthorizedOrder(body.orderId, bearerToken(request));
  if (!row) throw new ApiError(404, "order_not_found", "Order not found on this device.");
  await getPool().execute(
    "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN ('checkout_created', 'processing')",
    [row.id],
  );
  sendJson(response, 200, { ok: true });
}

async function applyPaymentEvent(connection, event) {
  const object = event.data?.object || {};
  let orderId = object.metadata?.order_id;
  if (event.type === "checkout.session.completed" && object.payment_status !== "paid") {
    if (orderId) {
      await connection.execute("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'checkout_created'", [orderId]);
    }
    return;
  }
  if (!orderId || !["checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed"].includes(event.type)) return;
  const [rows] = await connection.execute("SELECT id, payment_method, currency, subtotal_minor, status FROM orders WHERE id = ? LIMIT 1 FOR UPDATE", [orderId]);
  const order = rows[0];
  if (!order || order.payment_method !== "stripe") return;

  if (event.type === "payment_intent.payment_failed") {
    await connection.execute(
      "UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status NOT IN ('paid', 'review_required', 'cancelled')",
      [orderId],
    );
    return;
  }

  const amount = event.type === "checkout.session.completed" ? object.amount_total : (object.amount_received || object.amount);
  const eventCurrency = String(object.currency || "").toLowerCase();
  const subtotalMinor = Number(order.subtotal_minor);
  if (!Number.isSafeInteger(amount) || eventCurrency !== currency || amount < 0 || amount > subtotalMinor) {
    await connection.execute("UPDATE orders SET status = 'review_required' WHERE id = ? AND status <> 'paid'", [orderId]);
    return;
  }
  const intentId = typeof object.payment_intent === "string" ? object.payment_intent : object.id;
  const sessionId = event.type === "checkout.session.completed" ? object.id : null;
  await connection.execute(
    `UPDATE orders SET status = 'paid', total_minor = ?, discount_minor = ?,
      stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
      stripe_session_id = COALESCE(?, stripe_session_id), paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP(3))
     WHERE id = ? AND payment_method = 'stripe'`,
    [amount, subtotalMinor - amount, intentId, sessionId, orderId],
  );
}

async function handleStripeWebhook(request, response) {
  const rawBody = await readRawBody(request);
  const signature = request.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || typeof signature !== "string") throw new ApiError(400, "webhook_not_configured", "Webhook signature could not be verified.");
  let event;
  try {
    event = getStripe({ allowLive: true }).webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    throw new ApiError(400, "webhook_signature_invalid", "Webhook signature could not be verified.");
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [insert] = await connection.execute(
      "INSERT IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)",
      [event.id, event.type],
    );
    if (insert.affectedRows === 0) {
      await connection.commit();
      sendJson(response, 200, { received: true, duplicate: true });
      return;
    }
    await applyPaymentEvent(connection, event);
    await connection.commit();
    sendJson(response, 200, { received: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function methodNotAllowed(response, allow) {
  response.setHeader("Allow", allow);
  sendJson(response, 405, { error: "method_not_allowed" });
}

export async function handleApiRequest(request, response) {
  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(response, 400, { error: "bad_request" });
    return true;
  }
  if (!pathname.startsWith("/api/")) return false;

  try {
    if (pathname === "/api/stripe/webhook") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      await handleStripeWebhook(request, response);
      return true;
    }
    if (pathname === "/api/checkout/stripe") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      await createStripeCheckout(request, response);
      return true;
    }
    if (pathname === "/api/checkout/upi") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      await createUpiOrder(request, response);
      return true;
    }
    if (pathname === "/api/orders/lookup") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      await lookupOrders(request, response);
      return true;
    }
    if (pathname === "/api/orders/cancel") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      await cancelOrder(request, response);
      return true;
    }
    const orderMatch = pathname.match(/^\/api\/orders\/([0-9a-f-]{36})$/i);
    if (orderMatch) {
      if (request.method !== "GET") return methodNotAllowed(response, "GET");
      await sendReceipt(request, response, orderMatch[1]);
      return true;
    }
    sendJson(response, 404, { error: "api_route_not_found" });
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.status, { error: error.code, message: error.message });
      return true;
    }
    console.error("[api] request failed", error?.code || error?.type || "internal_error");
    sendJson(response, 500, { error: "internal_error", message: "Something went wrong. Please try again." });
    return true;
  }
}
