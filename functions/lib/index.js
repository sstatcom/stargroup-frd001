"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.stargroupWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = __importStar(require("firebase-functions/logger"));
const helpers_1 = require("./helpers");
// Define Firebase Secrets for Sage Intacct credentials
const SAGE_CLIENT_ID = (0, params_1.defineSecret)("SAGE_CLIENT_ID");
const SAGE_CLIENT_SECRET = (0, params_1.defineSecret)("SAGE_CLIENT_SECRET");
const SAGE_USERNAME = (0, params_1.defineSecret)("SAGE_USERNAME");
/**
 * Firebase Cloud Function (v2) receiving Sage Intacct webhook POST trigger.
 * Authenticates with Sage Intacct, transforms postingDate & description,
 * and updates the journal entry via PATCH request.
 */
exports.stargroupWebhook = (0, https_1.onRequest)({ secrets: [SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, SAGE_USERNAME] }, async (req, res) => {
    // Ensure HTTP POST method
    if (req.method !== "POST") {
        logger.warn(`Method Not Allowed: Received ${req.method} request.`);
        res.status(405).send("Method Not Allowed. Please send a POST request.");
        return;
    }
    try {
        const payload = req.body || {};
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
        const tokenData = (await tokenResponse.json());
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            logger.error("Access token missing from Sage Intacct OAuth2 response.", { tokenData });
            throw new Error("Access token missing in Sage Intacct authentication response.");
        }
        // 2. Perform Data Transformation
        const newDateObj = (0, helpers_1.calculateNewDate)(postingDate);
        const newPostingDate = (0, helpers_1.formatYYYYMMDD)(newDateObj);
        const newDescription = (0, helpers_1.transformDescription)(description, newDateObj);
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
    }
    catch (error) {
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
});
//# sourceMappingURL=index.js.map