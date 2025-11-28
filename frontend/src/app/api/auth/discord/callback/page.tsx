"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { handleDiscordCallback } from "@/utils/discordAuth";
import { useAppContext } from "@/app/context/AppContext";

export default function DiscordCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setIsLoginOpen } = useAppContext();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Discord authentication failed: ${errorParam}`);
      setLoading(false);
      return;
    }

    if (!code) {
      setError("No authorization code received from Discord");
      setLoading(false);
      return;
    }

    const authenticate = async () => {
      try {
        const result = await handleDiscordCallback(code);
        console.log("User authenticated:", result.user);

        // Store token and user info
        if (result.access_token) {
          localStorage.setItem("discord_token", result.access_token);
        }
        if (result.user) {
          localStorage.setItem("discord_user", JSON.stringify(result.user));
          // Trigger storage event for ProfileAvatar component
          window.dispatchEvent(new Event("storage"));
        }

        setIsLoginOpen(false);

        router.push("/");
      } catch (err) {
        console.error("Authentication error:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");
      } finally {
        setLoading(false);
      }
    };

    authenticate();
  }, [searchParams, router, setIsLoginOpen]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        {loading && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
              Authenticating with Discord...
            </h1>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Authentication Error
            </h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Go Back Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
