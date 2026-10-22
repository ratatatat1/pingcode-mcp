import { pingcodeClient } from '../api/pingcode-client.js';
import type { TestSuite } from '../types/pingcode.js';

type ToolResult = {
  success: boolean;
  data?: string;
  error?: string;
};

/**
 * 把 PingCode 富文本（HTML）压扁成纯文本/极简 markdown
 * 仅做轻量转换，避免引第三方依赖
 */
function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![image]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isRootSuite(suite: TestSuite): boolean {
  return !suite.parent_id && (!suite.parent_ids || suite.parent_ids.length === 0);
}

/**
 * 沿 parent_id 链回溯，构建从根到当前 suite 的名字路径（面包屑）
 */
function buildBreadcrumb(allSuites: TestSuite[], suiteId: string): string[] {
  const map = new Map(allSuites.map((s) => [s._id, s]));
  const path: string[] = [];
  let current: TestSuite | undefined = map.get(suiteId);
  // 防御循环引用
  const seen = new Set<string>();
  while (current && !seen.has(current._id)) {
    seen.add(current._id);
    path.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return path;
}

/**
 * 基于 suite 树本地聚合每个节点的"子树合计用例数"
 *   合计(node) = node.count(直属) + Σ 合计(children)
 * 接口返回的 suite.count 是直属用例数（不递归），父级目录通常为 0
 * 带 visiting 防环，避免脏数据导致死循环
 */
function buildCumulativeCountMap(allSuites: TestSuite[]): Map<string, number> {
  const childrenByParent = new Map<string, TestSuite[]>();
  for (const s of allSuites) {
    const pid = s.parent_id || '';
    const arr = childrenByParent.get(pid);
    if (arr) arr.push(s);
    else childrenByParent.set(pid, [s]);
  }

  const cumulative = new Map<string, number>();
  const visiting = new Set<string>();

  function compute(node: TestSuite): number {
    const cached = cumulative.get(node._id);
    if (cached !== undefined) return cached;
    if (visiting.has(node._id)) return node.count ?? 0;
    visiting.add(node._id);

    let total = node.count ?? 0;
    const children = childrenByParent.get(node._id) || [];
    for (const child of children) {
      total += compute(child);
    }

    visiting.delete(node._id);
    cumulative.set(node._id, total);
    return total;
  }

  for (const s of allSuites) compute(s);
  return cumulative;
}

/**
 * 同时拿到直属和子树合计两个数字，用于格式化展示
 *   两者相等（典型叶子节点）→ 只输出一个数字，省屏幕
 *   不相等 → "直属 X / 子树合计 Y"
 */
function formatCount(direct: number | undefined, cumulative: number): string {
  const d = direct ?? 0;
  if (d === cumulative) return String(cumulative);
  return `直属 ${d} / 子树合计 ${cumulative}`;
}

export async function listTestLibraries(): Promise<ToolResult> {
  try {
    const libraries = await pingcodeClient.getTestLibraries();

    if (libraries.length === 0) {
      return { success: true, data: '没有可访问的测试库' };
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

    lines.push('', '下一步: browse_test_module(library_id="<上面的 identifier>")');

    return { success: true, data: lines.join('\n') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 浏览测试模块树（一次返回当前位置的子模块 + 直属用例 + 面包屑 + 下一步建议）
 *
 * 不传 suiteId  → 进入测试库根，列顶层模块
 * 传 suiteId    → 进入该模块，列其直接子模块 + 该模块下"不含子模块"的用例
 *
 * AI 的钻取循环：
 *   1) 没有子模块 + 有用例    → 看到叶子，直接 get_test_case 看详情
 *   2) 有子模块 + 没有用例    → 继续 browse 钻入某个子模块
 *   3) 有子模块 + 有用例      → 该模块自身挂了用例，同时还有更细分的子模块，按需选
 */
export async function browseTestModule(
  libraryId: string,
  suiteId?: string,
  pageIndex: number = 0,
  pageSize: number = 20
): Promise<ToolResult> {
  try {
    const allSuites = await pingcodeClient.getTestSuites(libraryId, 'direct');
    const cumulativeMap = buildCumulativeCountMap(allSuites);

    // 当前层的子模块
    const childModules = suiteId
      ? allSuites.filter((s) => s.parent_id === suiteId)
      : allSuites.filter(isRootSuite);

    // 当前模块的元信息（仅在传入 suiteId 时有意义）
    const currentSuite = suiteId
      ? allSuites.find((s) => s._id === suiteId)
      : null;

    if (suiteId && !currentSuite) {
      return {
        success: false,
        error: `在测试库 ${libraryId} 中未找到模块 ${suiteId}`,
      };
    }

    // 当前模块下"不含子模块"的直属用例（仅在 suiteId 存在时拉）
    const directCases = suiteId
      ? await pingcodeClient.listTestCases(libraryId, {
          suite_id: suiteId,
          include_sub_suite: false,
          page_index: pageIndex,
          page_size: pageSize,
        })
      : null;

    const breadcrumb = suiteId
      ? [libraryId, ...buildBreadcrumb(allSuites, suiteId)].join(' / ')
      : `${libraryId} (根)`;

    const lines: string[] = [`# 当前位置: ${breadcrumb}`, ''];

    if (currentSuite) {
      const cur = cumulativeMap.get(currentSuite._id) ?? currentSuite.count ?? 0;
      lines.push(
        `- 模块 ID: ${currentSuite._id}`,
        `- 模块用例数: ${formatCount(currentSuite.count, cur)}`,
        ''
      );
    } else {
      // 根层：测试库累计 = Σ 顶层 cumulative
      const libraryTotal = childModules.reduce(
        (sum, s) => sum + (cumulativeMap.get(s._id) ?? s.count ?? 0),
        0
      );
      lines.push(`- 测试库累计用例数: ${libraryTotal}`, '');
    }

    // 子模块块
    if (childModules.length === 0) {
      lines.push(suiteId ? '## 子模块: 无（已是叶子模块）' : '## 顶层模块: 无');
    } else {
      lines.push(
        suiteId ? `## 子模块（${childModules.length} 个）` : `## 顶层模块（${childModules.length} 个）`,
        ''
      );
      childModules.forEach((s) => {
        const cum = cumulativeMap.get(s._id) ?? s.count ?? 0;
        lines.push(`- **${s.name}** (ID: ${s._id}) | 用例数: ${formatCount(s.count, cum)}`);
      });
    }

    // 当前模块直属用例块
    if (directCases) {
      lines.push('');
      if (directCases.items.length === 0) {
        lines.push('## 当前模块直属用例: 无');
      } else {
        const totalPages = Math.max(directCases.page_count, 1);
        lines.push(
          `## 当前模块直属用例（不含子模块）`,
          '',
          `共 ${directCases.total} 条，第 ${directCases.page_index + 1}/${totalPages} 页，每页 ${directCases.page_size} 条`,
          ''
        );
        directCases.items.forEach((item) => {
          lines.push(`- **${item.whole_identifier}** (${item.short_id}) ${item.title}`);
        });
      }
    }

    // 下一步建议
    lines.push('', '## 下一步');
    if (childModules.length > 0) {
      lines.push('- 钻入子模块: browse_test_module(library_id, suite_id="<上面的子模块 ID>")');
    }
    if (directCases && directCases.items.length > 0) {
      lines.push('- 查看用例详情: get_test_case(test_case_id="<上面的编号>")');
      if (directCases.page_count > directCases.page_index + 1) {
        lines.push(
          `- 翻下一页用例: browse_test_module(..., page_index=${directCases.page_index + 1})`
        );
      }
    }
    if (childModules.length === 0 && (!directCases || directCases.items.length === 0)) {
      lines.push('- 当前模块为空（既无子模块也无用例），可回退到上级或换模块');
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 全库关键词搜索（"跳跃"补充手段，不强制走逐层钻取）
 */
export async function searchTestCases(
  libraryId: string,
  keyword: string,
  pageIndex: number = 0,
  pageSize: number = 20
): Promise<ToolResult> {
  try {
    if (!keyword || !keyword.trim()) {
      return {
        success: false,
        error: 'keyword 不能为空。如要逐层浏览，请使用 browse_test_module',
      };
    }
    const result = await pingcodeClient.listTestCases(libraryId, {
      keyword,
      page_index: pageIndex,
      page_size: pageSize,
      include_sub_suite: true,
    });

    if (result.items.length === 0) {
      return {
        success: true,
        data: `在测试库 ${libraryId} 中没有找到匹配 "${keyword}" 的测试用例`,
      };
    }

    const totalPages = Math.max(result.page_count, 1);
    const lines: string[] = [
      `# ${libraryId} 关键词搜索: "${keyword}"`,
      '',
      `共 ${result.total} 条，第 ${result.page_index + 1}/${totalPages} 页，每页 ${result.page_size} 条`,
      '',
    ];
    result.items.forEach((item) => {
      lines.push(`- **${item.whole_identifier}** (${item.short_id}) ${item.title}`);
    });

    lines.push('', '## 下一步');
    lines.push('- 查看用例详情: get_test_case(test_case_id="<上面的编号>")');
    if (result.page_count > result.page_index + 1) {
      lines.push(`- 翻下一页: search_test_cases(..., page_index=${result.page_index + 1})`);
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getTestCase(testCaseId: string): Promise<ToolResult> {
  try {
    const [item, typeOptions] = await Promise.all([
      pingcodeClient.getTestCase(testCaseId),
      pingcodeClient.getTestCaseTypeOptions(),
    ]);

    if (!item) {
      return {
        success: false,
        error: `测试用例 ${testCaseId} 在详情接口返回为空（可能已删除或当前账号无权访问）`,
      };
    }

    const inputIdentifier = testCaseId.replace(/^#/, '').trim();
    const libraryIdentifierFromInput = /^[A-Za-z]+-\d+$/.test(inputIdentifier)
      ? inputIdentifier.split('-')[0]
      : null;

    const typeText = typeOptions.find((option) => option.id === item.type)?.text;
    const versionName = item.version_name || (item.version_identifier ? `v${item.version_identifier}` : '');

    const lines: string[] = [
      `# ${item.whole_identifier} (${item.short_id})`,
      '',
      `- 标题: ${item.title}`,
    ];

    if (libraryIdentifierFromInput) {
      lines.push(`- 测试库: ${libraryIdentifierFromInput}`);
    } else if (item.test_library_id) {
      lines.push(`- 测试库 (内部 ID): ${item.test_library_id}`);
    }

    if (item.suite_id) {
      lines.push(`- 模块 ID: ${item.suite_id}`);
    }

    if (versionName) {
      lines.push(`- 版本: ${versionName}`);
    }

    const versionDescription = stripHtml(item.version_description);
    if (versionDescription) {
      lines.push(`- 版本说明: ${versionDescription}`);
    }

    if (typeText) {
      lines.push(`- 类型: ${typeText}`);
    }

    const precondition = stripHtml(item.precondition);
    if (precondition) {
      lines.push('', '## 前置条件', '', precondition);
    }

    const description = stripHtml(item.description);
    if (description) {
      lines.push('', '## 描述', '', description);
    }

    if (item.steps && item.steps.length > 0) {
      lines.push('', '## 步骤', '');
      item.steps.forEach((step, index) => {
        const action = stripHtml(step.description) || '(无)';
        const expected = stripHtml(step.expected_value) || '(无)';
        lines.push(`${index + 1}. 操作: ${action}`);
        lines.push(`   预期: ${expected}`);
      });
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
