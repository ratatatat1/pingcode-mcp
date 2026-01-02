import { chromium, BrowserContext } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import {
  saveCredentials,
  clearCredentials,
  loadCredentials,
  isCredentialsValid,
  getCredentialsPath,
} from '../utils/credentials.js';
import type { Credentials, CookieData } from '../types/pingcode.js';

const PINGCODE_DOMAIN = process.env.PINGCODE_DOMAIN || 'neuralgalaxy.pingcode.com';
const LOGIN_URL = `https://${PINGCODE_DOMAIN}/signin`;
const SUCCESS_URL_PATTERN = /pingcode\.com\/(pjm|agile|wiki|testhub|workspace)/;

// 登录超时时间（5分钟）
const LOGIN_TIMEOUT = 5 * 60 * 1000;

// 独立的 Chrome 配置文件目录（不影响系统 Chrome）
const CHROME_USER_DATA_DIR = path.join(
  os.homedir(),
  '.pingcode-mcp',
  'chrome-profile'
);

/**
 * 打开浏览器进行登录
 */
export async function login(): Promise<{ success: boolean; message: string }> {
  let context: BrowserContext | null = null;

  try {
    console.error('正在启动浏览器...');
    
    // 使用独立的配置文件目录，首次登录后会保存登录状态
    // 下次登录时会复用已保存的状态（包括飞书授权）
    context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
      headless: false,
      channel: 'chrome', // 使用系统 Chrome
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await context.newPage();

    console.error(`正在打开登录页面: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

    console.error('请在浏览器中完成登录（支持飞书等第三方登录）...');
    console.error(`登录超时时间: ${LOGIN_TIMEOUT / 1000 / 60} 分钟`);

    // 等待用户完成登录（检测 URL 变化）
    try {
      await page.waitForURL(SUCCESS_URL_PATTERN, {
        timeout: LOGIN_TIMEOUT,
      });
    } catch {
      // 如果超时，检查当前 URL 是否已经是登录成功的页面
      const currentUrl = page.url();
      if (!SUCCESS_URL_PATTERN.test(currentUrl)) {
        return {
          success: false,
          message: '登录超时或被取消',
        };
      }
    }

    console.error('登录成功，正在保存凭证...');

    // 从页面提取当前用户信息
    let currentUser: { id: string; name: string } | undefined;
    try {
      // 等待页面加载完成
      await page.waitForLoadState('networkidle');
      
      // 从 localStorage 或页面提取用户信息
      const userInfo = await page.evaluate(() => {
        // 尝试从 localStorage 获取
        const stored = localStorage.getItem('user') || localStorage.getItem('currentUser');
        if (stored) {
          try {
            const user = JSON.parse(stored);
            return { id: user._id || user.id, name: user.display_name || user.name };
          } catch {}
        }
        // 尝试从 window 对象获取
        const w = window as any;
        if (w.__INITIAL_STATE__?.user) {
          const user = w.__INITIAL_STATE__.user;
          return { id: user._id || user.id, name: user.display_name || user.name };
        }
        if (w.currentUser) {
          return { id: w.currentUser._id || w.currentUser.id, name: w.currentUser.display_name || w.currentUser.name };
        }
        return null;
      });
      
      if (userInfo && userInfo.id) {
        currentUser = userInfo;
        console.error(`当前用户: ${currentUser.name} (${currentUser.id})`);
      }
    } catch {
      console.error('未能获取用户信息，继续保存凭证...');
    }

    // 获取所有 cookies
    const cookies = await context.cookies();
    const pingcodeCookies: CookieData[] = cookies
      .filter((c) => c.domain.includes('pingcode.com'))
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
      }));

    if (pingcodeCookies.length === 0) {
      return {
        success: false,
        message: '未能获取有效的登录凭证',
      };
    }

    // 计算过期时间（取最早过期的 cookie，或默认 7 天）
    const expiresAt = pingcodeCookies.reduce((min, c) => {
      if (c.expires && c.expires > 0) {
        const expMs = c.expires * 1000;
        return expMs < min ? expMs : min;
      }
      return min;
    }, Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 保存凭证
    const credentials: Credentials = {
      cookies: pingcodeCookies,
      domain: PINGCODE_DOMAIN,
      saved_at: Date.now(),
      expires_at: expiresAt,
      user: currentUser,
    };

    saveCredentials(credentials);

    return {
      success: true,
      message: `登录成功！凭证已保存到 ${getCredentialsPath()}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `登录失败: ${error.message}`,
    };
  } finally {
    // 关闭浏览器
    if (context) await context.close().catch(() => {});
  }
}

/**
 * 退出登录（清除凭证）
 */
export function logout(): { success: boolean; message: string } {
  clearCredentials();
  return {
    success: true,
    message: '已退出登录，凭证已清除',
  };
}

/**
 * 检查登录状态
 */
export function checkAuth(): {
  authenticated: boolean;
  message: string;
  expiresAt?: string;
} {
  const credentials = loadCredentials();
  const isValid = isCredentialsValid(credentials);

  if (!isValid) {
    return {
      authenticated: false,
      message: '未登录或凭证已过期，请调用 login 工具进行登录',
    };
  }

  const expiresAt = credentials!.expires_at
    ? new Date(credentials!.expires_at).toLocaleString('zh-CN')
    : '未知';

  return {
    authenticated: true,
    message: '已登录',
    expiresAt,
  };
}
