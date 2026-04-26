#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { login, logout, checkAuth } from './tools/login.js';
import { getWorkItem, getReleaseItems, searchWorkItems, listReleases, listProjects, updateWorkItemState, getBugFieldOptions, updateBugFields } from './tools/work-items.js';
import { listTestLibraries, browseTestModule, searchTestCases, getTestCase } from './tools/testhub.js';

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'pingcode-mcp',
    version: '1.1.1',
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
          '通过 PingCode 工作项编号获取详情。支持格式：#12345、12345、<project_id>-123 等。',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: '工作项编号，如 #12345、12345 或 <project_id>-123',
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
              description: '项目标识，如 <project_id>',
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
              description: '项目标识，如 <project_id>',
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
        name: 'list_test_libraries',
        description: '列出用户可访问的所有测试库。这是定位测试用例的第一步：先选库 → browse_test_module 逐层钻取 → get_test_case 看详情。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'browse_test_module',
        description:
          '浏览测试库的模块树，一次返回当前位置的【子模块 + 当前模块直属用例 + 面包屑 + 下一步建议】。' +
          '不传 suite_id 进入测试库根（列顶层模块）；传 suite_id 进入该模块。' +
          '模块行的"用例数"展示直属或"直属/子树合计"两种形式；根层会额外给出测试库累计用例数。' +
          '使用方式：循环调用钻取，直到找到目标用例编号后用 get_test_case 看详情。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识（来自 list_test_libraries），如 <library_id>',
            },
            suite_id: {
              type: 'string',
              description: '模块 ID（可选）。不传 = 进入根；传 = 进入该模块。模块 ID 从上一次 browse_test_module 的输出里拿',
            },
            page_index: {
              type: 'number',
              description: '当前模块直属用例的页码，从 0 开始（默认 0）',
            },
            page_size: {
              type: 'number',
              description: '当前模块直属用例的每页数量（默认 20）',
            },
          },
          required: ['library_id'],
        },
      },
      {
        name: 'search_test_cases',
        description:
          '在指定测试库内全库关键词搜索测试用例（标题/编号匹配）。当不知道用例在哪个模块时使用，作为 browse_test_module 的"跳跃"补充。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识，如 <library_id>',
            },
            keyword: {
              type: 'string',
              description: '搜索关键词（必填，命中标题或编号）',
            },
            page_index: {
              type: 'number',
              description: '页码，从 0 开始（默认 0）',
            },
            page_size: {
              type: 'number',
              description: '每页数量（默认 20）',
            },
          },
          required: ['library_id', 'keyword'],
        },
      },
      {
        name: 'get_test_case',
        description: '获取测试用例详情。test_case_id 支持详情页 URL 中的短 ID（如 <short_id>）和展示编号（如 <project_id>-123）。',
        inputSchema: {
          type: 'object',
          properties: {
            test_case_id: {
              type: 'string',
              description: '测试用例短 ID（如 <short_id>）或展示编号（如 <project_id>-123）',
            },
          },
          required: ['test_case_id'],
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
              description: '工作项编号，如 <project_id>-123',
            },
            state_name: {
              type: 'string',
              description: '目标状态名称，如 "已完成"、"进行中"、"待处理"',
            },
          },
          required: ['work_item_id', 'state_name'],
        },
      },
      {
        name: 'get_bug_field_options',
        description: '获取缺陷字段的可选值列表（原因分析、解决方案）及其 ID 映射。AI 根据修复内容判断选择哪个选项。',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: {
              type: 'string',
              description: '缺陷工作项编号',
            },
          },
          required: ['work_item_id'],
        },
      },
      {
        name: 'update_bug_fields',
        description: '更新缺陷的原因分析、解决方案、解决方法字段。支持使用选项文本或 ID。',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: {
              type: 'string',
              description: '工作项编号',
            },
            reason: {
              type: 'string',
              description: '原因分析（可选），使用 get_bug_field_options 返回的选项文本或 ID',
            },
            solution: {
              type: 'string',
              description: '解决方案（可选），使用 get_bug_field_options 返回的选项文本或 ID',
            },
            jiejuefangfa: {
              type: 'string',
              description: '解决方法（可选），描述具体的修复方法',
            },
          },
          required: ['work_item_id'],
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

      case 'list_test_libraries': {
        const result = await listTestLibraries();
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

      case 'browse_test_module': {
        const { library_id, suite_id, page_index, page_size } = args as {
          library_id: string;
          suite_id?: string;
          page_index?: number;
          page_size?: number;
        };
        const result = await browseTestModule(library_id, suite_id, page_index, page_size);
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

      case 'search_test_cases': {
        const { library_id, keyword, page_index, page_size } = args as {
          library_id: string;
          keyword: string;
          page_index?: number;
          page_size?: number;
        };
        const result = await searchTestCases(library_id, keyword, page_index, page_size);
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

      case 'get_test_case': {
        const { test_case_id } = args as { test_case_id: string };
        const result = await getTestCase(test_case_id);
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

      case 'get_bug_field_options': {
        const { work_item_id } = args as { work_item_id: string };
        const result = await getBugFieldOptions(work_item_id);
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

      case 'update_bug_fields': {
        const { work_item_id, reason, solution, jiejuefangfa } = args as {
          work_item_id: string;
          reason?: string;
          solution?: string;
          jiejuefangfa?: string;
        };
        const result = await updateBugFields(work_item_id, reason, solution, jiejuefangfa);
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
