# PawSupply

A responsive pet-products storefront created for a college project. This archive includes the storefront, its Node API, the local image assets, the product catalog, and a locked dependency set.

## Included features

- Home, All goodies, Dogs, Cats, Birds, Smart Pet Tech, Market insights, My orders, and receipt views.
- Search, quick view, local cart, quantity changes, and INR totals.
- A MySQL-backed order/customer store, test-mode Stripe Checkout, signed Stripe webhook handling, and pending/manual UPI orders.
- Original hero and product WebP images plus the PawSupply mark and user-provided UPI QR in `public/assets/`.
- A Google Trends-style sample chart clearly labeled as illustrative (not live Google Trends data).

## Local requirements and setup

- Node.js `>=22.12.0` and pnpm `11.25.0`.
- A MySQL-compatible database, a Stripe **test-mode** secret key, and a Stripe test webhook signing secret. The managed Manus database and Stripe credentials are not included in this ZIP.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env with your own MySQL DSN and Stripe test credentials.
set -a
. ./.env
set +a
pnpm run dev
```

Open `http://localhost:3000`. The development command starts Vite on port `3000` and the API on port `3001`; Vite proxies `/api` requests to the API. The server creates the required MySQL tables additively on first start. If testing signed webhooks locally, forward Stripe test events to `http://localhost:3001/api/stripe/webhook` and put the Stripe CLI's test `whsec_...` value in `STRIPE_WEBHOOK_SECRET`.

Run checks and create a production build with:

```sh
pnpm run check
pnpm run build
```

For container hosting, the included `Dockerfile` builds the frontend and runs `server.js`; provide `DATABASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` securely at runtime. The app's `/healthz` endpoint reports ready only after database initialization and a successful database ping.

## Payment and sharing warnings

- Stripe Checkout is **test-only** with the current sample prices. The server rejects Stripe live-mode keys until production prices and tax/shipping policies are separately reviewed.
- **The included UPI QR is a real payment destination and can accept real money.** UPI orders stay **Awaiting verification** until the store owner verifies the transaction reference manually. There is no merchant review dashboard in this project.
- The UPI QR contains payment-recipient details. Treat the ZIP and QR as public if you upload them to a public GitHub repository or share them broadly; remove/replace the QR first if that is not intended.
- Customer contact/address data is stored in the configured MySQL database. Card details are entered on Stripe's hosted checkout page and are not collected by PawSupply.
- Do not commit a populated `.env` file. `.env.example` contains placeholders only.
- This source bundle does not itself publish the website. Configure production integrations and webhook URLs separately, and publish only when authorized.
