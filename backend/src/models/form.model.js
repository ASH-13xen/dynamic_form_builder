import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  questionKey: { type: String, required: true },
  airtableFieldId: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "singleLineText",
      "multilineText",
      "singleSelect",
      "multipleSelects",
      "multipleAttachments",
    ],
    required: true,
  },
  options: [String],

  required: { type: Boolean, default: false },

  conditionalRules: {
    type: {
      logic: { type: String, enum: ["AND", "OR"] },
      conditions: [
        {
          questionKey: String,
          operator: String,
          value: mongoose.Schema.Types.Mixed,
        },
      ],
    },
    default: null,
  },
});

const formSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: String,
    airtableBaseId: String,
    airtableTableId: String,
    questions: [QuestionSchema],
  },
  { timestamps: true }
);

export const Form = mongoose.model("Form", formSchema);
