import { CrmHeader } from "@/components/crm-header";
import { getProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/account/unauthorized");

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <CrmHeader role={profile.role} email={profile.email} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
