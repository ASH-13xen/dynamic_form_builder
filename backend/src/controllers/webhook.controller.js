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
