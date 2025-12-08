import axios from "axios";
import { Response } from "../models/response.model.js";
import { Form } from "../models/form.model.js";
import { User } from "../models/user.model.js";

// --- 1. Register Webhook ---
export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;
    const user = await User.findById(req.user.userId);
    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    // Cleanup old hooks
    const listRes = await axios.get(listUrl, { headers });
    for (const hook of listRes.data.webhooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
    }

    // Create new hook
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

    console.log("New Webhook Registered:", response.data.id);
    res.json(response.data);
  } catch (error) {
    console.error(
      "Registration Failed:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

// --- 2. Token Refresh Utility ---
const refreshAirtableToken = async (refreshToken) => {
  const data = new URLSearchParams();
  data.append("grant_type", "refresh_token");
  data.append("refresh_token", refreshToken);
  data.append("client_id", process.env.AIRTABLE_CLIENT_ID);
  data.append("client_secret", process.env.AIRTABLE_CLIENT_SECRET);

  const response = await axios.post(
    "https://api.airtable.com/v0/oauth2/token",
    data.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
  };
};

// --- 3. Handle Webhook (Update & Delete) ---
export const handleAirtableWebhook = async (req, res) => {
  const {
    base: { id: baseId } = {},
    webhook: { id: webhookId } = {},
    cursor,
  } = req.body;

  // If no cursor, it is a ping. Acknowledge and exit.
  if (!baseId || !webhookId || !cursor) {
    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };

    // IMPORTANT: Pass the cursor to get only NEW changes
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads?cursor=${cursor}`;

    const { data } = await axios.get(payloadUrl, { headers });

    if (!data.payloads || data.payloads.length === 0) return;

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        // --- A. Handle Deletions ---
        if (changes.destroyedRecordIds) {
          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );
          console.log(
            `Synced: Marked ${result.modifiedCount} records as deleted.`
          );
        }

        // --- B. Handle Updates ---
        if (changes.changedRecordsById) {
          for (const recordId in changes.changedRecordsById) {
            const changeDetails = changes.changedRecordsById[recordId];

            // Check for both data formats
            const currentData = changeDetails.current;
            const newCellValues =
              currentData?.cellValuesByFieldId || currentData?.cellValues;

            if (newCellValues) {
              const localResponse = await Response.findOne({
                airtableRecordId: recordId,
              });

              // If record is not in Mongo, we cannot update it. Skip.
              if (!localResponse) continue;

              const form = await Form.findById(localResponse.formId);
              if (!form) continue;

              let hasUpdates = false;

              for (const [fieldId, newValue] of Object.entries(newCellValues)) {
                const question = form.questions.find(
                  (q) => q.airtableFieldId === fieldId
                );

                if (question) {
                  localResponse.answers.set(question.questionKey, newValue);
                  hasUpdates = true;
                }
              }

              if (hasUpdates) {
                localResponse.markModified("answers");
                await localResponse.save();
                console.log(`Synced: Updated record ${recordId}`);
              }
            }
          }
        }
      }
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) return res.sendStatus(200);

    try {
      await fetchAndProcessPayload(systemUser, false);
      res.json({ success: true });
    } catch (apiError) {
      // Handle Token Expiry
      if (apiError.response && apiError.response.status === 401) {
        if (!systemUser.refreshToken) throw new Error("Missing Refresh Token");

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();

        await fetchAndProcessPayload(systemUser, true);
        res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Webhook Error:", error.message);
    res.sendStatus(200);
  }
};
