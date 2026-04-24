"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

interface SidebarProps {
  session: Session;
}

const navItems = [
  { href: "/", label: "Kalendář", icon: "📅" },
  { href: "/recordings", label: "Záznamy", icon: "📋" },
  { href: "/admin", label: "Nastavení", icon: "⚙️" },
];

export default function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const user = session.user;
  const initials = (user?.name ?? user?.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <h1>🤖 MeetBot</h1>
        <span>Automatické záznamy</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <div className="sidebar-avatar">
            {user?.image ? (
              <img src={user.image} alt={user.name ?? ""} />
            ) : (
              initials
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{user?.name ?? "Uživatel"}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Odhlásit se
        </button>
      </div>
    </aside>
  );
}
