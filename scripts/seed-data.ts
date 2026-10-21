/**
 * Catalogue seed data for Nexora.
 *
 * Prices are written in rupees and converted to minor units (paise) by
 * `rupees()`, which keeps this file readable while the database still stores
 * exact integers.
 *
 * Images point at a public product-image CDN so a fresh clone shows a realistic
 * storefront. Swap them for your own uploads (e.g. Cloudinary) when media
 * management ships.
 */

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
}

export interface SeedProduct {
  name: string;
  slug: string;
  description: string;
  sku: string;
  priceInPaise: number;
  costInPaise: number;
  stock: number;
  categorySlug: string;
  image: string;
  isFeatured: boolean;
  isActive: boolean;
  isService: boolean;
}

/** ₹499.99 -> 49999 paise. */
export function rupees(amount: number): number {
  return Math.round(amount * 100);
}

const IMAGE_BASE = "https://cdn.dummyjson.com/product-images";

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Cellphones",
    slug: "cellphones",
    description: "Flagship Android and everyday smartphones with local warranty.",
    image: "/images/products/samsung-galaxy-s24-ultra.jpg",
    isActive: true,
  },
  {
    name: "iPhone",
    slug: "iphone",
    description: "Official Apple iPhone devices and certified models.",
    image: `${IMAGE_BASE}/smartphones/iphone-13-pro/1.webp`,
    isActive: true,
  },
  {
    name: "Laptops",
    slug: "laptops",
    description: "Ultrabooks, creator laptops and business machines.",
    image: `${IMAGE_BASE}/laptops/apple-macbook-pro-14-inch-space-grey/1.webp`,
    isActive: true,
  },
  {
    name: "Tablets",
    slug: "tablets",
    description: "Tablets for reading, drawing, note-taking and streaming.",
    image: `${IMAGE_BASE}/tablets/ipad-mini-2021-starlight/1.webp`,
    isActive: true,
  },
  {
    name: "Accessories",
    slug: "accessories",
    description: "Audio, wearables, chargers and protection for your devices.",
    image: `${IMAGE_BASE}/mobile-accessories/apple-airpods-max-silver/1.webp`,
    isActive: true,
  },
  {
    name: "Services",
    slug: "services",
    description:
      "In-house repairs, setup and protection plans booked with a Nexora technician.",
    image: "/images/products/services-category.jpg",
    isActive: true,
  },
  {
    /**
     * Intentionally has no active products: it demonstrates the empty-category
     * state and keeps its inactive products out of the public catalogue.
     */
    name: "Smart Home",
    slug: "smart-home",
    description: "Plugs, cameras and sensors for connected homes.",
    image: "/images/products/smarthome-category.jpg",
    isActive: true,
  },
];

