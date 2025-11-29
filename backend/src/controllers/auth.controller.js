import crypto from "crypto";
import axios from "axios";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

const tempStorage = {};

export const login = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  tempStorage[state] = codeVerifier;
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

export const callback = async (req, res) => {
  const { code, state } = req.query;
  const codeVerifier = tempStorage[state];

  if (!codeVerifier) {
    return res.status(400).send("Security Error: Invalid state.");
  }

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

    delete tempStorage[state];

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);
    res.redirect(`${process.env.CLIENT_URL}/login?error=true`);
  }
};

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
