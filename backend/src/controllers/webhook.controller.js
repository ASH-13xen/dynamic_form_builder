import axios from "axios";
import { Response } from "../models/response.model.js";
import { User } from "../models/user.model.js";

// --- HELPER: REFRESH TOKEN ---
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
    throw new Error("Airtable Token Refresh failed.");
  }
};

// --- REGISTER WEBHOOK ---
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
      `🔔 REGISTRATION: Starting cleanup of ${existingHooks.length} old webhooks...`
    );

    for (const hook of existingHooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
      console.log(`✅ REGISTRATION: Deleted old hook: ${hook.id}`);
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

    console.log("✅ REGISTRATION: New Webhook Registered:", response.data.id);
    res.json(response.data);
  } catch (error) {
    console.error(
      "❌ REGISTRATION Failed:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

// --- HANDLE WEBHOOK ---
export const handleAirtableWebhook = async (req, res) => {
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log(
      "🔔 WEBHOOK START: Received ping/incomplete body. Sending 200."
    );
    return res.sendStatus(200);
  }

  const fetchAndProcessPayload = async (user) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log(`🔎 WEBHOOK SYNC: Starting fetch for base ${baseId}...`);
    const { data } = await axios.get(payloadUrl, { headers });

    console.log(
      `PAYLOAD: Received ${data.payloads.length} total transactions since last sync.`
    );

    let deletedCount = 0;
    let transactionIndex = 0;

    for (const payload of data.payloads) {
      transactionIndex++;

      console.log(
        `--- TRANSACTION #${transactionIndex} (Total Transactions: ${data.payloads.length}) ---`
      );

      if (!payload.changedTablesById) {
        console.log("  -> No table changes found in this transaction.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        if (
          changes.destroyedRecordIds &&
          changes.destroyedRecordIds.length > 0
        ) {
          console.log(`   🚨 DELETION DETECTED in Table ${tableId}!`);
          console.log(
            `   IDs Received from Airtable:`,
            changes.destroyedRecordIds
          );

          // PERFORM UPDATE AND LOG RESULT
          const dbResult = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          console.log(
            `   MONGO DB RESULT: Matched=${dbResult.matchedCount}, Modified=${dbResult.modifiedCount}`
          );

          if (dbResult.matchedCount === 0) {
            console.log(
              "   ⚠️ WARNING: MongoDB found 0 records matching these IDs. Did you delete a record that wasn't in the DB?"
            );
          }

          deletedCount += dbResult.modifiedCount;
        } else {
          // Optional check to see if we missed anything else:
          if (changes.changedRecordsById) {
            console.log(
              `   ℹ️ Found ${
                Object.keys(changes.changedRecordsById).length
              } record edits, skipping...`
            );
          }
        }
      }
    }

    if (deletedCount > 0) {
      console.log(
        `\n✅ SYNC COMPLETE: Marked ${deletedCount} records as deleted in MongoDB.`
      );
    } else {
      console.log("\nℹ️ SYNC COMPLETE: No new deletions processed.");
    }
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });

    if (!systemUser) {
      console.warn(
        "⚠️ WEBHOOK SYNC: No system user found. Cannot fetch payload."
      );
      return res.sendStatus(200);
    }

    // --- MAIN EXECUTION LOGIC WITH TOKEN REFRESH ---
    try {
      await fetchAndProcessPayload(systemUser);
      return res.json({ success: true });
    } catch (apiError) {
      // Catch 401 error and attempt refresh
      if (apiError.response && apiError.response.status === 401) {
        console.warn(
          "⚠️ TOKEN EXPIRED: Access Token expired (401). Attempting to refresh..."
        );

        if (!systemUser.refreshToken) {
          console.error("❌ REFRESH FAILED: Missing refresh token.");
          return res.sendStatus(200);
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();
        console.log(
          "✅ TOKEN REFRESH: Successfully refreshed and saved to DB. Retrying payload fetch..."
        );

        // Retry fetching payload with new token
        await fetchAndProcessPayload(systemUser);
        return res.json({ success: true });
      } else {
        // Handle all other API errors
        throw apiError;
      }
    }
  } catch (error) {
    console.error(
      "❌ WEBHOOK SYNC FAILURE:",
      error.response?.data || error.message
    );
    res.sendStatus(200);
  }
};
