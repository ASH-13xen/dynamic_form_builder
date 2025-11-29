import mongoose from "mongoose";

const responseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },

  // The ID Airtable gives us (Important for syncing later)
  airtableRecordId: { type: String, required: true },

  // We store answers as a flexible object
  answers: { type: Map, of: mongoose.Schema.Types.Mixed },
  isDeletedInAirtable: { type: Boolean, default: false },

  submittedAt: { type: Date, default: Date.now },
});

export const Response = mongoose.model("Response", responseSchema);
