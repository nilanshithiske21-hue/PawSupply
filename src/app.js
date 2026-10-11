import {
  calculateTotals,
  formatMinor,
  formatMoney,
  productById,
  products,
} from "../shared/products.js";

const pageDetails = {
  dogs: { label: "Dogs", kicker: "DOGS · PLAY · WANDER", title: "For every", accent: "good dog.", description: "Walk-ready, nap-approved, and picked for the best friend who goes everywhere with you.", emoji: "🐕", sticker: "GOOD DOG\nENERGY", footnote: "FETCH A LITTLE JOY", theme: "dogs" },
  cats: { label: "Cats", kicker: "CATS · CLIMB · COZY", title: "For the", accent: "curious ones.", description: "Soft landings, clever play, and little details for the ruler of every sunny spot.", emoji: "🐈", sticker: "CATITUDE\nAPPROVED", footnote: "MADE FOR THE LOAF LIFE", theme: "cats" },
  birds: { label: "Birds", kicker: "BIRDS · PERCH · PLAY", title: "Little joys for", accent: "little wings.", description: "Bright, enriching finds to keep curious beaks busy and every perch feeling like home.", emoji: "🐦", sticker: "HAPPY\nCHIRPS", footnote: "A LITTLE ROOM TO FLUTTER", theme: "birds" },
  tech: { label: "Smart Pet Tech", kicker: "SMART PET TECH · EASY ROUTINES", title: "Smarter days.", accent: "Happier pets.", description: "Thoughtful tech for feeding, exploring, and making everyday pet care feel a little simpler.", emoji: "🤖", sticker: "CLEVER\nCOMPANION", footnote: "GOOD CARE, WITH A LITTLE TECH", theme: "tech" },
};
const pageHashes = {
  home: "#/home", shop: "#/shop", dogs: "#/dogs", cats: "#/cats", birds: "#/birds",
  tech: "#/smart-pet-tech", trends: "#/trends", orders: "#/orders", receipt: "#/receipt",
};
const validPages = new Set(Object.keys(pageHashes));
const featuredProductIds = ["comet-ball", "orbit-wand", "skyseed-trio", "halo-feeder"];
const trendSeries = [
  { id: "food", name: "Dog Food", color: "food", values: [43, 46, 45, 52, 50, 56, 58, 57, 64, 61, 70, 75] },
  { id: "feeder", name: "Smart Feeder", color: "feeder", values: [17, 19, 20, 24, 22, 29, 34, 32, 44, 42, 55, 62] },
  { id: "grooming", name: "Grooming", color: "grooming", values: [30, 35, 31, 39, 35, 33, 43, 39, 48, 43, 47, 53] },
];
const weekLabels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];
const CART_STORAGE_KEY = "pawsupply-demo-cart-v1";
const RECEIPTS_STORAGE_KEY = "pawsupply-order-access-v1";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const productGrid = document.querySelector("#product-grid");
const emptyResults = document.querySelector("#empty-results");
const resultsCount = document.querySelector("#results-count");
const searchInput = document.querySelector("#site-search");
const cartDrawer = document.querySelector("#cart-drawer");
const cartBackdrop = document.querySelector("#cart-backdrop");
const cartContent = document.querySelector("#cart-content");
const cartSummary = document.querySelector("#cart-summary");
const cartCount = document.querySelector("#cart-count");
const quickViewDialog = document.querySelector("#quick-view-dialog");
const quickViewContent = document.querySelector("#quick-view-content");
const checkoutDialog = document.querySelector("#checkout-dialog");
const checkoutContent = document.querySelector("#checkout-content");
const toastRegion = document.querySelector("#toast-region");
const homeHero = document.querySelector("#home-hero");
const homeCategories = document.querySelector("#home-categories");
const categoryPage = document.querySelector("#category-page");
const categoryHeroPanel = document.querySelector("#category-hero-panel");
const catalogSection = document.querySelector("#featured");
const analyticsSection = document.querySelector("#analytics");
const closingNote = document.querySelector("#closing-note");
const filterRow = document.querySelector("#filter-row");
const ordersView = document.querySelector("#orders-view");
const ordersContent = document.querySelector("#orders-content");
const receiptView = document.querySelector("#receipt-view");
const receiptContent = document.querySelector("#receipt-content");
const catalogTitleMain = document.querySelector("#catalog-title-main");
const catalogTitleAccent = document.querySelector("#catalog-title-accent");
const catalogEyebrow = document.querySelector("#catalog-eyebrow");
const catalogDescription = document.querySelector("#catalog-description");

let activePage = getPageFromLocation();
let searchTerm = "";
let cart = readCart();
let toastTimer;
let cartOpener = null;
let checkoutOpener = null;
let revealObserver = null;
let receiptRequestVersion = 0;
let ordersRequestVersion = 0;
let lastCancellationOrderId = "";

