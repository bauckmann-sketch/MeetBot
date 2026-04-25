"use client";

import { useState, useEffect } from "react";
import { showToast } from "@/components/ToastContainer";

interface Settings {
  bot_name: string;
}

interface UserSettings {
  drive_folder_id: string;
  drive_folder_name: string;
}

interface AllowedUser {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
}

interface CostSummary {
  total: number;
  byType: { bot: number; transcription: number; storage: number };
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings>({ bot_name: "MeetBot" });
  const [userSettings, setUserSettings] = useState<UserSettings>({ drive_folder_id: "", drive_folder_name: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [costs, setCosts] = useState<CostSummary>({ total: 0, byType: { bot: 0, transcription: 0, storage: 0 } });
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [botNameInput, setBotNameInput] = useState("MeetBot");
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7); // "2025-04"

  useEffect(() => {
    // Načti nastavení
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(({ settings: s, userSettings: us, isAdmin: ia }) => {
        if (s) { setSettings(s); setBotNameInput(s.bot_name ?? "MeetBot"); }
        if (us) setUserSettings(us);
        setIsAdmin(ia ?? false);
      });

    // Načti costs
    fetch(`/api/admin/costs?month=${currentMonth}`)
      .then((r) => r.json())
      .then(({ total, byType }) => setCosts({ total: total ?? 0, byType: byType ?? { bot: 0, transcription: 0, storage: 0 } }));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(({ users: u }) => setUsers(u ?? []));
  }, [isAdmin]);

  async function saveBotName() {
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botName: botNameInput }),
    });
    setSaving(false);
    if (res.ok) showToast("Název bota uložen ✅", "success");
    else showToast("Chyba při ukládání", "error");
  }

  async function addUser() {
    if (!newEmail.trim()) return;
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null }),
    });
    if (res.ok) {
      showToast("Uživatel přidán ✅", "success");
      setNewEmail(""); setNewName("");
      fetch("/api/admin/users").then((r) => r.json()).then(({ users: u }) => setUsers(u ?? []));
    } else {
      const err = await res.json();
      showToast(err.error ?? "Chyba", "error");
    }
  }

  async function removeUser(email: string) {
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      showToast("Uživatel odebrán", "info");
      setUsers((prev) => prev.filter((u) => u.email !== email));
    } else {
      showToast("Chyba při odebírání", "error");
    }
  }

  const monthName = new Date().toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">⚙️ Nastavení</h1>
          <p className="page-subtitle">Konfigurace bota a správa účtu</p>
        </div>
      </div>

      <div className="admin-sections">
        {/* Sekce 1 – Bot name (jen admin) */}
        {isAdmin && (
          <div className="admin-section">
            <div className="admin-section-title">🤖 Globální nastavení bota</div>
            <label className="label">Jméno bota</label>
            <div className="input-group">
              <input
                id="bot-name-input"
                className="input"
                value={botNameInput}
                onChange={(e) => setBotNameInput(e.target.value)}
                placeholder="MeetBot"
              />
              <button
                className="btn btn-primary"
                onClick={saveBotName}
                disabled={saving}
              >
                {saving ? "Ukládám…" : "Uložit"}
              </button>
            </div>
            <p className="text-sm text-muted" style={{ marginTop: 8 }}>
              Takto se bot přihlásí na všech schůzkách
            </p>
          </div>
        )}

        {/* Sekce 2 – Google Drive složka */}
        <div className="admin-section">
          <div className="admin-section-title">📁 Moje Google Drive složka</div>
          <p className="text-sm text-muted mb-4">
            Záznamy a přepisy budou nahrány do vaší Google Drive složky.
          </p>
          {userSettings.drive_folder_name ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="badge badge-done">📁 {userSettings.drive_folder_name}</span>
              <span className="text-sm text-muted">ID: {userSettings.drive_folder_id}</span>
              <a
                href={`https://drive.google.com/drive/folders/${userSettings.drive_folder_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                Otevřít na Drivu ↗
              </a>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ marginBottom: 12, color: "var(--text-secondary)" }}>
                Složka nenastavena
              </div>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setSaving(true);
                  try {
                    const res = await fetch("/api/drive/folder", { method: "POST" });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error);
                    }
                    const { folder } = await res.json();
                    setUserSettings({
                      drive_folder_id: folder.id,
                      drive_folder_name: folder.name,
                    });
                    showToast("Složka vytvořena na Google Drivu ✅", "success");
                  } catch (err: unknown) {
                    showToast(
                      err instanceof Error ? err.message : "Chyba při vytváření složky",
                      "error"
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                {saving ? "Vytvářím…" : "📁 Vytvořit složku na Google Drivu"}
              </button>
            </div>
          )}
        </div>

        {/* Sekce 3 – Náklady */}
        <div className="admin-section">
          <div className="admin-section-title">💰 Moje náklady · {monthName}</div>
          <div className="cost-summary">
            <div className="cost-stat">
              <div className="cost-stat-label">Celkem</div>
              <div className="cost-stat-value">${costs.total.toFixed(2)}</div>
              <div className="cost-stat-sub">tento měsíc</div>
            </div>
            <div className="cost-stat">
              <div className="cost-stat-label">Bot (Recall.ai)</div>
              <div className="cost-stat-value">${costs.byType.bot.toFixed(2)}</div>
              <div className="cost-stat-sub">$0.50 / hod</div>
            </div>
            <div className="cost-stat">
              <div className="cost-stat-label">Přepis (AssemblyAI)</div>
              <div className="cost-stat-value">${costs.byType.transcription.toFixed(2)}</div>
              <div className="cost-stat-sub">$0.37 / hod</div>
            </div>
          </div>
        </div>

        {/* Sekce 4 – Správa uživatelů (jen admin) */}
        {isAdmin && (
          <div className="admin-section">
            <div className="admin-section-title">👥 Povolení uživatelé</div>

            <div className="user-list mb-4">
              {users.map((u) => (
                <div className="user-item" key={u.id}>
                  <span className="user-item-email">{u.email}</span>
                  {u.name && <span className="text-sm text-muted">{u.name}</span>}
                  {u.is_admin && <span className="user-item-admin">Admin</span>}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeUser(u.email)}
                  >
                    Odebrat
                  </button>
                </div>
              ))}
            </div>

            <div className="section-title" style={{ fontSize: 14 }}>Přidat uživatele</div>
            <div className="flex gap-2 mb-4">
              <input
                id="new-user-email"
                className="input"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUser()}
              />
              <input
                className="input"
                placeholder="Jméno (volitelné)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ maxWidth: 180 }}
              />
              <button className="btn btn-primary" onClick={addUser}>
                + Přidat
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
