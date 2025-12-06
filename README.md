# Airtable Dynamic Form Builder (MERN Stack)

A full-stack application that acts as a dynamic **Typeform-like form generator** built on top of **Airtable**.  
It automatically reads Airtable Base schema (fields, options & types) and builds UI forms with custom conditional logic, without any hard-coded configuration.

---

## 🌍 Live Demo
🔗 **https://dynamicformbuilder-sigma.vercel.app** (frontend)

> ⚠️ **Deceptive Site Warning Notice**
> Since the backend uses a free `onrender.com` domain with OAuth redirects, Google Safe Browsing may display a warning.
> The application is safe. Click **"Details" → "Visit this unsafe site"** to continue.

---

## Render Link : 
#### 🔗 **https://dynamic-form-builder-jhhf.onrender.com** (backend)

## 🚀 Features

| Feature | Description |
|--------|-------------|
| 🔐 Airtable OAuth | Secure password-less PKCE OAuth 2.0 login |
| 🏗 Dynamic Form Builder | Auto-generates UI from Airtable schema |
| 🧠 Conditional Logic Engine | Recursive AND/OR rule evaluation |
| 🔄 Two-Way Sync | Real-time updates using Airtable Webhooks |
| 💽 Response Backup | Data stored in Airtable & MongoDB |
| 🎧 Real-time Listener | Detects edits and deletions instantly |

---

## 🛠 Tech Stack

### Frontend
- React + Vite
- TypeScript
- Tailwind CSS

### Backend
- Node.js & Express
- MongoDB (Atlas)
- Airtable Webhooks + OAuth

### Deployment
- Vercel (Frontend)
- Render (Backend)

## Airtable OAUTH Setup Guide