function getPageFromLocation() {
  const route = window.location.hash.match(/^#\/([^?]*)/)?.[1];
  if (!route || route === "home") return "home";
  if (route === "smart-pet-tech") return "tech";
  return validPages.has(route) ? route : "home";
}

function getRouteParams() {
  const params = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.split("?").slice(1).join("?");
  for (const [key, value] of new URLSearchParams(hashQuery)) params.set(key, value);
  return params;
}

function navigateTo(page, options = {}) {
  if (!validPages.has(page)) return;
  const { afterScroll = null, replace = false, preserveSearch = false } = options;
  activePage = page;
  if (!preserveSearch) {
    searchTerm = "";
    searchInput.value = "";
  }
  const nextHash = pageHashes[page];
  if (replace) window.history.replaceState({ page }, "", nextHash);
  else if (window.location.hash !== nextHash) window.history.pushState({ page }, "", nextHash);
  renderPage();
  requestAnimationFrame(() => {
    if (afterScroll) {
      document.querySelector(afterScroll)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
  });
  if (page === "orders") void loadOrders();
  if (page === "receipt") void loadReceipt(getRouteParams().get("order_id"));
}

function syncPageFromLocation() {
  const nextPage = getPageFromLocation();
  if (nextPage === activePage) return;
  activePage = nextPage;
  searchTerm = "";
  searchInput.value = "";
  renderPage();
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  if (nextPage === "orders") void loadOrders();
  if (nextPage === "receipt") void loadReceipt(getRouteParams().get("order_id"));
  if (nextPage === "shop") void processCancellationReturn();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((line) => productById.has(line.id) && Number.isInteger(line.quantity) && line.quantity > 0)
      .map((line) => ({ id: line.id, quantity: Math.min(line.quantity, 99) }));
  } catch {
    return [];
  }
}

function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }
  catch { showToast("Your browser couldn't save the bag for next time."); }
}

function canSaveReceiptAccess() {
  try {
    localStorage.setItem("pawsupply-storage-check", "1");
    localStorage.removeItem("pawsupply-storage-check");
    return true;
  } catch {
    return false;
  }
}

function readStoredOrders() {
  try {
    const value = JSON.parse(localStorage.getItem(RECEIPTS_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.token === "string");
  } catch {
    return [];
  }
}

function rememberOrder(id, token) {
  const existing = readStoredOrders().filter((entry) => entry.id !== id);
  const next = [{ id, token, savedAt: new Date().toISOString() }, ...existing].slice(0, 20);
  localStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(next));
}

function tokenForOrder(id) {
  return readStoredOrders().find((entry) => entry.id === id)?.token || "";
}

function productCard(product) {
  return `
    <article class="product-card reveal is-visible" data-product-card="${escapeHTML(product.id)}">
      <div class="product-media">
        <span class="product-badge">${escapeHTML(product.badge)}</span>
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.imageAlt)}" loading="lazy" />
        <button class="quick-view-button" type="button" data-quick-view="${escapeHTML(product.id)}" aria-label="Quick view ${escapeHTML(product.name)}">Quick view <span aria-hidden="true">↗</span></button>
      </div>
      <div class="product-card-copy">
        <div class="product-meta"><span class="product-category">${escapeHTML(product.categoryLabel)}</span><span class="product-rating" aria-label="Rated ${product.rating.toFixed(1)} out of 5 stars"><span aria-hidden="true">★</span> ${product.rating.toFixed(1)}</span></div>
        <h3>${escapeHTML(product.name)}</h3>
        <div class="product-card-bottom"><span class="product-price">${formatMoney(product.price)}</span><button class="add-to-cart-button" type="button" data-add-to-cart="${escapeHTML(product.id)}"><span aria-hidden="true">＋</span> Add to bag</button></div>
      </div>
    </article>`;
}

