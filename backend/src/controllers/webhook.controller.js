import axios from "axios";
import { Response } from "../models/response.model.js";
import { Form } from "../models/form.model.js";
import { User } from "../models/user.model.js";

const processDeletions = async (destroyedRecordIds) => {
  if (!destroyedRecordIds || destroyedRecordIds.length === 0) return;

  console.log(`IDs detected:`, destroyedRecordIds);
  const count = await Response.countDocuments({
    airtableRecordId: { $in: destroyedRecordIds },
  });

  if (count === 0) {
    console.warn(`No matching records found in DB to delete.`);
  } else {
    console.log(`Found ${count} matching records. Deleting...`);
  }
  const updateResult = await Response.updateMany(
    { airtableRecordId: { $in: destroyedRecordIds } },
    { $set: { isDeletedInAirtable: true } }
  );

  console.log(
    `Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`
  );
};

const processUpdates = async (changedRecordsById) => {
  const recordIds = Object.keys(changedRecordsById);
  if (recordIds.length === 0) return;

  console.log(`Processing ${recordIds.length} records...`);

  for (const recordId of recordIds) {
    const changes = changedRecordsById[recordId];
    const newCellValues = changes.current.cellValuesByFieldId;

    if (!newCellValues) continue;

    try {
      const responseDoc = await Response.findOne({
        airtableRecordId: recordId,
      }).populate("formId");

      if (!responseDoc) {
        console.warn(`Record ${recordId} not found in DB. Skipping.`);
        continue;
      }

      if (!responseDoc.formId) {
        console.warn(`Record ${recordId} has no associated Form. Skipping.`);
        continue;
      }
      const fieldToKeyMap = {};
      responseDoc.formId.questions.forEach((q) => {
        fieldToKeyMap[q.airtableFieldId] = q.questionKey;
      });
      let hasChanges = false;
      for (const [fieldId, newValue] of Object.entries(newCellValues)) {
        const questionKey = fieldToKeyMap[fieldId];

        if (questionKey) {
          responseDoc.answers.set(questionKey, newValue);
          hasChanges = true;
          console.log(`        -> Updated field '${questionKey}'`);
        }
      }
      if (hasChanges) {
        responseDoc.markModified("answers");
        await responseDoc.save();
        console.log(`Record ${recordId} updated successfully.`);
      }
    } catch (err) {
      console.error(`Updating record ${recordId}:`, err.message);
    }
  }
};

const processCreations = async (createdRecordsById) => {
  const count = Object.keys(createdRecordsById).length;
  if (count > 0) {
    console.log(
      `${count} new records created in Airtable (No DB Action taken).`
    );
  }
};

