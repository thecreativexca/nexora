import "server-only";

import { Types } from "mongoose";

import { mergeCartDraftLines } from "@/lib/cart/cart-lines";
import { connectDB } from "@/lib/db/mongodb";
import { ensureRequestTime } from "@/lib/db/request-time";
import { toDatabaseError } from "@/lib/services/service-errors";
import { Product } from "@/models/Product";
import type { CartLineDraft, CartLineValidation, CartValidation } from "@/types/cart";

interface LeanCartProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  image?: string;
  priceInPaise: number;
  stock: number;
  isService?: boolean;
  isActive?: boolean;
}

/**
 * Re-reads the cart from MongoDB.
 *
 * The storefront uses this to refresh prices/availability in the bag, and the
 * order service applies the same rules authoritatively before writing an order.
 */
export async function validateCartLines(
  lines: readonly CartLineDraft[],
): Promise<CartValidation> {
  await ensureRequestTime();

  const merged = mergeCartDraftLines(lines);
  if (merged.length === 0) {
    return { lines: [], subtotalInPaise: 0, itemCount: 0, hasIssues: false };
  }

  try {
    await connectDB();

    const products = await Product.find({
      _id: { $in: merged.map((line) => new Types.ObjectId(line.productId)) },
    })
      .select("name slug image priceInPaise stock isService isActive")
      .lean<LeanCartProduct[]>();

    const productById = new Map(products.map((product) => [String(product._id), product]));

    const validations: CartLineValidation[] = merged.map((line) => {
      const product = productById.get(line.productId);

      if (!product) {
        return {
          productId: line.productId,
          slug: "",
          name: "Unavailable item",
          image: "",
          isService: false,
          unitPriceInPaise: 0,
          quantity: line.quantity,
          lineTotalInPaise: 0,
          available: false,
          maxQuantity: null,
          status: "NOT_FOUND" as const,
          message: "This item is no longer sold. Please remove it from your bag.",
        };
      }

      const isService = Boolean(product.isService);
      const maxQuantity = isService ? null : product.stock;
      const base = {
        productId: String(product._id),
        slug: product.slug,
        name: product.name,
        image: product.image ?? "",
        isService,
        unitPriceInPaise: product.priceInPaise,
        quantity: line.quantity,
      };

      if (product.isActive === false) {
        return {
          ...base,
          lineTotalInPaise: 0,
          available: false,
          maxQuantity,
          status: "INACTIVE" as const,
          message: "This item has been withdrawn. Please remove it from your bag.",
        };
      }

      if (!isService && product.stock <= 0) {
        return {
          ...base,
          lineTotalInPaise: 0,
          available: false,
          maxQuantity: 0,
          status: "OUT_OF_STOCK" as const,
          message: "Out of stock. Please remove it from your bag.",
        };
      }

      if (!isService && line.quantity > product.stock) {
        return {
          ...base,
          lineTotalInPaise: product.priceInPaise * product.stock,
          available: false,
          maxQuantity: product.stock,
          status: "INSUFFICIENT_STOCK" as const,
          message: `Only ${product.stock} left in stock.`,
        };
      }

      return {
        ...base,
        lineTotalInPaise: product.priceInPaise * line.quantity,
        available: true,
        maxQuantity,
        status: "OK" as const,
        message: null,
      };
    });

    return {
      lines: validations,
      subtotalInPaise: validations
        .filter((line) => line.available)
        .reduce((total, line) => total + line.lineTotalInPaise, 0),
      itemCount: validations.reduce((count, line) => count + line.quantity, 0),
      hasIssues: validations.some((line) => line.status !== "OK"),
    };
  } catch (error) {
    throw toDatabaseError(error);
  }
}