function renderProducts() {
  const query = searchTerm.trim().toLowerCase();
  let source = [];
  const category = pageDetails[activePage];
  if (activePage === "home" && !query) source = featuredProductIds.map((id) => productById.get(id));
  else if (category) source = products.filter((product) => product.category === activePage);
  else if (activePage === "shop" || (activePage === "home" && query)) source = products;

  const visibleProducts = source.filter((product) => {
    const haystack = `${product.name} ${product.categoryLabel} ${product.description} ${product.tags}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  productGrid.innerHTML = visibleProducts.map(productCard).join("");
  emptyResults.hidden = visibleProducts.length > 0 || catalogSection.hidden;
  if (query) resultsCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "find" : "finds"} for “${searchInput.value.trim()}”`;
  else if (activePage === "home") resultsCount.textContent = "Showing 4 featured finds";
  else if (category) resultsCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "goodie" : "goodies"} for ${category.label.toLowerCase()}`;
  else resultsCount.textContent = `Showing ${visibleProducts.length} hand-picked finds`;
  document.querySelector("#all-count").textContent = String(products.length);
  document.querySelector("#catalog-bottom-link").hidden = activePage !== "home" || Boolean(query);
}

function renderPage() {
  const isHome = activePage === "home";
  const isTrends = activePage === "trends";
  const isOrders = activePage === "orders";
  const isReceipt = activePage === "receipt";
  const category = pageDetails[activePage];
  const hasCatalog = !isTrends && !isOrders && !isReceipt;
  homeHero.hidden = !isHome;
  homeCategories.hidden = !isHome;
  categoryPage.hidden = !category;
  catalogSection.hidden = !hasCatalog;
  analyticsSection.hidden = !isHome && !isTrends;
  analyticsSection.classList.toggle("is-full-page", isTrends);
  closingNote.hidden = isTrends || isOrders || isReceipt;
  ordersView.hidden = !isOrders;
  receiptView.hidden = !isReceipt;
  filterRow.hidden = activePage !== "shop";

  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isActive = link.dataset.page === activePage;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (category) {
    categoryHeroPanel.dataset.categoryTheme = category.theme;
    document.querySelector("#category-breadcrumb-current").textContent = category.label;
    document.querySelector("#category-hero-kicker").textContent = category.kicker;
    document.querySelector("#category-page-title").innerHTML = `${escapeHTML(category.title)}<br /><span>${escapeHTML(category.accent)}</span>`;
    document.querySelector("#category-page-description").textContent = category.description;
    document.querySelector("#category-hero-emoji").textContent = category.emoji;
    document.querySelector("#category-hero-sticker").textContent = category.sticker;
    document.querySelector("#category-hero-footnote").textContent = category.footnote;
    catalogEyebrow.textContent = `${category.label.toUpperCase()} COLLECTION`;
    catalogTitleMain.textContent = "Picked for";
    catalogTitleAccent.textContent = `${category.label.toLowerCase()}.`;
    catalogDescription.textContent = category.description;
    document.title = `${category.label} goodies | PawSupply`;
  } else if (activePage === "shop") {
    catalogEyebrow.textContent = "THE FULL PAWSUPPLY EDIT";
    catalogTitleMain.textContent = "All the good";
    catalogTitleAccent.textContent = "stuff.";
    catalogDescription.textContent = "A little something for every kind of companion, from first zoomies to their favorite nap spot.";
    document.title = "All goodies | PawSupply";
  } else if (isTrends) {
    document.title = "Market insights | PawSupply";
  } else if (isOrders) {
    document.title = "My orders | PawSupply";
  } else if (isReceipt) {
    document.title = "Order receipt | PawSupply";
  } else {
    catalogEyebrow.textContent = searchTerm ? "PAWSUPPLY SEARCH" : "THE PAWSUPPLY SHORTLIST";
    catalogTitleMain.textContent = searchTerm ? "Search for" : "Small things.";
    catalogTitleAccent.textContent = searchTerm ? `“${searchInput.value.trim()}”` : "Big tail wags.";
    catalogDescription.textContent = searchTerm ? "Matching finds from every corner of the PawSupply shop." : "Well-picked pieces for play, comfort, and the little routines that make their day.";
    document.title = "PawSupply — Good days, on paws.";
  }
  renderProducts();
  setupReveal();
}

function getCartQuantity() {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

function getSubtotal() {
  return cart.reduce((total, line) => total + productById.get(line.id).price * line.quantity, 0);
}

function renderCart() {
  const count = getCartQuantity();
  const subtotal = getSubtotal();
  cartCount.textContent = String(count);
  document.querySelector("#open-cart").setAttribute("aria-label", `Open shopping cart, ${count} ${count === 1 ? "item" : "items"}`);
  document.querySelector("#cart-title-count").textContent = `(${count})`;

  if (count === 0) {
    cartContent.innerHTML = `<div class="cart-empty"><span class="cart-empty-icon" aria-hidden="true">✳</span><h3>Your bag is taking a nap.</h3><p>Let's find a little something for their next good day.</p><button class="button button-primary" type="button" data-page="shop" data-close-and-shop>Explore the goodies <span aria-hidden="true">↗</span></button></div>`;
    cartSummary.innerHTML = "";
    return;
  }

  cartContent.innerHTML = `${cart.map((line) => {
    const product = productById.get(line.id);
    return `<article class="cart-line" data-cart-line="${escapeHTML(product.id)}"><div class="cart-line-image"><img src="${escapeHTML(product.image)}" alt="" loading="lazy" /></div><div class="cart-line-info"><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.categoryLabel)}</p><div class="quantity-control" aria-label="Quantity for ${escapeHTML(product.name)}"><button type="button" data-quantity-change="-1" data-id="${escapeHTML(product.id)}" aria-label="Decrease ${escapeHTML(product.name)} quantity">−</button><span aria-live="polite">${line.quantity}</span><button type="button" data-quantity-change="1" data-id="${escapeHTML(product.id)}" aria-label="Increase ${escapeHTML(product.name)} quantity">＋</button></div></div><div class="cart-line-end"><span class="cart-line-price">${formatMoney(product.price * line.quantity)}</span><button class="remove-line" type="button" data-remove-line="${escapeHTML(product.id)}">Remove</button></div></article>`;
  }).join("")}<div class="shipping-note">Free shipping on every order · Tax ₹0 for this project checkout.</div>`;

  cartSummary.innerHTML = `<div class="summary-row"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div><div class="summary-row"><span>Tax</span><strong>${formatMoney(0)}</strong></div><div class="summary-row"><span>Shipping</span><strong>Free</strong></div><div class="summary-row total"><span>Order total</span><strong>${formatMoney(subtotal)}</strong></div><p class="summary-caption">Prices are in INR. Stripe is test-only; UPI is a real transfer and stays pending until manual verification.</p><button class="button button-primary checkout-button" type="button" id="start-checkout">Continue to checkout <span aria-hidden="true">↗</span></button>`;
}

function addToCart(id, quantity = 1) {
  if (!productById.has(id)) return;
  const existing = cart.find((line) => line.id === id);
  if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
  else cart.push({ id, quantity });
  saveCart();
  renderCart();
  cartCount.classList.remove("bump");
  void cartCount.offsetWidth;
  cartCount.classList.add("bump");
  showToast(`${productById.get(id).name} added to your bag.`);
}

function changeQuantity(id, delta) {
  const line = cart.find((item) => item.id === id);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity <= 0) cart = cart.filter((item) => item.id !== id);
  if (line.quantity > 99) line.quantity = 99;
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter((line) => line.id !== id);
  saveCart();
  renderCart();
  showToast("Item removed from your bag.");
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
}

