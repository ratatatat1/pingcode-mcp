# PingCode MCP Server

[![npm version](https://badge.fury.io/js/pingcode-mcp.svg)](https://www.npmjs.com/package/pingcode-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

PingCode MCP (Model Context Protocol) 服务器,让 AI 助手能够与 PingCode 项目管理系统交互,支持查询工作项、发布版本管理、更新状态和缺陷字段,以及浏览 TestHub 测试库、测试模块和测试用例详情。

## ✨ 功能特性

- 🔐 **便捷登录** - 支持浏览器登录和飞书等第三方登录
- 🔍 **工作项查询** - 通过编号快速查看工作项详情
- 📋 **发布管理** - 查询发布版本关联的缺陷和需求
- 🔎 **全文搜索** - 搜索项目中的工作项
- 📊 **版本列表** - 列出项目的所有发布版本
- ✏️ **状态更新** - 更新工作项的状态
- 🐛 **缺陷管理** - 更新缺陷的原因分析、解决方案和解决方法
- 🧪 **测试管理** - 列出测试库、测试模块、测试用例并查看用例详情

## 📦 安装

### 方式一：全局安装（推荐）

```bash
npm install -g pingcode-mcp
```

安装后需要安装 Chromium 浏览器（用于登录）:

```bash
npx playwright install chromium
```

### 方式二：使用 npx（无需安装）

```bash
npx pingcode-mcp
```

首次使用会自动下载依赖。

## 🚀 快速开始

### 1. 配置 MCP 客户端

在你的 MCP 客户端（如 Windsurf、Cursor、Claude Desktop、Codex）中添加 `pingcode-mcp`：

#### **全局安装后的配置**

编辑 `~/.cursor/mcp.json` 或 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pingcode-mcp": {
      "command": "pingcode-mcp",
      "env": {
        "PINGCODE_DOMAIN": "your-company.pingcode.com"
      }
    }
  }
}
```

#### **使用 npx 的配置**

```json
{
  "mcpServers": {
    "pingcode-mcp": {
      "command": "npx",
      "args": ["-y", "pingcode-mcp"],
      "env": {
        "PINGCODE_DOMAIN": "your-company.pingcode.com"
      }
    }
  }
}
```

> **注意**: 建议显式配置 `PINGCODE_DOMAIN`，避免连接到错误的 PingCode 实例。

#### 在 Claude Desktop 中使用

编辑 Claude Desktop 配置文件：

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`

加入以下配置：

```json
{
  "mcpServers": {
    "pingcode-mcp": {
      "command": "npx",
      "args": ["-y", "pingcode-mcp"],
      "env": {
        "PINGCODE_DOMAIN": "your-company.pingcode.com"
      }
    }
  }
}
```

保存后重启 Claude Desktop，然后可以直接提问：

```text
请帮我登录 PingCode
```

```text
查看工作项 <项目标识>-123 的详情
```

```text
查看测试用例 <项目标识>-123 的详情
```

#### 在 Codex CLI 中使用

