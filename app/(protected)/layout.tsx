import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/ToastContainer";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="app-shell">
      <Sidebar session={session} />
      <main className="app-main">
        {children}
      </main>
      <ToastContainer />
    </div>
  );
}