function showQuickView(id) {
  const product = productById.get(id);
  if (!product) return;
  quickViewContent.innerHTML = `<button class="icon-button dialog-close" type="button" data-close-dialog aria-label="Close quick view">×</button><div class="quick-view-layout"><div class="quick-view-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.imageAlt)}" /></div><div class="quick-view-info"><p class="eyebrow">${escapeHTML(product.categoryLabel)} <span aria-hidden="true">·</span> ${product.rating.toFixed(1)} ★</p><h2 id="quick-view-title">${escapeHTML(product.name)}</h2><p>${escapeHTML(product.description)}</p><div class="quick-view-price">${formatMoney(product.price)}</div><button class="add-to-cart-button" type="button" data-add-to-cart="${escapeHTML(product.id)}"><span aria-hidden="true">＋</span> Add to bag</button></div></div>`;
  quickViewDialog.showModal();
}

function openCart() {
  cartOpener = document.activeElement;
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartDrawer.inert = false;
  cartBackdrop.hidden = false;
  requestAnimationFrame(() => cartBackdrop.classList.add("is-visible"));
  document.body.classList.add("drawer-open");
  document.querySelector("#close-cart").focus();
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartDrawer.inert = true;
  cartBackdrop.classList.remove("is-visible");
  document.body.classList.remove("drawer-open");
  window.setTimeout(() => { cartBackdrop.hidden = true; }, reducedMotion ? 0 : 290);
  cartOpener?.focus();
  cartOpener = null;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastRegion.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.append(toast);
  toastTimer = window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 3400);
}

function openCheckout() {
  if (cart.length === 0) { showToast("Your bag is empty — find a goodie first."); return; }
  if (!canSaveReceiptAccess()) {
    showToast("Enable browser storage to save your private order receipt before checking out.");
    return;
  }
  closeCart();
  checkoutOpener = document.activeElement;
  const total = getSubtotal();
  const count = getCartQuantity();
  checkoutContent.innerHTML = `
    <button class="icon-button dialog-close" type="button" data-close-dialog aria-label="Close checkout">×</button>
    <p class="checkout-kicker">A happier routine is close</p>
    <h2 class="checkout-title" id="checkout-title">Your checkout</h2>
    <p class="checkout-note"><strong>Prices are in INR; tax is ₹0 and shipping is free.</strong> Stripe uses the test account, so test-card payments do not charge you. UPI transfers use your QR and can move real money; UPI orders stay pending until the store owner verifies the reference.</p>
    <form class="checkout-form" id="checkout-form" autocomplete="on">
      <div class="form-field field-wide"><label for="checkout-name">Full name</label><input id="checkout-name" name="name" autocomplete="name" maxlength="120" required /></div>
      <div class="form-field"><label for="checkout-email">Email</label><input id="checkout-email" name="email" type="email" autocomplete="email" maxlength="254" required /></div>
      <div class="form-field"><label for="checkout-phone">Phone number</label><input id="checkout-phone" name="phone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" maxlength="24" required /></div>
      <div class="form-field field-wide"><label for="checkout-address">Address line 1</label><input id="checkout-address" name="addressLine1" autocomplete="address-line1" maxlength="180" required /></div>
      <div class="form-field field-wide"><label for="checkout-address2">Address line 2 <span>(optional)</span></label><input id="checkout-address2" name="addressLine2" autocomplete="address-line2" maxlength="180" /></div>
      <div class="form-field"><label for="checkout-city">City</label><input id="checkout-city" name="city" autocomplete="address-level2" maxlength="100" required /></div>
      <div class="form-field"><label for="checkout-state">State</label><input id="checkout-state" name="state" autocomplete="address-level1" maxlength="100" required /></div>
      <div class="form-field"><label for="checkout-postal">PIN code</label><input id="checkout-postal" name="postalCode" autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></div>
      <div class="form-field"><label>Country</label><div class="form-static-value">India</div></div>
      <fieldset class="payment-methods field-wide"><legend>Choose how to pay</legend>
        <label class="payment-option"><input type="radio" name="paymentMethod" value="stripe" checked /><span class="payment-option-copy"><strong>Stripe Checkout</strong><small>Secure hosted card form · test mode</small></span><span class="payment-tag payment-tag-test">TEST</span></label>
        <label class="payment-option"><input type="radio" name="paymentMethod" value="upi" /><span class="payment-option-copy"><strong>UPI QR payment</strong><small>Real transfer · order awaits manual verification</small></span><span class="payment-tag payment-tag-upi">UPI</span></label>
      </fieldset>
      <div class="upi-panel field-wide" id="upi-panel" hidden>
        <div class="upi-panel-copy"><p class="mini-eyebrow">MANUAL UPI CHECKOUT</p><h3>Scan, pay, then share the reference.</h3><p>Pay exactly <strong>${formatMoney(total)}</strong> using this QR. It is a real transfer. After it succeeds in your UPI app, enter the UTR/reference below; the order will remain <strong>Awaiting verification</strong> until checked manually.</p></div>
        <figure class="upi-qr-card"><img src="/assets/upi-payment-qr.jpeg" alt="Merchant UPI payment QR code supplied for PawSupply" width="260" height="260" /><figcaption>Scan with your UPI app</figcaption></figure>
        <div class="form-field field-wide"><label for="upi-reference">UPI transaction reference / UTR</label><input id="upi-reference" name="upiReference" autocomplete="off" inputmode="text" pattern="[A-Za-z0-9-]{6,40}" minlength="6" maxlength="40" placeholder="Enter the reference from your payment app" disabled /></div>
        <p class="upi-warning field-wide">Only submit after your UPI app shows the transfer as complete. This page cannot verify QR payments automatically.</p>
      </div>
      <p class="privacy-note field-wide">Your name, phone, email, and delivery address are stored for this order and its receipt. Card details are entered on Stripe's hosted page and are never stored on PawSupply.</p>
      <p class="checkout-status field-wide" id="checkout-status" role="status" aria-live="polite" hidden></p>
      <button class="button button-primary checkout-submit" id="checkout-submit" type="submit">Continue to secure Stripe Checkout <span aria-hidden="true">↗</span></button>
    </form>
    <p class="checkout-summary-note">${count} ${count === 1 ? "item" : "items"} · ${formatMoney(total)} total · ₹0 tax · free shipping</p>`;
  checkoutDialog.showModal();
  checkoutContent.querySelector("#checkout-name")?.focus();
}