export const registerWebhook = async (req, res) => {
  console.log("\nREGISTER WEBHOOK START");
  try {
    const { baseId } = req.params;
    console.log(`Request received for Base ID: ${baseId}`);
    console.log(`User ID from Req: ${req.user.userId}`);

    const user = await User.findById(req.user.userId);
    console.log(`User found in DB: ${user ? "Yes" : "No"}`);

    const webhookUrl = `${process.env.AIRTABLE_WEBHOOK_URL}/api/webhooks/airtable`;
    console.log(`Target Notification URL: ${webhookUrl}`);

    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const listUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks`;
    console.log(`Fetching existing webhooks from: ${listUrl}`);
    const listRes = await axios.get(listUrl, { headers });

    const existingHooks = listRes.data.webhooks;
    console.log(
      `Found ${existingHooks.length} existing webhooks. Payload:`,
      JSON.stringify(existingHooks, null, 2)
    );
    if (existingHooks.length > 0) {
      console.log("Starting cleanup process");
      for (const hook of existingHooks) {
        console.log(`   - Deleting webhook ID: ${hook.id}`);
        await axios.delete(`${listUrl}/${hook.id}`, { headers });
        console.log(`   - Deleted: ${hook.id}`);
      }
    } else {
      console.log("No existing webhooks to delete.");
    }
    console.log("Registering NEW webhook");
    const payload = {
      notificationUrl: webhookUrl,
      specification: {
        options: {
          filters: { dataTypes: ["tableData"] },
        },
      },
    };
    console.log("Payload sending:", JSON.stringify(payload, null, 2));

    const response = await axios.post(listUrl, payload, { headers });

    console.log("Webhook Registered Successfully!");
    console.log("Response Data:", JSON.stringify(response.data, null, 2));

    console.log("REGISTER WEBHOOK END\n");
    res.json(response.data);
  } catch (error) {
    console.error(
      "Registration Failed:",
      error.response?.data || error.message
    );
    console.log("REGISTER WEBHOOK END (ERROR)\n");
    res.status(500).json({ error: "Failed to register webhook" });
  }
};

const refreshAirtableToken = async (refreshToken) => {
  console.log("\nTOKEN REFRESH INITIATED");
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
      "Token Refresh Response:",
      JSON.stringify(response.data, null, 2)
    );
    console.log("TOKEN REFRESH COMPLETE\n");

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
  console.log("\nINCOMING WEBHOOK START");
  console.log("Raw Request Body:", JSON.stringify(req.body, null, 2));

  const { base: { id: baseId } = {}, webhook: { id: webhookId } = {} } =
    req.body;

  if (!baseId || !webhookId) {
    console.log(
      "Ping or incomplete body received (No BaseID or WebhookID). sending 200 OK."
    );
    console.log("INCOMING WEBHOOK END (PING)\n");
    return res.sendStatus(200);
  }

  console.log(`Processing Event -> Base: ${baseId}, Webhook: ${webhookId}`);

  const fetchAndProcessPayload = async (user, isRetry = false) => {
    const headers = { Authorization: `Bearer ${user.accessToken}` };
    const payloadUrl = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`;

    console.log(`GET Request to: ${payloadUrl}`);
    const { data } = await axios.get(payloadUrl, { headers });
    const validPayloads = data.payloads.filter((p) => p.changedTablesById);

    console.log(
      `Found ${data.payloads.length} total payloads. (${validPayloads.length} have table changes)`
    );

    for (const payload of validPayloads) {
      console.log(`Processing Sequence #${payload.baseTransactionNumber}`);

      for (const tableId in payload.changedTablesById) {
        const changes = payload.changedTablesById[tableId];
        if (
          changes.destroyedRecordIds &&
          changes.destroyedRecordIds.length > 0
        ) {
          console.log(`DELETE DETECTED. IDs:`, changes.destroyedRecordIds);
          const count = await Response.countDocuments({
            airtableRecordId: { $in: changes.destroyedRecordIds },
          });

          if (count === 0) {
            console.error(
              `MongoDB contains 0 records with these airtableRecordIds!`
            );
            console.error(
              `Are you saving 'airtableRecordId' when you create the Response?`
            );
            console.error(
              `Expected ID format: ${changes.destroyedRecordIds[0]}`
            );
          } else {
            console.log(
              `Found ${count} matching records in DB. Proceeding to update.`
            );
          }

          const updateResult = await Response.updateMany(
            { airtableRecordId: { $in: changes.destroyedRecordIds } },
            { $set: { isDeletedInAirtable: true } }
          );

          console.log(
            `DB Update Result: Matched ${updateResult.matchedCount}, Modified ${updateResult.modifiedCount}`
          );
        }
        if (changes.createdRecordsById) {
          console.log(
            `Records Created (Count: ${
              Object.keys(changes.createdRecordsById).length
            }) `
          );
          await processCreations(changes.createdRecordsById);
        }
        if (changes.changedRecordsById) {
          console.log(
            `Records Updated (Count: ${
              Object.keys(changes.changedRecordsById).length
            }) `
          );
          await processUpdates(changes.changedRecordsById);
        }
      }
    }
    console.log(" Payload Processing Finished \n");
  };

  try {
    let systemUser = await User.findOne({ accessToken: { $exists: true } });
    console.log(`Found: ${systemUser ? "Yes" : "No"}`);

    if (!systemUser) {
      console.warn(
        "Webhook Sync: No system user found for Airtable API access."
      );
      return res.sendStatus(200);
    }

    try {
      console.log("[Attempt 1] Calling fetchAndProcessPayload...");
      await fetchAndProcessPayload(systemUser, false);
      console.log("Webhook handled successfully.");
      console.log("INCOMING WEBHOOK END\n");
      return res.json({ success: true });
    } catch (apiError) {
      console.error(`Status: ${apiError.response?.status}`);
      console.error(`   - Message: ${JSON.stringify(apiError.response?.data)}`);

      if (apiError.response && apiError.response.status === 401) {
        console.warn("🔄 Access Token expired (401). Attempting to refresh...");

        if (!systemUser.refreshToken) {
          console.error(
            "Token refresh failed: No refresh token available on user object."
          );
          throw new Error("Missing Refresh Token");
        }

        const newTokens = await refreshAirtableToken(systemUser.refreshToken);

        systemUser.accessToken = newTokens.accessToken;
        systemUser.refreshToken =
          newTokens.refreshToken || systemUser.refreshToken;
        await systemUser.save();
        console.log("New tokens saved to Database.");
        console.log("Retrying fetchAndProcessPayload with new token...");
        await fetchAndProcessPayload(systemUser, true);

        console.log("Webhook handled after refresh.");
        console.log("INCOMING WEBHOOK END\n");
        return res.json({ success: true });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Webhook Sync Error:", error.response?.data || error.message);
    console.log("INCOMING WEBHOOK END (ERROR)\n");
    res.sendStatus(200);
  }
};
