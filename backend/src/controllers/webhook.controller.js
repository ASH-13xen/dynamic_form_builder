import axios from "axios";
import { Response } from "../models/response.model.js";
import { User } from "../models/user.model.js";

// --- REFRESH TOKEN HELPER FUNCTION ---
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
      "Airtable Token Refresh Failure:",
      error.response?.data || error.message
    );
    // Throw an error to trigger the main webhook handler's catch block
    throw new Error("Airtable Token Refresh failed.");
  }
};

// --- WEBHOOK REGISTRATION (CLEANUP) ---
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
      `🔔 Webhook Registration: Found ${existingHooks.length} existing webhooks. Cleaning up...`
    );

    for (const hook of existingHooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
      console.log(`✅ Deleted old webhook: ${hook.id}`);
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
      "❌ Webhook Registration Failed:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

// --- WEBHOOK HANDLER (FIXED FOR DELETIONS AND REFRESH) ---
export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log("🔔 Webhook Ping Acknowledged.");
    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log("🔎 Fetching webhook payload...");
    const { data } = await axios.get(payloadUrl, { headers });

    // The cursor value is required by Airtable but we don't need to manually process it here.
    console.log(`Payloads Received: ${data.payloads.length} transactions.`);

    let deletedCount = 0;

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        // CRITICAL FIX: Only look for destroyedRecordIds to handle deletions.
        if (
          changes.destroyedRecordIds &&
          changes.destroyedRecordIds.length > 0
        ) {
          console.log(`   - Found Deletions in Table ${tableId}.`);

          await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          deletedCount += changes.destroyedRecordIds.length;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(
        `✅ SYNC COMPLETE: Marked ${deletedCount} records as deleted in MongoDB.`
      );
    } else {
      console.log("ℹ️ SYNC COMPLETE: No deletions found in payload.");
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });

    if (!systemUser) {
      console.warn(
        "⚠️ Webhook Sync: No system user found for Airtable API access."
      );
      return res.sendStatus(200);
    }

    // 1. Initial attempt to fetch payload
    try {
      await fetchAndProcessPayload(systemUser);
      return res.json({ success: true });
    } catch (apiError) {
      // 2. Catch 401 error and attempt refresh
      if (apiError.response && apiError.response.status === 401) {
        console.warn("⚠️ Access Token expired (401). Attempting to refresh...");

        if (!systemUser.refreshToken) {
          console.error("❌ Token refresh failed: Missing refresh token.");
          // Acknowledge the webhook but log failure
          return res.sendStatus(200);
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        // Update user tokens
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();
        console.log("✅ Token successfully refreshed and saved to DB.");

        // 3. Retry fetching payload with new token
        await fetchAndProcessPayload(systemUser);
        return res.json({ success: true });
      } else {
        // Handle all other API errors (e.g., 404, 500)
        throw apiError;
      }
    }
  } catch (error) {
    console.error(
      "❌ Webhook Sync Error (Final):",
      error.response?.data || error.message
    );
    // Always return 200 to Airtable to prevent them from retrying the webhook indefinitely
    res.sendStatus(200);
  }
};
