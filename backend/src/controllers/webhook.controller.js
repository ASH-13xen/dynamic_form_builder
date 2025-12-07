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
  // 1. Prepare the request data as URLSearchParams (form data)
  const data = new URLSearchParams();
  data.append("grant_type", "refresh_token");
  data.append("refresh_token", refreshToken);
  data.append("client_id", process.env.AIRTABLE_CLIENT_ID);
  data.append("client_secret", process.env.AIRTABLE_CLIENT_SECRET);

  try {
    // 2. Send the POST request with the correct headers and data
    const response = await axios.post(
      "https://api.airtable.com/v0/oauth2/token",
      data.toString(), // Convert URLSearchParams to the request body string
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded", // CRITICAL HEADER
        },
      }
    ); // 3. Return the new tokens

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token, // NOTE: Airtable does not always return a new refresh_token. // Your logic in handleAirtableWebhook already handles this: // systemUser.refreshToken = newTokens.refreshToken || systemUser.refreshToken;
    };
  } catch (error) {
    console.error(
      "Airtable Token Refresh Failure:",
      error.response?.data || error.message
    ); // Re-throw a clear error to be caught by the main handler
    throw new Error(
      "Airtable Token Refresh failed: Check client_id/secret or refresh token validity."
    );
  }
};

/**
 * Handles incoming Airtable webhook notifications, fetches the payload,
 * and synchronizes changes (e.g., deleted records) to the local database.
 * Includes logic to refresh the access token if it has expired (401 error).
 */
export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  // Acknowledge the webhook request immediately if it's a simple ping or lacks IDs
  if (!baseId || !webhookId) {
    console.log(
      "Airtable Webhook: Received ping or incomplete body. Acknowledging."
    );
    return res.sendStatus(200);
  }

  // This function encapsulates the core logic of fetching and processing the payload
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
            `✅ Synced: Marked ${changes.destroyedRecordIds.length} records in table ${tableId} as deleted.`
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
      // 1. Attempt the primary action
      await fetchAndProcessPayload(systemUser, false);
      return res.json({ success: true });
    } catch (apiError) {
      // 2. Check if the error is a 401 (Unauthorized - usually token expiration)
      if (apiError.response && apiError.response.status === 401) {
        console.warn("Access Token expired (401). Attempting to refresh...");

        if (!systemUser.refreshToken) {
          console.error(
            "Token refresh failed: No refresh token available on user object."
          );
          throw new Error("Missing Refresh Token");
        }

        // 3. Get new tokens
        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        // 4. Update the user record with the new tokens
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken; // Use new refresh token if returned
        // systemUser.tokenExpiresAt = newTokens.expiresAt; // Optional: store expiration
        await systemUser.save();
        console.log("✅ Token successfully refreshed and saved to DB.");

        // 5. Retry the primary action with the new token
        await fetchAndProcessPayload(systemUser, true);
        return res.json({ success: true });
      } else {
        // Not a 401 error (e.g., 404, 500, network error) - re-throw
        throw apiError;
      }
    }
  } catch (error) {
    console.error(
      "Webhook Sync Error (Final):",
      error.response?.data || error.message
    );
    // Important: Always respond 200 to Airtable, even on processing failure,
    // to prevent it from retrying the webhook continuously.
    res.sendStatus(200);
  }
};
