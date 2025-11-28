function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function sha256(str: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  return crypto.subtle.digest("SHA-256", data);
}

export async function generateCodeChallenge(
  codeVerifier: string
): Promise<string> {
  const hash = await sha256(codeVerifier);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashString = String.fromCharCode(...hashArray);
  return base64UrlEncode(hashString);
}

export function generateCodeVerifier(): string {
  return generateRandomString(128);
}

export function generateState(): string {
  return generateRandomString(32);
}

export function storePKCEValues(verifier: string, state: string): void {
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);
}

export function getPKCEValues(): { verifier: string; state: string } | null {
  const verifier = sessionStorage.getItem("pkce_verifier");
  const state = sessionStorage.getItem("pkce_state");

  if (verifier && state) {
    return { verifier, state };
  }
  return null;
}

export function clearPKCEValues(): void {
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("pkce_state");
}
