import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Credentials, CookieData } from '../types/pingcode.js';

const CREDENTIALS_DIR = path.join(os.homedir(), '.pingcode-mcp');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

/**
 * 确保凭证目录存在
 */
function ensureCredentialsDir(): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * 保存凭证
 */
export function saveCredentials(credentials: Credentials): void {
  ensureCredentialsDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

/**
 * 读取凭证
 */
export function loadCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

/**
 * 删除凭证
 */
export function clearCredentials(): void {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // ignore
  }
}

/**
 * 检查凭证是否有效（未过期）
 */
export function isCredentialsValid(credentials: Credentials | null): boolean {
  if (!credentials) return false;
  if (!credentials.cookies || credentials.cookies.length === 0) return false;
  
  // 检查是否有关键 cookie
  const hasPingCodeCookie = credentials.cookies.some(
    (c) => c.name.includes('pingcode') || c.name.includes('session') || c.name.includes('token')
  );
  
  if (!hasPingCodeCookie) return false;
  
  // 检查过期时间（如果有设置）
  if (credentials.expires_at && Date.now() > credentials.expires_at) {
    return false;
  }
  
  return true;
}

/**
 * 将 cookies 转换为请求头格式
 */
export function cookiesToHeader(cookies: CookieData[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * 获取凭证存储路径（用于提示用户）
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
