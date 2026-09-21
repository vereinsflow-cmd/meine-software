/**
 * Passwortregeln (nach den Empfehlungen des BSI/NIST: Länge vor Komplexität, keine
 * erratbaren Passwörter). Reine Funktion – wird serverseitig durchgesetzt und kann
 * clientseitig für Hinweise verwendet werden.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Kleine Auswahl der am häufigsten verwendeten Passwörter (DE/EN). */
const COMMON_PASSWORDS = new Set([
  "passwort",
  "passwort1",
  "passwort123",
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "0123456789",
  "qwertzuiop",
  "qwertyuiop",
  "qwertz123",
  "qwerty123",
  "asdfghjkl",
  "iloveyou",
  "willkommen",
  "willkommen1",
  "hallo1234",
  "hallo12345",
  "abc123456",
  "abcdefghij",
  "sommer2024",
  "sommer2025",
  "sommer2026",
  "winter2024",
  "winter2025",
  "winter2026",
  "fussball",
  "fussball1",
  "fussball123",
  "verein123",
  "vereinsflow",
  "vereinsflow1",
  "changeme123",
  "letmein123",
  "welcome123",
  "administrator",
  "master1234",
  "superman123",
  "trustno1",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
]);

export interface PasswordContext {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function isRepetitiveOrSequential(password: string): boolean {
  if (/^(.)\1+$/.test(password)) return true;
  const sequences = [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "qwertzuiopasdfghjklyxcvbnm",
    "qwertyuiopasdfghjklzxcvbnm",
  ];
  const lower = password.toLowerCase();
  return sequences.some((sequence) => {
    const reversed = [...sequence].reverse().join("");
    return sequence.includes(lower) || reversed.includes(lower);
  });
}

/** Gibt eine Liste verständlicher Probleme zurück; leer bedeutet: Passwort ist zulässig. */
export function getPasswordIssues(password: string, context: PasswordContext = {}): string[] {
  const issues: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`);
  }
  if (issues.length > 0) return issues;

  const normalized = normalize(password);
  if (COMMON_PASSWORDS.has(normalized) || isRepetitiveOrSequential(normalized)) {
    issues.push(
      "Dieses Passwort ist zu leicht zu erraten. Wähle ein anderes, z. B. einen längeren Satz.",
    );
  }

  const personalParts = [context.email?.split("@")[0], context.firstName, context.lastName]
    .filter((part): part is string => !!part && part.length >= 4)
    .map(normalize);

  if (personalParts.some((part) => normalized.includes(part))) {
    issues.push("Das Passwort darf deinen Namen oder deine E-Mail-Adresse nicht enthalten.");
  }

  return issues;
}
