import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: settings } = await supabase.from("settings").select("*").single();
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_email", session.user.email)
    .single();
  const { data: allowedUser } = await supabase
    .from("allowed_users")
    .select("is_admin")
    .eq("email", session.user.email)
    .single();

  return NextResponse.json({
    settings,
    userSettings,
    isAdmin: allowedUser?.is_admin ?? false,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const body = await req.json();
  const { botName, driveFolderId, driveFolderName } = body;

  // Zkontroluj admin pro globální nastavení
  if (botName !== undefined) {
    const { data: allowedUser } = await supabase
      .from("allowed_users")
      .select("is_admin")
      .eq("email", session.user.email)
      .single();

    if (!allowedUser?.is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    await supabase.from("settings").upsert({
      id: 1,
      bot_name: botName,
      updated_at: new Date().toISOString(),
    });
  }

  // Per-user nastavení
  if (driveFolderId !== undefined || driveFolderName !== undefined) {
    await supabase.from("user_settings").upsert({
      user_email: session.user.email,
      drive_folder_id: driveFolderId ?? "",
      drive_folder_name: driveFolderName ?? "",
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ success: true });
}
