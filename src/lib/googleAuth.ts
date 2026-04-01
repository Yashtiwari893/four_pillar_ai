import { google } from "googleapis";

export function createGoogleJwt(scopes: string[] = []) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (key) {
    key = key.trim();

    // 1. Detect if it's a full JSON service account
    if (key.startsWith("{")) {
      try {
        console.info("Google Auth: Detected JSON service account, extracting private_key.");
        const json = JSON.parse(key);
        key = json.private_key || key;
      } catch (err) {
        console.error("Google Auth: Failed to parse GOOGLE_PRIVATE_KEY as JSON", err);
      }
    }

    // 2. Strip surrounding quotes (if any)
    key = key.replace(/^"|"$/g, "");

    // 3. Find the actual start of the PEM key (handles cases where junk is before it)
    const beginIndex = key.indexOf("-----BEGIN");
    if (beginIndex > -1) {
      key = key.substring(beginIndex);
    } else {
      console.warn("GOOGLE_PRIVATE_KEY does not contain -----BEGIN");
    }

    // 4. Handle escaped newlines (\n) and normalize Windows-style CRLF
    key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

    console.info(`Google Auth: Key prepared, length: ${key.length}`);
  } else {
    console.warn("GOOGLE_PRIVATE_KEY is missing from environment variables.");
  }

  return new google.auth.JWT({
    email,
    key: key || undefined,
    scopes,
  });
}

export default createGoogleJwt;
