/**
 * PingCode 工作项类型
 */
export interface WorkItem {
  _id: string;
  identifier: string;        // 工作项编号，如 #12345
  title: string;             // 标题
  type: WorkItemType;        // 类型：bug, story, task 等
  state: WorkItemState;      // 状态
  priority?: Priority;       // 优先级
  assignee?: User;           // 负责人
  reporter?: User;           // 创建人
  created_at: string;        // 创建时间
  updated_at: string;        // 更新时间
  description?: string;      // 描述
  sprint?: Sprint;           // 迭代
  release?: Release;         // 发布版本
  project?: Project;         // 项目
  labels?: Label[];          // 标签
}

export interface WorkItemType {
  _id: string;
  name: string;              // bug, story, task, etc.
  display_name: string;      // 缺陷, 需求, 任务
}

export interface WorkItemState {
  _id: string;
  name: string;
  display_name: string;
  category: 'todo' | 'in_progress' | 'done';
}

export interface Priority {
  _id: string;
  name: string;
  value: number;
}

export interface User {
  _id: string;
  name: string;
  display_name: string;
  avatar?: string;
}

export interface Sprint {
  _id: string;
  name: string;
  start_date?: string;
  end_date?: string;
}

export interface Release {
  _id: string;
  name: string;
  version?: string;
  release_date?: string;
  state?: string;
}

export interface Project {
  _id: string;
  name: string;
  identifier: string;        // 项目标识，如 <project_id>
}

export interface Label {
  _id: string;
  name: string;
  color?: string;
}

/**
 * PingCode 测试库
 */
export interface TestLibrary {
  _id: string;
  identifier: string;
  name: string;
  description?: string;
}

/**
 * PingCode 测试模块（Suite）
 */
export interface TestSuite {
  _id: string;
  name: string;
  parent_id?: string;
  parent_ids?: string[];
  test_library_id: string;
  count?: number;
}

/**
 * 测试步骤
 */
export interface TestCaseStep {
  step_id?: string;
  description: string;
  expected_value: string;
}

/**
 * PingCode 测试用例
 */
export interface TestCase {
  _id: string;
  short_id: string;
  whole_identifier: string;
  identifier: number;
  title: string;
  test_library_id: string;
  suite_id?: string;
  precondition?: string;
  description?: string;
  important_level?: string;
  type?: string;
  version_identifier?: number;
  version_name?: string;
  version_description?: string;
  steps?: TestCaseStep[];
  comments?: any[];
}

export interface TestCaseQueryOptions {
  page_index?: number;
  page_size?: number;
  suite_id?: string;
  include_sub_suite?: boolean;
  keyword?: string;
  link_library_id?: string;
}

export interface PaginatedTestCases {
  items: TestCase[];
  total: number;
  page_index: number;
  page_size: number;
  page_count: number;
}

/**
 * 存储的凭证信息
 */
export interface Credentials {
  cookies: CookieData[];
  domain: string;
  saved_at: number;
  expires_at?: number;
  /** 当前登录用户信息 */
  user?: {
    id: string;
    name: string;
  };
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * API 响应
 */
export interface ApiResponse<T> {
  value?: T;
  values?: T[];
  total?: number;
  error?: {
    code: string;
    message: string;
  };
}
