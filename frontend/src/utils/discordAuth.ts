import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  storePKCEValues,
  getPKCEValues,
  clearPKCEValues,
} from "./pkce";

const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "";
const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || "";

export async function initiateDiscordLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  storePKCEValues(codeVerifier, state);

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify email",
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  window.location.assign(authUrl);
}

export async function handleDiscordCallback(code: string): Promise<any> {
  const pkceValues = getPKCEValues();

  if (!pkceValues) {
    throw new Error("PKCE values not found. Session may have expired.");
  }

  const { verifier, state } = pkceValues;

  try {
    const tokenResponse = await fetch("/api/auth/discord/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        state,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const data = await tokenResponse.json();
    clearPKCEValues();
    return data;
  } catch (error) {
    console.error("Discord authentication error:", error);
    throw error;
  }
}
