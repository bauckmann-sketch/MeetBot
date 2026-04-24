import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

async function requireAdmin(email: string, supabase: ReturnType<typeof createServerClient>) {
  const { data } = await supabase
    .from("allowed_users")
    .select("is_admin")
    .eq("email", email)
    .single();
  return data?.is_admin === true;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const isAdmin = await requireAdmin(session.user.email, supabase);
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { data: users } = await supabase
    .from("allowed_users")
    .select("*")
    .order("added_at", { ascending: true });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const isAdmin = await requireAdmin(session.user.email, supabase);
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { email, name } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { error } = await supabase.from("allowed_users").insert({
    email: email.toLowerCase().trim(),
    name: name ?? null,
    is_admin: false,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const isAdmin = await requireAdmin(session.user.email, supabase);
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (email === session.user.email) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  await supabase.from("allowed_users").delete().eq("email", email);

  return NextResponse.json({ success: true });
}
