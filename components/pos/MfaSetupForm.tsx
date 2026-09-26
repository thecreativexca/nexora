"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { postJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AlertIcon } from "@/components/ui/icons";

interface SetupResponse {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  accountName: string;
}
interface VerifyResponse {
  ok: boolean;
  redirectTo: string;
}

/**
 * One-time MFA setup: fetches a QR code + manual secret (guarded server-side by
 * the pre-auth cookie), then verifies a code before the account is enrolled.
 */
export function MfaSetupForm() {
  const router = useRouter();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await postJson<SetupResponse>("/api/staff/mfa/setup", {});
      if (cancelled) return;
      if (result.ok) {
        setSetup(result.data);
      } else {
        setSetupError(result.message);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVerifying || !setup) return;

    setVerifyError(null);
    setIsVerifying(true);

    const result = await postJson<VerifyResponse>("/api/staff/mfa/verify", { code });

    if (result.ok) {
      setSetup(null);
      router.replace(result.data.redirectTo);
      return;
    }

    setVerifyError(result.message);
    setCode("");
    setIsVerifying(false);
  }

  if (setupError) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
      >
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{setupError}</p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
        <Spinner label="Loading" /> Getting your setup code...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Scan this QR code with Google Authenticator, Authy, 1Password, Microsoft
        Authenticator or any other TOTP app. If you cannot scan it, type the code
        below into the app instead.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={setup.qrDataUrl}
        alt="QR code to add Nexora POS to your authenticator app"
        className="mx-auto h-52 w-52 rounded-lg border border-slate-200"
        width={208}
        height={208}
      />

      <div className="rounded-lg bg-slate-50 p-3 text-center">
        <p className="text-xs font-medium text-slate-500">Manual setup key</p>
        <p className="mt-1 font-mono text-sm tracking-widest text-slate-900">{setup.secret}</p>
      </div>

      <form onSubmit={handleVerify} noValidate className="space-y-4">
        {verifyError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{verifyError}</p>
          </div>
        ) : null}

        <TextField
          name="code"
          label="Code from your app"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          error={null}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        />

        <Button type="submit" size="lg" fullWidth disabled={isVerifying || code.length !== 6}>
          {isVerifying ? (
            <>
              <Spinner label="Verifying" /> Verifying...
            </>
          ) : (
            "Verify & finish setup"
          )}
        </Button>
      </form>
    </div>
  );
}