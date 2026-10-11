# PawSupply implementation outcomes

## 1. Home and collection navigation
- Create a fully functional, responsive, single-page e-commerce web application for a Pet Products Store named **PawSupply** using **HTML, Tailwind CSS, and Vanilla JavaScript (or React)**.
- Home, All goodies, Dogs, Cats, Birds, Smart Pet Tech, Market insights, My orders, and order receipt are distinct in-app views; navigation changes the visible page content and shareable hash route.
- Clicking **Home** restores the PawSupply homepage. Clicking **Dogs**, **Cats**, or **Birds** opens that animal's own collection and shows only products for that animal. Clicking **Smart Pet Tech** opens its own view and shows only Smart Pet Tech products.
- Keep brand, search, and interactive cart badge available across views, with responsive and touch-friendly navigation.

## 2. Home hero, visual style, and scrolling
- Provide a modern promotional home hero with featured deals and CTA buttons, plus featured products and category entry points.
- Preserve the futuristic blue direction with polished cartoon-inspired shapes/illustrations and friendly personality; make the interface feel more professional through clear hierarchy, spacing, and legible controls.
- Add smooth scrolling and restrained page/section motion; respect reduced-motion preferences.

## 3. Catalog, filters, and product quick view
- Provide product cards with image, title, category, price, star rating, Quick View modal, and Add to Cart functionality.
- Support Dogs, Cats, Birds, and Smart Pet Tech collections and a real-time product search.
- Each collection view must render only its matching products; all products remain available in All goodies. Quick View shows product details and add-to-cart, and adding updates the cart badge and cart contents.
- The shared product module is the sole source for catalog titles and integer rupee amounts; the server ignores browser-supplied prices and recomputes payment totals.

## 4. Google Trends-style market analytics
- Include a multi-series visual graph comparing search interest over time for Dog Food, Smart Feeder, and Grooming.
- Include analytical insights and clearly distinguish illustrative/sample chart values from live Google Trends data when the chart is not connected to a live source.
- Keep the chart responsive and provide a readable accessible summary and a link to Google Trends.

## 5. Cart, details, and order storage
- Provide an interactive slide-out cart with quantity modification, item removal, dynamic subtotal, ₹0 demo tax, and free shipping.
- Collect customer **name, phone number, email, and India shipping address** before checkout; show that these are used for delivery and the requested order/receipt, and store the minimum needed order/customer data in the managed database.
- Keep customer/card information out of browser payment code and logs; never store a card number, security code, expiry date, raw Stripe webhook payload, or payment/client secret as an application order record.
- Share one managed MySQL database between Preview/development and the published container; initialize schema repeatably and additively.

## 6. Stripe test checkout and verified receipt
- Create one-time Stripe Checkout Sessions on the server with the platform-managed **test** key; use the canonical INR product prices, order/cart metadata tied to a stored guest customer identity, and `allow_promotion_codes: true`.
- Open the Stripe-hosted checkout in a new browser tab and explain that the current Checkout integration is in test mode. The current numeric rupee catalog amounts are authorized for test/demo only; reject Stripe live keys until live pricing and business policies are reviewed.
- Build success and cancel URLs from the allowlisted browser-visible origin, never from a guessed/internal request host. Preserve cancel state separately; neither redirect parameters nor client claims mark an order paid.
- Implement `POST /api/stripe/webhook` using the exact raw request bytes and `STRIPE_WEBHOOK_SECRET`; support the registered `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and subscription lifecycle event types.
- Persist Stripe event IDs/timestamps before acknowledging and make redelivery idempotent; verify amount and INR currency against the server order before marking paid. Acknowledge registered subscription events that the one-time store does not otherwise process.
- Generate a paid receipt only from stored webhook-confirmed payment state. Keep still-processing returns, cancellation, payment failure, and amount mismatch distinct. Let the customer print/save the verified receipt.

## 7. Manual UPI fallback and pending verification
- Show the user's supplied UPI QR as a customer-visible alternative, preserve the image unchanged, and allow transfers using the current numeric item prices as rupees with **zero tax and free shipping**.
- Ask for the payer's UPI transaction reference and create a durable order marked **Awaiting verification**. A static QR is not automatically verifiable: do not mark a QR order paid or issue a paid receipt merely because the customer scanned the code, entered a reference, or returned to the store. Keep the pending acknowledgement clearly distinct from a Stripe-verified receipt.
- Provide the user's **My orders** page with date, amount, status and items for orders accessible through the same browser's receipt tokens; show paid, pending, failed and cancelled states separately.

## 8. Accessibility, security, and responsive polish
- Use a clean, modern, accessible UI with smooth micro-interactions and mobile responsiveness.
- Maintain keyboard-friendly controls, visible focus, appropriate dialog semantics, adequate contrast, and reduced-motion support.
- Validate customer, address, cart, UPI reference, allowed origin, and receipt bearer token server-side; return generic errors and never log submitted customer data or secrets.
- Provide a readiness endpoint that returns success only after database schema initialization and a database ping.

## 9. Container readiness — Preview only
- With existing `features.server: true` and user-approved `features.database: true`, provide a committed root Dockerfile and a complete `deploy` declaration.
- Install the pinned pnpm toolchain, lockfile and policy; compile the storefront; run the production Node server with Stripe/MySQL runtime packages; bind to `0.0.0.0:$PORT` (default `3000`); return unauthenticated success at `/healthz` after database readiness.
- Keep the current build **Preview-only** and `publishing.auto_publish` off. Do not publish until the user explicitly asks. If publication is authorized later, connect the Stripe webhook to the production URL using the approved secure deployment flow; do not copy development credentials into production.

## 10. Complete source ZIP
- Provide a downloadable ZIP of the complete current PawSupply source, including app and server code, lockfile, setup documentation, local hero/product imagery, brand mark, and the exact user-provided UPI QR.
- Exclude `.git`, `node_modules`, `dist`, local `.env` files, and all actual Stripe/database credentials or other secrets.
- Include setup notes that make the source locally understandable and clearly warn that the UPI QR can receive real money and UPI orders need manual verification.
