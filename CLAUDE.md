# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PingCode MCP Server - 一个基于 Model Context Protocol (MCP) 的服务器，用于与 PingCode 项目管理系统交互。支持查询发布版本的缺陷与需求、通过编号查看工作项详情等功能。

## 常用命令

```bash
# 安装依赖
npm install
npx playwright install chromium  # 安装 Chromium 用于登录

# 开发模式（使用 tsx 直接运行 TypeScript）
npm run dev

# 构建
npm run build

# 生产模式运行
npm start
```

## 架构

```
src/
├── index.ts              # MCP 服务器入口，定义所有工具和请求处理
├── api/
│   └── pingcode-client.ts # PingCode API 客户端（axios + cookie 认证）
├── tools/
│   ├── login.ts          # 登录相关（Playwright 打开浏览器进行第三方登录）
│   └── work-items.ts     # 工作项查询、发布版本、搜索等功能
├── types/
│   └── pingcode.ts       # 类型定义（WorkItem、Credentials 等）
└── utils/
    └── credentials.ts    # 凭证管理（保存/读取/验证 cookies）
```

### 核心流程

1. **认证流程**: 使用 Playwright 打开浏览器让用户手动登录（支持飞书等第三方登录），登录成功后从浏览器提取 cookies 保存到 `~/.pingcode-mcp/credentials.json`

2. **API 调用**: `PingCodeClient` 使用保存的 cookies 作为认证头调用 PingCode REST API

3. **MCP 工具**: 通过 `@modelcontextprotocol/sdk` 暴露 9 个工具供 AI 客户端调用：
   - `login` / `logout` / `check_auth` - 认证管理
   - `get_work_item` - 获取单个工作项详情
   - `get_release_items` - 获取发布版本关联的工作项
   - `search_work_items` - 搜索工作项
   - `list_releases` - 列出项目发布版本
   - `list_projects` - 列出可访问的项目
   - `update_work_item_state` - 更新工作项状态

### 关键常量映射

- `PRIORITY_MAP` (pingcode-client.ts): 优先级 ID → 名称（紧急/高/中/低）
- `STATE_TYPE_MAP` (work-items.ts): 状态类型数字 → 名称
- `WORK_ITEM_TYPE_MAP` (work-items.ts): 工作项类型数字 → 名称（2=需求, 3=用户故事, 5=缺陷）

## MCP 客户端配置

```json
{
  "mcpServers": {
    "pingcode": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "PINGCODE_DOMAIN": "your-company.pingcode.com"
      }
    }
  }
}
```

开发模式使用 `npx tsx` 代替 `node`。

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PINGCODE_DOMAIN` | PingCode 域名 | `neuralgalaxy.pingcode.com` |

## 凭证存储

- 目录: `~/.pingcode-mcp/`
- 凭证文件: `credentials.json`
- Chrome 配置文件: `chrome-profile/`（保存登录状态以便复用飞书授权）
- 图片缓存: `images/`（下载的工作项图片）
