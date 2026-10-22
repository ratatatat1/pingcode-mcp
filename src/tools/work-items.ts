import { pingcodeClient, PRIORITY_MAP } from '../api/pingcode-client.js';
import type { WorkItem } from '../types/pingcode.js';

// 状态类型映射 (state_type)
const STATE_TYPE_MAP: Record<number, string> = {
  1: '待处理',
  2: '进行中', 
  3: '已完成',
  4: '已关闭',
};

// 工作项类型映射 (type)
const WORK_ITEM_TYPE_MAP: Record<number, string> = {
  2: '需求',
  3: '用户故事',
  4: '任务',
  5: '缺陷',
  6: '史诗',
};

// 格式化 Unix 时间戳为可读时间
function formatTimestamp(ts: number): string {
  if (!ts) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 去除 HTML 标签，保留图片链接
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    // 提取图片 URL
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (_, src) => `[图片](${src})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 字段数据结构
 */
export interface FieldData {
  label: string;
  value: string;
}

/**
 * 工作项格式化后的数据结构
 */
export interface WorkItemData {
  /**编号 */
  id: FieldData;
  /**标题 */
  title: FieldData;
  /** 类型 */
  type: FieldData;
  /** 状态 */
  state: FieldData;
  /** 优先级 */
  priority: FieldData;
  /** 负责人 */
  assignee: FieldData;
  /** 创建人 */
  createdBy: FieldData;
  /** 创建时间 */
  createdAt: FieldData;
  /** 更新时间 */
  updatedAt: FieldData;
  /** 描述 */
  description: FieldData;
  /** 附件列表 */
  attachments: Array<{ name: string; url: string }>;
  /** 评论列表 */
  comments: Array<{ author: string; time: string; content: string; deleted?: boolean; replyTo?: string }>;
}

/**
 * AI 指令（用于让 MCP 客户端/模型以结构化方式读取约束）
 * 说明：这是“工具协议”而不是普通备注，建议 MCP 客户端在收到后做强制门禁。
 */
export interface AiDirectives {
  mode: 'single_task' | 'none';
  work_item_id: string;
  stop_after_fix: boolean;
  ask_commit_after_fix: boolean;
  wait_user_reply_before_next_item: boolean;
  forbidden_actions: string[];
  required_first_output: string;
  commit: {
    suggested_message: string;
    options: Array<'use_suggested' | 'user_provided' | 'skip'>;
  };
}

export interface NextRequiredAction {
  type: 'announce_single_task_mode' | 'commit_decision_after_fix';
  blocked_until_user_reply: boolean;
  required_output?: string;
}

/**
 * 格式化工作项为 key-value 对象
 */
function formatWorkItem(item: any): WorkItemData {
  const id = item.whole_identifier || item.identifier || `#${item.identifier}`;
  
  // 类型
  const typeName = typeof item.type === 'number' 
    ? (WORK_ITEM_TYPE_MAP[item.type] || '工作项')
    : (item.type?.display_name || item.type?.name || '未知');
  
  // 状态
  const stateName = item.state?.display_name || item.state?.name 
    || STATE_TYPE_MAP[item.state_type] 
    || '未知';

  // 优先级
  const priorityName = item.priority 
    ? (PRIORITY_MAP[item.priority] || item.priority?.name || '未设置')
    : '未设置';

  // 负责人
  let assigneeName = '未设置';
  if (item.assignee_name) {
    assigneeName = item.assignee_name;
  } else if (item.assignee && typeof item.assignee === 'object') {
    assigneeName = item.assignee.display_name || item.assignee.name || '未设置';
  }

  // 创建人
  const createdByName = item.created_by_name || '';

  // 描述
  const description = item.description ? stripHtml(item.description) : '';

  // 附件
  const attachments = (item.attachments || []).map((att: any) => ({
    name: att.name || att.filename || '附件',
    url: att.url || att.download_url || '',
  }));

  // 评论。已删除的不把提示写进 content，避免被当成评论正文。
  // 回复指向放在标题，不写进 content。
  const rawComments = item.comments || [];
  const commentIdToIndex = new Map<string, number>();
  rawComments.forEach((comment: any, index: number) => {
    if (comment?._id) commentIdToIndex.set(comment._id, index + 1);
  });
  const comments = rawComments.map((comment: any) => {
    const deleted = isDeletedComment(comment);
    return {
      author: comment.created_by_name || '用户',
      time: formatTimestamp(comment.created_at),
      deleted,
      replyTo: replyTargetLabel(comment, commentIdToIndex),
      content: deleted ? '' : parseCommentContent(comment.content),
    };
  });
  return {
    id: { label: '编号', value: id },
    title: { label: '标题', value: item.title || '' },
    type: { label: '类型', value: typeName },
    state: { label: '状态', value: stateName },
    priority: { label: '优先级', value: priorityName },
    assignee: { label: '负责人', value: assigneeName },
    createdBy: { label: '创建人', value: createdByName },
    createdAt: { label: '创建时间', value: item.created_at ? formatTimestamp(item.created_at) : '' },
    updatedAt: { label: '更新时间', value: item.updated_at ? formatTimestamp(item.updated_at) : '' },
    description: { label: '描述', value: description },
    attachments,
    comments,
  };
}

