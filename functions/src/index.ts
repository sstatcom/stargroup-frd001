import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { calculateNewDate, formatYYYYMMDD, transformDescription } from "./helpers";

// Step 2: Define Firebase Secrets for Sage Intacct credentials
const SAGE_CLIENT_ID = defineSecret("SAGE_CLIENT_ID");
const SAGE_CLIENT_SECRET = defineSecret("SAGE_CLIENT_SECRET");
const SAGE_USERNAME = defineSecret("SAGE_USERNAME");

interface WebhookPayload {
  recordno?: string;
  postingdate?: string;
  postingDate?: string;
  description?: string;
}

/**
 * Helper function to send an audit log entry to Sage Intacct.
 *
 * @param accessToken Sage Intacct OAuth2 access token
 * @param state "success" or "fail" process state
 * @param message Summary message for the audit log entry
 */
async function writeAuditLog(
  accessToken: string,
  state: "success" | "fail",
  message: string
): Promise<void> {
  try {
    const auditUrl = "https://api.intacct.com/ia/api/v1/objects/platform-apps/nsp::gl_date_update_audit_log";
    const response = await fetch(auditUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        process_state: state,
        message: message
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Sage Intacct audit log request failed.", {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to execute writeAuditLog.", {
      errorMessage: err.message,
      stack: err.stack
    });
  }
}

/**
 * Firebase Cloud Function (v2) receiving Sage Intacct webhook POST trigger.
 * Parses recordno, postingdate, and description, authenticates with Sage Intacct,
 * queries journal entry lines, transforms date/descriptions, and updates via PATCH.
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

    let accessToken: string | undefined;

    try {
      // Step 1: Parse Webhook Input
      const payload: WebhookPayload = req.body || {};
      const { recordno, postingdate, postingDate, description } = payload;
      const inputPostingDate = postingdate || postingDate;

      // Validate required inputs
      if (!recordno || !inputPostingDate || description === undefined) {
        logger.error("Missing required webhook parameters.", {
          recordno,
          postingdate: inputPostingDate,
          description
        });
        res.status(400).json({
          error: "Invalid request payload. 'recordno', 'postingdate', and 'description' are required."
        });
        return;
      }

      logger.info(`Received webhook trigger for recordno: ${recordno}`, {
        recordno,
        postingdate: inputPostingDate,
        description
      });

      // Step 2: Secrets Management
      const clientId = SAGE_CLIENT_ID.value();
      const clientSecret = SAGE_CLIENT_SECRET.value();
      const username = SAGE_USERNAME.value();

      if (!clientId || !clientSecret || !username) {
        throw new Error("Sage Intacct credentials (CLIENT_ID, CLIENT_SECRET, USERNAME) are missing or undefined in Secrets Manager.");
      }

      // Step 3: Authentication (POST)
      logger.info("Authenticating with Sage Intacct OAuth2 token endpoint...");
      const authParams = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        username: username
      });

      const tokenResponse = await fetch("https://api.intacct.com/ia/api/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: authParams.toString()
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
      accessToken = tokenData.access_token;

      if (!accessToken) {
        logger.error("Access token missing from Sage Intacct OAuth2 response.", { tokenData });
        throw new Error("Access token missing in Sage Intacct authentication response.");
      }

      // Step 4: Data Transformation
      const newDateObj = calculateNewDate(inputPostingDate);
      const newPostingDate = formatYYYYMMDD(newDateObj);
      const newHeaderDescription = transformDescription(description, newDateObj);

      logger.info("Transformed header data successfully", {
        originalPostingDate: inputPostingDate,
        newPostingDate,
        originalDescription: description,
        newHeaderDescription
      });

      // Step 5: Fetch Journal Lines (NEW)
      logger.info(`Fetching journal lines for journal entry recordno: ${recordno}`);
      const queryUrl = "https://api.intacct.com/ia/api/v1/services/core/query";
      const queryResponse = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          object: "general-ledger/journal-entry-line",
          fields: ["key", "id", "lineNumber", "description"],
          filters: [
            {
              "$eq": {
                "journalEntry.key": recordno
              }
            }
          ],
          size: 4000
        })
      });

      if (!queryResponse.ok) {
        const queryErrorText = await queryResponse.text();
        logger.error("Failed to query journal entry lines.", {
          recordno,
          status: queryResponse.status,
          queryErrorText
        });
        throw new Error(`Sage Intacct Query failed with status ${queryResponse.status}: ${queryErrorText}`);
      }

      const queryData = (await queryResponse.json()) as {
        "ia::result"?: Array<{ id: string; key?: string; lineNumber?: number; description?: string }>;
      };
      const rawLines = queryData["ia::result"] || [];

      // Step 6: Update Record (PATCH)
      const lines = rawLines.map((line) => ({
        key: line.id,
        description: transformDescription(line.description || "", newDateObj)
      }));

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
          description: newHeaderDescription,
          lines: lines
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

      // Step 7: Audit Logging & Success Response
      //await writeAuditLog(accessToken, "success", "Journal entry record successfully updated.");
      await writeAuditLog(accessToken, "success", `Journal entry ${recordno} successfully updated. New description: ${newHeaderDescription}`);

      res.status(200).json({
        message: `Journal entry ${recordno} successfully updated. New description: ${newHeaderDescription}`,
        recordno,
        updatedPostingDate: newPostingDate,
        updatedDescription: newHeaderDescription,
        updatedLinesCount: lines.length
      });
    } catch (error: unknown) {
      // Step 7: Log errors and return 500 status code on failure
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("stargroupWebhook execution failed.", {
        errorMessage: err.message,
        stack: err.stack
      });

      if (accessToken) {
        await writeAuditLog(accessToken, "fail", err.message);
      }

      res.status(500).json({
        error: "Internal Server Error",
        message: err.message
      });
    }
  }
);
