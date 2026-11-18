export interface NoteLockSettings { version: 1; salt: string; verifier: string }
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
export function validateLockSettings(value: unknown): NoteLockSettings {
  const x = value as Partial<NoteLockSettings> | null;
  if (!x || x.version !== 1 || !/^[a-f0-9]{32}$/.test(x.salt ?? "") || !/^[a-f0-9]{64}$/.test(x.verifier ?? "")) throw new Error("日記のロック設定を読み取れませんでした。");
  return { version: 1, salt: x.salt!, verifier: x.verifier! };
}
async function passwordVerifier(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bytes = Uint8Array.from(salt.match(/../g)!, byte => parseInt(byte, 16));
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes, iterations: 600_000 }, material, 256)));
}
export async function createLockSettings(password: string): Promise<NoteLockSettings> {
  if ([...password].length < 8 || password.length > 1024) throw new Error("パスワードは8文字以上、1,024文字以内にしてください。");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, salt, verifier: await passwordVerifier(password, salt) };
}
export async function verifyLockPassword(password: string, raw: NoteLockSettings) {
  const settings = validateLockSettings(raw);
  if (!password || password.length > 1024) return false;
  const candidate = await passwordVerifier(password, settings.salt);
  let difference = 0;
  for (let i = 0; i < settings.verifier.length; i++) difference |= candidate.charCodeAt(i) ^ settings.verifier.charCodeAt(i);
  return difference === 0;
}
