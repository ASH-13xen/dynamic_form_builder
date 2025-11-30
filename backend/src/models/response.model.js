import mongoose from "mongoose";

const responseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
  airtableRecordId: { type: String, required: true },
  answers: { type: Map, of: mongoose.Schema.Types.Mixed },
  isDeletedInAirtable: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
});

export const Response = mongoose.model("Response", responseSchema);
