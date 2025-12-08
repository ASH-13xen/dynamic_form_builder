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
  console.log("\n🛑 ---------------------------------------------------");
  console.log("📡 WEBHOOK HIT: Request received from Airtable");

  const {
    base: { id: baseId } = {},
    webhook: { id: webhookId } = {},
    cursor,
  } = req.body;

  console.log(`🆔 Base ID: ${baseId}`);
  console.log(`🆔 Webhook ID: ${webhookId}`);
  console.log(`📍 Cursor provided: ${cursor || "NONE"}`);

  if (!baseId || !webhookId) {
    console.log("⚠️ Missing Base/Webhook ID. Ignoring.");
    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };

    // If cursor exists, use it. If not, fetch recent (might cause duplicates but fixes 'stuck' hooks)
    let payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;
    if (cursor) {
      payloadUrl += `?cursor=${cursor}`;
    }

    console.log(`⬇️  Fetching payloads (Retry: ${isRetry})...`);
    console.log(`    URL: ${payloadUrl}`);

    const { data } = await axios.get(payloadUrl, { headers });

    // console.log("📦 RAW PAYLOAD:", JSON.stringify(data, null, 2)); // Uncomment if you need raw JSON

    if (!data.payloads || data.payloads.length === 0) {
      console.log("ℹ️  No payloads returned from Airtable API.");
      return;
    }

    console.log(`📦 Received ${data.payloads.length} payload(s) to process.`);

    for (const payload of data.payloads) {
      console.log(
        `   🔄 Processing Sequence #${payload.baseTransactionNumber}`
      );

      if (!payload.changedTablesById) {
        console.log("      ℹ️  No table data changes. Skipping.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        console.log(`      📂 Processing Table: ${tableId}`);
        const changes = payload.changedTablesById[tableId];

        // 1. DELETE LOGIC
        if (changes.destroyedRecordIds) {
          console.log(
            `         🗑️  Deletions detected: ${changes.destroyedRecordIds.length} records.`
          );

          const result = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          if (result.modifiedCount > 0) {
            console.log(
              `         ✅ DATABASE UPDATED: ${result.modifiedCount} records marked deleted.`
            );
          } else {
            console.log(
              `         ⚠️  No DB records matched these IDs (already deleted or never existed).`
            );
          }
        }

        // 2. UPDATE LOGIC
        if (changes.changedRecordsById) {
          const recordIds = Object.keys(changes.changedRecordsById);
          console.log(
            `         ✏️  Updates detected for: ${recordIds.length} records.`
          );

          for (const recordId of recordIds) {
            const changeDetails = changes.changedRecordsById[recordId];

            // Handle both data formats (Airtable v0 vs v1 webhook structures)
            const currentData = changeDetails.current;
            const newCellValues =
              currentData?.cellValuesByFieldId || currentData?.cellValues;

            if (!newCellValues) {
              console.log(
                `         ℹ️  Record ${recordId}: No cell values changed (likely metadata update).`
              );
              continue;
            }

            console.log(`            🔎 Processing Record: ${recordId}`);
            // console.log("            Values:", JSON.stringify(newCellValues));

            // A. Find MongoDB Response
            const localResponse = await Response.findOne({
              airtableRecordId: recordId,
            });

            if (!localResponse) {
              console.log(
                `            ❌ SKIPPING: Record ${recordId} not found in MongoDB.`
              );
              continue;
            }

            // B. Find Form Schema
            const form = await Form.findById(localResponse.formId);
            if (!form) {
              console.log(
                `            ❌ ERROR: Associated Form (ID: ${localResponse.formId}) not found.`
              );
              continue;
            }

            let hasUpdates = false;

            // C. Map Fields
            for (const [fieldId, newValue] of Object.entries(newCellValues)) {
              const question = form.questions.find(
                (q) => q.airtableFieldId === fieldId
              );

              if (question) {
                console.log(
                  `               ✅ Match: ${fieldId} -> ${question.questionKey}`
                );
                localResponse.answers.set(question.questionKey, newValue);
                hasUpdates = true;
              } else {
                console.log(
                  `               ⚠️  No Match: Field ${fieldId} not in Form schema.`
                );
              }
            }

            // D. Save
            if (hasUpdates) {
              localResponse.markModified("answers");
              await localResponse.save();
              console.log(`               💾 SUCCESS: Database updated.`);
            }
          }
        }
      }
    }
  };

  try {
    // Authenticate
    let systemUser = await User.findOne({ accessToken: { $exists: true } });

    if (!systemUser) {
      console.error("❌ CRITICAL: No System User found with access token.");
      return res.sendStatus(200);
    }
    // console.log(`👤 Using System User: ${systemUser.email || systemUser._id}`);

    try {
      await fetchAndProcessPayload(systemUser, false);
      console.log("✅ Sync Complete.");
      return res.json({ success: true });
    } catch (apiError) {
      if (apiError.response && apiError.response.status === 401) {
        console.warn("🔐 Token expired (401). Refreshing...");

        if (!systemUser.refreshToken) {
          console.error("❌ No refresh token available.");
          throw new Error("Missing Refresh Token");
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();
        console.log("🔐 Token refreshed.");

        await fetchAndProcessPayload(systemUser, true);
        return res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error.response?.data || error.message);
    // Always return 200 to Airtable to prevent them from disabling your webhook
    res.sendStatus(200);
  }
};
