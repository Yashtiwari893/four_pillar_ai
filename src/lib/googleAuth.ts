import { google } from "googleapis";

export function createGoogleJwt(scopes: string[] = []) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (key) {
    // Strip leading/trailing quotes if the user wrapped the key in quotes in .env
    key = key.trim().replace(/^"|"$/g, "");
    // Handle escaped newlines (e.g., if the key is on a single line with \n characters)
    key = key.replace(/\\n/g, "\n");
    // Normalize Windows-style CRLF newlines to LF
    key = key.replace(/\r\n/g, "\n");
    // Ensure the key has proper headers if they were somehow mangled
    if (!key.startsWith("-----BEGIN")) {
      console.warn("GOOGLE_PRIVATE_KEY does not start with -----BEGIN");
    }
    console.log(`Google Auth: Key loaded, length: ${key.length}`);
  } else {
    console.warn("GOOGLE_PRIVATE_KEY is missing from environment variables.");
  }

  return new google.auth.JWT({
    email,
    key,
    scopes,
  });
}

export default createGoogleJwt;