如果你已经安装了 [Codex CLI](https://developers.openai.com/codex/)，可以直接把 `pingcode-mcp` 加到 Codex 的 MCP 配置里。

推荐命令：

```bash
codex mcp add pingcode-mcp \
  --env PINGCODE_DOMAIN=your-company.pingcode.com \
  -- npx -y pingcode-mcp
```

如果你已经全局安装了 `pingcode-mcp`，也可以这样配置：

```bash
codex mcp add pingcode-mcp \
  --env PINGCODE_DOMAIN=your-company.pingcode.com \
  -- pingcode-mcp
```

配置完成后可用下面的命令检查：

```bash
codex mcp list
```

然后启动 Codex，在对话里直接使用：

```text
请帮我登录 PingCode
```

```text
列出 <project_id> 项目的所有发布版本
```

```text
查看测试用例 <short_id> 的详情
```

### 2. 首次登录

重启 MCP 客户端后，让 AI 助手调用 `login` 工具:

```
请帮我登录 PingCode
```

会自动打开浏览器，完成授权后凭证会保存在 `~/.pingcode-mcp/credentials.json`。

### 3. 开始使用

```
查看工作项 <项目标识>-123 的详情
```

```
列出 <project_id> 项目的所有发布版本
```

```
查询发布版本 <release_id> 的所有缺陷
```

```
列出所有测试库
```

```
打开 <library_id> 测试库逐层浏览模块和用例
```

```
查看测试用例 <项目标识>-123 的详情
```

## 🛠️ 可用工具

| 工具名称                 | 说明                       | 参数                                                                         |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------- |
| `login`                  | 打开浏览器进行登录         | 无                                                                           |
| `logout`                 | 退出登录，清除凭证         | 无                                                                           |
| `check_auth`             | 检查登录状态               | 无                                                                           |
| `get_work_item`          | 获取工作项详情             | `identifier`: 工作项编号（如 `<project_id>-123`）                            |
| `list_projects`          | 列出所有可访问项目         | 无                                                                           |
| `list_releases`          | 列出项目的发布版本         | `project_id`: 项目标识（如 `<project_id>`）                                  |
| `get_release_items`      | 获取版本关联的工作项       | `release_id`: 版本ID<br>`project_id`: 项目标识<br>`item_type`: bug/story/all |
| `search_work_items`      | 搜索工作项                 | `query`: 搜索关键词<br>`project_id`: 项目标识（可选）                        |
| `list_test_libraries`    | 列出所有可访问测试库（钻取入口） | 无                                                                           |
| `browse_test_module`     | 逐层浏览测试模块树：一次返回当前位置的【子模块 + 直属用例 + 面包屑 + 下一步建议】。模块行展示"用例数"（直属与子树合计相等时显示一个数，否则显示 `直属 X / 子树合计 Y`），根层额外给出"测试库累计用例数" | `library_id`: 测试库标识<br>`suite_id`: 模块 ID（可选，不传 = 进入根；传 = 进入该模块）<br>`page_index`: 直属用例页码（可选，默认 0）<br>`page_size`: 直属用例每页数量（可选，默认 20） |
| `search_test_cases`      | 在指定测试库内全库关键词搜索测试用例（跳跃式补充） | `library_id`: 测试库标识<br>`keyword`: 搜索关键词（必填）<br>`page_index`: 页码（可选，默认 0）<br>`page_size`: 每页数量（可选，默认 20） |
| `get_test_case`          | 获取测试用例详情           | `test_case_id`: 测试用例短 ID（如 `<short_id>`）或展示编号（如 `<project_id>-123`） |
| `update_work_item_state` | 更新工作项状态             | `work_item_id`: 工作项编号<br>`state_name`: 目标状态                         |
| `get_bug_field_options`  | 获取缺陷字段可选值         | `work_item_id`: 缺陷工作项编号                                               |
| `update_bug_fields`      | 更新缺陷的分析和解决方案   | `work_item_id`: 工作项编号<br>`reason`: 原因分析（可选）<br>`solution`: 解决方案（可选）<br>`jiejuefangfa`: 解决方法（可选） |
| `add_work_item_comment`  | 给工作项添加评论，`@姓名` 会转成提及 | `work_item_id`: 工作项编号<br>`content`: 评论正文，可写 `@姓名`<br>`reply_comment_id`: 被回复评论的 `_id`（可选） |

### 🧪 TestHub 钻取式工作流

测试用例的定位采用"逐层钻取"模式，AI 会按下面的循环走，直到找到目标用例：

```
list_test_libraries          # 1. 选库
        ↓
browse_test_module(library)  # 2. 进入根，看顶层模块
        ↓
browse_test_module(library, suite_id)   # 3. 进入某个模块
        ↓                               #    - 有子模块就继续 browse 钻入
        ↓                               #    - 看到目标用例就跳到下一步
get_test_case(test_case_id)  # 4. 看用例详情（步骤、前置条件、版本等）
```

每一步返回的模块行都带"用例数"：
- 数字单显示 → 直属和子树合计相等（典型叶子模块）
- `直属 X / 子树合计 Y` → 该模块自身挂了 X 条，整棵子树共 Y 条（X==0 表示纯目录壳子）

可以据此判断是否值得钻入；根层会先告诉你"测试库累计用例数"，方便横向比对。

如果已经知道关键词、不想逐层走，可以用 `search_test_cases(library_id, keyword)` 直接跳到结果列表。

## 💡 使用示例

### 查看工作项详情

```
查看 <项目标识>-123 的详情
```

### 查询发布版本的缺陷

从发布页面 URL 获取参数：

```
https://yourcompany.pingcode.com/pjm/projects/<project_id>/releases/<release_id>/workitems
                                                      ↑                ↑
                                                project_id        release_id
```

然后询问 AI:

```
查询项目 <project_id> 的发布版本 <release_id> 中的所有缺陷
```

### 搜索工作项

```
在某项目中搜索包含"登录"的工作项
```

### 列出测试库

```
列出所有测试库
```

### 浏览测试模块（钻取式）

进入测试库根，看顶层模块：

```
打开 <library_id> 测试库（不传 suite_id，进入根目录看顶层模块）
```

进入某个模块，看子模块和该模块下的直属用例：

```
进入 <library_id> 测试库的 <suite_id> 模块（钻入下一层）
```

> AI 会基于返回的"下一步"提示循环调用 `browse_test_module`，直到找到目标用例编号。

### 关键词搜索测试用例（跳跃式）

```
在 <library_id> 测试库里搜包含"登录"的测试用例
```

### 查看测试用例详情

```
查看测试用例 <项目标识>-123 的详情
```

```
查看测试用例 <short_id> 的详情
```

### 更新工作项状态

```
把 <项目标识>-123 的状态改为已完成
```

### 更新缺陷分析字段

```
帮我更新 <项目标识>-123 的原因分析和解决方案
```

## 🔧 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PINGCODE_DOMAIN` | PingCode 域名 | `your-company.pingcode.com` |

## 🔨 本地开发

如果你想修改源码或为项目贡献代码：

```bash
# 克隆仓库
git clone https://github.com/ratatatat1/pingcode-mcp.git
cd pingcode-mcp

# 安装依赖
npm install

# 安装浏览器
npx playwright install chromium

# 开发模式（实时编译）
npm run dev

# 构建
npm run build

# 测试构建产物
npm start
```

### 在 MCP 客户端中使用本地开发版本

```json
{
  "mcpServers": {
    "pingcode-mcp": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/pingcode-mcp/src/index.ts"]
    }
  }
}
```

## 📂 项目结构

```
pingcode-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── api/
│   │   └── pingcode-client.ts # PingCode API 客户端
│   ├── tools/
│   │   ├── login.ts          # 登录相关工具
│   │   ├── work-items.ts     # 工作项相关工具
│   │   └── testhub.ts        # TestHub 测试管理工具
│   ├── types/
│   │   └── pingcode.ts       # TypeScript 类型定义
│   └── utils/
│       └── credentials.ts    # 凭证管理工具
├── dist/                     # 编译输出目录
├── package.json
├── tsconfig.json
└── README.md
```

## 🔒 隐私与安全

- 登录凭证仅保存在本地 `~/.pingcode-mcp/credentials.json`
- 不会上传任何数据到第三方服务器
- 所有 API 请求直接发送到你的 PingCode 实例

## ❓ 常见问题

**Q: 凭证过期了怎么办？**
A: 重新调用 `login` 工具即可。

**Q: 支持哪些 MCP 客户端？**
A: 支持所有实现了 MCP 协议的客户端，包括 Windsurf、Cursor、Claude Desktop、Codex 等。

**Q: 可以在 CI/CD 中使用吗？**
A: 登录需要浏览器交互，不适合 CI/CD 环境。如需自动化，建议使用 PingCode API。

**Q: `get_test_case` 应该传 `<project_id>-123` 还是 `<short_id>`？**
A: 都支持。推荐优先使用展示编号（如 `<project_id>-123`），工具会自动解析为详情接口所需的短 ID。

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**作者**: ratat
**关键词**: mcp, pingcode, model-context-protocol, ai, release, bug-tracking, project-management
