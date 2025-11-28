import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const secretClient = new SecretManagerServiceClient();

export async function getSecret(secretName: string): Promise<string> {
    try {
        const projectId = process.env.NEXT_PUBLIC_PROJETCT_ID;
        const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;

        console.log(`Accessing secret: ${secretPath}`);

        const [version] = await secretClient.accessSecretVersion({
            name: secretPath,
        });

        if (!version.payload?.data) {
            throw new Error(`Secret ${secretName} has no data`);
        }

        const secret = version.payload.data.toString('utf8');
        if (!secret) {
            throw new Error(`Secret ${secretName} is empty`);
        }

        console.log(`Successfully retrieved secret: ${secretName} from Secret Manager`);
        return secret;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching secret: ${secretName}`, errorMessage);
        throw error;
    }
}

export async function POST(request: NextRequest) {
  const { code, code_verifier, state } = await request.json();

  const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "";
  // const DISCORD_CLIENT_SECRET = await getSecret("discord_client_secret");
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