import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — UTEONT" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const hasGoogle = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f5] px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <h1 className="text-[36px] font-bold text-[#141413] tracking-tight">
            UTEONT
          </h1>
          <p className="text-[13px] text-[#6b6a64] mt-2 font-serif italic">
            Multi-agent SEO orchestrator
          </p>
        </div>
        <LoginForm hasGoogle={hasGoogle} />
        <p className="text-[11px] text-[#9a988e] text-center mt-6 font-serif">
          Single-user system. Credentials managed via Telegram bot.
        </p>
      </div>
    </div>
  );
}
