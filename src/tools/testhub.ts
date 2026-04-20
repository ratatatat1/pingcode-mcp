import { pingcodeClient } from '../api/pingcode-client.js';
import type { PaginatedTestCases, TestSuite } from '../types/pingcode.js';

type ToolResult = {
  success: boolean;
  data?: string;
  error?: string;
};

function formatTestSuiteList(
  libraryId: string,
  suites: TestSuite[],
  suiteType: 'direct' | 'link',
  title: string
): ToolResult {
  if (suites.length === 0) {
    return {
      success: true,
      data: suiteType === 'link' ? '该测试库没有关联模块' : '该测试库没有测试模块',
    };
  }

  const lines: string[] = [
    `# ${libraryId} ${title}`,
    '',
    `类型: ${suiteType === 'link' ? '关联模块' : '直属模块'}`,
    `共 ${suites.length} 个模块`,
    '',
  ];

  suites.forEach((suite) => {
    lines.push(`- **${suite.name}** (ID: ${suite._id}) | 用例数: ${suite.count || 0}`);
  });

  return {
    success: true,
    data: lines.join('\n'),
  };
}

function isRootSuite(suite: TestSuite): boolean {
  return !suite.parent_id && (!suite.parent_ids || suite.parent_ids.length === 0);
}

function formatTestCaseList(
  title: string,
  result: PaginatedTestCases,
  summaryLines: string[] = []
): ToolResult {
  if (result.items.length === 0) {
    return {
      success: true,
      data: '没有找到匹配的测试用例',
    };
  }

  const lines: string[] = [
    `# ${title}`,
    '',
    ...summaryLines,
    `共 ${result.total} 条，当前第 ${result.page_index + 1}/${Math.max(result.page_count, 1)} 页，每页 ${result.page_size} 条`,
    '',
  ];

  result.items.forEach((item) => {
    lines.push(`- **${item.whole_identifier}** (${item.short_id}) ${item.title}`);
  });

  return {
    success: true,
    data: lines.join('\n'),
  };
}

export async function listTestLibraries(): Promise<ToolResult> {
  try {
    const libraries = await pingcodeClient.getTestLibraries();

    if (libraries.length === 0) {
      return {
        success: true,
        data: '没有可访问的测试库',
      };
    }

    const lines: string[] = [
      '# 测试库列表',
      '',
      `共 ${libraries.length} 个测试库`,
      '',
    ];

    libraries.forEach((library) => {
      lines.push(`- **${library.identifier}** - ${library.name}`);
    });

    return {
      success: true,
      data: lines.join('\n'),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function listTestSuites(
  libraryId: string,
  suiteType: 'direct' | 'link' = 'direct'
): Promise<ToolResult> {
  try {
    const suites = await pingcodeClient.getTestSuites(libraryId, suiteType);
    return formatTestSuiteList(libraryId, suites, suiteType, '测试模块列表');
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getTestCaseModules(
  libraryId: string,
  suiteType: 'direct' | 'link' = 'direct'
): Promise<ToolResult> {
  try {
    const suites = await pingcodeClient.getTestSuites(libraryId, suiteType);

    const rootSuites = suites.filter(isRootSuite);
    if (rootSuites.length === 0) {
      return {
        success: true,
        data: suiteType === 'link' ? '该测试库没有关联用例模块' : '该测试库没有顶层用例模块',
      };
    }

    const moduleTotals = await Promise.all(
      rootSuites.map(async (suite) => {
        const result = await pingcodeClient.listTestCases(libraryId, {
          suite_id: suite._id,
          include_sub_suite: true,
          page_index: 0,
          page_size: 1,
        });

        return {
          ...suite,
          total: result.total,
        };
      })
    );

    const lines: string[] = [
      `# ${libraryId} 用例模块列表`,
      '',
      `类型: ${suiteType === 'link' ? '关联模块' : '直属模块'}`,
      `范围: 顶层模块（与 TestHub 左侧模块树一致）`,
      `共 ${moduleTotals.length} 个模块`,
      '',
    ];

    moduleTotals.forEach((suite) => {
      lines.push(`- **${suite.name}** (ID: ${suite._id}) | 用例总数: ${suite.total}`);
    });

    return {
      success: true,
      data: lines.join('\n'),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function listTestCases(
  libraryId: string,
  suiteId?: string,
  keyword?: string,
  pageIndex: number = 0,
  pageSize: number = 50,
  includeSubSuite: boolean = true
): Promise<ToolResult> {
  try {
    const result = await pingcodeClient.listTestCases(libraryId, {
      suite_id: suiteId,
      keyword,
      page_index: pageIndex,
      page_size: pageSize,
      include_sub_suite: includeSubSuite,
    });

    const summaryLines = suiteId
      ? [
          `模块 ID: ${suiteId}`,
          `包含子模块: ${includeSubSuite ? '是' : '否'}`,
        ]
      : [];
    return formatTestCaseList(`${libraryId} 测试用例列表`, result, summaryLines);
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getTestCasesByModule(
  libraryId: string,
  suiteId: string,
  keyword?: string,
  pageIndex: number = 0,
  pageSize: number = 50,
  includeSubSuite: boolean = true
): Promise<ToolResult> {
  try {
    const result = await pingcodeClient.listTestCases(libraryId, {
      suite_id: suiteId,
      keyword,
      page_index: pageIndex,
      page_size: pageSize,
      include_sub_suite: includeSubSuite,
    });

    return formatTestCaseList(`${libraryId} 用例模块用例列表`, result, [
      `模块 ID: ${suiteId}`,
      `包含子模块: ${includeSubSuite ? '是' : '否'}`,
    ]);
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getTestCase(
  testCaseId: string
): Promise<ToolResult> {
  try {
    const [item, typeOptions] = await Promise.all([
      pingcodeClient.getTestCase(testCaseId),
      pingcodeClient.getTestCaseTypeOptions(),
    ]);

    if (!item) {
      return {
        success: false,
        error: `未找到测试用例: ${testCaseId}`,
      };
    }

    const typeText = typeOptions.find((option) => option.id === item.type)?.text;
    const versionName = item.version_name || (item.version_identifier ? `v${item.version_identifier}` : '');
    const lines: string[] = [
      `# ${item.whole_identifier} (${item.short_id})`,
      '',
      `- 标题: ${item.title}`,
    ];

    if (versionName) {
      lines.push(`- 版本: ${versionName}`);
    }

    if (item.version_description) {
      lines.push(`- 版本说明: ${item.version_description}`);
    }

    if (typeText) {
      lines.push(`- 类型: ${typeText}`);
    }

    if (item.precondition) {
      lines.push(`- 前置条件: ${item.precondition}`);
    }

    if (item.description) {
      lines.push(`- 描述: ${item.description}`);
    }

    if (item.steps && item.steps.length > 0) {
      lines.push('', '## 步骤', '');
      item.steps.forEach((step, index) => {
        lines.push(`${index + 1}. 操作: ${step.description}`);
        lines.push(`   预期: ${step.expected_value}`);
      });
    }

    if (item.comments) {
      lines.push('', `评论数: ${item.comments.length}`);
    }

    return {
      success: true,
      data: lines.join('\n'),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