function customerFromForm(form) {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    address: {
      line1: data.get("addressLine1"),
      line2: data.get("addressLine2"),
      city: data.get("city"),
      state: data.get("state"),
      postalCode: data.get("postalCode"),
      country: "IN",
    },
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "We couldn't complete that request. Please try again.");
  return result;
}

function showCheckoutStatus(message, kind = "error", html = false) {
  const status = checkoutContent.querySelector("#checkout-status");
  if (!status) return;
  status.hidden = false;
  status.className = `checkout-status field-wide ${kind}`;
  if (html) status.innerHTML = message;
  else status.textContent = message;
}

function cartPayload() {
  // Recompute locally for display; the server independently recalculates every price.
  return calculateTotals(cart.map((line) => ({ id: line.id, quantity: line.quantity })));
}

function checkoutPayload(form) {
  return {
    origin: window.location.origin,
    cart: cart.map((line) => ({ id: line.id, quantity: line.quantity })),
    customer: customerFromForm(form),
  };
}

async function submitCheckout(event) {
  if (event.target.id !== "checkout-form") return;
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const method = new FormData(form).get("paymentMethod");
  const button = checkoutContent.querySelector("#checkout-submit");
  const originalText = button.textContent;
  let paymentTab = null;
  button.disabled = true;
  button.textContent = method === "stripe" ? "Connecting to Stripe…" : "Saving your pending UPI order…";
  checkoutContent.querySelector("#checkout-status").hidden = true;

  if (method === "stripe") {
    paymentTab = window.open("about:blank", "_blank");
    if (paymentTab) {
      try { paymentTab.opener = null; } catch { /* continue with the parent tab */ }
    }
    showCheckoutStatus("Preparing secure Stripe test checkout in a new tab…", "info");
  }

  try {
    const payload = checkoutPayload(form);
    if (method === "stripe") {
      const result = await apiRequest("/api/checkout/stripe", { method: "POST", body: JSON.stringify(payload) });
      if (!result.orderId || !result.receiptToken || !result.checkoutUrl) throw new Error("Stripe did not return a usable checkout session.");
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") throw new Error("Stripe returned an unexpected checkout address.");
      rememberOrder(result.orderId, result.receiptToken);
      if (paymentTab && !paymentTab.closed) {
        paymentTab.location.href = checkoutUrl.href;
        checkoutDialog.close();
        showToast("Secure Stripe test checkout opened in a new tab.");
      } else {
        showCheckoutStatus(`Your secure session is ready. <a href="${escapeHTML(checkoutUrl.href)}" target="_blank" rel="noopener noreferrer">Open Stripe Checkout</a>.`, "info", true);
        showToast("Allow pop-ups or use the secure Stripe Checkout link in this dialog.");
        button.textContent = "Open Stripe Checkout";
        button.disabled = false;
        button.onclick = (clickEvent) => {
          if (clickEvent.target.closest("#checkout-submit")) window.open(checkoutUrl.href, "_blank", "noopener,noreferrer");
        };
        return;
      }
    } else {
      const upiReference = new FormData(form).get("upiReference");
      const result = await apiRequest("/api/checkout/upi", {
        method: "POST",
        body: JSON.stringify({ ...payload, upiReference }),
      });
      if (!result.orderId || !result.receiptToken) throw new Error("The UPI order could not be saved.");
      rememberOrder(result.orderId, result.receiptToken);
      clearCart();
      checkoutDialog.close();
      showToast("UPI order recorded as awaiting manual verification.");
      openReceipt(result.orderId);
    }
  } catch (error) {
    if (paymentTab && !paymentTab.closed) paymentTab.close();
    showCheckoutStatus(error.message || "We couldn't connect to checkout. Please try again.", "error");
    button.disabled = false;
    button.textContent = originalText;
  }
}

function setPaymentChoice() {
  const selected = checkoutContent.querySelector('input[name="paymentMethod"]:checked')?.value || "stripe";
  const upiPanel = checkoutContent.querySelector("#upi-panel");
  const upiReference = checkoutContent.querySelector("#upi-reference");
  const submit = checkoutContent.querySelector("#checkout-submit");
  if (!upiPanel || !upiReference || !submit) return;
  const isUpi = selected === "upi";
  upiPanel.hidden = !isUpi;
  upiReference.disabled = !isUpi;
  upiReference.required = isUpi;
  submit.innerHTML = isUpi ? "Submit UPI order for verification <span aria-hidden=\"true\">↗</span>" : "Continue to secure Stripe Checkout <span aria-hidden=\"true\">↗</span>";
  const summary = checkoutContent.querySelector(".checkout-summary-note");
  if (summary) summary.textContent = `${getCartQuantity()} ${getCartQuantity() === 1 ? "item" : "items"} · ${formatMoney(getSubtotal())} total · ₹0 tax · free shipping`;
}

