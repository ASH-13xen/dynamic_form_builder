import axios from "axios";
import { Response } from "../models/response.model.js";
import { User } from "../models/user.model.js";

// --- HELPER: Refresh Expired Token ---
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
    console.error(
      "Token Refresh Failed:",
      error.response?.data || error.message
    );
    throw new Error("Failed to refresh Airtable token");
  }
};

// --- REGISTER WEBHOOK (Setup) ---
export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;
    const user = await User.findById(req.user.userId);
    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    // 1. List existing hooks
    const listRes = await axios.get(listUrl, { headers });
    const existingHooks = listRes.data.webhooks;
    console.log(
      `Found ${existingHooks.length} existing webhooks. Cleaning up...`
    );

    // 2. Delete old hooks to prevent "Too Many Webhooks" error
    for (const hook of existingHooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
    }

    // 3. Create new hook
    const response = await axios.post(
      listUrl,
      {
        notificationUrl: webhookUrl,
        specification: { options: { filters: { dataTypes: ["tableData"] } } },
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

// --- HANDLE WEBHOOK (Listener) ---
export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) return res.sendStatus(200);

  // Define the logic as a reusable function so we can retry it after refresh
  const processPayload = async (user) => {
    const { data } = await axios.get(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
      { headers: { Authorization: `Bearer ${user.accessToken}` } }
    );

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      // Use for...in loop instead of forEach to ensure async/await works correctly
      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        if (changes.destroyedRecordIds) {
          await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );
          console.log(
            `Synced: Marked ${changes.destroyedRecordIds.length} records as deleted.`
          );
        }
      }
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) return res.sendStatus(200);

    try {
      // Attempt 1: Try fetching payload
      await processPayload(systemUser);
      return res.json({ success: true });
    } catch (apiError) {
      // Attempt 2: If 401 Unauthorized, refresh token and retry
      if (apiError.response && apiError.response.status === 401) {
        console.warn("Token expired. Refreshing...");

        if (!systemUser.refreshToken) return res.sendStatus(200);

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        // Update DB
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();

        // Retry Logic
        await processPayload(systemUser);
        return res.json({ success: true });
      } else {
        throw apiError; // Throw other errors normally
      }
    }
  } catch (error) {
    console.error("Webhook Sync Error:", error.message);
    res.sendStatus(200);
  }
};
