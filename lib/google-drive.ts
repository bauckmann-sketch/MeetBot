import { google } from "googleapis";

/**
 * Získá access token z refresh tokenu přes Google OAuth2
 */
export async function getAccessTokenFromRefresh(refreshToken: string): Promise<string> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Failed to refresh Google access token");
  }
  return credentials.access_token;
}

/**
 * Vytvoří složku na Google Drivu
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string
): Promise<{ id: string; name: string; url: string }> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, name, webViewLink",
  });

  return {
    id: res.data.id!,
    name: res.data.name!,
    url: res.data.webViewLink!,
  };
}

/**
 * Nahraje textový transkript jako Google Doc do složky
 */
export async function uploadTranscriptToDrive(
  accessToken: string,
  folderId: string,
  title: string,
  content: string
): Promise<string> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const res = await drive.files.create({
    requestBody: {
      name: `${title} – Přepis`,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    media: {
      mimeType: "text/plain",
      body: content,
    },
    fields: "id, webViewLink",
  });

  return res.data.webViewLink!;
}

/**
 * Nahraje video záznam do složky (stáhne z URL a pošle na Drive)
 * Best-effort – může selhat kvůli velikosti/timeoutu
 */
export async function uploadRecordingToDrive(
  accessToken: string,
  folderId: string,
  title: string,
  videoUrl: string
): Promise<string | null> {
  try {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });

    // Stáhni video stream z Recall URL
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      console.error("Failed to fetch video from Recall:", videoRes.status);
      return null;
    }

    // Upload na Drive pomocí readable stream
    const { Readable } = await import("stream");
    const nodeStream = Readable.fromWeb(videoRes.body as import("stream/web").ReadableStream);

    const res = await drive.files.create({
      requestBody: {
        name: `${title} – Záznam.mp4`,
        parents: [folderId],
      },
      media: {
        mimeType: "video/mp4",
        body: nodeStream,
      },
      fields: "id, webViewLink",
    });

    return res.data.webViewLink!;
  } catch (err) {
    console.error("Recording upload to Drive failed (best-effort):", err);
    return null;
  }
}