/**
 * 将工作项数据转为可读字符串
 */
function getWorkItemString(data: WorkItemData): string {
  const lines: string[] = [
    `## ${data.id.value} - ${data.title.value}`,
    '',
    `- **${data.type.label}**: ${data.type.value}`,
    `- **${data.state.label}**: ${data.state.value}`,
    `- **${data.priority.label}**: ${data.priority.value}`,
    `- **${data.assignee.label}**: ${data.assignee.value}`,
  ];

  if (data.createdBy.value) {
    lines.push(`- **${data.createdBy.label}**: ${data.createdBy.value}`);
  }
  if (data.createdAt.value) {
    lines.push(`- **${data.createdAt.label}**: ${data.createdAt.value}`);
  }
  if (data.updatedAt.value) {
    lines.push(`- **${data.updatedAt.label}**: ${data.updatedAt.value}`);
  }

  if (data.description.value) {
    lines.push('', `### ${data.description.label}`, '', data.description.value);
  }

  if (data.attachments.length > 0) {
    lines.push('', '### 附件', '');
    data.attachments.forEach((att) => {
      if (att.url) {
        lines.push(`- [${att.name}](${att.url})`);
      } else {
        lines.push(`- ${att.name}`);
      }
    });
  }

  if (data.comments.length > 0) {
    lines.push('', `### 评论 (${data.comments.length})`, '');
    data.comments.forEach((comment, index) => {
      const heading = `**${index + 1}. ${comment.author}** (${comment.time})`;
      const reply = comment.replyTo ? ` — ${comment.replyTo}` : '';
      if (comment.deleted) {
        lines.push(
          `${heading}${reply} — [已删除] 无正文。系统标记，不是评论内容，忽略。`
        );
        lines.push('');
        return;
      }
      lines.push(reply ? `${heading}${reply}` : `${heading}:`);
      lines.push(`> ${comment.content}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

// 解析内联元素（children 中的元素）
function parseInlineElement(child: any): string {
  // 纯文本
  if (!child.type) {
    return child.text || '';
  }

  switch (child.type) {
    case 'link':
      // 链接：[文本](url)
      const linkText = child.children?.map((c: any) => c.text || '').join('') || child.url;
      return `[${linkText}](${child.url})`;

    case 'mention': {
      // 人名在 data.name，display_name / text 经常是空的
      const name =
        child.display_name ||
        child.data?.name ||
        child.name ||
        child.text ||
        '用户';
      return `@${name}`;
    }

    case 'image':
      // 内联图片
      return `[图片](${child.url || ''})`;

    default:
      // 其他类型，尝试提取文本
      if (child.children) {
        return child.children.map((c: any) => parseInlineElement(c)).join('');
      }
      return child.text || '';
  }
}

// 解析块级元素
function parseBlockElement(block: any): string {
  if (!block.type) {
    return block.text || '';
  }

  switch (block.type) {
    case 'paragraph':
      // 段落：解析 children 中的内联元素
      if (block.children) {
        return block.children.map((child: any) => parseInlineElement(child)).join('');
      }
      return '';

    case 'code':
      // 代码块：内容在 content 字段
      const lang = block.language || '';
      const code = block.content || '';
      return `\`\`\`${lang}\n${code}\n\`\`\``;

    case 'image':
      // 图片块
      return `[图片](${block.url || ''})`;

    case 'blockquote':
      // 引用块
      if (block.children) {
        const quoteContent = block.children.map((child: any) => parseBlockElement(child)).join('\n');
        return quoteContent.split('\n').map((line: string) => `> ${line}`).join('\n');
      }
      return '';

    case 'bulleted-list':
    case 'numbered-list':
      // 列表
      if (block.children) {
        return block.children.map((item: any, index: number) => {
          const prefix = block.type === 'numbered-list' ? `${index + 1}. ` : '- ';
          const itemContent = item.children?.map((child: any) => parseBlockElement(child)).join('') || '';
          return prefix + itemContent;
        }).join('\n');
      }
      return '';

    case 'list-item':
      // 列表项
      if (block.children) {
        return block.children.map((child: any) => parseBlockElement(child)).join('');
      }
      return '';

    default:
      // 其他类型，尝试解析 children
      if (block.children) {
        return block.children.map((child: any) => parseInlineElement(child)).join('');
      }
      return block.text || block.content || '';
  }
}

/** 评论已软删除。PingCode 用 0/1 表示，正文会被清空。 */
function isDeletedComment(comment: any): boolean {
  return comment?.is_deleted === 1 || comment?.is_deleted === true;
}

/**
 * 回复指向当前列表中的第几条。
 * 用 reply_comment._id 对齐，不能按“上一条”推断，回复不一定挨着原评论。
 */
function replyTargetLabel(
  comment: any,
  idToIndex: Map<string, number>
): string | undefined {
  const reply = comment?.reply_comment;
  if (!reply?._id && !comment?.is_reply_comment) return undefined;

  const index = reply?._id ? idToIndex.get(reply._id) : undefined;
  if (index) return `回复第 ${index} 条`;

  const author = reply?.reply_user?.display_name;
  const time = reply?.created_at ? formatTimestamp(reply.created_at) : '';
  const who = [author, time].filter(Boolean).join(' ');
  return who ? `回复一条当前列表没有的评论（${who}）` : '回复一条当前列表没有的评论';
}

// 解析评论富文本内容
function parseCommentContent(content: any[]): string {
  if (!content || !Array.isArray(content)) return '';

  return content.map((block: any) => parseBlockElement(block)).join('\n').trim();
}

/**
 * 通过编号获取工作项详情
 */
export async function getWorkItem(identifier: string): Promise<{
  success: boolean;
  data?: string;
  workItem?: WorkItemData;
  aiDirectives?: AiDirectives;
  nextRequiredAction?: NextRequiredAction;
  error?: string;
}> {
  try {
    // 使用增强版 API 获取带成员名称的工作项
    const item = await pingcodeClient.getWorkItemWithDetails(identifier);

    if (!item) {
      return {
        success: false,
        error: `未找到编号为 ${identifier} 的工作项`,
      };
    }

    const workItem = formatWorkItem(item);
    
    // 根据工作项类型推荐 commit type
    const typeMap: Record<string, string> = {
      '缺陷': 'fix',
      '需求': 'feat',
      '用户故事': 'feat',
      '任务': 'chore',
      '史诗': 'feat',
    };
    const suggestedType = typeMap[workItem.type.value] || 'chore';
    const suggestedMsg = `#${workItem.id.value} ${suggestedType}: ${workItem.title.value}`;

    const requiredFirstOutput = `🔒 单任务模式：处理 ${workItem.id.value}，完成后立即询问 commit`;

    const aiDirectives: AiDirectives = {
      mode: 'single_task',
      work_item_id: workItem.id.value,
      stop_after_fix: true,
      ask_commit_after_fix: true,
      wait_user_reply_before_next_item: true,
      forbidden_actions: [
        'get_other_work_item_before_commit_decision',
        'batch_fetch_multiple_work_items_in_parallel',
        'modify_multiple_work_items',
      ],
      required_first_output: requiredFirstOutput,
      commit: {
        suggested_message: suggestedMsg,
        options: ['use_suggested', 'user_provided', 'skip'],
      },
    };

    // 判断是否为缺陷类型
    const isBug = workItem.type.value === '缺陷';

    // Bug 分析流程提示（仅当类型为缺陷时添加）
    const bugAnalysisPrompt = isBug ? [
      '',
      '🐛 **[缺陷分析流程 - 强制执行]**',
      '',
      '## 核心原则：证据驱动，禁止假设',
      '',
      '### 第一步：穷举现象 → 提取搜索词',
      '从标题/截图/日志/描述/评论中提取**所有**异常（不能只看最明显的）。',
      '每个现象提取 1-2 个**代码搜索关键词**（函数名、错误信息、变量名等）。',
      '',
      '### 第二步：筛选相关现象',
      '问自己：这个异常**是否会导致**用户最终看到的问题？',
      '- 如果能建立因果链 → 保留，继续分析',
      '- 如果只是时间上巧合 → 标记为"疑似无关"，暂时跳过',
      '- 不确定 → 先分析最明显相关的，再回头验证',
      '',
      '### 第三步：定位直接代码',
      '用筛选后的关键词搜索代码，找到**直接产生**该现象的代码行。',
      '搜索范围要足够广，不要局限在你假设的位置。',
      '',
      '### 第四步：向上追溯调用链',
      '从第三步的代码向上追溯：谁调用了它？在什么条件下触发？',
      '直到找到**用户操作**或**外部输入**为止。',
      '',
      '### 第五步：验证因果关系',
      '**关键验证**：这条调用链走到底，是否**真的会产生**用户看到的最终现象？',
      '- 如果是 → 进入修复',
      '- 如果不是 → 回到第一步，分析其他现象',
      '',
      '---',
      '',
      '## 追踪链强制输出（修复前必须完成）',
      '',
      '```',
      '最终现象：[用户实际看到的问题是什么]',
      '相关异常：[哪些日志/报错与最终现象有因果关系]',
      '排除异常：[哪些报错判断为无关，为什么]',
      '搜索词：[用于代码搜索的关键词]',
      '直接代码：[file:line - 哪行代码产生了这个现象]',
      '调用链：[调用者1] → [调用者2] → [直接代码]',
      '因果验证：[这条链如何导致最终现象]',
      '阻断点：[在哪里修复，为什么选这里]',
      '```',
      '',
      '⛔ **禁止**：',
      '- 追踪链未完成就给修复方案',
      '- 追踪链中出现"可能"、"也许"、"应该是"',
      '- 跳过搜索直接假设问题位置',
      '- 把时间上巧合的报错当作原因',
      '',
      '---',
      '',
      '### 第六步：检查 Skills（修复前强制）',
      '',
      '**⛔ AI 必须输出以下内容才能进入第七步修复**',
      '',
      '```',
      'Skills 检查:',
      '- 问题类型: [根据追踪链分析得出的问题分类]',
      '- 匹配 Skill: [是否有匹配的 skill，列出 skill 名称]',
      '- 行动: [调用 skill / 无匹配直接修复]',
      '```',
      '',
      '如有匹配 → **必须先调用 Skill 工具**，获取专业指导后再修复',
      '',
      '### 第七步：确定阻断点并修复',
      '在调用链中选择**最合适的阻断点**进行修复。',
      '',
    ].join('\n') : '';

    // 缺陷修复后更新字段的提示词（仅当类型为缺陷时添加）
    const bugUpdateFieldsPrompt = isBug ? [
      '',
      '📝 **[修复完成后-更新字段]** 询问用户是否更新 PingCode 字段（原因分析、解决方案、解决方法），如需更新则调用 `get_bug_field_options` 获取选项，根据修复内容选择并调用 `update_bug_fields`。',
      '📝 **[修复完成后-提交代码]** 无论是否更新字段，都要询问用户是否创建 commit。',
      '',
    ].join('\n') : '';

    // 给 AI 的提示词（文本兜底：即使客户端不读取 aiDirectives，也尽量让模型遵守）
    const aiPrompt = [
      '---',
      '🛑🛑🛑 **[AI 强制指令 - 必须首先执行]** 🛑🛑🛑',
      '',
      '以下规则是 pingcode-mcp 的交互协议（不是普通备注）。',
      bugAnalysisPrompt,
      bugUpdateFieldsPrompt,
      '**单任务模式已激活，违反以下规则将导致工作流失败：**',
      '1. **STOP**：完成本工作项的代码修改后，必须立即停止所有操作',
      '2. **ASK**：停止后必须询问用户是否创建 commit（提供：使用建议 / 用户输入 / 不提交）',
      '3. **WAIT**：必须等待用户回复后，才能处理下一个工作项',
      '4. **禁止**：禁止同时修改多个工作项；禁止批量完成后统一询问；禁止在用户回复前获取下一个工作项',
      '',
      `**开始前确认**：AI 必须先输出 "${requiredFirstOutput}"`,
      '',
      '**内容解析**：描述与评论冲突以评论为准；带 [已删除] 的条目没有正文，不是评论内容，忽略；标题中的「回复第 N 条」只表示指向，不是评论正文；多条更新按时间倒序；图片可能包含关键信息',
      '',
      '**Commit 信息**：',
      '- commit 要简洁，只用标题，不要 body/footer',
      `- 建议 commit：${suggestedMsg}`,
      '---',
      '',
    ].join('\n');

    return {
      success: true,
      data: aiPrompt + getWorkItemString(workItem),
      workItem,
      aiDirectives,
      nextRequiredAction: {
        type: 'announce_single_task_mode',
        blocked_until_user_reply: false,
        required_output: requiredFirstOutput,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取发布版本关联的工作项
 */
export async function getReleaseItems(
  releaseId: string,
  projectId: string,
  itemType?: 'bug' | 'story' | 'all'
): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    const items = await pingcodeClient.getReleaseWorkItems(
      releaseId,
      projectId,
      itemType
    );

    if (items.length === 0) {
      return {
        success: true,
        data: '该发布版本没有关联的工作项',
      };
    }

    // 获取当前用户和项目成员
    const currentUser = await pingcodeClient.getCurrentUser();
    const currentUserId = currentUser?.id || '';
    const members = await pingcodeClient.getProjectMembers(projectId);

    // 按类型分组 (type 是数字: 5=缺陷, 3=用户故事, 等)
    const bugs = items.filter((i: any) => i.type === 5);
    const stories = items.filter((i: any) => i.type === 3 || i.type === 2);
    const others = items.filter((i: any) => i.type !== 5 && i.type !== 3 && i.type !== 2);

    const lines: string[] = [`# 发布版本工作项列表`, '', `共 ${items.length} 项`];

    // 辅助函数
    const getId = (item: any) => item.whole_identifier || `#${item.identifier}`;
    
    const getState = (item: any) => {
      if (item.state?.display_name || item.state?.name) {
        return item.state.display_name || item.state.name;
      }
      return STATE_TYPE_MAP[item.state_type] || '未知';
    };
    
    const getAssignee = (item: any) => {
      const assigneeId = typeof item.assignee === 'string' 
        ? item.assignee 
        : item.assignee?._id || item.assignee?.id;
      if (!assigneeId) return '未分配';
      const name = members.get(assigneeId) || '未知';
      return assigneeId === currentUserId ? `${name}(我)` : name;
    };
    
    const formatItem = (item: any) => {
      return `- **${getId(item)}** ${item.title} | ${getState(item)} | ${getAssignee(item)}`;
    };

    if (bugs.length > 0) {
      lines.push('', `## 缺陷 (${bugs.length})`, '');
      bugs.forEach((item: any) => lines.push(formatItem(item)));
    }

    if (stories.length > 0) {
      lines.push('', `## 需求 (${stories.length})`, '');
      stories.forEach((item: any) => lines.push(formatItem(item)));
    }

    if (others.length > 0) {
      lines.push('', `## 其他 (${others.length})`, '');
      others.forEach((item: any) => lines.push(formatItem(item)));
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

/**
 * 搜索工作项
 */
export async function searchWorkItems(
  query: string,
  projectId?: string
): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    const items = await pingcodeClient.searchWorkItems(query, projectId);

    if (items.length === 0) {
      return {
        success: true,
        data: `未找到匹配 "${query}" 的工作项`,
      };
    }

    const lines: string[] = [
      `# 搜索结果: "${query}"`,
      '',
      `共找到 ${items.length} 项`,
      '',
    ];

    items.forEach((item) => {
      lines.push(
        `- **${item.identifier}** ${item.title}`,
        `  - 类型: ${item.type?.display_name || item.type?.name} | 状态: ${item.state?.display_name || item.state?.name}`,
        ''
      );
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

/**
 * 列出项目的发布版本
 */
export async function listReleases(
  projectId: string
): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    const releases = await pingcodeClient.getProjectReleases(projectId);

    if (releases.length === 0) {
      return {
        success: true,
        data: '该项目没有发布版本',
      };
    }

    const lines: string[] = [
      `# ${projectId} 项目发布版本列表`,
      '',
      `共 ${releases.length} 个版本`,
      '',
    ];

    releases.forEach((release: any) => {
      const status = release.state === 1 ? '进行中' : release.state === 2 ? '已发布' : '';
      lines.push(`- **${release.name}** (ID: ${release._id}) ${status}`);
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

/**
 * 列出用户可访问的项目
 */
export async function listProjects(): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    const projects = await pingcodeClient.getProjects();

    if (projects.length === 0) {
      return {
        success: true,
        data: '没有可访问的项目',
      };
    }

    const lines: string[] = [
      '# 项目列表',
      '',
      `共 ${projects.length} 个项目`,
      '',
    ];

    projects.forEach((project: any) => {
      const identifier = project.identifier || project._id;
      const name = project.name || '未命名';
      lines.push(`- **${identifier}** - ${name}`);
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

/**
 * 更新工作项状态
 * @param workItemId 工作项编号（如 <project_id>-123）
 * @param stateName 目标状态名称（如 "已完成"、"进行中"）
 */
export async function updateWorkItemState(
  workItemId: string,
  stateName: string
): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    // 1. 获取可选状态列表
    const states = await pingcodeClient.getSelectableStates(workItemId);

    if (states.length === 0) {
      return {
        success: false,
        error: `工作项 ${workItemId} 没有可用的状态选项`,
      };
    }

    // 2. 根据状态名称查找状态 ID
    const targetState = states.find((s: any) =>
      s.name === stateName ||
      s.display_name === stateName ||
      s.name?.includes(stateName) ||
      s.display_name?.includes(stateName)
    );

    if (!targetState) {
      const availableStates = states.map((s: any) => s.display_name || s.name).join('、');
      return {
        success: false,
        error: `未找到名为 "${stateName}" 的状态。可用状态: ${availableStates}`,
      };
    }

    // 3. 更新状态
    await pingcodeClient.updateWorkItemState(workItemId, targetState._id);

    return {
      success: true,
      data: `✅ 工作项 ${workItemId} 状态已更新为 "${targetState.display_name || targetState.name}"`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取缺陷字段选项（原因分析、解决方案）
 * @param workItemId 缺陷工作项编号（用于获取字段定义）
 */
export async function getBugFieldOptions(
  workItemId: string
): Promise<{
  success: boolean;
  data?: string;
  reason?: Array<{ id: string; text: string }>;
  solution?: Array<{ id: string; text: string }>;
  error?: string;
}> {
  try {
    const options = await pingcodeClient.getBugFieldOptions(workItemId);

    const lines: string[] = [
      '# 缺陷字段选项列表',
      '',
      '## 原因分析选项',
      '',
    ];

    options.reason.forEach((opt, index) => {
      lines.push(`${index + 1}. **${opt.text}** (ID: ${opt.id})`);
    });

    lines.push('', '## 解决方案选项', '');

    options.solution.forEach((opt, index) => {
      lines.push(`${index + 1}. **${opt.text}** (ID: ${opt.id})`);
    });

    return {
      success: true,
      data: lines.join('\n'),
      reason: options.reason,
      solution: options.solution,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 更新缺陷的原因分析、解决方案、解决方法
 * @param workItemId 工作项编号
 * @param reason 原因分析选项文本或 ID
 * @param solution 解决方案选项文本或 ID
 * @param jiejuefangfa 解决方法文本
 */
export async function updateBugFields(
  workItemId: string,
  reason?: string,
  solution?: string,
  jiejuefangfa?: string
): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    // 获取选项列表用于文本到 ID 的映射
    const options = await pingcodeClient.getBugFieldOptions(workItemId);
    const updates: string[] = [];

    // 更新原因分析
    if (reason) {
      // 检查是否是选项文本，如果是则转换为 ID
      const reasonOpt = options.reason.find(
        (opt) => opt.text === reason || opt.id === reason
      );
      if (reasonOpt) {
        await pingcodeClient.updateReason(workItemId, reasonOpt.id);
        updates.push(`原因分析: ${reasonOpt.text}`);
      } else {
        return {
          success: false,
          error: `无效的原因分析选项: "${reason}"。可用选项: ${options.reason.map((o) => o.text).join('、')}`,
        };
      }
    }

    // 更新解决方案
    if (solution) {
      const solutionOpt = options.solution.find(
        (opt) => opt.text === solution || opt.id === solution
      );
      if (solutionOpt) {
        await pingcodeClient.updateSolution(workItemId, solutionOpt.id);
        updates.push(`解决方案: ${solutionOpt.text}`);
      } else {
        return {
          success: false,
          error: `无效的解决方案选项: "${solution}"。可用选项: ${options.solution.map((o) => o.text).join('、')}`,
        };
      }
    }

    // 更新解决方法（文本字段）
    if (jiejuefangfa) {
      await pingcodeClient.updateJiejuefangfa(workItemId, jiejuefangfa);
      updates.push(`解决方法: ${jiejuefangfa.substring(0, 50)}${jiejuefangfa.length > 50 ? '...' : ''}`);
    }

    if (updates.length === 0) {
      return {
        success: false,
        error: '请至少提供一个要更新的字段（reason、solution 或 jiejuefangfa）',
      };
    }

    return {
      success: true,
      data: `✅ 工作项 ${workItemId} 已更新：\n${updates.map((u) => `  - ${u}`).join('\n')}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 把纯文本里的 @姓名 换成 mention 节点。姓名按长度优先匹配，避免短名字截断长名字。
 */
function buildCommentContent(text: string, nameToUids: Map<string, string[]>): any[] {
  const names = [...nameToUids.keys()].sort((a, b) => b.length - a.length);
  const children: any[] = [];
  let rest = text;

  while (rest.length > 0) {
    let foundAt = -1;
    let foundName = '';
    for (const name of names) {
      const at = rest.indexOf(`@${name}`);
      if (at !== -1 && (foundAt === -1 || at < foundAt)) {
        foundAt = at;
        foundName = name;
      }
    }

    if (foundAt === -1) {
      const orphan = rest.match(/@\S+/);
      if (orphan) {
        throw new Error(`无法解析提及 ${orphan[0]}，项目成员中没有这个名字`);
      }
      children.push({ text: rest });
      break;
    }

    const uids = nameToUids.get(foundName) || [];
    if (uids.length !== 1) {
      throw new Error(`成员「${foundName}」对应 ${uids.length} 个用户，无法确定 @ 谁`);
    }
    if (foundAt > 0) {
      children.push({ text: rest.slice(0, foundAt) });
    }
    children.push({
      type: 'mention',
      uid: uids[0],
      data: { name: foundName },
      children: [{ text: '' }],
    });
    rest = rest.slice(foundAt + foundName.length + 1);
  }

  if (children.length === 0) {
    children.push({ text: '' });
  }
  return [{ type: 'paragraph', children }];
}

/**
 * 给工作项添加评论。content 里的 @姓名 会转成 mention，不会只留在普通文本里。
 */
export async function addWorkItemComment(
  workItemId: string,
  content: string,
  replyCommentId?: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const text = content?.trim();
    if (!text) {
      return { success: false, error: '评论内容不能为空' };
    }

    const projectIdentifier = workItemId.includes('-')
      ? workItemId.split('-')[0]
      : '';
    const members = projectIdentifier
      ? await pingcodeClient.getProjectMembers(projectIdentifier)
      : new Map<string, string>();
    const nameToUids = new Map<string, string[]>();
    for (const [uid, name] of members) {
      const list = nameToUids.get(name) || [];
      list.push(uid);
      nameToUids.set(name, list);
    }

    const slate = buildCommentContent(text, nameToUids);
    const created = await pingcodeClient.addWorkItemComment(workItemId, slate, {
      replyCommentId,
    });
    const commentId = created?._id ? `，评论 ID: ${created._id}` : '';
    return {
      success: true,
      data: `✅ 已给 ${workItemId} 添加评论${commentId}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