export const SEED_PRODUCTS: SeedProduct[] = [
  // ---------------------------------------------------------------- Cellphones
  {
    name: "Apple iPhone 13 Pro 128GB",
    slug: "apple-iphone-13-pro-128gb",
    description:
      "6.1-inch Super Retina XDR display with ProMotion 120Hz, A15 Bionic chip and a triple 12MP Pro camera system. 128GB in Graphite.",
    sku: "NX-CEL-IP13P-128",
    priceInPaise: rupees(69_900),
    costInPaise: rupees(61_500),
    stock: 12,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/iphone-13-pro/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy S10 128GB",
    slug: "samsung-galaxy-s10-128gb",
    description:
      "Dynamic AMOLED display, triple rear camera and wireless charging. Certified refurbished with a 6-month Nexora warranty.",
    sku: "NX-CEL-SGS10-128",
    priceInPaise: rupees(34_999),
    costInPaise: rupees(29_500),
    stock: 8,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/samsung-galaxy-s10/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy S8 64GB",
    slug: "samsung-galaxy-s8-64gb",
    description:
      "Infinity display with curved glass, 4GB RAM and fast charging. Refurbished unit tested across 40 checkpoints.",
    sku: "NX-CEL-SGS8-64",
    priceInPaise: rupees(18_499),
    costInPaise: rupees(15_200),
    stock: 5,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/samsung-galaxy-s8/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Realme XT 8GB / 128GB",
    slug: "realme-xt-8gb-128gb",
    description:
      "64MP quad camera, Snapdragon 712 and a 4000mAh battery with VOOC 3.0 fast charging.",
    sku: "NX-CEL-RMXT-128",
    priceInPaise: rupees(15_999),
    costInPaise: rupees(13_100),
    stock: 20,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/realme-xt/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    /** Deliberately out of stock: exercises the disabled "Add to bag" state. */
    name: "Oppo F19 Pro+ 5G 128GB",
    slug: "oppo-f19-pro-plus-5g-128gb",
    description:
      "Dimensity 800U with 5G, 50W VOOC flash charge and 8GB RAM. Currently awaiting the next shipment.",
    sku: "NX-CEL-OPF19P-128",
    priceInPaise: rupees(21_499),
    costInPaise: rupees(18_400),
    stock: 0,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/oppo-f19-pro-plus/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Vivo S1 6GB / 128GB",
    slug: "vivo-s1-6gb-128gb",
    description:
      "Super AMOLED display, 32MP selfie camera and a 4500mAh battery for two-day use.",
    sku: "NX-CEL-VVS1-128",
    priceInPaise: rupees(13_999),
    costInPaise: rupees(11_600),
    stock: 15,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/vivo-s1/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },

  // ------------------------------------------------------------------- Laptops
  {
    name: 'Apple MacBook Pro 14" (M3, Space Grey)',
    slug: "apple-macbook-pro-14-m3-space-grey",
    description:
      "14.2-inch Liquid Retina XDR display, M3 Pro chip, 18GB unified memory and 512GB SSD. Two-year Apple warranty.",
    sku: "NX-LAP-MBP14-M3",
    priceInPaise: rupees(1_69_900),
    costInPaise: rupees(1_52_000),
    stock: 6,
    categorySlug: "laptops",
    image: `${IMAGE_BASE}/laptops/apple-macbook-pro-14-inch-space-grey/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Asus Zenbook Pro Duo 15",
    slug: "asus-zenbook-pro-duo-15",
    description:
      "Dual 4K screen creator laptop with Intel Core i9, RTX graphics and 32GB RAM for heavy editing workloads.",
    sku: "NX-LAP-ASZPD15",
    priceInPaise: rupees(2_05_000),
    costInPaise: rupees(1_86_000),
    stock: 2,
    categorySlug: "laptops",
    image: `${IMAGE_BASE}/laptops/asus-zenbook-pro-dual-screen-laptop/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Dell XPS 13 9300",
    slug: "dell-xps-13-9300",
    description:
      "13.4-inch InfinityEdge display, 10th-gen Core i7 and a machined aluminium chassis weighing 1.2kg.",
    sku: "NX-LAP-DXPS13-9300",
    priceInPaise: rupees(1_12_500),
    costInPaise: rupees(99_000),
    stock: 4,
    categorySlug: "laptops",
    image: `${IMAGE_BASE}/laptops/new-dell-xps-13-9300-laptop/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Lenovo Yoga 920",
    slug: "lenovo-yoga-920",
    description:
      "360-degree convertible with a 4K touch display, fingerprint reader and long-life battery.",
    sku: "NX-LAP-LNY920",
    priceInPaise: rupees(89_990),
    costInPaise: rupees(78_500),
    stock: 7,
    categorySlug: "laptops",
    image: `${IMAGE_BASE}/laptops/lenovo-yoga-920/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Huawei MateBook X Pro",
    slug: "huawei-matebook-x-pro",
    description:
      "Ultra-slim 13.9-inch 3K display notebook with pop-up camera and quad speakers for meetings.",
    sku: "NX-LAP-HWMBXP",
    priceInPaise: rupees(1_34_999),
    costInPaise: rupees(1_19_000),
    stock: 3,
    categorySlug: "laptops",
    image: `${IMAGE_BASE}/laptops/huawei-matebook-x-pro/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },

  // ------------------------------------------------------------------- Tablets
  {
    name: "Apple iPad Mini (6th gen, Starlight)",
    slug: "apple-ipad-mini-6th-gen-starlight",
    description:
      "8.3-inch Liquid Retina display, A15 Bionic chip and USB-C with Apple Pencil (2nd gen) support.",
    sku: "NX-TAB-IPMINI6",
    priceInPaise: rupees(46_900),
    costInPaise: rupees(41_200),
    stock: 9,
    categorySlug: "tablets",
    image: `${IMAGE_BASE}/tablets/ipad-mini-2021-starlight/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy Tab S8+ (Grey)",
    slug: "samsung-galaxy-tab-s8-plus-grey",
    description:
      "12.4-inch Super AMOLED 120Hz display, S Pen included and DeX mode for desktop-style work.",
    sku: "NX-TAB-SGTABS8P",
    priceInPaise: rupees(70_999),
    costInPaise: rupees(63_500),
    stock: 5,
    categorySlug: "tablets",
    image: `${IMAGE_BASE}/tablets/samsung-galaxy-tab-s8-plus-grey/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy Tab A8 (White)",
    slug: "samsung-galaxy-tab-a8-white",
    description:
      "10.5-inch display, quad speakers with Dolby Atmos and a 7040mAh battery for family use.",
    sku: "NX-TAB-SGTABA8",
    priceInPaise: rupees(28_499),
    costInPaise: rupees(24_900),
    stock: 11,
    categorySlug: "tablets",
    image: `${IMAGE_BASE}/tablets/samsung-galaxy-tab-white/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },

  // --------------------------------------------------------------- Accessories
  {
    name: "Apple AirPods Max (Silver)",
    slug: "apple-airpods-max-silver",
    description:
      "Over-ear active noise cancelling headphones with spatial audio and 20 hours of battery life.",
    sku: "NX-ACC-APMAX-SIL",
    priceInPaise: rupees(59_900),
    costInPaise: rupees(53_500),
    stock: 14,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-airpods-max-silver/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple AirPods (2nd generation)",
    slug: "apple-airpods-2nd-generation",
    description:
      "Wireless earbuds with fast pairing, 24 hours of total listening time with the charging case.",
    sku: "NX-ACC-APPODS2",
    priceInPaise: rupees(14_900),
    costInPaise: rupees(12_800),
    stock: 25,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-airpods/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple Watch Series 4 (Gold, renewed)",
    slug: "apple-watch-series-4-gold-renewed",
    description:
      "ECG-capable smartwatch with GPS, refurbished and sealed with a new battery by our service desk.",
    sku: "NX-ACC-AW4-GLD",
    priceInPaise: rupees(27_900),
    costInPaise: rupees(23_900),
    stock: 6,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-watch-series-4-gold/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple MagSafe Battery Pack",
    slug: "apple-magsafe-battery-pack",
    description:
      "Magnetic portable battery that snaps onto MagSafe-compatible iPhones for on-the-go charging.",
    sku: "NX-ACC-MAGSAFE-BP",
    priceInPaise: rupees(9_499),
    costInPaise: rupees(8_100),
    stock: 18,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-magsafe-battery-pack/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "iPhone 12 Silicone Case with MagSafe (Plum)",
    slug: "iphone-12-silicone-case-magsafe-plum",
    description:
      "Soft-touch silicone case with MagSafe alignment magnets and a microfibre interior lining.",
    sku: "NX-ACC-CASE12-PLM",
    priceInPaise: rupees(3_499),
    costInPaise: rupees(2_600),
    stock: 30,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/iphone-12-silicone-case-with-magsafe-plum/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Beats Flex Wireless Earphones",
    slug: "beats-flex-wireless-earphones",
    description:
      "Neckband earphones with the Apple W1 chip, fast fuel charging and magnetic earbuds.",
    sku: "NX-ACC-BEATSFLEX",
    priceInPaise: rupees(5_999),
    costInPaise: rupees(4_900),
    stock: 22,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/beats-flex-wireless-earphones/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple 20W USB-C Power Adapter",
    slug: "apple-20w-usb-c-power-adapter",
    description:
      "Compact fast charger for iPhone and iPad - reaches 50% charge in around 30 minutes.",
    sku: "NX-ACC-PWR20W",
    priceInPaise: rupees(1_899),
    costInPaise: rupees(1_450),
    stock: 40,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-iphone-charger/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Amazon Echo Plus (2nd generation)",
    slug: "amazon-echo-plus-2nd-generation",
    description:
      "Smart speaker with built-in Zigbee hub, far-field microphones and room-filling 3-inch woofer.",
    sku: "NX-ACC-ECHOPLUS2",
    priceInPaise: rupees(12_999),
    costInPaise: rupees(10_900),
    stock: 10,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/amazon-echo-plus/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },

  // ------------------------------------------------------------- New Products
  {
    name: "Sony WH-1000XM5 Wireless Headphones",
    slug: "sony-wh-1000xm5-wireless-headphones",
    description:
      "Industry-leading noise canceling over-ear headphones with two processors, eight microphones and 30-hour battery life.",
    sku: "NX-ACC-SNY-XM5",
    priceInPaise: rupees(29_990),
    costInPaise: rupees(24_000),
    stock: 15,
    categorySlug: "accessories",
    image: "/images/products/sony-wh-1000xm5.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Google Pixel 8 Pro 128GB (Obsidian)",
    slug: "google-pixel-8-pro-128gb-obsidian",
    description:
      "6.7-inch Super Actua display, Google Tensor G3 chip, fully upgraded pro camera system with 5x telephoto and magic editor.",
    sku: "NX-CEL-PXL8P-128",
    priceInPaise: rupees(79_999),
    costInPaise: rupees(68_000),
    stock: 10,
    categorySlug: "cellphones",
    image: "/images/products/google-pixel-8-pro.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple Watch Ultra 2 (Titanium, Orange Ocean Band)",
    slug: "apple-watch-ultra-2-titanium-orange",
    description:
      "Rugged 49mm aerospace-grade titanium case, precision dual-frequency GPS, 3000-nit display and up to 72 hours of battery life.",
    sku: "NX-ACC-AW-ULTRA2",
    priceInPaise: rupees(89_900),
    costInPaise: rupees(78_000),
    stock: 7,
    categorySlug: "accessories",
    image: "/images/products/apple-watch-ultra-2.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Dell XPS 15 9530 (OLED 3.5K)",
    slug: "dell-xps-15-9530-oled",
    description:
      "15.6-inch 3.5K OLED InfinityEdge touch display, 13th Gen Intel Core i7, 32GB RAM, 1TB SSD and NVIDIA RTX 4060 graphics.",
    sku: "NX-LAP-DXPS15-OLED",
    priceInPaise: rupees(1_89_990),
    costInPaise: rupees(1_65_000),
    stock: 5,
    categorySlug: "laptops",
    image: "/images/products/dell-xps-15-oled.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Logitech MX Master 3S Performance Wireless Mouse",
    slug: "logitech-mx-master-3s-performance-mouse",
    description:
      "Ergonomic wireless performance mouse with 8K DPI any-surface tracking, quiet clicks and MagSpeed electromagnetic scrolling.",
    sku: "NX-ACC-LOGI-MX3S",
    priceInPaise: rupees(8_995),
    costInPaise: rupees(6_500),
    stock: 25,
    categorySlug: "accessories",
    image: "/images/products/logitech-mx-master-3s.jpg",
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: 'Apple iPad Pro 11" (M4, Space Black)',
    slug: "apple-ipad-pro-11-m4-space-black",
    description:
      "Ultra Retina XDR display with tandem OLED technology, breakthrough Apple M4 chip performance and Apple Pencil Pro support.",
    sku: "NX-TAB-IPPRO11-M4",
    priceInPaise: rupees(99_900),
    costInPaise: rupees(88_000),
    stock: 8,
    categorySlug: "tablets",
    image: "/images/products/apple-ipad-pro-11-m4.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy S24 Ultra 256GB (Titanium Gray)",
    slug: "samsung-galaxy-s24-ultra-256gb-titanium",
    description:
      "Titanium frame, 6.8-inch Dynamic AMOLED 2X flat display with Gorilla Armor, built-in S Pen and Galaxy AI.",
    sku: "NX-CEL-SGS24U-256",
    priceInPaise: rupees(1_29_999),
    costInPaise: rupees(1_12_000),
    stock: 12,
    categorySlug: "cellphones",
    image: "/images/products/samsung-galaxy-s24-ultra.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy Tab S9 FE (Silver)",
    slug: "samsung-galaxy-tab-s9-fe-silver",
    description:
      "10.9-inch 90Hz display, IP68 water and dust resistant with inbox S Pen, powered by Exynos 1380 with expandable microSD.",
    sku: "NX-TAB-SGTABS9FE",
    priceInPaise: rupees(36_999),
    costInPaise: rupees(31_000),
    stock: 14,
    categorySlug: "tablets",
    image: "/images/products/samsung-galaxy-tab-s9-fe.jpg",
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: 'Apple MacBook Air 13" (M3, Starlight)',
    slug: "apple-macbook-air-13-m3-starlight",
    description:
      "Strikingly thin design with M3 chip, 13.6-inch Liquid Retina display, MagSafe charging and up to 18 hours of battery life.",
    sku: "NX-LAP-MBA13-M3",
    priceInPaise: rupees(1_14_900),
    costInPaise: rupees(1_02_000),
    stock: 9,
    categorySlug: "laptops",
    image: "/images/products/apple-macbook-air-13-m3.jpg",
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Nothing Phone (2) 256GB (Dark Grey)",
    slug: "nothing-phone-2-256gb-dark-grey",
    description:
      "Iconic transparent Glyph Interface 2.0, Snapdragon 8+ Gen 1, 6.7-inch flexible LTPO OLED 120Hz display and dual 50MP Sony sensors.",
    sku: "NX-CEL-NOTH2-256",
    priceInPaise: rupees(39_999),
    costInPaise: rupees(33_500),
    stock: 16,
    categorySlug: "cellphones",
    image: "/images/products/nothing-phone-2.jpg",
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Bose QuietComfort Ultra Earbuds",
    slug: "bose-quietcomfort-ultra-earbuds",
    description:
      "World-class active noise cancellation with breakthrough Bose Immersive Audio, CustomTune technology and all-day comfort.",
    sku: "NX-ACC-BOSE-QCU",
    priceInPaise: rupees(25_900),
    costInPaise: rupees(21_000),
    stock: 18,
    categorySlug: "accessories",
    image: "/images/products/bose-quietcomfort-ultra.jpg",
    isFeatured: false,
    isActive: true,
    isService: false,
  },

  // ------------------------------------------------------------------ Services
  // Services never consume physical inventory: stock stays at 0 and they remain
  // purchasable, which is exactly what the checkout logic must prove.
  {
    name: "Nexora Screen Replacement - Premium (in-store)",
    slug: "nexora-screen-replacement-premium",
    description:
      "Original-grade screen replacement for flagship smartphones, fitted at our service desk in about 90 minutes. Includes a 6-month workmanship warranty.",
    sku: "NX-SVC-SCRN-PREM",
    priceInPaise: rupees(4_999),
    costInPaise: rupees(2_900),
    stock: 0,
    categorySlug: "services",
    image: "/images/products/service-screen-replacement.svg",
    isFeatured: false,
    isActive: true,
    isService: true,
  },
  {
    name: "Nexora Extended Warranty - 2 Years",
    slug: "nexora-extended-warranty-2-years",
    description:
      "Extends manufacturer coverage by 24 months for accidental damage, battery degradation and component failure. Registered against your device serial number.",
    sku: "NX-SVC-WRTY-2Y",
    priceInPaise: rupees(7_999),
    costInPaise: rupees(3_500),
    stock: 0,
    categorySlug: "services",
    image: "/images/products/service-extended-warranty.svg",
    isFeatured: true,
    isActive: true,
    isService: true,
  },
  {
    name: "Nexora Device Setup & Data Transfer",
    slug: "nexora-device-setup-and-data-transfer",
    description:
      "Guided setup of a new phone, tablet or laptop including account sign-in, security settings and migration of your photos, chats and files.",
    sku: "NX-SVC-SETUP-DATA",
    priceInPaise: rupees(999),
    costInPaise: rupees(400),
    stock: 0,
    categorySlug: "services",
    image: "/images/products/service-device-setup.svg",
    isFeatured: false,
    isActive: true,
    isService: true,
  },
  {
    name: "Nexora Annual Maintenance Plan - Business Devices",
    slug: "nexora-annual-maintenance-business-devices",
    description:
      "Twelve months of priority support for company fleets: quarterly health checks, loaner devices during repairs and a dedicated account technician.",
    sku: "NX-SVC-AMC-BIZ",
    priceInPaise: rupees(14_999),
    costInPaise: rupees(7_200),
    stock: 0,
    categorySlug: "services",
    image: "/images/products/service-annual-maintenance.svg",
    isFeatured: false,
    isActive: true,
    isService: true,
  },
  {
    name: "Nexora Battery Replacement (Smartphones)",
    slug: "nexora-battery-replacement-smartphones",
    description:
      "Genuine capacity-matched battery replacement with a 12-month warranty, fitted while you wait.",
    sku: "NX-SVC-BATT-PHONE",
    priceInPaise: rupees(2_499),
    costInPaise: rupees(1_150),
    stock: 0,
    categorySlug: "services",
    image: "/images/products/service-battery-replacement.svg",
    isFeatured: false,
    isActive: true,
    isService: true,
  },

  // ---------------------------------------------------------------- Smart Home
  // Both products are inactive on purpose: they must never appear in the public
  // catalogue, which also leaves this category empty for the empty-state test.
  {
    name: "Nexora Smart Plug (Gen 3)",
    slug: "nexora-smart-plug-gen-3",
    description:
      "Wi-Fi smart plug with energy monitoring and schedules. Withdrawn from sale pending a firmware update.",
    sku: "NX-SMH-PLUG-G3",
    priceInPaise: rupees(1_999),
    costInPaise: rupees(1_250),
    stock: 25,
    categorySlug: "smart-home",
    image: "/images/products/smarthome-smart-plug.svg",
    isFeatured: false,
    isActive: false,
    isService: false,
  },
  {
    name: "Nexora Indoor Security Camera 2K",
    slug: "nexora-indoor-security-camera-2k",
    description:
      "2K indoor camera with night vision and local storage. Discontinued - replaced by a newer model.",
    sku: "NX-SMH-CAM-2K",
    priceInPaise: rupees(4_499),
    costInPaise: rupees(3_100),
    stock: 12,
    categorySlug: "smart-home",
    image: "/images/products/smarthome-security-cam.svg",
    isFeatured: false,
    isActive: false,
    isService: false,
  },

  // ----------------------------------------------------------- 10 More Products
  {
    name: "Apple HomePod Mini (Cosmic Grey)",
    slug: "apple-homepod-mini-cosmic-grey",
    description:
      "Jam-packed with innovation, HomePod mini delivers unexpectedly big sound for a speaker of its size with Siri smart assistant.",
    sku: "NX-ACC-HMPD-MINI",
    priceInPaise: rupees(9_900),
    costInPaise: rupees(8_200),
    stock: 15,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-homepod-mini-cosmic-grey/1.webp`,
    isFeatured: true,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple AirPower Multi-Device Wireless Charger",
    slug: "apple-airpower-multi-device-charger",
    description:
      "Elegant multi-device wireless charging mat capable of fast-charging an iPhone, Apple Watch and AirPods simultaneously.",
    sku: "NX-ACC-AIRPWR-MAT",
    priceInPaise: rupees(4_999),
    costInPaise: rupees(3_800),
    stock: 20,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/apple-airpower-wireless-charger/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Apple iPhone X 256GB (Space Grey, renewed)",
    slug: "apple-iphone-x-256gb-space-grey",
    description:
      "5.8-inch Super Retina HD OLED display with HDR and True Tone, surgical-grade stainless steel band, dual 12MP cameras with dual OIS.",
    sku: "NX-CEL-IPX-256",
    priceInPaise: rupees(29_999),
    costInPaise: rupees(24_000),
    stock: 8,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/iphone-x/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Realme C35 4GB / 64GB (Glowing Green)",
    slug: "realme-c35-4gb-64gb-glowing-green",
    description:
      "Ultra-slim 8.1mm dynamic glowing design with 50MP AI triple camera, FHD full-screen display and 5000mAh all-day battery.",
    sku: "NX-CEL-RMC35-64",
    priceInPaise: rupees(11_999),
    costInPaise: rupees(9_800),
    stock: 22,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/realme-c35/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Vivo V9 64GB (Pearl Black)",
    slug: "vivo-v9-64gb-pearl-black",
    description:
      "6.3-inch FHD+ 19:9 FullView display, AI face access unlock, 24MP selfie camera with bokeh mode and Snapdragon processor.",
    sku: "NX-CEL-VVV9-64",
    priceInPaise: rupees(14_499),
    costInPaise: rupees(12_100),
    stock: 14,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/vivo-v9/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Oppo A57 64GB (Glowing Black)",
    slug: "oppo-a57-64gb-glowing-black",
    description:
      "33W SUPERVOOC fast charge, 5000mAh long-lasting battery, ultra-linear stereo speakers and up to 4GB RAM expansion.",
    sku: "NX-CEL-OPA57-64",
    priceInPaise: rupees(13_999),
    costInPaise: rupees(11_500),
    stock: 18,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/oppo-a57/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Samsung Galaxy S7 32GB (Black Onyx)",
    slug: "samsung-galaxy-s7-32gb-black-onyx",
    description:
      "Quad HD Super AMOLED display with curved back glass, dual pixel 12MP fast focus camera, IP68 water resistance.",
    sku: "NX-CEL-SGS7-32",
    priceInPaise: rupees(12_499),
    costInPaise: rupees(9_900),
    stock: 10,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/samsung-galaxy-s7/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Realme X 128GB (Polar White)",
    slug: "realme-x-128gb-polar-white",
    description:
      "Elevating pop-up camera with AMOLED full-screen display, in-display fingerprint scanner and VOOC Flash Charge 3.0.",
    sku: "NX-CEL-RMX-128",
    priceInPaise: rupees(16_999),
    costInPaise: rupees(14_200),
    stock: 12,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/realme-x/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Vivo X21 128GB (Ruby Red)",
    slug: "vivo-x21-128gb-ruby-red",
    description:
      "Futuristic in-display fingerprint sensor, 19:9 bezel-less Super AMOLED screen, dual rear pixel sensors with AI backlight engine.",
    sku: "NX-CEL-VVX21-128",
    priceInPaise: rupees(19_999),
    costInPaise: rupees(16_500),
    stock: 9,
    categorySlug: "cellphones",
    image: `${IMAGE_BASE}/smartphones/vivo-x21/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
  {
    name: "Nexora Professional Monopod & Desktop Stand",
    slug: "nexora-professional-monopod-desktop-stand",
    description:
      "Heavy-duty aluminium monopod with universal 1/4-inch screw mount, fluid pan head and anti-slip rubberized foot for steady mobile shooting.",
    sku: "NX-ACC-MNPOD-PRO",
    priceInPaise: rupees(2_499),
    costInPaise: rupees(1_500),
    stock: 30,
    categorySlug: "accessories",
    image: `${IMAGE_BASE}/mobile-accessories/monopod/1.webp`,
    isFeatured: false,
    isActive: true,
    isService: false,
  },
];
