import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
const dummyHash = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const valid = stored?.match(/^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const [, salt, expected] = (valid ? stored! : dummyHash).split("$");
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && Boolean(valid);
}
