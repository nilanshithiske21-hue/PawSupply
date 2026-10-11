# PawSupply storefront plan

## Current scope and serving architecture

Build **PawSupply**, a responsive pet-products storefront for a college project. The user approved separate shareable screens for Home, All goodies, Dogs, Cats, Birds, Smart Pet Tech, Market insights, receipt, and My orders. Animal collections show only their own products. The app uses semantic HTML, Tailwind CSS, vanilla JavaScript, and Vite.

The catalog, INR prices, and line-item calculation live in `shared/products.js`, shared by the browser and server so a client cannot alter its payable price. The existing numeric prices are **INR demo amounts for Stripe test checkout**. The user separately authorized real UPI transfers at those rupee amounts with **₹0 tax and free shipping**. Stripe remains sandbox/test-only while demo prices are in use; server code rejects live Stripe keys until production prices and policies are separately approved. The public UPI QR is a manual fallback: customers enter their UPI transaction reference and receive an **Awaiting verification** order acknowledgement; the app never treats a QR submission or return URL as proof of payment.

Platform-managed Stripe integration and the one-way managed MySQL capability are enabled with the user's explicit approval. Stripe Checkout Sessions are created server-side, use the stored customer identity, order/cart metadata, allow promotion codes, and return in a new tab. Signed webhook processing validates exact raw bytes, records event IDs idempotently, and marks an order paid only after verified, amount/currency-matched Stripe events. Card details remain entirely with Stripe. The MySQL schema stores only customer/contact/delivery details required for the requested order and receipt, order/line snapshots, Stripe identifiers, UPI reference, and event IDs/timestamps; it never stores raw webhook payloads or card details. The database is shared by development and publication.

Checkout collects name, phone, email, and India delivery address. The receipt route uses a random bearer token kept in that browser's local storage; receipt/order-history APIs return customer details only after token verification. My orders shows paid, pending, failed, and cancelled records held on the same browser. Stripe live payments stay blocked until real product pricing, tax/shipping policy, and secure live keys have been separately reviewed. The UPI order acknowledgement remains pending until the owner verifies the UTR outside the storefront; no merchant review dashboard is included.

## Design system

- **Movement:** Clean neo-futurist pet retail with a polished cartoon accent.
- **Principles:** Distinct page destinations; friendly but professional; clear product hierarchy; responsive, keyboard-ready controls and reduced-motion support.
- **Color:** Ice-blue surfaces and deep navy text keep browsing calm and readable; electric azure is the brand signature; lilac, sea-glass and warm yellow distinguish animal page illustrations without losing the blue-led identity.
- **Layout:** Asymmetric editorial Home hero, horizontal primary navigation, one dedicated category hero per pet collection, practical product cards and a full-width analytics destination.
- **Motifs:** Geometric paw/spark brand mark; orbit rings and small illustrated stickers; softly rounded category panels.
- **Motion:** Page transitions reset to the beginning, collection views reveal on entry, and cartoon accents drift gently; all motion respects `prefers-reduced-motion`.
- **Typography:** Space Grotesk headings paired with DM Sans body and interface text.
- **Brand:** PawSupply is a bright, caring and curious source of thoughtful pet essentials. Voice: clear and lightly witty; examples: “Good days, on paws.” and “Small upgrades, happier routines.”
- **Logo:** Custom geometric paw mark paired with a compact PawSupply wordmark.

## Project structure

- `index.html`: semantic shell, navigation, distinct view containers, checkout, receipts, order history, dialogs and cart.
- `shared/products.js`: single canonical product list, INR test prices, and shared calculation/formatting helpers.
- `src/app.js`: hash routing, page-specific content, catalog search, quick view, cart, payment UI, receipt/history views, analytics and scroll interactions.
- `src/input.css`: Tailwind entrypoint plus responsive brand, checkout and receipt styling and motion.
- `public/manus-routes.json`: root and all shareable hash-view route declarations; APIs are not page routes.
- `public/assets/`: bundled original hero and eight product WebP images, PawSupply mark, and the exact user-supplied UPI QR; images are local so the downloaded ZIP works without Preview storage.
- `server.js`: production static server, API dispatch, SPA fallback, health check, and exact raw Stripe webhook handling.
- `server/db.js`: repeatable managed-MySQL schema and minimal customer/order helpers.
- `server/payments.js`: Stripe session creation, UPI pending orders, signed event processing, receipt-token checks and order lookups.
- `dev.js`, `vite.config.js`: one preview listener with a local API sidecar and same-origin `/api` proxy for development.
- `Dockerfile`: pinned-toolchain install, production build, Stripe/MySQL runtime dependencies, and container entrypoint.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: pinned Vite/Tailwind/Stripe/MySQL toolchain and reviewed lifecycle-script policy.
- `README.md`, `.env.example`: local setup and payment safety notes; `.env.example` contains placeholders only.
- `dist/`: Vite production output copied into the final container image.

## Download and release status

The downloadable source archive should contain committed source, lockfile, setup notes, generated hero/product images, mark, and the user-provided UPI QR; exclude Git internals, installed dependencies, build output, and real credentials. Treat the included QR as a real payment destination if sharing the ZIP or publishing a public repository.

The Google Trends-style chart remains an explicitly illustrative comparison, not a live Google Trends export. Real Stripe checkout is currently in test mode; the owner must claim the sandbox and later use the secure Dashboard flow for live credentials. The user requested **Preview-only testing and no publication**: keep `publishing.auto_publish` off and do not publish. Before a future production release, reconnect the Stripe webhook to the production URL and use only separately authorized production credentials.
