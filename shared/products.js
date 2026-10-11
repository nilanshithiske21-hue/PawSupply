export const currency = "inr";
export const currencyCode = "INR";
export const taxMinor = 0;
export const shippingMinor = 0;

export const products = [
  {
    id: "comet-ball", name: "Comet Play Ball", category: "dogs", categoryLabel: "Dogs", price: 18, rating: 4.9,
    badge: "TAIL-WAG TESTED", image: "/assets/comet-play-ball.webp",
    imageAlt: "Cobalt-blue textured rubber enrichment ball for dogs",
    description: "A bouncy, paw-friendly playmate with just enough texture for a satisfying game of fetch or solo chomping.",
    tags: "dog toy play fetch enrichment ball",
  },
  {
    id: "trail-kit", name: "Trail Mix Walk Kit", category: "dogs", categoryLabel: "Dogs", price: 32, rating: 4.8,
    badge: "READY TO ROAM", image: "/assets/trail-mix-walk-kit.webp",
    imageAlt: "Sky-blue dog walking leash, treat pouch, and water bottle set",
    description: "The walk-ready trio: an easy-grab leash, snack pouch, and a bottle for the good sniff breaks along the way.",
    tags: "dog walk leash treats bottle travel outdoor",
  },
  {
    id: "orbit-wand", name: "Orbit Feather Wand", category: "cats", categoryLabel: "Cats", price: 16, rating: 4.8,
    badge: "PLAYTIME PICK", image: "/assets/orbit-feather-wand.webp",
    imageAlt: "Navy cat teaser wand with blue, white, and lilac feathers",
    description: "A feather-light teaser that turns five quiet minutes into a whole galaxy of pounces, leaps, and proud catches.",
    tags: "cat toy teaser feather wand play enrichment",
  },
  {
    id: "moon-pod", name: "Moonbeam Cat Pod", category: "cats", categoryLabel: "Cats", price: 58, rating: 5.0,
    badge: "COZY CORNER", image: "/assets/moonbeam-cat-pod.webp",
    imageAlt: "Rounded ice-blue plush cat bed with a navy cushion",
    description: "A soft little landing pad with a raised, cloud-like rim for loafing, curling up, or supervising the room.",
    tags: "cat bed cozy sleep cushion pod plush",
  },
  {
    id: "skyseed-trio", name: "Skyseed Treat Trio", category: "birds", categoryLabel: "Birds", price: 12, rating: 4.8,
    badge: "A LITTLE TREAT", image: "/assets/skyseed-treat-trio.webp",
    imageAlt: "Small-bird seed cup and two natural hanging enrichment toys",
    description: "A tiny rotation of seed-time favorites and hanging chew play to give curious little beaks something to explore.",
    tags: "bird seed treat chew natural toy enrichment",
  },
  {
    id: "perch-play", name: "Perch & Play Set", category: "birds", categoryLabel: "Birds", price: 22, rating: 4.7,
    badge: "FLIGHT PLAN", image: "/assets/perch-play-set.webp",
    imageAlt: "Wooden bird perch with pastel chew rings and a small rope swing",
    description: "A fresh little corner for perching, swinging, and discovering bright textures between snack breaks.",
    tags: "bird perch swing wood toy rings play cage",
  },
  {
    id: "halo-feeder", name: "Halo Smart Feeder", category: "tech", categoryLabel: "Smart Pet Tech", price: 129, rating: 4.9,
    badge: "CLEVER ROUTINE", image: "/assets/halo-smart-feeder.webp",
    imageAlt: "Matte-white automatic pet feeder with a cobalt-blue bowl and cyan status light",
    description: "A tidy timed-feeding helper that keeps everyday portions feeling a little more thoughtful and a lot more predictable.",
    tags: "smart pet tech automatic feeder food schedule connected",
  },
  {
    id: "pawpilot-tag", name: "PawPilot GPS Tag", category: "tech", categoryLabel: "Smart Pet Tech", price: 49, rating: 4.8,
    badge: "ADVENTURE READY", image: "/assets/pawpilot-gps-tag.webp",
    imageAlt: "Small cobalt-blue GPS tracker tag clipped onto a navy pet collar",
    description: "A lightweight location tag for the curious wanderers who think every walk has one more side quest.",
    tags: "smart pet tech gps tracker collar location dog cat safety",
  },
];

export const productById = new Map(products.map((product) => [product.id, product]));

const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: currencyCode,
  maximumFractionDigits: 0,
});

export function formatMoney(rupees) {
  return rupeeFormatter.format(rupees);
}

export function formatMinor(minor) {
  return rupeeFormatter.format(Number(minor || 0) / 100);
}

export function calculateTotals(lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > products.length) {
    throw new TypeError("The cart is empty or invalid.");
  }
  const quantities = new Map();
  for (const line of lines) {
    if (!line || typeof line.id !== "string" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new TypeError("The cart contains an invalid quantity.");
    }
    if (!productById.has(line.id)) throw new TypeError("The cart contains an unknown product.");
    const quantity = (quantities.get(line.id) || 0) + line.quantity;
    if (quantity > 99) throw new TypeError("The cart quantity is too high.");
    quantities.set(line.id, quantity);
  }
  const items = [...quantities].map(([id, quantity]) => {
    const product = productById.get(id);
    const unitPriceMinor = product.price * 100;
    return {
      id: product.id,
      name: product.name,
      category: product.categoryLabel,
      quantity,
      unitPriceMinor,
      lineTotalMinor: unitPriceMinor * quantity,
      image: product.image,
    };
  });
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  return {
    items,
    currency,
    subtotalMinor,
    taxMinor,
    shippingMinor,
    discountMinor: 0,
    totalMinor: subtotalMinor + taxMinor + shippingMinor,
  };
}
