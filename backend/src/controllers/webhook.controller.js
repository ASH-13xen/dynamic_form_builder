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
  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) return res.sendStatus(200);

  try {
    const systemUser = await User.findOne({ accessToken: { $exists: true } });
    if (!systemUser) return res.sendStatus(200);

    const { data } = await axios.get(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
      { headers: { Authorization: `Bearer ${systemUser.accessToken}` } }
    );

    for (const payload of data.payloads) {
      if (!payload.changedTablesById) continue;

      Object.keys(payload.changedTablesById).forEach(async (tableId) => {
        const changes = payload.changedTablesById[tableId];

        if (changes.destroyedRecordIds) {
          await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { isDeletedInAirtable: true }
          );
          console.log(
            `Synced: Marked ${changes.destroyedRecordIds.length} records as deleted.`
          );
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Webhook Sync Error:", error.message);
    res.sendStatus(200);
  }
};
