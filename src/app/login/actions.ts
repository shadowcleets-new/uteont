"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

/**
 * Credentials sign-in form action.
 *
 * On success: NextAuth throws a NEXT_REDIRECT (caught by Next.js — user
 * is redirected). On failure: returns { error } for the form to render.
 */
export async function credentialsSignInAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { error: "Username and password required." };
  }
  try {
    await signIn("credentials", {
      username,
      password,
      redirectTo: "/",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // CredentialsSignin = bad password / username mismatch
      if (e.type === "CredentialsSignin") {
        return { error: "Invalid username or password." };
      }
      return { error: "Sign-in failed. Try again." };
    }
    // Next.js redirect — let it bubble
    throw e;
  }
}

/**
 * Google sign-in form action — kicks off the OAuth flow.
 */
export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/" });
}
