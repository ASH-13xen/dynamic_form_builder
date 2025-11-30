import axios from "axios";
import { User } from "../models/user.model.js";
import { Form } from "../models/form.model.js";
import { Response } from "../models/response.model.js";

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

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!title || !baseId || !tableId || !questions || questions.length === 0) {
      return res.status(400).json({
        error: "Missing required fields (title, baseId, tableId, or questions)",
      });
    }

    const newForm = await Form.create({
      userId: req.user.userId,
      title: title,
      airtableBaseId: baseId,
      airtableTableId: tableId,
      questions: questions,
    });

    console.log("Form Saved Successfully:", newForm._id);
    res.status(201).json(newForm);
  } catch (error) {
    console.error("Save Error:", error);
    res.status(500).json({ error: error.message || "Failed to save form" });
  }
};

export const getFormById = async (req, res) => {
  try {
    const { id } = req.params;
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

    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ error: "Form not found" });
    const owner = await User.findById(form.userId);
    if (!owner) return res.status(404).json({ error: "Form owner not found" });

    const data = {};

    form.questions.forEach((q) => {
      const answer = answers[q.questionKey];

      if (answer !== undefined && answer !== "") {
        data[q.airtableFieldId] = answer;
      }
    });

    const airtableUrl = `https://api.airtable.com/v0/${form.airtableBaseId}/${form.airtableTableId}`;

    const airtableRes = await axios.post(
      airtableUrl,
      { fields: data },
      { headers: { Authorization: `Bearer ${owner.accessToken}` } }
    );

    const newRecordId = airtableRes.data.id;
    console.log("Saved to Airtable with ID:", newRecordId);
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

    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ error: "Form not found" });

    if (form.userId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized access to these responses" });
    }

    const responses = await Response.find({
      formId,
      isDeletedInAirtable: { $ne: true },
    }).sort({ submittedAt: -1 });

    res.json(responses);
  } catch (error) {
    console.error("Error fetching responses:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
