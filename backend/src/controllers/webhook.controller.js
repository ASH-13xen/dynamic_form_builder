import axios from "axios";
import { Response } from "../models/response.model.js";
import { User } from "../models/user.model.js";

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

export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;
    const user = await User.findById(req.user.userId);
    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    const listRes = await axios.get(listUrl, { headers });

    for (const hook of listRes.data.webhooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
    }

    const response = await axios.post(
      listUrl,
      {
        notificationUrl: webhookUrl,
        specification: { options: { filters: { dataTypes: ["tableData"] } } },
      },
      { headers }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) return res.sendStatus(200);

  const processPayload = async (user) => {
    const { data } = await axios.get(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
      { headers: { Authorization: `Bearer ${user.accessToken}` } }
    );

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        if (changes.destroyedRecordIds) {
          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          // Only log if we ACTUALLY updated something in MongoDB
          if (result.modifiedCount > 0) {
            console.log(
              `Synced: Marked ${result.modifiedCount} records as deleted.`
            );
          }
        }
      }
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) return res.sendStatus(200);

    try {
      await processPayload(systemUser);
      return res.json({ success: true });
    } catch (apiError) {
      if (apiError.response && apiError.response.status === 401) {
        if (!systemUser.refreshToken) return res.sendStatus(200);

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();

        await processPayload(systemUser);
        return res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Webhook Sync Error:", error.message);
    res.sendStatus(200);
  }
};
