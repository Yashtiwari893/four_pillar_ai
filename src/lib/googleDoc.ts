import { google } from "googleapis";
import createGoogleJwt from "./googleAuth";

const docsAuth = createGoogleJwt(["https://www.googleapis.com/auth/documents.readonly"]);
const driveAuth = createGoogleJwt(["https://www.googleapis.com/auth/drive.readonly"]);

async function readViaDriveExport(docId: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth: driveAuth });
  const res = await drive.files.export(
    {
      fileId: docId,
      mimeType: "text/plain",
    },
    { responseType: "text" }
  );

  const text = typeof res.data === "string" ? res.data : String(res.data || "");
  return text.trim();
}

export async function readGoogleDoc(docId: string): Promise<string> {
  try {
    const docs = google.docs({ version: "v1", auth: docsAuth });

    const res = await docs.documents.get({
      documentId: docId,
    });

    const content = res.data.body?.content || [];
    let text = "";

    for (const element of content) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements || []) {
          if (paragraphElement.textRun) {
            text += paragraphElement.textRun.content || "";
          }
        }
      }
    }

    return text.trim();
  } catch (error: any) {
    if (error?.code === 403 || error?.status === 403) {
      console.warn("Google Docs API unavailable, falling back to Drive export.");
      return readViaDriveExport(docId);
    }

    throw error;
  }
}

export async function getGoogleDocMetadata(docId: string) {
  try {
    const docs = google.docs({ version: "v1", auth: docsAuth });
    const res = await docs.documents.get({ documentId: docId });
    return {
      title: res.data.title || null,
      revisionId: (res.data.revisionId as string) || null,
    };
  } catch (error: any) {
    if (error?.code === 403 || error?.status === 403) {
      const drive = google.drive({ version: "v3", auth: driveAuth });
      const res = await drive.files.get({
        fileId: docId,
        fields: "name, modifiedTime",
      });

      return {
        title: res.data.name || null,
        revisionId: (res.data.modifiedTime as string) || null,
      };
    }

    throw error;
  }
}