function statusCopy(status, method) {
  const values = {
    paid: { label: "Payment verified", title: "Your order is confirmed.", note: "Stripe confirmed this payment. Your PawSupply receipt is ready." },
    pending_verification: { label: "Awaiting verification", title: "Your UPI order is received.", note: "Your UPI reference has been saved. The store owner must verify the transfer; this is not a paid receipt yet." },
    checkout_created: { label: "Checkout created", title: "Waiting for payment confirmation.", note: "A Stripe redirect is not proof of payment. We will update this order after a verified webhook arrives." },
    processing: { label: "Payment processing", title: "Your payment is still being confirmed.", note: "This can take a moment. Refresh this page or check My orders shortly; we have not marked it paid." },
    payment_failed: { label: "Payment not confirmed", title: "This payment did not complete.", note: "No paid receipt was issued. Your cart is still saved so you can try again." },
    cancelled: { label: "Checkout cancelled", title: "No payment was recorded.", note: "Your checkout was cancelled. Your bag is still available if you want to try again." },
    review_required: { label: "Manual review", title: "We are checking this payment.", note: "The amount or currency needs an owner review before the order can be confirmed." },
  };
  return values[status] || { label: method === "upi" ? "Awaiting verification" : "Payment processing", title: "Order status update", note: "Check My orders for the latest status." };
}

function safeOrderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function receiptMarkup(order) {
  const state = statusCopy(order.status, order.paymentMethod);
  const paid = order.status === "paid";
  const items = Array.isArray(order.items) ? order.items : [];
  const address = order.shippingAddress || {};
  const addressText = [address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(", ")].filter(Boolean).map(escapeHTML).join("<br />");
  const itemMarkup = items.map((item) => `<li><span>${Number(item.quantity) || 0} × ${escapeHTML(item.name)}</span><strong>${formatMinor(item.lineTotalMinor)}</strong></li>`).join("");
  const upiReference = order.paymentMethod === "upi" && order.upiReference ? ` · UPI ref ••••${escapeHTML(String(order.upiReference).slice(-4))}` : "";
  return `<article class="receipt-card">
    <div class="receipt-topline"><span class="receipt-status status-${escapeHTML(order.status)}"><i aria-hidden="true">${paid ? "✓" : "•"}</i>${escapeHTML(state.label)}</span><span class="receipt-order-id">ORDER ${escapeHTML(order.id.slice(0, 8).toUpperCase())}</span></div>
    <div class="receipt-title-block"><p class="eyebrow">${paid ? "PAWSUPPLY PAYMENT RECEIPT" : "PAWSUPPLY ORDER ACKNOWLEDGEMENT"}</p><h1 id="receipt-page-title">${escapeHTML(state.title)}</h1><p>${escapeHTML(state.note)}</p></div>
    <div class="receipt-grid"><section class="receipt-detail"><h2>Order details</h2><p><span>Order date</span><strong>${escapeHTML(safeOrderDate(order.createdAt))}</strong></p><p><span>Payment method</span><strong>${order.paymentMethod === "stripe" ? "Stripe card checkout" : "UPI manual transfer"}</strong></p><p><span>Status</span><strong>${escapeHTML(state.label)}</strong></p><p><span>Order reference</span><strong>${escapeHTML(order.id)}</strong></p></section>
    <section class="receipt-detail"><h2>Delivery to</h2><p class="receipt-customer"><strong>${escapeHTML(order.customer?.name)}</strong><br />${escapeHTML(order.customer?.email)}<br />${escapeHTML(order.customer?.phone)}</p><p class="receipt-address">${addressText || "Address unavailable"}</p></section></div>
    <section class="receipt-items"><h2>Items</h2><ul>${itemMarkup}</ul></section>
    <div class="receipt-totals"><p><span>Subtotal</span><strong>${formatMinor(order.subtotalMinor)}</strong></p>${Number(order.discountMinor) > 0 ? `<p><span>Stripe promotion</span><strong>−${formatMinor(order.discountMinor)}</strong></p>` : ""}<p><span>Tax</span><strong>${formatMinor(order.taxMinor)}</strong></p><p><span>Shipping</span><strong>Free</strong></p><p class="receipt-total"><span>Total</span><strong>${formatMinor(order.totalMinor)}</strong></p></div>
    ${order.paymentMethod === "upi" ? `<p class="receipt-utr">UPI transaction reference${upiReference}</p>` : ""}
    <div class="receipt-actions"><button class="button button-primary" type="button" data-print-receipt>${paid ? "Print / save receipt" : "Print order acknowledgement"} <span aria-hidden="true">↗</span></button><a class="button button-secondary" href="#/orders" data-page="orders">My orders</a><a class="receipt-back-link" href="#/shop" data-page="shop">Continue shopping</a></div>
    <p class="receipt-footnote">${paid ? "Payment status is based on Stripe's verified server webhook." : "This is not proof of payment. Never pay twice; keep your UPI/Stripe app confirmation and check the order status."}</p>
  </article>`;
}

function openReceipt(orderId) {
  if (!orderId) return;
  activePage = "receipt";
  searchTerm = "";
  searchInput.value = "";
  window.history.pushState({ page: "receipt", orderId }, "", `#/receipt?order_id=${encodeURIComponent(orderId)}`);
  renderPage();
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  void loadReceipt(orderId);
}

