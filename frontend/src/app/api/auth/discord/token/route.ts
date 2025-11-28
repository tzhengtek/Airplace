import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function POST(request: NextRequest) {
  const { code, code_verifier, state } = await request.json();

  const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "";
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
  const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || "";

  if (!DISCORD_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Missing DISCORD_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/v10/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
        code_verifier: code_verifier,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get(
      "https://discord.com/api/v10/users/@me",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    return NextResponse.json({
      success: true,
      user: userResponse.data,
      access_token: access_token,
    });
  } catch (error) {
    console.error("Discord token exchange error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate with Discord" },
      { status: 400 }
    );
  }
}
