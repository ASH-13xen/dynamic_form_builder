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
  console.log("---------------------------------------------------");
  console.log("📡 WEBHOOK HIT: Received request from Airtable");

  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log("⚠️  Missing baseId or webhookId. Likely a ping request.");
    return res.sendStatus(200);
  }

  console.log(`🆔 Base ID: ${baseId}`);
  console.log(`🆔 Webhook ID: ${webhookId}`);

  // Internal function to process the data
  const fetchAndProcessPayload = async (user, isRetry = false) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log(
      `⬇️  Fetching payloads from: ${payloadUrl} (Retry: ${isRetry})`
    );

    const { data } = await axios.get(payloadUrl, { headers });

    // CRITICAL DEBUG: Log the raw data from Airtable
    console.log("📦 RAW PAYLOAD RECEIVED:", JSON.stringify(data, null, 2));

    if (!data.payloads || data.payloads.length === 0) {
      console.log("⚠️  No payloads found in response.");
      return;
    }

    for (const payload of data.payloads) {
      console.log(
        `🔄 Processing Payload Sequence: ${payload.baseTransactionNumber}`
      );

      if (!payload.changedTablesById) {
        console.log("ℹ️  No table changes in this payload. Skipping.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        console.log(`📂 Processing Table ID: ${tableId}`);
        const changes = payload.changedTablesById[tableId];

        // 1. Handle Deletions
        if (changes.destroyedRecordIds) {
          console.log(
            `🗑️  Found ${changes.destroyedRecordIds.length} deletions.`
          );
          const deleteResult = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );
          console.log(
            `✅ Database Updated: ${deleteResult.modifiedCount} records marked deleted.`
          );
        }

        // 2. Handle Updates
        if (changes.changedRecordsById) {
          console.log(
            `✏️  Found updates for records:`,
            Object.keys(changes.changedRecordsById)
          );

          for (const recordId in changes.changedRecordsById) {
            console.log(`   🔎 Checking Record ID: ${recordId}`);
            const changeDetails = changes.changedRecordsById[recordId];

            // --- DEBUG: PRINT THE FULL CHANGE OBJECT ---
            console.log(
              "   👀 FULL CHANGE DETAILS:",
              JSON.stringify(changeDetails, null, 2)
            );
            // -------------------------------------------

            if (changeDetails.current && changeDetails.current.cellValues) {
              const newCellValues = changeDetails.current.cellValues;
              console.log(
                `      📝 Cell Values Changed:`,
                JSON.stringify(newCellValues)
              );

              // A. Find Local Response
              const localResponse = await Response.findOne({
                airtableRecordId: recordId,
              });

              if (!localResponse) {
                console.warn(
                  `      ❌ SKIPPING: Record ${recordId} not found in MongoDB.`
                );
                continue;
              }

              // B. Find Form Schema
              const form = await Form.findById(localResponse.formId);
              if (!form) {
                console.log("Form not found");
                continue;
              }

              let hasUpdates = false;

              // C. Iterate Fields
              for (const [fieldId, newValue] of Object.entries(newCellValues)) {
                // Find matching question
                const question = form.questions.find(
                  (q) => q.airtableFieldId === fieldId
                );

                if (question) {
                  console.log(
                    `            ✅ Matched ${fieldId} -> ${question.questionKey}`
                  );
                  console.log(`            🔄 Value: "${newValue}"`);

                  localResponse.answers.set(question.questionKey, newValue);
                  hasUpdates = true;
                } else {
                  // This is common if you deleted a column and made a new one
                  console.log(
                    `            ⚠️ Unmatched Field ID: ${fieldId} (Check your Form Schema)`
                  );
                }
              }

              if (hasUpdates) {
                localResponse.markModified("answers");
                await localResponse.save();
                console.log(`      💾 SAVED to Database.`);
              }
            } else {
              console.log(
                `      ⚠️ Update received, but 'current.cellValues' is missing.`
              );
              console.log(
                `      Check the 'FULL CHANGE DETAILS' log above to see why.`
              );
            }
          }
        }
      }
    }
  };

  // Execution Block
  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) {
      console.warn("❌ Webhook Sync: No system user found in DB.");
      return res.sendStatus(200);
    }

    try {
      await fetchAndProcessPayload(systemUser, false);
      res.json({ success: true });
    } catch (apiError) {
      if (apiError.response && apiError.response.status === 401) {
        console.warn("🔐 Access Token expired (401). Refreshing...");
        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        if (newTokens.refreshToken)
          systemUser.refreshToken = newTokens.refreshToken;
        await systemUser.save();

        await fetchAndProcessPayload(systemUser, true);
        res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("FINAL ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
};
