"use client";

import { User, Settings, Sun, LogOut } from "lucide-react";
import { useLogout } from "@/hooks/useLogout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProfileMenuProps {
  userEmail?: string | null;
}

/**
 * Profile dropdown in the header right zone.
 *
 * Items:
 *   1. Doctor email (muted label)
 *   2. Settings → /dashboard/settings
 *   3. Theme toggle placeholder (U5.4 will wire dim mode)
 *   4. ── separator ──
 *   5. Log out (calls supabase.auth.signOut)
 *
 * The standalone <LogoutButton> is intentionally NOT rendered in the header
 * anymore — its action is inlined here. LogoutButton.tsx remains exported
 * for other consumers.
 *
 * @see task-ui-B1-header-redesign.md § Profile dropdown
 */
export function HeaderProfileMenu({ userEmail }: HeaderProfileMenuProps) {
  const handleLogout = useLogout();

  function handleThemeToggle() {
    // TODO(U5.4): wire dim-mode toggle when theme system ships.
    console.warn(
      "[HeaderProfileMenu] Theme toggle is a placeholder — U5.4 will wire it."
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open profile menu">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {userEmail && (
          <>
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <a href="/dashboard/settings" className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleThemeToggle}
          className="flex cursor-pointer items-center gap-2"
        >
          <Sun className="h-4 w-4" />
          Theme: light / dim
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
