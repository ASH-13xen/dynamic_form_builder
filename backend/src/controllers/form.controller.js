import axios from "axios";
import { User } from "../models/user.model.js";
import { Form } from "../models/form.model.js";
import { Response } from "../models/response.model.js";

// 1. GET BASES
export const getBases = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const response = await axios.get("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    res.json(response.data.bases);
  } catch (error) {
    console.error("Error fetching bases:", error.message);
    res.status(500).json({ error: "Failed to fetch bases" });
  }
};

// 2. GET TABLES
export const getTables = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { baseId } = req.params;
    const response = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }
    );
    res.json(response.data.tables);
  } catch (error) {
    console.error("Error fetching tables:", error.message);
    res.status(500).json({ error: "Failed to fetch tables" });
  }
};

export const createForm = async (req, res) => {
  try {
    const { title, baseId, tableId, questions } = req.body;

    console.log("Receiving Form Data:", {
      title,
      baseId,
      tableId,
      questionCount: questions?.length,
    });

    // 1. Validation: Ensure User ID exists (from protectRoute middleware)
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized: User ID missing" });
    }

    // 2. Validation: Ensure required fields are present
    if (!title || !baseId || !tableId || !questions || questions.length === 0) {
      return res.status(400).json({
        error: "Missing required fields (title, baseId, tableId, or questions)",
      });
    }

    // 3. Create the Form in MongoDB
    const newForm = await Form.create({
      userId: req.user.userId, // Link the form to the logged-in user
      title: title,
      airtableBaseId: baseId,
      airtableTableId: tableId,
      questions: questions, // The array of configured fields
    });

    console.log("Form Saved Successfully:", newForm._id);
    res.status(201).json(newForm);
  } catch (error) {
    console.error("Save Error:", error);
    // Return the actual error message so you can see it in the frontend console
    res.status(500).json({ error: error.message || "Failed to save form" });
  }
};

export const getFormById = async (req, res) => {
  try {
    const { id } = req.params;

    // We find the form by ID.
    // We do NOT check req.user because anonymous people need to fill this out.
    const form = await Form.findById(id);

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    res.json(form);
  } catch (error) {
    console.error("Error fetching form:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

export const getUserForms = async (req, res) => {
  try {
    // req.user is set by the protectRoute middleware
    const forms = await Form.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json(forms);
  } catch (error) {
    console.error("Error fetching user forms:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
export const submitResponse = async (req, res) => {
  try {
    const { formId } = req.params;
    const { answers } = req.body;

    console.log(`Submitting to Form ${formId}`, answers);

    // A. Find the Form & Owner
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ error: "Form not found" });

    // B. Find the Owner to get their Airtable Access Token
    const owner = await User.findById(form.userId);
    if (!owner) return res.status(404).json({ error: "Form owner not found" });

    // C. Prepare Data for Airtable
    // Airtable API expects: { "fields": { "Field_ID": "Value" } }
    const airtableFields = {};

    // Map our questionKeys back to Airtable Field IDs
    form.questions.forEach((q) => {
      const answer = answers[q.questionKey];

      // Only send if the user provided an answer
      if (answer !== undefined && answer !== "") {
        // Special handling for Arrays (Multi-Select)
        // Airtable expects simple arrays for multi-selects
        airtableFields[q.airtableFieldId] = answer;
      }
    });

    // NOTE: File Uploads (Attachments) are skipped here.
    // Airtable API requires a public URL to upload files, which requires S3/Cloudinary.
    // For this task, we only send text/select data.

    // D. Send to Airtable
    const airtableUrl = `https://api.airtable.com/v0/${form.airtableBaseId}/${form.airtableTableId}`;

    const airtableRes = await axios.post(
      airtableUrl,
      { fields: airtableFields },
      { headers: { Authorization: `Bearer ${owner.accessToken}` } }
    );

    const newRecordId = airtableRes.data.id;
    console.log("Saved to Airtable with ID:", newRecordId);

    // E. Save Backup to MongoDB
    const response = await Response.create({
      formId: form._id,
      airtableRecordId: newRecordId,
      answers: answers,
    });

    res.status(201).json({ message: "Success", id: response._id });
  } catch (error) {
    console.error("Submission Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to submit form" });
  }
};

export const getFormResponses = async (req, res) => {
  try {
    const { formId } = req.params;

    // A. Verify Ownership (Security)
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ error: "Form not found" });

    // Check if the logged-in user owns this form
    if (form.userId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized access to these responses" });
    }

    // B. Fetch Responses from MongoDB
    const responses = await Response.find({
      formId,
      isDeletedInAirtable: { $ne: true }, // <--- THIS IS THE KEY
    }).sort({ submittedAt: -1 });

    res.json(responses);
  } catch (error) {
    console.error("Error fetching responses:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
