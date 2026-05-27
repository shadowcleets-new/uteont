import { SetupForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set password" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SetupPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f5] px-4">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-semibold text-[#141413] tracking-tight">
            Set password
          </h1>
          <p className="text-[12px] text-[#6b6a64] mt-2 font-serif italic">
            Single-use link · expires in 10 minutes
          </p>
        </div>
        <SetupForm token={token} />
      </div>
    </div>
  );
}
