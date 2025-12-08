import axios from "axios";

import { Response } from "../models/response.model.js";

import { Form } from "../models/form.model.js";

import { User } from "../models/user.model.js";

export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;

    const user = await User.findById(req.user.userId);

    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;

    const headers = { Authorization: `Bearer ${user.accessToken}` };

    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    const listRes = await axios.get(listUrl, { headers });

    const existingHooks = listRes.data.webhooks;

    console.log(
      `Found ${existingHooks.length} existing webhooks. Cleaning up...`
    );

    for (const hook of existingHooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });

      console.log(`Deleted old webhook: ${hook.id}`);
    }

    const response = await axios.post(
      listUrl,

      {
        notificationUrl: webhookUrl,

        specification: {
          options: {
            filters: { dataTypes: ["tableData"] },
          },
        },
      },

      { headers }
    );

    console.log("✅ New Webhook Registered:", response.data.id);

    res.json(response.data);
  } catch (error) {
    console.error(
      "Registration Failed:",

      error.response?.data || error.message
    );

    res.status(500).json({ error: "Failed to register webhook" });
  }
};

const refreshAirtableToken = async (refreshToken) => {
  const data = new URLSearchParams();

  data.append("grant_type", "refresh_token");

  data.append("refresh_token", refreshToken);

  data.append("client_id", process.env.AIRTABLE_CLIENT_ID);

  data.append("client_secret", process.env.AIRTABLE_CLIENT_SECRET);

  try {
    const response = await axios.post(
      "https://api.airtable.com/v0/oauth2/token",

      data.toString(),

      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      accessToken: response.data.access_token,

      refreshToken: response.data.refresh_token,
    };
  } catch (error) {
    console.error(
      "Airtable Token Refresh Failure:",

      error.response?.data || error.message
    );

    throw new Error(
      "Airtable Token Refresh failed: Check client_id/secret or refresh token validity."
    );
  }
};

export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log(
      "Airtable Webhook: Received ping or incomplete body. Acknowledging."
    );

    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };

    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log(
      `Fetching webhook payload for base ${baseId}... (Retry: ${isRetry})`
    );

    const { data } = await axios.get(payloadUrl, { headers });

    console.dir(data, { depth: null });

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        if (changes.destroyedRecordIds) {
          await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },

            { isDeletedInAirtable: true }
          );

          console.log(
            `Synced: Marked ${changes.destroyedRecordIds.length} records in table ${tableId} as deleted.`
          );
        }
      }
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });

    if (!systemUser) {
      console.warn(
        "Webhook Sync: No system user found for Airtable API access."
      );

      return res.sendStatus(200);
    }

    try {
      await fetchAndProcessPayload(systemUser, false);

      return res.json({ success: true });
    } catch (apiError) {
      if (apiError.response && apiError.response.status === 401) {
        console.warn("Access Token expired (401). Attempting to refresh...");

        if (!systemUser.refreshToken) {
          console.error(
            "Token refresh failed: No refresh token available on user object."
          );

          throw new Error("Missing Refresh Token");
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        systemUser.accessToken = newTokens.accessToken;

        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;

        await systemUser.save();

        console.log(" Token successfully refreshed and saved to DB.");

        await fetchAndProcessPayload(systemUser, true);

        return res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error(
      "Webhook Sync Error (Final):",

      error.response?.data || error.message
    );

    res.sendStatus(200);
  }
};

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

import crypto from "crypto";

import axios from "axios";

import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";

export const login = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");

  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const codeChallenge = crypto

    .createHash("sha256")

    .update(codeVerifier)

    .digest("base64url");

  const isProduction = process.env.NODE_ENV === "production";

  const cookieOptions = {
    httpOnly: true,

    secure: isProduction,

    sameSite: isProduction ? "none" : "lax",

    maxAge: 10 * 60 * 1000,
  };

  res.cookie("oauth_state", state, cookieOptions);

  res.cookie("oauth_verifier", codeVerifier, cookieOptions);

  const authUrl =
    `https://airtable.com/oauth2/v1/authorize?` +
    `client_id=${process.env.AIRTABLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(
      process.env.AIRTABLE_OAUTH_REDIRECT_URL
    )}&` +
    `response_type=code&` +
    `scope=data.records:read data.records:write schema.bases:read webhook:manage user.email:read&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;

  res.redirect(authUrl);
};

export const callback = async (req, res) => {
  const { code, state } = req.query;

  const storedState = req.cookies.oauth_state;

  const codeVerifier = req.cookies.oauth_verifier;

  if (!storedState || !codeVerifier || state !== storedState) {
    return res

      .status(400)

      .send("Security Error: Invalid state or Session expired");
  }

  try {
    const credentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      "https://airtable.com/oauth2/v1/token",

      new URLSearchParams({
        grant_type: "authorization_code",

        code: code,

        redirect_uri: process.env.AIRTABLE_OAUTH_REDIRECT_URL,

        client_id: process.env.AIRTABLE_CLIENT_ID,

        code_verifier: codeVerifier,
      }),

      {
        headers: {
          Authorization: `Basic ${credentials}`,

          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.clearCookie("oauth_state");

    res.clearCookie("oauth_verifier");

    const { access_token, refresh_token, expires_in } = response.data;

    const userMe = await axios.get("https://api.airtable.com/v0/meta/whoami", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = await User.findOneAndUpdate(
      { airtableUserId: userMe.data.id },

      {
        email: userMe.data.email,

        accessToken: access_token,

        refreshToken: refresh_token,

        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },

      { new: true, upsert: true }
    );

    const token = jwt.sign(
      { userId: user._id, email: user.email },

      process.env.JWT_SECRET,

      { expiresIn: "7d" }
    );

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,

      secure: isProduction,

      sameSite: isProduction ? "none" : "lax",

      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);

    res.redirect(`${process.env.CLIENT_URL}/login?error=true`);
  }
};

export const logout = (req, res) => {
  res.clearCookie("token");

  res.status(200).json({ message: "Logged out successfully" });
};

export const checkAuth = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-accessToken -refreshToken"
    );

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

import { Router } from "express";

import {
  handleAirtableWebhook,
  registerWebhook,
} from "../controllers/webhook.controller.js";

import { protectRoute } from "../middleware/protect.route.js";

const router = Router();

router.post("/register/:baseId", protectRoute, registerWebhook);

router.post("/airtable", handleAirtableWebhook);

export default router;

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

import mongoose from "mongoose";

const responseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },

  airtableRecordId: { type: String, required: true },

  answers: { type: Map, of: mongoose.Schema.Types.Mixed },

  isDeletedInAirtable: { type: Boolean, default: false },

  submittedAt: { type: Date, default: Date.now },
});

export const Response = mongoose.model("Response", responseSchema);

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