async function loadReceipt(orderId) {
  const requestVersion = ++receiptRequestVersion;
  if (!orderId) {
    receiptContent.innerHTML = `<div class="account-empty"><span aria-hidden="true">✧</span><h2>Receipt link is missing</h2><p>Open My orders in the browser where you checked out.</p><a class="button button-primary" href="#/orders" data-page="orders">Open My orders</a></div>`;
    return;
  }
  const token = tokenForOrder(orderId);
  if (!token) {
    receiptContent.innerHTML = `<div class="account-empty"><span aria-hidden="true">✧</span><h2>This order isn't saved in this browser</h2><p>Private receipt access is stored in the browser used at checkout. Try My orders on that device.</p><a class="button button-primary" href="#/orders" data-page="orders">Open My orders</a></div>`;
    return;
  }
  receiptContent.innerHTML = `<div class="account-loading">Checking the verified order status…</div>`;
  let order = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const result = await apiRequest(`/api/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
      order = result.order;
      if (requestVersion !== receiptRequestVersion) return;
      if (!order || !["checkout_created", "processing"].includes(order.status)) break;
    } catch (error) {
      receiptContent.innerHTML = `<div class="account-empty"><span aria-hidden="true">✧</span><h2>We couldn't load this receipt</h2><p>${escapeHTML(error.message)}</p><a class="button button-secondary" href="#/orders" data-page="orders">Check My orders</a></div>`;
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  if (requestVersion !== receiptRequestVersion) return;
  if (!order) {
    receiptContent.innerHTML = `<div class="account-empty"><h2>Order not found</h2><p>Try My orders on the browser used for checkout.</p></div>`;
    return;
  }
  receiptContent.innerHTML = receiptMarkup(order);
  if (order.status === "paid" && cart.length > 0) {
    clearCart();
    showToast("Stripe confirmed the payment — your cart is now cleared.");
  }
}

async function loadOrders() {
  const requestVersion = ++ordersRequestVersion;
  const saved = readStoredOrders();
  if (saved.length === 0) {
    ordersContent.innerHTML = `<div class="account-empty"><span aria-hidden="true">✧</span><h2>No saved orders yet</h2><p>Completed Stripe checkouts and UPI orders submitted in this browser will appear here.</p><a class="button button-primary" href="#/shop" data-page="shop">Browse the goodies</a></div>`;
    return;
  }
  ordersContent.innerHTML = `<div class="account-loading">Loading your private order history…</div>`;
  try {
    const result = await apiRequest("/api/orders/lookup", { method: "POST", body: JSON.stringify({ orders: saved }) });
    if (requestVersion !== ordersRequestVersion) return;
    const rows = Array.isArray(result.orders) ? result.orders : [];
    if (rows.length === 0) {
      ordersContent.innerHTML = `<div class="account-empty"><h2>No available order records</h2><p>We couldn't match these saved receipt links. Try this page in the browser used for checkout.</p></div>`;
      return;
    }
    ordersContent.innerHTML = `<div class="orders-list">${rows.map((order) => {
      const state = statusCopy(order.status, order.paymentMethod);
      const itemSummary = (order.items || []).map((item) => `${Number(item.quantity) || 0} × ${escapeHTML(item.name)}`).join(" · ");
      return `<article class="order-row"><div class="order-row-main"><div class="order-row-top"><span class="receipt-status status-${escapeHTML(order.status)}">${escapeHTML(state.label)}</span><span class="order-date">${escapeHTML(safeOrderDate(order.createdAt))}</span></div><h2>Order ${escapeHTML(order.id.slice(0, 8).toUpperCase())}</h2><p>${itemSummary}</p><span class="order-payment-type">${order.paymentMethod === "stripe" ? "Stripe checkout" : "UPI transfer · manual verification"}</span></div><div class="order-row-side"><strong>${formatMinor(order.totalMinor)}</strong><button class="button button-secondary" type="button" data-open-receipt="${escapeHTML(order.id)}">View details</button></div></article>`;
    }).join("")}</div>`;
  } catch (error) {
    if (requestVersion !== ordersRequestVersion) return;
    ordersContent.innerHTML = `<div class="account-empty"><h2>Order history is unavailable</h2><p>${escapeHTML(error.message)}</p></div>`;
  }
}

async function processCancellationReturn() {
  const params = getRouteParams();
  if (params.get("payment") !== "cancelled") return;
  const orderId = params.get("order_id") || "";
  if (orderId && tokenForOrder(orderId) && orderId !== lastCancellationOrderId) {
    lastCancellationOrderId = orderId;
    try {
      await apiRequest("/api/orders/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenForOrder(orderId)}` },
        body: JSON.stringify({ orderId }),
      });
    } catch { /* The order history remains authoritative if the cancel update is delayed. */ }
  }
  showToast("Stripe checkout was cancelled. No payment was marked complete; your bag is saved.");
}

