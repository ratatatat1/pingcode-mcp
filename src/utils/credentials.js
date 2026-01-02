"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCredentials = saveCredentials;
exports.loadCredentials = loadCredentials;
exports.clearCredentials = clearCredentials;
exports.isCredentialsValid = isCredentialsValid;
exports.cookiesToHeader = cookiesToHeader;
exports.getCredentialsPath = getCredentialsPath;
var fs = require("fs");
var path = require("path");
var os = require("os");
var CREDENTIALS_DIR = path.join(os.homedir(), '.pingcode-mcp');
var CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
/**
 * 确保凭证目录存在
 */
function ensureCredentialsDir() {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 448 });
    }
}
/**
 * 保存凭证
 */
function saveCredentials(credentials) {
    ensureCredentialsDir();
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
        mode: 384,
    });
}
/**
 * 读取凭证
 */
function loadCredentials() {
    try {
        if (!fs.existsSync(CREDENTIALS_FILE)) {
            return null;
        }
        var content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch (_a) {
        return null;
    }
}
/**
 * 删除凭证
 */
function clearCredentials() {
    try {
        if (fs.existsSync(CREDENTIALS_FILE)) {
            fs.unlinkSync(CREDENTIALS_FILE);
        }
    }
    catch (_a) {
        // ignore
    }
}
/**
 * 检查凭证是否有效（未过期）
 */
function isCredentialsValid(credentials) {
    if (!credentials)
        return false;
    if (!credentials.cookies || credentials.cookies.length === 0)
        return false;
    // 检查是否有关键 cookie
    var hasPingCodeCookie = credentials.cookies.some(function (c) { return c.name.includes('pingcode') || c.name.includes('session') || c.name.includes('token'); });
    if (!hasPingCodeCookie)
        return false;
    // 检查过期时间（如果有设置）
    if (credentials.expires_at && Date.now() > credentials.expires_at) {
        return false;
    }
    return true;
}
/**
 * 将 cookies 转换为请求头格式
 */
function cookiesToHeader(cookies) {
    return cookies.map(function (c) { return "".concat(c.name, "=").concat(c.value); }).join('; ');
}
/**
 * 获取凭证存储路径（用于提示用户）
 */
function getCredentialsPath() {
    return CREDENTIALS_FILE;
}
