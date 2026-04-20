#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { login, logout, checkAuth } from './tools/login.js';
import { getWorkItem, getReleaseItems, searchWorkItems, listReleases, listProjects, updateWorkItemState, getBugFieldOptions, updateBugFields } from './tools/work-items.js';
import { listTestLibraries, listTestSuites, getTestCaseModules, listTestCases, getTestCasesByModule, getTestCase } from './tools/testhub.js';

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
        description: '列出用户可访问的所有测试库。返回测试库标识和名称列表。',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'list_test_suites',
        description: '列出测试库中的全部测试模块。返回平铺列表，支持直属模块和关联模块。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识，如 <library_id>',
            },
            suite_type: {
              type: 'string',
              enum: ['direct', 'link'],
              description: '模块类型：direct=直属模块，link=关联模块',
            },
          },
          required: ['library_id'],
        },
      },
      {
        name: 'get_test_case_modules',
        description: '获取测试库中的顶层用例模块列表。返回结果与 TestHub 左侧模块树第一层一致，支持直属模块和关联模块。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识，如 <library_id>',
            },
            suite_type: {
              type: 'string',
              enum: ['direct', 'link'],
              description: '模块类型：direct=直属模块，link=关联模块',
            },
          },
          required: ['library_id'],
        },
      },
      {
        name: 'list_test_cases',
        description: '获取测试库中的测试用例列表。可按模块、关键词和分页筛选。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识，如 <library_id>',
            },
            suite_id: {
              type: 'string',
              description: '测试模块 ID（可选，可通过 list_test_suites 获取）',
            },
            keyword: {
              type: 'string',
              description: '标题/编号搜索关键词（可选）',
            },
            page_index: {
              type: 'number',
              description: '页码，从 0 开始（可选，默认 0）',
            },
            page_size: {
              type: 'number',
              description: '每页数量（可选，默认 50）',
            },
            include_sub_suite: {
              type: 'boolean',
              description: '是否包含子模块用例（可选，默认 true）',
            },
          },
          required: ['library_id'],
        },
      },
      {
        name: 'get_test_cases_by_module',
        description: '获取某个用例模块下的测试用例列表。支持关键词搜索和分页。',
        inputSchema: {
          type: 'object',
          properties: {
            library_id: {
              type: 'string',
              description: '测试库标识，如 <library_id>',
            },
            suite_id: {
              type: 'string',
              description: '测试模块 ID，可通过 get_test_case_modules 获取',
            },
            keyword: {
              type: 'string',
              description: '标题/编号搜索关键词（可选）',
            },
            page_index: {
              type: 'number',
              description: '页码，从 0 开始（可选，默认 0）',
            },
            page_size: {
              type: 'number',
              description: '每页数量（可选，默认 50）',
            },
            include_sub_suite: {
              type: 'boolean',
              description: '是否包含子模块用例（可选，默认 true）',
            },
          },
          required: ['library_id', 'suite_id'],
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

      case 'list_test_suites': {
        const { library_id, suite_type } = args as {
          library_id: string;
          suite_type?: 'direct' | 'link';
        };
        const result = await listTestSuites(library_id, suite_type);
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

      case 'get_test_case_modules': {
        const { library_id, suite_type } = args as {
          library_id: string;
          suite_type?: 'direct' | 'link';
        };
        const result = await getTestCaseModules(library_id, suite_type);
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

      case 'list_test_cases': {
        const {
          library_id,
          suite_id,
          keyword,
          page_index,
          page_size,
          include_sub_suite,
        } = args as {
          library_id: string;
          suite_id?: string;
          keyword?: string;
          page_index?: number;
          page_size?: number;
          include_sub_suite?: boolean;
        };
        const result = await listTestCases(
          library_id,
          suite_id,
          keyword,
          page_index,
          page_size,
          include_sub_suite
        );
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

      case 'get_test_cases_by_module': {
        const {
          library_id,
          suite_id,
          keyword,
          page_index,
          page_size,
          include_sub_suite,
        } = args as {
          library_id: string;
          suite_id: string;
          keyword?: string;
          page_index?: number;
          page_size?: number;
          include_sub_suite?: boolean;
        };
        const result = await getTestCasesByModule(
          library_id,
          suite_id,
          keyword,
          page_index,
          page_size,
          include_sub_suite
        );
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