function drawTrendChart() {
  const host = document.querySelector("#trend-chart");
  const width = 760;
  const height = 245;
  const pad = { top: 12, right: 20, bottom: 32, left: 34 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const xAt = (index) => pad.left + (index / (weekLabels.length - 1)) * graphWidth;
  const yAt = (value) => pad.top + ((100 - value) / 100) * graphHeight;
  const yTicks = [0, 25, 50, 75, 100];
  const grid = yTicks.map((value) => { const y = yAt(value); return `<g><line class="chart-gridline" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"/><text class="chart-y-label" x="${pad.left - 10}" y="${y + 3}" text-anchor="end">${value}</text></g>`; }).join("");
  const xAxis = [0, 2, 4, 6, 8, 10, 11].map((index) => `<text class="chart-x-label" x="${xAt(index)}" y="${height - 7}" text-anchor="middle">${weekLabels[index]}</text>`).join("");
  const lines = trendSeries.map((series) => {
    const points = series.values.map((value, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(" ");
    const circles = series.values.map((value, index) => `<circle class="chart-point chart-point-${series.color}" cx="${xAt(index).toFixed(1)}" cy="${yAt(value).toFixed(1)}" r="3.3"><title>${series.name}, ${weekLabels[index]}: ${value} (illustrative index)</title></circle>`).join("");
    return `<g class="chart-series" data-chart-series="${series.id}"><path class="chart-line chart-line-${series.color}" d="${points}"/>${circles}</g>`;
  }).join("");
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trend-chart-title trend-chart-desc" preserveAspectRatio="xMidYMid meet"><title id="trend-chart-title">Illustrative pet search interest sample</title><desc id="trend-chart-desc">A sample, not live Google Trends data, comparing Dog Food, Smart Feeder, and Grooming across 12 weeks on an index from 0 to 100.</desc>${grid}${xAxis}${lines}</svg>`;
  document.querySelectorAll("[data-series]").forEach((button) => button.addEventListener("click", () => {
    const visible = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(visible));
    document.querySelector(`[data-chart-series="${button.dataset.series}"]`)?.classList.toggle("is-hidden", !visible);
  }));
}

function setupReveal() {
  const revealItems = document.querySelectorAll(".reveal:not(.is-visible)");
  if (reducedMotion || !("IntersectionObserver" in window)) { revealItems.forEach((item) => item.classList.add("is-visible")); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -25px 0px" });
  }
  revealItems.forEach((item) => revealObserver.observe(item));
}

document.addEventListener("click", (event) => {
  const receiptButton = event.target.closest("[data-open-receipt]");
  if (receiptButton) { openReceipt(receiptButton.dataset.openReceipt); return; }
  if (event.target.closest("[data-print-receipt]")) { window.print(); return; }
  const pageLink = event.target.closest("[data-page]");
  if (pageLink) {
    event.preventDefault();
    navigateTo(pageLink.dataset.page, { afterScroll: pageLink.dataset.scrollAfter || null });
    if (pageLink.hasAttribute("data-close-and-shop")) closeCart();
    return;
  }
  const scrollLink = event.target.closest("[data-scroll-target]");
  if (scrollLink) {
    const target = document.querySelector(scrollLink.dataset.scrollTarget);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  if (["trends", "orders", "receipt"].includes(activePage)) navigateTo("shop", { replace: true, preserveSearch: true });
  else renderPage();
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && searchInput.value) { searchInput.value = ""; searchTerm = ""; renderPage(); }
});

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-to-cart]");
  const quickButton = event.target.closest("[data-quick-view]");
  if (addButton) addToCart(addButton.dataset.addToCart);
  if (quickButton) showQuickView(quickButton.dataset.quickView);
});
quickViewDialog.addEventListener("click", (event) => {
  if (event.target === quickViewDialog || event.target.closest("[data-close-dialog]")) quickViewDialog.close();
  const addButton = event.target.closest("[data-add-to-cart]");
  if (addButton) { addToCart(addButton.dataset.addToCart); quickViewDialog.close(); }
});
checkoutDialog.addEventListener("click", (event) => {
  if (event.target === checkoutDialog || event.target.closest("[data-close-dialog]")) checkoutDialog.close();
});
checkoutDialog.addEventListener("close", () => checkoutOpener?.focus());
checkoutDialog.addEventListener("submit", submitCheckout);
checkoutDialog.addEventListener("change", (event) => {
  if (event.target.matches('input[name="paymentMethod"]')) setPaymentChoice();
});
cartContent.addEventListener("click", (event) => {
  const changeButton = event.target.closest("[data-quantity-change]");
  const removeButton = event.target.closest("[data-remove-line]");
  if (changeButton) changeQuantity(changeButton.dataset.id, Number(changeButton.dataset.quantityChange));
  if (removeButton) removeFromCart(removeButton.dataset.removeLine);
});
cartSummary.addEventListener("click", (event) => { if (event.target.closest("#start-checkout")) openCheckout(); });
document.querySelector("#open-cart").addEventListener("click", openCart);
document.querySelector("#close-cart").addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);
document.querySelector("#clear-filters").addEventListener("click", () => navigateTo("shop"));

document.addEventListener("keydown", (event) => {
  if (!cartDrawer.classList.contains("is-open")) return;
  if (event.key === "Escape") { closeCart(); return; }
  if (event.key === "Tab") {
    const focusable = [...cartDrawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !cartDrawer.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !cartDrawer.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
});

window.addEventListener("popstate", syncPageFromLocation);
window.addEventListener("hashchange", syncPageFromLocation);
window.addEventListener("storage", (event) => {
  if (event.key === CART_STORAGE_KEY) { cart = readCart(); renderCart(); }
});
checkoutDialog.addEventListener("close", () => { checkoutOpener = null; });

renderCart();
drawTrendChart();
renderPage();
if (activePage === "receipt") void loadReceipt(getRouteParams().get("order_id"));
if (activePage === "orders") void loadOrders();
if (activePage === "shop") void processCancellationReturn();
