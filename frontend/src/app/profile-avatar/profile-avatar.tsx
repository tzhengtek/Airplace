"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/app/context/AppContext";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  email: string;
}

export function ProfileAvatar() {
  const { setIsLoginOpen } = useAppContext();
  const [user, setUser] = useState<DiscordUser | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("discord_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    const handleStorageChange = () => {
      const updated = localStorage.getItem("discord_user");
      if (updated) {
        setUser(JSON.parse(updated));
      } else {
        setUser(null);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const getDiscordAvatarUrl = (userId: string, avatarHash: string) => {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
  };

  if (!user) {
    return null;
  }

  return (
    <button
      onClick={() => setIsLoginOpen(true)}
      className="fixed top-6 right-6 z-40 cursor-pointer rounded-full shadow-xl/50 transition-transform hover:scale-110 duration-200 hover:shadow-xl/100"
      title={`${user.username}#${user.discriminator}`}
    >
      <img
        src={getDiscordAvatarUrl(user.id, user.avatar)}
        alt={user.username}
        className="w-18 h-18 rounded-full border-2 border- hover:border-[#3b4aed] transition-colors duration-200 shadow-lg"
      />
    </button>
  );
}
