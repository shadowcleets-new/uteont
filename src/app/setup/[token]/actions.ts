"use server";

import { consumeSetupToken } from "@/lib/services/setup-token";

export type SetupState =
  | { error?: string; success?: boolean }
  | undefined;

export async function setupPasswordAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Setup link is malformed." };
  if (!password) return { error: "Password is required." };
  if (password !== confirm) return { error: "Passwords don't match." };

  try {
    await consumeSetupToken(token, password);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
