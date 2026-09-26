import mongoose, { Schema, type Model } from "mongoose";

export interface CategoryDocument {
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    name: {
      type: String,
      required: [true, "Category name is required."],
      trim: true,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: [true, "Category slug is required."],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 80,
    },
    description: { type: String, trim: true, default: "", maxlength: 500 },
    image: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

/** Backs the public navigation query (active categories, alphabetical). */
categorySchema.index({ isActive: 1, name: 1 });

export const Category: Model<CategoryDocument> =
  (mongoose.models.Category as Model<CategoryDocument> | undefined) ??
  mongoose.model<CategoryDocument>("Category", categorySchema);

export default Category;
