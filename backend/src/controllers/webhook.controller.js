import axios from "axios";
import { Response } from "../models/response.model.js";
import { Form } from "../models/form.model.js";
import { User } from "../models/user.model.js";

// ... imports

// ==================================================================
// 1. REGISTER WEBHOOK (With Auto-Cleanup)
// ==================================================================
export const registerWebhook = async (req, res) => {
  try {
    const { baseId } = req.params;
    const user = await User.findById(req.user.userId);
    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;

    const headers = { Authorization: `Bearer ${user.accessToken}` };

    // --- STEP A: List Existing Webhooks ---
    // We check if we hit the limit so we can clear space
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;
    const listRes = await axios.get(listUrl, { headers });

    const existingHooks = listRes.data.webhooks;
    console.log(
      `Found ${existingHooks.length} existing webhooks. Cleaning up...`
    );

    // --- STEP B: Delete Old Webhooks ---
    // We loop through and delete them to free up slots
    for (const hook of existingHooks) {
      await axios.delete(`${listUrl}/${hook.id}`, { headers });
      console.log(`Deleted old webhook: ${hook.id}`);
    }

    // --- STEP C: Register New Webhook ---
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

// ==================================================================
// 2. HANDLE WEBHOOK (The Listener)
// Airtable calls THIS function when data changes.
// ==================================================================
export const handleAirtableWebhook = async (req, res) => {
  try {
    console.log("🔔 1. Ping Received:", req.body);
    const baseId = req.body.base?.id;
    const webhookId = req.body.webhook?.id;
    if (!baseId || !webhookId) {
      console.log("❌ Missing Base ID or Webhook ID in payload.");
      return res.sendStatus(200);
    }
    // A. Find a user to act as the fetcher
    const user = await User.findOne({ accessToken: { $exists: true } });
    if (!user) {
      console.log("❌ 2. No User found with access token.");
      return res.sendStatus(200);
    }
    console.log("✅ 2. Found User for Auth:", user.email);

    // B. Fetch Payload
    const url = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;
    console.log("🔄 3. Fetching Payload from:", url);

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    const payloads = response.data.payloads;
    console.log(`📦 4. Payloads Received: ${payloads.length} items`);

    if (payloads.length === 0) {
      console.log(
        "⚠️ Payload list is empty. Airtable thinks we already processed this."
      );
    }

    // C. Loop through changes
    for (const payload of payloads) {
      console.log("🔎 5. Processing Payload Item:", JSON.stringify(payload));

      if (!payload.changedTablesById) {
        console.log("   -> No table changes in this payload.");
        continue;
      }

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];

        // CHECK DELETE
        if (changes.destroyedRecordIds) {
          console.log("   -> Found Destroyed IDs:", changes.destroyedRecordIds);
          for (const recordId of changes.destroyedRecordIds) {
            // Debug the DB Find
            const exists = await Response.findOne({
              airtableRecordId: recordId,
            });
            console.log(
              `   -> Searching DB for ${recordId}... Found? ${!!exists}`
            );

            if (exists) {
              await Response.findOneAndUpdate(
                { airtableRecordId: recordId },
                { isDeletedInAirtable: true }
              );
              console.log(
                `🗑️ SUCCESS: Marked ${recordId} as deleted in MongoDB.`
              );
            }
          }
        } else {
          console.log("   -> No destroyedRecordIds in this change.");
        }

        // CHECK UPDATE (omitted for brevity, focus on delete first)
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ CRITICAL ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
};
