"use client";

import { useActionState } from "react";
import {
  credentialsSignInAction,
  googleSignInAction,
  type LoginState,
} from "./actions";

interface LoginFormProps {
  hasGoogle: boolean;
}

export function LoginForm({ hasGoogle }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    credentialsSignInAction,
    undefined,
  );

  return (
    <div className="bg-white rounded-[12px] border border-[#e8e6dc] p-6 space-y-4">
      {hasGoogle ? (
        <>
          <form action={googleSignInAction}>
            <button
              type="submit"
              className="w-full rounded-md bg-white border border-[#cfccc1] text-[#141413] px-4 py-2.5 text-sm font-medium hover:bg-[#faf9f5] transition-colors flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e8e6dc]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-white px-2 text-[#9a988e]">or</span>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-md bg-[#f3f1ea] border border-[#e8e6dc] px-3 py-2 text-[11px] text-[#9a988e] font-serif italic">
          Google sign-in not yet configured. Use the password form below.
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor="username"
            className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
          >
            USERNAME
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded-md border border-[#cfccc1] px-3 py-2 text-[14px] focus:outline-none focus:border-[#d97757]"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-[10px] font-bold tracking-wider text-[#9a988e] mb-1"
          >
            PASSWORD
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-[#cfccc1] px-3 py-2 text-[14px] focus:outline-none focus:border-[#d97757]"
          />
        </div>
        {state?.error && (
          <div className="text-[12px] text-[#a33b2b]">{state.error}</div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[#d97757] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] transition-colors"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
