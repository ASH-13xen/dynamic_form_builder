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

export const handleAirtableWebhook = async (req, res) => {
  // ... (existing destructuring)
  if (!baseId || !webhookId) return res.sendStatus(200);

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) return res.sendStatus(200);

    // --- API Call with Token Refresh Logic ---
    const headers = { Authorization: `Bearer ${systemUser.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    try {
      // 1. Attempt the API call
      const { data } = await axios.get(payloadUrl, { headers });

      // ... (process payload data)
      // ... (rest of the handleAirtableWebhook logic)

      res.json({ success: true });
    } catch (apiError) {
      // 2. Check for 401 Unauthorized
      if (apiError.response && apiError.response.status === 401) {
        console.log("Token expired. Attempting refresh...");

        // **3. Use Refresh Token to Get New Tokens**
        // This function must implement the OAuth refresh flow.
        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        // **4. Update User in DB with New Tokens**
        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken = newTokens.refreshToken;
        await systemUser.save();

        // **5. Retry the Original Request**
        const retryHeaders = {
          Authorization: `Bearer ${newTokens.accessToken}`,
        };
        const { data } = await axios.get(payloadUrl, { headers: retryHeaders });

        // ... (process payload data again)
        // ... (rest of the handleAirtableWebhook logic)

        res.json({ success: true });
      } else {
        // Handle other API errors (network, 404, 500, etc.)
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Webhook Sync Error (Final):", error.message);
    // Send 200 to Airtable to acknowledge the webhook, even if processing failed.
    // This stops Airtable from retrying the hook incessantly.
    res.sendStatus(200);
  }
};
