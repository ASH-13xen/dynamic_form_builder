import axios from "axios";
import { Response } from "../models/response.model.js";
import { Form } from "../models/form.model.js";
import { User } from "../models/user.model.js";

// --- 1. Register Webhook ---
export const registerWebhook = async (req, res) => {
  console.log("--- Starting Webhook Registration ---");
  try {
    const { baseId } = req.params;
    console.log(`Registering for Base ID: ${baseId}`);

    const user = await User.findById(req.user.userId);
    if (!user) {
      console.log("User not found for registration.");
      return res.status(404).json({ error: "User not found" });
    }

    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;
    console.log(`Target Notification URL: ${webhookUrl}`);

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    // 1. Cleanup old hooks
    console.log("Fetching existing webhooks to clean up...");
    const listRes = await axios.get(listUrl, { headers });

    for (const hook of listRes.data.webhooks) {
      console.log(`Deleting old webhook: ${hook.id}`);
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
    }

    // 2. Create new hook
    // NOTE: We removed the 'filters' object to ensure we get ALL events (deletes, creates, updates)
    const payloadSpec = {
      notificationUrl: webhookUrl,
      specification: {
        options: {
          // Empty options means "listen to everything"
          filters: {
            dataTypes: ["tableData"],
            recordHistory: true, // Explicitly requesting history/changes
          },
        },
      },
    };

    console.log(
      "Sending registration payload:",
      JSON.stringify(payloadSpec, null, 2)
    );

    const response = await axios.post(listUrl, payloadSpec, { headers });

    console.log("SUCCESS: New Webhook Registered with ID:", response.data.id);
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
  console.log("--- Refreshing Airtable Token ---");
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

  console.log("Token refreshed successfully.");
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
  };
};

// --- 3. Handle Webhook (Update & Delete) ---
export const handleAirtableWebhook = async (req, res) => {
  console.log("\n========================================");
  console.log("INCOMING WEBHOOK HIT");
  console.log("========================================");

  const {
    base: { id: baseId } = {},
    webhook: { id: webhookId } = {},
    cursor,
  } = req.body;

  console.log("Webhook Params:", { baseId, webhookId, cursor });

  // If no cursor, it is a ping. Acknowledge and exit.
  if (!baseId || !webhookId || !cursor) {
    console.log("Ping received (no cursor). Sending 200 OK.");
    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    console.log(`Processing payload (Retry: ${isRetry})...`);

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads?cursor=${cursor}`;

    console.log(`Fetching payloads from: ${payloadUrl}`);
    const { data } = await axios.get(payloadUrl, { headers });

    // LOG THE RAW PAYLOAD FROM AIRTABLE
    console.log("--- RAW AIRTABLE PAYLOAD ---");
    console.log(JSON.stringify(data, null, 2));
    console.log("----------------------------");

    if (!data.payloads || data.payloads.length === 0) {
      console.log("No payloads found in response.");
      return;
    }

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) {
        console.log("Skipping payload: No 'changedTablesById' found.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];
        console.log(`Processing changes for Table ID: ${tableId}`);

        // --- A. Handle Deletions ---
        if (
          changes.destroyedRecordIds &&
          changes.destroyedRecordIds.length > 0
        ) {
          console.log("!!! DELETION DETECTED !!!");
          console.log("IDs to delete:", changes.destroyedRecordIds);

          // FIX: Added $set operator here
          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { $set: { isDeletedInAirtable: true } }
          );

          console.log(
            `Synced: Marked ${result.modifiedCount} mongo records as deleted.`
          );
        } else {
          console.log("No deletions in this table batch.");
        }

        // --- B. Handle Updates ---
        if (changes.changedRecordsById) {
          console.log(
            `Updates detected for ${
              Object.keys(changes.changedRecordsById).length
            } records.`
          );

          for (const recordId in changes.changedRecordsById) {
            const changeDetails = changes.changedRecordsById[recordId];

            // Check for both data formats
            const currentData = changeDetails.current;
            const newCellValues =
              currentData?.cellValuesByFieldId || currentData?.cellValues;

            if (newCellValues) {
              console.log(`Processing update for Record: ${recordId}`);

              const localResponse = await Response.findOne({
                airtableRecordId: recordId,
              });

              if (!localResponse) {
                console.log(
                  `Record ${recordId} not found in MongoDB. Skipping.`
                );
                continue;
              }

              const form = await Form.findById(localResponse.formId);
              if (!form) {
                console.log(`Form not found for response. Skipping.`);
                continue;
              }

              let hasUpdates = false;

              for (const [fieldId, newValue] of Object.entries(newCellValues)) {
                const question = form.questions.find(
                  (q) => q.airtableFieldId === fieldId
                );

                if (question) {
                  console.log(
                    `Updating field: ${question.questionKey} -> ${newValue}`
                  );
                  localResponse.answers.set(question.questionKey, newValue);
                  hasUpdates = true;
                }
              }

              if (hasUpdates) {
                localResponse.markModified("answers");
                await localResponse.save();
                console.log(
                  `Synced: Successfully saved update for ${recordId}`
                );
              } else {
                console.log(`No mapped fields changed for ${recordId}`);
              }
            }
          }
        }
      }
    }
  };

  try {
    // Note: This grabs the first user with a token. Ensure this matches your actual logic.
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) {
      console.log("No system user found to process webhook.");
      return res.sendStatus(200);
    }

    try {
      await fetchAndProcessPayload(systemUser, false);
      res.json({ success: true });
    } catch (apiError) {
      // Handle Token Expiry
      if (apiError.response && apiError.response.status === 401) {
        console.log("401 Unauthorized received. Attempting Token Refresh...");

        if (!systemUser.refreshToken) throw new Error("Missing Refresh Token");

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();

        console.log("Retrying payload processing with new token...");
        await fetchAndProcessPayload(systemUser, true);
        res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Webhook Error:", error.message);
    if (error.response) console.error("API Error Data:", error.response.data);

    res.sendStatus(200); // Always return 200 to Airtable to prevent retries on logic errors
  }
};
