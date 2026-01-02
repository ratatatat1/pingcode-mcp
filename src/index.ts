#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { login, logout, checkAuth } from './tools/login.js';
import { getWorkItem, getReleaseItems, searchWorkItems, listReleases, listProjects, updateWorkItemState } from './tools/work-items.js';

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'pingcode-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);


// 定义工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'login',
        description:
          '打开浏览器进行 PingCode 登录（支持飞书等第三方登录）。登录成功后凭证会自动保存。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'logout',
        description: '退出 PingCode 登录，清除本地保存的凭证。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'check_auth',
        description: '检查当前 PingCode 登录状态。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_work_item',
        description:
          '通过 PingCode 工作项编号获取详情。支持格式：#12345、12345、LFY-123 等。',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: '工作项编号，如 #12345、12345 或 LFY-123',
            },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'get_release_items',
        description:
          '获取某个发布版本关联的缺陷和需求列表。',
        inputSchema: {
          type: 'object',
          properties: {
            release_id: {
              type: 'string',
              description: '发布版本 ID（可从发布页面 URL 获取）',
            },
            project_id: {
              type: 'string',
              description: '项目标识，如 LFY',
            },
            item_type: {
              type: 'string',
              enum: ['bug', 'story', 'all'],
              description: '筛选工作项类型：bug=缺陷，story=需求，all=全部（默认）',
            },
          },
          required: ['release_id', 'project_id'],
        },
      },
      {
        name: 'search_work_items',
        description: '搜索 PingCode 工作项。',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词',
            },
            project_id: {
              type: 'string',
              description: '限定在某个项目中搜索（可选）',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_releases',
        description: '列出项目的所有发布版本。用户可以通过此工具查看版本名称和对应的 ID。',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: '项目标识，如 LFY（优点云）',
            },
          },
          required: ['project_id'],
        },
      },
      {
        name: 'list_projects',
        description: '列出用户可访问的所有项目。返回项目标识和名称列表。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'update_work_item_state',
        description: '更新工作项（缺陷/需求/任务）的状态。通过状态名称指定目标状态。',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: {
              type: 'string',
              description: '工作项编号，如 LFY-2527',
            },
            state_name: {
              type: 'string',
              description: '目标状态名称，如 "已完成"、"进行中"、"待处理"',
            },
          },
          required: ['work_item_id', 'state_name'],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'login': {
        const result = await login();
        return {
          content: [
            {
              type: 'text',
              text: result.message,
            },
          ],
          isError: !result.success,
        };
      }

      case 'logout': {
        const result = logout();
        return {
          content: [
            {
              type: 'text',
              text: result.message,
            },
          ],
          isError: !result.success,
        };
      }

      case 'check_auth': {
        const result = checkAuth();
        let text = result.message;
        if (result.authenticated && result.expiresAt) {
          text += `\n凭证过期时间: ${result.expiresAt}`;
        }
        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
          isError: !result.authenticated,
        };
      }

      case 'get_work_item': {
        const identifier = (args as { identifier: string }).identifier;
        const result = await getWorkItem(identifier);
        
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `错误: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: result.data!,
              // 结构化数据：供 MCP 客户端/模型可靠读取
              data: {
                work_item: result.workItem,
                ai_directives: result.aiDirectives,
                next_required_action: result.nextRequiredAction,
              },
            },
          ] as any,
        };
      }

      case 'get_release_items': {
        const { release_id, project_id, item_type } = args as {
          release_id: string;
          project_id: string;
          item_type?: 'bug' | 'story' | 'all';
        };
        const result = await getReleaseItems(release_id, project_id, item_type);
        return {
          content: [
            {
              type: 'text',
              text: result.success ? result.data! : `错误: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      case 'search_work_items': {
        const { query, project_id } = args as {
          query: string;
          project_id?: string;
        };
        const result = await searchWorkItems(query, project_id);
        return {
          content: [
            {
              type: 'text',
              text: result.success ? result.data! : `错误: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      case 'list_releases': {
        const { project_id } = args as { project_id: string };
        const result = await listReleases(project_id);
        return {
          content: [
            {
              type: 'text',
              text: result.success ? result.data! : `错误: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      case 'list_projects': {
        const result = await listProjects();
        return {
          content: [
            {
              type: 'text',
              text: result.success ? result.data! : `错误: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      case 'update_work_item_state': {
        const { work_item_id, state_name } = args as {
          work_item_id: string;
          state_name: string;
        };
        const result = await updateWorkItemState(work_item_id, state_name);
        return {
          content: [
            {
              type: 'text',
              text: result.success ? result.data! : `错误: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `未知工具: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `执行失败: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PingCode MCP Server 已启动');
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
