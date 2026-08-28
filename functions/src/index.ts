import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { calculateNewDate, formatYYYYMMDD, transformDescription } from "./helpers";

// Define Firebase Secrets for Sage Intacct credentials
const SAGE_CLIENT_ID = defineSecret("SAGE_CLIENT_ID");
const SAGE_CLIENT_SECRET = defineSecret("SAGE_CLIENT_SECRET");
const SAGE_USERNAME = defineSecret("SAGE_USERNAME");

interface WebhookPayload {
  recordno?: string;
  postingDate?: string;
  description?: string;
}

/**
 * Firebase Cloud Function (v2) receiving Sage Intacct webhook POST trigger.
 * Authenticates with Sage Intacct, transforms postingDate & description,
 * and updates the journal entry via PATCH request.
 */
export const stargroupWebhook = onRequest(
  { secrets: [SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, SAGE_USERNAME] },
  async (req, res): Promise<void> => {
    // Ensure HTTP POST method
    if (req.method !== "POST") {
      logger.warn(`Method Not Allowed: Received ${req.method} request.`);
      res.status(405).send("Method Not Allowed. Please send a POST request.");
      return;
    }

    try {
      const payload: WebhookPayload = req.body || {};
      const { recordno, postingDate, description } = payload;

      // Validate required inputs
      if (!recordno || !postingDate || description === undefined) {
        logger.error("Missing required webhook parameters.", { recordno, postingDate, description });
        res.status(400).json({
          error: "Invalid request payload. 'recordno', 'postingDate', and 'description' are required."
        });
        return;
      }

      logger.info(`Received webhook trigger for recordno: ${recordno}`, {
        recordno,
        postingDate,
        description
      });

      // Retrieve secret values
      const clientId = SAGE_CLIENT_ID.value();
      const clientSecret = SAGE_CLIENT_SECRET.value();
      const username = SAGE_USERNAME.value();

      if (!clientId || !clientSecret || !username) {
        throw new Error("Sage Intacct credentials (CLIENT_ID, CLIENT_SECRET, USERNAME) are missing or undefined in Secrets Manager.");
      }

      // 1. Authenticate with Sage Intacct to obtain Bearer token
      logger.info("Authenticating with Sage Intacct OAuth2 token endpoint...");
      const tokenResponse = await fetch("https://api.intacct.com/ia/api/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          username: username
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error("Sage Intacct authentication failed.", {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          errorText
        });
        throw new Error(`Sage Intacct Authentication failed with status ${tokenResponse.status}: ${errorText}`);
      }

      const tokenData = (await tokenResponse.json()) as { access_token?: string };
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        logger.error("Access token missing from Sage Intacct OAuth2 response.", { tokenData });
        throw new Error("Access token missing in Sage Intacct authentication response.");
      }

      // 2. Perform Data Transformation
      const newDateObj = calculateNewDate(postingDate);
      const newPostingDate = formatYYYYMMDD(newDateObj);
      const newDescription = transformDescription(description, newDateObj);

      logger.info("Transformed record data successfully", {
        originalPostingDate: postingDate,
        newPostingDate,
        originalDescription: description,
        newDescription
      });

      // 3. Update Record via PATCH request to Sage Intacct
      const patchUrl = `https://api.intacct.com/ia/api/v1/objects/general-ledger/journal-entry/${recordno}`;
      logger.info(`Sending PATCH update to Sage Intacct: ${patchUrl}`);

      const patchResponse = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          postingDate: newPostingDate,
          description: newDescription
        })
      });

      if (!patchResponse.ok) {
        const patchErrorText = await patchResponse.text();
        logger.error("Failed to update Sage Intacct Journal Entry record.", {
          recordno,
          status: patchResponse.status,
          patchErrorText
        });
        throw new Error(`Sage Intacct PATCH request failed with status ${patchResponse.status}: ${patchErrorText}`);
      }

      const patchResult = await patchResponse.json().catch(() => ({}));
      logger.info(`Successfully updated journal entry recordno: ${recordno}`, { patchResult });

      res.status(200).json({
        message: "Journal entry record successfully updated.",
        recordno,
        updatedPostingDate: newPostingDate,
        updatedDescription: newDescription
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("stargroupWebhook execution failed.", {
        errorMessage: err.message,
        stack: err.stack
      });

      res.status(500).json({
        error: "Internal Server Error",
        message: err.message
      });
    }
  }
);
