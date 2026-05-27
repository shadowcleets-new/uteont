"use client";

import { useActionState } from "react";
import { setupPasswordAction, type SetupState } from "./actions";

export function SetupForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    setupPasswordAction,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="bg-white rounded-[12px] border border-[#e8e6dc] p-6 space-y-4"
    >
      <input type="hidden" name="token" value={token} />
      <div>
        <label
          htmlFor="password"
          className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
        >
          NEW PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="w-full rounded-md border border-[#cfccc1] px-3 py-2 text-[14px] focus:outline-none focus:border-[#d97757]"
        />
        <p className="text-[10px] text-[#9a988e] mt-1 font-serif italic">
          Minimum 12 chars. Must include 3 of: lowercase, uppercase, digit, symbol.
        </p>
      </div>
      <div>
        <label
          htmlFor="confirm"
          className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
        >
          CONFIRM PASSWORD
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded-md border border-[#cfccc1] px-3 py-2 text-[14px] focus:outline-none focus:border-[#d97757]"
        />
      </div>
      {state?.error && (
        <div className="text-[12px] text-[#a33b2b]">{state.error}</div>
      )}
      {state?.success && (
        <div className="text-[12px] text-[#788c5d]">
          ✓ Password set. <a href="/login" className="underline">Sign in</a>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#d97757] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] transition-colors"
      >
        {pending ? "Setting…" : "Set password"}
      </button>
    </form>
  );
}
