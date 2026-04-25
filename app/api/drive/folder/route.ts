import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";
import { createDriveFolder } from "@/lib/google-drive";

/**
 * POST – Vytvoří složku "MeetBot Záznamy" na uživatelově Google Drivu
 * Používá access token ze session (volá se z prohlížeče)
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const folder = await createDriveFolder(session.accessToken, "MeetBot Záznamy");

    // Ulož do user_settings
    const supabase = createServerClient();
    await supabase.from("user_settings").upsert({
      user_email: session.user.email,
      drive_folder_id: folder.id,
      drive_folder_name: folder.name,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ folder });
  } catch (err) {
    console.error("Drive folder creation error:", err);
    return NextResponse.json(
      { error: "Nepodařilo se vytvořit složku na Google Drivu" },
      { status: 500 }
    );
  }
}

/**
 * GET – Vrátí aktuálně nastavenou Drive složku uživatele
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from("user_settings")
    .select("drive_folder_id, drive_folder_name")
    .eq("user_email", session.user.email)
    .single();

  return NextResponse.json({ folder: data });
}
