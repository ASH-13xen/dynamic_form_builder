import axios from "axios";
import { Response } from "../models/response.model.js";
import { Form } from "../models/form.model.js";
import { User } from "../models/user.model.js";

export const registerWebhook = async (req, res) => {
  console.log("\n========== REGISTER WEBHOOK START ==========");
  try {
    const { baseId } = req.params;
    console.log(`[1] Request received for Base ID: ${baseId}`);
    console.log(`[1] User ID from Req: ${req.user.userId}`);

    const user = await User.findById(req.user.userId);
    console.log(`[2] User found in DB: ${user ? "Yes" : "No"}`);

    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;
    console.log(`[3] Target Notification URL: ${webhookUrl}`);

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;

    // --- STEP 1: List Existing Webhooks ---
    console.log(`[4] Fetching existing webhooks from: ${listUrl}`);
    const listRes = await axios.get(listUrl, { headers });

    const existingHooks = listRes.data.webhooks;
    console.log(
      `[5] Found ${existingHooks.length} existing webhooks. Payload:`,
      JSON.stringify(existingHooks, null, 2)
    );

    // --- STEP 2: Delete Old Webhooks ---
    if (existingHooks.length > 0) {
      console.log("[6] Starting cleanup process...");
      for (const hook of existingHooks) {
        console.log(`   - Deleting webhook ID: ${hook.id}`);
        await axios.delete(`${listUrl}/${hook.id}`, { headers });
        console.log(`   - Deleted: ${hook.id}`);
      }
    } else {
      console.log("[6] No existing webhooks to delete.");
    }

    // --- STEP 3: Register New Webhook ---
    console.log("[7] Registering NEW webhook...");
    const payload = {
      notificationUrl: webhookUrl,
      specification: {
        options: {
          filters: { dataTypes: ["tableData"] },
        },
      },
    };
    console.log("   - Payload sending:", JSON.stringify(payload, null, 2));

    const response = await axios.post(listUrl, payload, { headers });

    console.log("✅ [8] Webhook Registered Successfully!");
    console.log("   - Response Data:", JSON.stringify(response.data, null, 2));

    console.log("========== REGISTER WEBHOOK END ==========\n");
    res.json(response.data);
  } catch (error) {
    console.error(
      "❌ [ERROR] Registration Failed:",
      error.response?.data || error.message
    );
    console.log("========== REGISTER WEBHOOK END (ERROR) ==========\n");
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

const refreshAirtableToken = async (refreshToken) => {
  console.log("\n--- TOKEN REFRESH INITIATED ---");
  console.log(
    "Using Refresh Token (masked):",
    refreshToken.substring(0, 10) + "..."
  );

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

    console.log(
      "✅ Token Refresh Response:",
      JSON.stringify(response.data, null, 2)
    );
    console.log("--- TOKEN REFRESH COMPLETE ---\n");

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
    };
  } catch (error) {
    console.error(
      "❌ Airtable Token Refresh Failure:",
      error.response?.data || error.message
    );
    throw new Error(
      "Airtable Token Refresh failed: Check client_id/secret or refresh token validity."
    );
  }
};

export const handleAirtableWebhook = async (req, res) => {
  console.log("\n========== INCOMING WEBHOOK START ==========");

  // Log the raw body immediately
  console.log("📥 [1] Raw Request Body:", JSON.stringify(req.body, null, 2));

  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log(
      "⚠️ [2] Ping or incomplete body received (No BaseID or WebhookID). sending 200 OK."
    );
    console.log("========== INCOMING WEBHOOK END (PING) ==========\n");
    return res.sendStatus(200);
  }

  console.log(`[2] Processing Event -> Base: ${baseId}, Webhook: ${webhookId}`);

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    console.log(`\n   --- Fetching Payloads (Retry: ${isRetry}) ---`);
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log(`   [3a] GET Request to: ${payloadUrl}`);

    const { data } = await axios.get(payloadUrl, { headers });

    console.log("   [3b] Payload Data Received from Airtable:");
    // Using console.dir specifically for deep nesting
    console.dir(data, { depth: null, colors: true });

    if (!data.payloads || data.payloads.length === 0) {
      console.log("   [3c] No payloads found in response array.");
    }

    for (const payload of data.payloads) {
      console.log(
        `   [4] Processing Payload Sequence #${payload.baseTransactionNumber}`
      );

      if (!payload.changedTablesById) {
        console.log("       - No 'changedTablesById' found. Skipping.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        console.log(`       [5] Checking Table ID: ${tableId}`);
        const changes = payload.changedTablesById[tableId];

        console.log(
          "       - Changes Object:",
          JSON.stringify(changes, null, 2)
        );

        if (changes.destroyedRecordIds) {
          console.log(
            `       🚨 [6] DELETE DETECTED. IDs:`,
            changes.destroyedRecordIds
          );

          const updateResult = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );

          console.log(
            `       ✅ [7] DB Update Result: Matched ${updateResult.matchedCount}, Modified ${updateResult.modifiedCount}`
          );
        } else {
          console.log("       - No 'destroyedRecordIds' in this table change.");
        }
      }
    }
    console.log("   --- Payload Processing Finished ---\n");
  };

  try {
    // 1. Find System User
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    console.log(`[System User Check] Found: ${systemUser ? "Yes" : "No"}`);

    if (!systemUser) {
      console.warn(
        "❌ Webhook Sync: No system user found for Airtable API access."
      );
      return res.sendStatus(200);
    }

    try {
      // 2. Attempt Processing
      console.log("[Attempt 1] Calling fetchAndProcessPayload...");
      await fetchAndProcessPayload(systemUser, false);
      console.log("✅ [Success] Webhook handled successfully.");
      console.log("========== INCOMING WEBHOOK END ==========\n");
      return res.json({ success: true });
    } catch (apiError) {
      // 3. Handle 401 / Refresh Logic
      console.error(`⚠️ [API Error] Status: ${apiError.response?.status}`);
      console.error(`   - Message: ${JSON.stringify(apiError.response?.data)}`);

      if (apiError.response && apiError.response.status === 401) {
        console.warn("🔄 Access Token expired (401). Attempting to refresh...");

        if (!systemUser.refreshToken) {
          console.error(
            "❌ Token refresh failed: No refresh token available on user object."
          );
          throw new Error("Missing Refresh Token");
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();
        console.log("💾 New tokens saved to Database.");

        // 4. Retry Processing
        console.log(
          "[Attempt 2] Retrying fetchAndProcessPayload with new token..."
        );
        await fetchAndProcessPayload(systemUser, true);

        console.log("✅ [Success] Webhook handled after refresh.");
        console.log("========== INCOMING WEBHOOK END ==========\n");
        return res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error(
      "❌ [FINAL ERROR] Webhook Sync Error:",
      error.response?.data || error.message
    );
    console.log("========== INCOMING WEBHOOK END (ERROR) ==========\n");
    res.sendStatus(200); // Send 200 to Airtable so they don't keep retrying failed logic
  }
};
