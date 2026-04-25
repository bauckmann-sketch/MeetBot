import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Tento soubor je zde čistě jako "Catch-All" router pro Vercel Edge.
 * V Next.js 16 v kombinaci s aktuální platformou Vercelu chybějící proxy způsobuje 404 na všechny stránky,
 * protože Vercel jinak nedokáže správně namapovat cesty Serverless funkcí.
 * 
 * Tento kód NEPROVÁDÍ žádnou autentizaci na Edge (aby nespadl na 500 Internal Server Error kvůli chybějícím
 * Env variables nebo chybám crypto knihovny). 
 * Plná autentizace beží bezpečně v Node.js v rámci app/(protected)/layout.tsx!
 */
export function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Tento matcher Vercelu řekne, ať VŠECHNY requesty pošle skrze Edge (mimo statické soubory).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
