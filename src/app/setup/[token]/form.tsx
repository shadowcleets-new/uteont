"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Check, X, Circle } from "lucide-react";
import { setupPasswordAction, type SetupState } from "./actions";

// Mirror of validatePassword() in src/lib/services/auth-config.ts. Kept in
// sync via auth-config.test.ts. The /api/setup action validates on the server
// too — these checks are only UX scaffolding.
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const REQUIRED_CLASSES = 3;
const FORBIDDEN_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "qwerty123",
  "letmein123",
  "admin1234",
]);

interface PolicyState {
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
  classCount: number;
  meetsLength: boolean;
  withinMaxLength: boolean;
  notInBlocklist: boolean;
  meetsClassRequirement: boolean;
  allOk: boolean;
}

function evaluatePassword(pw: string): PolicyState {
  const hasLowercase = /[a-z]/.test(pw);
  const hasUppercase = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const classCount =
    Number(hasLowercase) + Number(hasUppercase) + Number(hasDigit) + Number(hasSymbol);
  const meetsLength = pw.length >= MIN_LENGTH;
  const withinMaxLength = pw.length <= MAX_LENGTH;
  const notInBlocklist = !FORBIDDEN_PASSWORDS.has(pw.toLowerCase());
  const meetsClassRequirement = classCount >= REQUIRED_CLASSES;
  const allOk =
    meetsLength &&
    withinMaxLength &&
    notInBlocklist &&
    meetsClassRequirement &&
    pw.length > 0;
  return {
    hasLowercase,
    hasUppercase,
    hasDigit,
    hasSymbol,
    classCount,
    meetsLength,
    withinMaxLength,
    notInBlocklist,
    meetsClassRequirement,
    allOk,
  };
}

interface CheckRowProps {
  ok: boolean;
  /** Pending (empty input) vs explicitly failed */
  neutral?: boolean;
  text: string;
}

function CheckRow({ ok, neutral, text }: CheckRowProps) {
  const color = ok
    ? "text-[#788c5d]"
    : neutral
      ? "text-[#9a988e]"
      : "text-[#a33b2b]";
  const Icon = ok ? Check : neutral ? Circle : X;
  return (
    <div className={`flex items-center gap-2 text-[12px] ${color}`}>
      <Icon size={14} strokeWidth={2.5} className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}

export function SetupForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    setupPasswordAction,
    undefined,
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const policy = evaluatePassword(password);

  const passwordEmpty = password.length === 0;
  const confirmEmpty = confirm.length === 0;
  const confirmsMatch = !confirmEmpty && password === confirm;
  const confirmsDontMatch = !confirmEmpty && password !== confirm;

  const canSubmit = policy.allOk && confirmsMatch && !pending;

  return (
    <form
      action={formAction}
      className="bg-white rounded-[12px] border border-[#e8e6dc] p-6 space-y-5"
    >
      <input type="hidden" name="token" value={token} />

      {/* NEW PASSWORD */}
      <div>
        <label
          htmlFor="password"
          className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
        >
          NEW PASSWORD
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[#cfccc1] px-3 py-2 pr-10 text-[14px] focus:outline-none focus:border-[#d97757] font-mono"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9a988e] hover:text-[#141413]"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* CONFIRM PASSWORD */}
      <div>
        <label
          htmlFor="confirm"
          className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
        >
          CONFIRM PASSWORD
        </label>
        <div className="relative">
          <input
            id="confirm"
            name="confirm"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 pr-10 text-[14px] focus:outline-none font-mono transition-colors ${
              confirmsDontMatch
                ? "border-[#a33b2b] focus:border-[#a33b2b]"
                : confirmsMatch
                  ? "border-[#788c5d] focus:border-[#788c5d]"
                  : "border-[#cfccc1] focus:border-[#d97757]"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            tabIndex={-1}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9a988e] hover:text-[#141413]"
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {/* Live match indicator */}
        <div className="mt-1.5">
          {confirmEmpty ? null : confirmsMatch ? (
            <CheckRow ok text="Passwords match" />
          ) : (
            <CheckRow ok={false} text="Passwords don't match" />
          )}
        </div>
      </div>

      {/* POLICY CHECKLIST */}
      <div className="rounded-md bg-[#faf9f5] border border-[#e8e6dc] p-3 space-y-1.5">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-1">
          REQUIREMENTS
        </div>

        <CheckRow
          ok={policy.meetsLength}
          neutral={passwordEmpty}
          text={`At least ${MIN_LENGTH} characters${
            passwordEmpty ? "" : ` — currently ${password.length}`
          }`}
        />
        {!policy.withinMaxLength && (
          <CheckRow ok={false} text={`Too long (max ${MAX_LENGTH} chars)`} />
        )}
        <CheckRow
          ok={policy.notInBlocklist || passwordEmpty}
          neutral={passwordEmpty}
          text={
            passwordEmpty
              ? "Not in common-passwords blocklist"
              : policy.notInBlocklist
                ? "Not in common-passwords blocklist"
                : "Password is too common — pick something less obvious"
          }
        />

        <div className="pt-1.5 mt-1.5 border-t border-[#e8e6dc]">
          <div className="text-[11px] text-[#6b6a64] mb-1.5">
            Need at least <strong>3 of 4</strong> character classes
            {!passwordEmpty && ` — currently ${policy.classCount}`}:
          </div>
          <CheckRow
            ok={policy.hasLowercase}
            neutral={passwordEmpty}
            text="Lowercase letter (a–z)"
          />
          <CheckRow
            ok={policy.hasUppercase}
            neutral={passwordEmpty}
            text="Uppercase letter (A–Z)"
          />
          <CheckRow
            ok={policy.hasDigit}
            neutral={passwordEmpty}
            text="Digit (0–9)"
          />
          <CheckRow
            ok={policy.hasSymbol}
            neutral={passwordEmpty}
            text="Symbol (e.g. ! @ # $ % & *)"
          />
        </div>
      </div>

      {/* SERVER MESSAGES */}
      {state?.error && (
        <div className="text-[12px] text-[#a33b2b] bg-[#fcf3f1] border border-[#e8c0b8] rounded-md p-2">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="text-[12px] text-[#788c5d] bg-[#f3f6ed] border border-[#c8d3b1] rounded-md p-2">
          ✓ Password set successfully.{" "}
          <a href="/login" className="underline font-medium">
            Sign in →
          </a>
        </div>
      )}

      {/* SUBMIT */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-[#d97757] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed transition-colors"
      >
        {pending
          ? "Setting…"
          : !policy.allOk && !passwordEmpty
            ? "Password doesn't meet requirements"
            : confirmsDontMatch
              ? "Passwords don't match"
              : passwordEmpty || confirmEmpty
                ? "Fill both fields"
                : "Set password"}
      </button>
    </form>
  );
}
