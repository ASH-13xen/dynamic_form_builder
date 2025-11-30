import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    airtableUserId: { type: String, required: true, unique: true },
    email: String,
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
