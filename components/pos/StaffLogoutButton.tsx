"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface LogoutResponse {
  ok: boolean;
  redirectTo: string;
}

/** Signs the staff member out of the portal (revokes the session server-side). */
export function StaffLogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const result = await postJson<LogoutResponse>("/api/staff/logout", {});
    if (result.ok) {
      router.replace(result.data.redirectTo);
      return;
    }
    router.replace("/account/login");
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void handleLogout()} disabled={isSubmitting}>
      {isSubmitting ? <Spinner label="Signing out" /> : null}
      Sign out
    </Button>
  );
}
