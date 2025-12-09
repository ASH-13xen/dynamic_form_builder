import axios from "axios";
import { Response } from "../models/response.model.js";
import { User } from "../models/user.model.js";

/* ---------------- Refresh Token Helper ---------------- */
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
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
    };
  } catch (error) {
    throw new Error("Failed to refresh Airtable token");
  }
};

/* ---------------- Register Webhook ---------------- */
export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;
    const user = await User.findById(req.user.userId);
    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;

    console.log("Registering webhook URL:", webhookUrl);

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    // Remove previously created hooks
    const listRes = await axios.get(listUrl, { headers });

    console.log("Existing Webhooks:", listRes.data.webhooks);

    for (const hook of listRes.data.webhooks) {
      console.log("Deleting existing webhook:", hook.id);
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
    }

    // Create new webhook
    const response = await axios.post(
      listUrl,
      {
        notificationUrl: webhookUrl,
        specification: { options: { filters: { dataTypes: ["tableData"] } } },
      },
      { headers }
    );

    console.log("Webhook registered successfully:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("Register webhook error:", error.message);
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

/* ---------------- Handle Webhook Events ---------------- */
export const handleAirtableWebhook = async (req, res) => {
  console.log("===== 🔔 WEBHOOK HIT START =====");
  console.log("RAW HEADERS:", JSON.stringify(req.headers, null, 2));
  console.log("RAW BODY:", JSON.stringify(req.body, null, 2));

  // Handle handshake challenge
  if (req.body?.challenge) {
    console.log("🚨 Challenge received:", req.body.challenge);
    console.log("===== 🔔 WEBHOOK CHALLENGE END =====");
    return res.status(200).send(req.body.challenge);
  }

  const baseId = req.body?.base?.id;
  const webhookId = req.body?.webhook?.id;

  console.log("Parsed Base ID:", baseId);
  console.log("Parsed Webhook ID:", webhookId);

  if (!baseId || !webhookId) {
    console.log("❌ No baseId or webhookId received - nothing to process");
    console.log("===== 🔔 WEBHOOK END (NO DATA) =====");
    return res.sendStatus(200);
  }

  const systemUser = await User.findOne({ accessToken: { $exists: true } });
  console.log("SYSTEM USER FOUND:", systemUser?.email || "NO USER FOUND");

  if (!systemUser) {
    console.log("❌ No user found with Airtable tokens.");
    return res.sendStatus(200);
  }

  const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;
  console.log("Fetching payloads from:", payloadUrl);

  try {
    const payloadResponse = await axios.get(payloadUrl, {
      headers: { Authorization: `Bearer ${systemUser.accessToken}` },
    });

    console.log(
      "📦 Airtable Payloads Response:",
      JSON.stringify(payloadResponse.data, null, 2)
    );

    for (const payload of payloadResponse.data.payloads) {
      console.log("Processing payload entry:", payload);

      if (!payload.changedTablesById) {
        console.log("⚠ No changedTablesById found, skipping...");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];
        console.log("Changes detected:", JSON.stringify(changes, null, 2));

        if (changes.destroyedRecordIds?.length > 0) {
          console.log("🗑 Destroyed Record IDs:", changes.destroyedRecordIds);

          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          console.log("Mongo Update Result:", result);
        }
      }
    }

    console.log("===== 🔔 WEBHOOK END SUCCESS =====");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(
      "🔥 Payload Fetch Error:",
      error.response?.data || error.message
    );

    if (error.response?.status === 401) {
      console.log("🔄 REFRESH TOKEN REQUIRED - EXPIRED TOKEN!");
    }

    console.log("===== 🔔 WEBHOOK END ERROR =====");
    return res.sendStatus(200);
  }
};
