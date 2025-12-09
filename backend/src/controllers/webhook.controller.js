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
  // Log the raw webhook body first
  console.log("📩 Webhook Event Received:", JSON.stringify(req.body, null, 2));

  // ⚠ Required: handle Airtable challenge verification
  if (req.body?.challenge) {
    console.log(
      "🔐 Challenge received from Airtable → sending back challenge token"
    );
    return res.status(200).send(req.body.challenge);
  }

  const baseId = req.body?.base?.id;
  const webhookId = req.body?.webhook?.id;

  if (!baseId || !webhookId) {
    console.log(
      "⚠ Missing baseId or webhookId in payload — nothing to process"
    );
    return res.sendStatus(200);
  }

  const processPayload = async (user) => {
    const payloadResponse = await axios.get(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
      { headers: { Authorization: `Bearer ${user.accessToken}` } }
    );

    console.log(
      "🔍 Detailed Payload Response:",
      JSON.stringify(payloadResponse.data, null, 2)
    );

    for (const payload of payloadResponse.data.payloads) {
      if (!payload.changedTablesById) continue;

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        if (changes.destroyedRecordIds?.length > 0) {
          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          console.log(
            `🗑 Delete Sync: ${result.modifiedCount} records marked as deleted`
          );
        }
      }
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });

    if (!systemUser) {
      console.log("❌ No user with system Airtable access found");
      return res.sendStatus(200);
    }

    try {
      await processPayload(systemUser);
      return res.status(200).json({ success: true });
    } catch (apiError) {
      if (apiError.response?.status === 401) {
        console.log("🔄 Token expired — refreshing...");

        if (!systemUser.refreshToken) return res.sendStatus(200);

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();

        await processPayload(systemUser);
        return res.status(200).json({ success: true });
      }

      throw apiError;
    }
  } catch (error) {
    console.error("🔥 Webhook Sync Error:", error.message);
    return res.sendStatus(200);
  }
};
