"use client";

import { useLogout } from "@/hooks/useLogout";

export function LogoutButton() {
  const handleLogout = useLogout();

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      Sign out
    </button>
  );
}
