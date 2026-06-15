"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export async function signOutAction() {
  // Clear NextAuth's server-side session state without letting it throw the
  // redirect — when signOut() redirects from inside a Server Action, the
  // Set-Cookie that deletes the session token never reaches the browser, so
  // the session survives and the rolling-session middleware re-issues it
  // (the sign-out-then-refresh re-login bug).
  await signOut({ redirect: false });

  // Belt-and-suspenders: expire the Auth.js cookies ourselves, with matching
  // attributes (__Secure-/__Host- prefixes require Secure + Path=/).
  const store = await cookies();
  for (const c of store.getAll()) {
    if (/authjs\.(session-token|csrf-token|callback-url)/.test(c.name)) {
      store.set(c.name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
    }
  }

  redirect("/login");
}
