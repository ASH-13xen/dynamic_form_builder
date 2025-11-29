import crypto from "crypto";
import axios from "axios";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

// DELETE THIS LINE: const tempStorage = {};

// 1. LOGIN
export const login = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // --- NEW: SAVE SECRETS TO COOKIES INSTEAD OF RAM ---
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction, // True in Prod, False in Dev
    sameSite: isProduction ? "none" : "lax",
    maxAge: 10 * 60 * 1000, // Expires in 10 minutes
  };

  res.cookie("oauth_state", state, cookieOptions);
  res.cookie("oauth_verifier", codeVerifier, cookieOptions);
  // ----------------------------------------------------

  const authUrl =
    `https://airtable.com/oauth2/v1/authorize?` +
    `client_id=${process.env.AIRTABLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(
      process.env.AIRTABLE_OAUTH_REDIRECT_URL
    )}&` +
    `response_type=code&` +
    `scope=data.records:read data.records:write schema.bases:read webhook:manage user.email:read&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;

  res.redirect(authUrl);
};

// 2. CALLBACK
export const callback = async (req, res) => {
  const { code, state } = req.query;

  // --- NEW: RETRIEVE SECRETS FROM COOKIES ---
  const storedState = req.cookies.oauth_state;
  const codeVerifier = req.cookies.oauth_verifier;

  // Validation: Check if cookies match the URL state
  if (!storedState || !codeVerifier || state !== storedState) {
    return res
      .status(400)
      .send(
        "Security Error: Invalid state or Session expired. Please try again."
      );
  }
  // ------------------------------------------

  try {
    const credentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      "https://airtable.com/oauth2/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.AIRTABLE_OAUTH_REDIRECT_URL,
        client_id: process.env.AIRTABLE_CLIENT_ID,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // --- NEW: CLEAN UP TEMP COOKIES ---
    res.clearCookie("oauth_state");
    res.clearCookie("oauth_verifier");
    // ----------------------------------

    const { access_token, refresh_token, expires_in } = response.data;

    const userMe = await axios.get("https://api.airtable.com/v0/meta/whoami", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = await User.findOneAndUpdate(
      { airtableUserId: userMe.data.id },
      {
        email: userMe.data.email,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },
      { new: true, upsert: true }
    );

    // Create Session Token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const isProduction = process.env.NODE_ENV === "production";

    // Set Final Session Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);
    res.redirect(`${process.env.CLIENT_URL}/login?error=true`);
  }
};

// ... logout and checkAuth remain the same
export const logout = (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully" });
};

export const checkAuth = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-accessToken -refreshToken"
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};