### Register Your Application
You must tell Airtable about your app to get credentials.
Airtable Developer Hub: Go to the Airtable dashboard and register a new OAuth Integration.
Redirect URI: Set the exact callback URL where Airtable will send the user back after login (e.g., https://your-backend.com/api/auth/callback).
Scopes: Define the permissions your app needs. For the form builder, these include data.records:read, data.records:write, and schema.bases:read (for fetching table structures).
Credentials: Airtable provides a Client ID and a Client Secret.

### Initiate the Authorization (PKCE Flow)
The Airtable OAuth setup guide involves four main steps: registering your application, implementing the PKCE authorization flow on your backend, setting up the token exchange, and configuring the callback and token storage.

1. Register Your Application
You must tell Airtable about your app to get credentials.
Airtable Developer Hub: Go to the Airtable dashboard and register a new OAuth Integration.
Redirect URI: Set the exact callback URL where Airtable will send the user back after login (e.g., https://your-backend.com/api/auth/callback).
Scopes: Define the permissions your app needs. For the form builder, these include data.records:read, data.records:write, and schema.bases:read (for fetching table structures).
Credentials: Airtable provides a Client ID and a Client Secret.

2. Initiate the Authorization (PKCE Flow)
The login flow uses Proof Key for Code Exchange (PKCE) for enhanced security. This happens on your backend before redirecting the user.
Generate Secrets: Your server must generate two random strings: a code_verifier (the secret) and a code_challenge (the publicly available hash of the secret).
Redirect: Redirect the user to the Airtable authorization page, including the client_id, redirect_uri, scopes, and the code_challenge.
Storage: The code_verifier (the secret) must be stored securely for a short time, usually in a signed cookie or server-side session, because you'll need it later.

### Exchange the Code for Tokens
This is where your backend proves its identity to Airtable.
Callback: Airtable sends the user back to your specified redirect_uri with a temporary Authorization Code.
Proof: Your backend sends a POST request to Airtable's token endpoint, including the received Authorization Code and the original code_verifier (retrieved from storage). This proves your server initiated the request.
Tokens Received: Airtable verifies the proof and responds with:
access_token: Used for immediate API calls (short-lived, ~60 minutes).
refresh_token: Used to get a new access token without re-authenticating the user (long-lived).

### Configure Session & Storage
The final steps integrate the tokens into your app's environment.
Database Storage: The access_token and refresh_token are saved in your MongoDB User document, linked to the user's Airtable ID.
Session Management: Your server creates its own secure session (e.g., a JWT in an HTTP-only cookie) and redirects the user to your app's dashboard.
Token Refresh: You must implement a mechanism to automatically use the stored refresh_token to fetch a new access_token whenever the current one expires, ensuring a continuous user session without relogging.

## ⚙️ Setup Instructions
To run this locally, the following keys must be configured.

### Phase 1: Airtable Configuration
1. Go to the [Airtable OAuth Creator](https://airtable.com/create/oauth).
2. Register a new OAuth integration.
3. Set the **Redirect URI** to: `http://localhost:5000/api/auth/callback`
4. Add these exact **Scopes** (permissions):
   * `data.records:read`
   * `data.records:write`
   * `schema.bases:read`
   * `webhook:manage`
   * `user.email:read`
5. Save the **Client ID** and **Client Secret**.

### Phase 2: Environment Variables
Create a `.env` file in the **root** folder with these values:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=any_random_string_for_security

AIRTABLE_CLIENT_ID=from_step_1
AIRTABLE_CLIENT_SECRET=from_step_1

CLIENT_URL=http://localhost:5173
AIRTABLE_OAUTH_REDIRECT_URL=http://localhost:5000/api/auth/callback
AIRTABLE_WEBHOOK_URL= # Leave blank for now, or use Ngrok URL env
```

Create a second `.env` file inside the **/client** folder:
```VITE_API_URL=http://localhost:5000```

### Phase 3: Run it
1. Open a terminal in the root folder and run:
```
npm install
node index.js
```
2. Open a second terminal in the /client folder and run:
```
npm install
npm run dev
```

## DEPLOYMENT & PRODUCTION CONFIGURATION
The application is deployed live using Render (Backend) and Vercel (Frontend). Below are the specific configurations used to make them communicate securely across different domains.

### Backend (Render)
The backend is hosted as a Web Service on Render.

Build Settings:

Build Command: npm install

Start Command: node index.js

Environment Variables:
```
NODE_ENV: production (Critical for cross-site secure cookies)
CLIENT_URL: https://your-frontend.vercel.app (No trailing slash)
AIRTABLE_WEBHOOK_URL: https://your-backend.onrender.com
AIRTABLE_OAUTH_REDIRECT_URL: https://your-backend.onrender.com/api/auth/callback
(Plus the standard Mongo/Airtable keys from local setup)
```
### Frontend (Vercel)
The frontend is hosted on Vercel using the Vite framework preset.

Environment Variables:
```
VITE_API_URL: https://your-backend.onrender.com
```

### Airtable Configuration 
To move from Localhost to Production, the Airtable App configuration was updated manually:

1. Redirect URI: Updated the allowed callback URL to the Render backend address.
2. Public Access: Added privacy policy links to unlock the integration for external users (bypassing the "Development Only" restriction).
3. Webhook Registration: The production webhook was registered by running a one-time fetch command from the browser console on the live site, pointing Airtable to the Render URL instead of the local Ngrok tunnel.

## Data Models

### User Model
This model serves as the authentication and authorization hub for your app. It stores the credentials needed to act on behalf of the user within Airtable.
airtableUserId: The unique identifier provided by Airtable after the OAuth login. Used as the primary key.
accessToken: The short-lived token required for making API calls (e.g., fetching bases, reading/writing records).
refreshToken: The long-lived token used to automatically request a new accessToken when the current one expires. This ensures the user doesn't have to log in every hour.
tokenExpiresAt: A timestamp used by the backend to determine when the accessToken needs to be renewed.

### Form Model
This model stores the entire configuration of a single form created by the authenticated user. It translates the raw Airtable field data into a functional form structure, including the conditional logic rules.
userId: A reference to the User who created the form (the owner).
airtableBaseId / airtableTableId: The specific Airtable location where submitted data will be written.
questions (Array): The core of the model. Each object in this array contains:
airtableFieldId: The specific ID (fld...) used to map the form input back to the correct column in Airtable.
label: The custom question text the user defined (e.g., "What is your role?").
type: The normalized input type (e.g., singleLineText, multipleSelects).
conditionalRules: The object defining the required visibility logic (logic: "AND" / "OR", conditions).

### Response Model
This model stores a complete local copy of the submission data and is essential for the webhook synchronization process.
formId: A reference to the Form schema this submission belongs to.
airtableRecordId: The unique ID (rec...) that Airtable assigns to the newly created row upon submission. This ID is the anchor used by the webhook listener to find and update the correct document in MongoDB.
answers (Map): A flexible JSON object storing the submitted values, keyed by the form's questionKey.
isDeletedInAirtable: A boolean flag used for soft deletion. When the webhook detects the record was deleted in Airtable, this flag is set to true, allowing the app to hide the response without permanently deleting the audit trail locally.

## Conditional Logic Explanation
Conditional logic operates on simple Boolean rules that determine whether a question should appear on the screen. 
It translates the configuration you set in the Form Builder (saved in MongoDB) into actionable rules on the frontend.
Core ComponentsTrigger Question (questionKey): The field the user interacts with (e.g., "Role").
Condition/Operator: The rule that must be met (e.g., "equals", "notEquals", "contains").Target Value: The required input to trigger the change (e.g., "Engineer").
Target Question: The field that is hidden or shown (e.g., "GitHub URL").Example WorkflowIf a user configures the rule: "Show GitHub URL only if Role equals AI Engineer.
"When a public user fills out the form:Initial State: The form loads. The shouldShowQuestion function runs for "GitHub URL". Since "Role" is empty, the function returns False. 
The field is hidden.User Action: The user selects "AI Engineer" in the "Role" dropdown.Execution: React's state updates, triggering a re-render. 
The shouldShowQuestion function runs again:$$\text{Role Answer} \overset{?}{=} \text{AI Engineer} \Rightarrow \text{True}$$Result: The function returns True, and the "GitHub URL" input immediately appears.

### 🧮 Handling Complexity (AND / OR)
Your logic engine is designed to handle multiple conditions for a single question:AND Logic: All conditions must be true for the question to show.
Example: Show "Resume" if (Role = Engineer) AND (Experience = 5+ years).OR Logic: Only one of the conditions must be true for the question to show.
Example: Show "Contact Info" if (Role = Engineer) OR (Role = Designer).This complex evaluation is handled by the pure JavaScript function (shouldShowQuestion) that is separated from the UI, 
making the logic testable and fast.

## Webhook Configuration Guide

### The Listener Endpoint
Your application needs a specific public route designed to receive external data.
Endpoint: POST /api/webhooks/airtable (on your Render backend).
Access: This endpoint must be public (no protectRoute middleware) because Airtable cannot provide a user login cookie.
Prerequisite: To make this endpoint publically reachable, you had to use a tunnel (Ngrok or LocalTunnel) during development, and your final, deployed Render URL in production.

### Registration and Scopes
The configuration is initiated by an API call from your backend to the Airtable Webhooks API.
Trigger: The registerWebhook function in your controller handles this.
Notification URL: You had to send the full, public URL of your listener to Airtable: https://your-backend.onrender.com/api/webhooks/airtable.
Scopes: The initial OAuth login (webhook:manage scope) gave your application permission to set up these webhooks.
Filters: When registering, you specified the payload should only include dataTypes: ["tableData"]. This tells Airtable not to send notifications about structural changes (like table renames), 
but only about record creation, updates, and deletions.

### The Sync Process (Ping $\rightarrow$ Fetch)
The configuration enables the following two-step security process:
```
Action	                        Component	                Explanation
Airtable Action	                Delete or Edit Record	        The change is saved on Airtable's server.
Step 1: Ping	                Airtable Webhook	        Sends a small notification (the "ping") to your registered Render URL, containing the baseId and webhookId.
Step 2: Fetch	                Your Backend	                Uses the stored Access Token of the form owner to call Airtable back immediately, requesting the full payload of changes associated with that webhookId.
Step 3: Update	                Your Backend	                Processes the payload, finds the record in MongoDB via its airtableRecordId, and either updates its answers or sets the isDeletedInAirtable: true flag.
```
