import axios, { AxiosInstance } from 'axios';
import {
  loadCredentials,
  isCredentialsValid,
  cookiesToHeader,
} from '../utils/credentials.js';
import type { WorkItem, Release, ApiResponse } from '../types/pingcode.js';

const DEFAULT_DOMAIN = process.env.PINGCODE_DOMAIN || 'neuralgalaxy.pingcode.com';

export class PingCodeClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(domain: string = DEFAULT_DOMAIN) {
    this.baseUrl = `https://${domain}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    const credentials = loadCredentials();
    return isCredentialsValid(credentials);
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(): Record<string, string> {
    const credentials = loadCredentials();
    if (!credentials || !isCredentialsValid(credentials)) {
      throw new Error('未登录，请先调用 login 工具进行登录');
    }
    return {
      Cookie: cookiesToHeader(credentials.cookies),
    };
  }

  /**
   * 通过编号获取工作项详情
   * @param identifier 工作项编号，如 "12345" 或 "#12345" 或 "LFY-123"
   */
  async getWorkItem(identifier: string): Promise<WorkItem | null> {
    const headers = this.getAuthHeaders();
    
    // 清理编号格式，支持 #LFY-2513、LFY-2513、2513 等格式
    let cleanId = identifier.replace(/^#/, '').trim();
    
    try {
      // 直接通过 /api/agile/work-items/{identifier} 获取
      const response = await this.client.get(`/api/agile/work-items/${cleanId}`, {
        headers,
      });
      // API 返回格式: { "data": { "value": { ... } } }
      const item = response.data?.data?.value || response.data?.value || response.data;
      if (item && item._id) {
        return item;
      }
      
      return null;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 通过项目标识符获取项目实际 ID
   */
  async getProjectId(identifier: string): Promise<string | null> {
    const headers = this.getAuthHeaders();
    
    try {
      const response = await this.client.get(
        `/api/agile/projects/${identifier}`,
        { headers, params: { addons: true } }
      );
      // API 返回格式: { "data": { "value": { "_id": "..." } } }
      return response.data?.data?.value?._id || response.data?._id || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取发布版本关联的工作项
   * @param releaseId 发布版本 ID
   * @param projectIdentifier 项目标识，如 LFY
   * @param itemType 工作项类型筛选
   */
  async getReleaseWorkItems(
    releaseId: string,
    projectIdentifier: string,
    itemType?: 'bug' | 'story' | 'all'
  ): Promise<WorkItem[]> {
    const headers = this.getAuthHeaders();
    
    try {
      // 先获取项目实际 ID
      const projectId = await this.getProjectId(projectIdentifier);
      if (!projectId) {
        throw new Error(`未找到项目: ${projectIdentifier}`);
      }

      // 使用正确的 API 路径和 POST 请求
      const response = await this.client.post(
        `/api/agile/projects/${projectId}/release/work-item/related-work-items/content`,
        {
          version_id: releaseId,  // 参数名是 version_id
        },
        { headers }
      );
      
      // API 返回格式: { "data": { "value": [...] } }
      let items: WorkItem[] = response.data?.data?.value || response.data?.value || [];
      
      // 按类型筛选 (type 是数字: 5=缺陷, 3=用户故事, 等)
      if (itemType && itemType !== 'all') {
        items = items.filter((item: any) => {
          const typeNum = item.type;
          const typeName = item.type?.name?.toLowerCase();
          if (itemType === 'bug') {
            return typeNum === 5 || typeName === 'bug' || typeName === '缺陷';
          }
          if (itemType === 'story') {
            return typeNum === 3 || typeName === 'story' || typeName === '需求' || typeName === '用户故事';
          }
          return true;
        });
      }
      
      return items;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 获取项目的发布版本列表
   * @param projectIdentifier 项目标识，如 LFY
   */
  async getProjectReleases(projectIdentifier: string): Promise<any[]> {
    const headers = this.getAuthHeaders();
    
    try {
      // 先获取项目实际 ID
      const projectId = await this.getProjectId(projectIdentifier);
      if (!projectId) {
        throw new Error(`未找到项目: ${projectIdentifier}`);
      }

      const response = await this.client.get(
        `/api/agile/projects/${projectId}/release/versions`,
        {
          headers,
          params: { ps: 50 },
        }
      );
      
      return response.data?.data?.value || response.data?.value || [];
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 通过版本名称查找版本 ID
   */
  async findReleaseByName(projectIdentifier: string, versionName: string): Promise<string | null> {
    const releases = await this.getProjectReleases(projectIdentifier);
    const release = releases.find((r: any) => 
      r.name === versionName || 
      r.name.includes(versionName) ||
      versionName.includes(r.name)
    );
    return release?._id || null;
  }

  /**
   * 获取当前登录用户信息
   */
  async getCurrentUser(): Promise<{ id: string; name: string } | null> {
    // 从本地凭证获取用户信息
    const credentials = loadCredentials();
    if (credentials?.user) {
      return credentials.user;
    }
    return null;
  }

  /**
   * 获取图片访问 token
   * 用于访问 PingCode 图片服务 (atlas.pingcode.com)
   */
  async getImageToken(): Promise<string | null> {
    const headers = this.getAuthHeaders();
    
    try {
      const response = await this.client.get('/api/typhon/secret/file/public-image-token', { headers });
      return response.data?.data?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * 下载图片到本地
   * @param imageUrl 图片 URL (atlas.pingcode.com)
   * @param imageDir 保存目录
   * @returns 本地文件路径
   */
  async downloadImage(imageUrl: string, imageDir: string): Promise<string | null> {
    try {
      // 从 URL 提取图片 ID
      const match = imageUrl.match(/files\/public\/([a-f0-9]+)/);
      if (!match) return null;
      
      const imageId = match[1];
      const localPath = `${imageDir}/${imageId}.png`;
      
      // 检查是否已下载
      const fs = await import('fs');
      if (fs.existsSync(localPath)) {
        return localPath;
      }
      
      // 获取 token
      const token = await this.getImageToken();
      if (!token) return null;
      
      // 下载图片
      const response = await this.client.get(
        `https://atlas.pingcode.com/files/public/${imageId}?token=${token}`,
        { responseType: 'arraybuffer', maxRedirects: 5 }
      );
      
      // 确保目录存在
      fs.mkdirSync(imageDir, { recursive: true });
      
      // 保存文件
      fs.writeFileSync(localPath, response.data);
      
      return localPath;
    } catch {
      return null;
    }
  }

  /**
   * 搜索工作项
   */
  async searchWorkItems(query: string, projectId?: string): Promise<WorkItem[]> {
    const headers = this.getAuthHeaders();
    
    try {
      const params: Record<string, any> = {
        q: query,
        page_size: 20,
      };
      
      if (projectId) {
        params.project_id = projectId;
      }
      
      const response = await this.client.get('/api/pjm/work-items/search', {
        headers,
        params,
      });
      
      return response.data?.values || [];
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }
  /**
   * 获取项目成员列表
   */
  async getProjectMembers(projectIdentifier: string): Promise<Map<string, string>> {
    const headers = this.getAuthHeaders();
    const memberMap = new Map<string, string>();
    
    try {
      const projectId = await this.getProjectId(projectIdentifier);
      if (!projectId) return memberMap;

      const response = await this.client.get(
        `/api/agile/projects/${projectId}/members`,
        { headers, params: { ps: 200 } }
      );
      
      const members = response.data?.data?.value || [];
      for (const m of members) {
        if (m.uid && m.display_name) {
          memberMap.set(m.uid, m.display_name);
        }
      }
    } catch {
      // 忽略错误
    }
    
    return memberMap;
  }

  /**
   * 获取工作项详情（增强版，包含成员名称）
   */
  async getWorkItemWithDetails(identifier: string): Promise<any | null> {
    const workItem = await this.getWorkItem(identifier);
    if (!workItem) return null;

    // 转为 any 以便添加额外字段
    const item: any = workItem;

    // 从标识符中提取项目标识
    const projectIdentifier = identifier.includes('-') 
      ? identifier.split('-')[0] 
      : 'LFY'; // 默认项目

    // 获取成员列表
    const members = await this.getProjectMembers(projectIdentifier);

    // 填充负责人名称
    if (item.assignee && typeof item.assignee === 'string') {
      item.assignee_name = members.get(item.assignee) || null;
    }
    
    // 填充创建人名称
    if (item.created_by && typeof item.created_by === 'string') {
      item.created_by_name = members.get(item.created_by) || null;
    }

    // 填充评论作者名称
    if (item.comments && Array.isArray(item.comments)) {
      item.comments.forEach((comment: any) => {
        if (comment.created_by && typeof comment.created_by === 'string') {
          comment.created_by_name = members.get(comment.created_by) || null;
        }
      });
    }

    // 下载描述中的图片到本地
    if (item.description) {
      item.description = await this.processDescriptionImages(item.description, identifier);
    }

    return item;
  }

  /**
   * 处理描述中的图片，下载到本地并替换 URL
   */
  private async processDescriptionImages(description: string, workItemId: string): Promise<string> {
    const os = await import('os');
    const imageDir = `${os.homedir()}/.pingcode-mcp/images`;
    
    // 匹配所有图片 URL
    const imgRegex = /<img[^>]*src="(https:\/\/atlas\.pingcode\.com\/files\/public\/[a-f0-9]+)"[^>]*>/gi;
    const matches = [...description.matchAll(imgRegex)];
    
    if (matches.length === 0) return description;
    
    let result = description;
    for (const match of matches) {
      const originalUrl = match[1];
      const localPath = await this.downloadImage(originalUrl, imageDir);
      if (localPath) {
        // 替换 URL 为本地路径
        result = result.replace(originalUrl, localPath);
      }
    }
    
    return result;
  }

  /**
   * 获取用户可访问的项目列表
   */
  async getProjects(): Promise<any[]> {
    const headers = this.getAuthHeaders();

    try {
      const response = await this.client.get(
        '/api/agile/pilot/entries',
        { headers, params: { sort_direction: 'asc', ps: 100 } }
      );
      return response.data?.data?.value || response.data?.value || [];
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 获取工作项可选的状态列表
   * @param workItemId 工作项 ID（如 LFY-2527）
   */
  async getSelectableStates(workItemId: string): Promise<any[]> {
    const headers = this.getAuthHeaders();

    // 清理编号格式
    const cleanId = workItemId.replace(/^#/, '').trim();

    try {
      const response = await this.client.get(
        `/api/agile/work-items/${cleanId}/selectable-states`,
        { headers }
      );
      // API 返回格式: { "data": [...] }
      return response.data?.data || response.data?.value || [];
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 更新工作项状态
   * @param workItemId 工作项 ID（如 LFY-2527）
   * @param stateId 目标状态 ID
   */
  async updateWorkItemState(workItemId: string, stateId: string): Promise<any> {
    const headers = this.getAuthHeaders();

    // 清理编号格式
    const cleanId = workItemId.replace(/^#/, '').trim();

    try {
      const response = await this.client.put(
        `/api/agile/work-items/${cleanId}`,
        { state: stateId },
        { headers }
      );
      return response.data?.data?.value || response.data?.value || response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 获取缺陷字段的选项列表（从工作项的 references 中提取）
   * @param workItemId 缺陷工作项的编号
   */
  async getBugFieldOptions(workItemId: string): Promise<{
    reason: Array<{ id: string; text: string }>;
    solution: Array<{ id: string; text: string }>;
  }> {
    const headers = this.getAuthHeaders();
    const cleanId = workItemId.replace(/^#/, '').trim();

    try {
      const response = await this.client.get(`/api/agile/work-items/${cleanId}`, { headers });
      const refs = response.data?.data?.references || {};
      const properties = refs.properties || [];

      const result = {
        reason: [] as Array<{ id: string; text: string }>,
        solution: [] as Array<{ id: string; text: string }>,
      };

      for (const prop of properties) {
        if (prop.key === 'reason' && prop.options) {
          result.reason = prop.options.map((opt: any) => ({
            id: opt._id,
            text: opt.text,
          }));
        }
        if (prop.key === 'solution' && prop.options) {
          result.solution = prop.options.map((opt: any) => ({
            id: opt._id,
            text: opt.text,
          }));
        }
      }

      return result;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 获取"原因分析"字段的可选值列表
   * @param workItemId 缺陷工作项的编号
   */
  async getReasonOptions(workItemId: string): Promise<Array<{ id: string; text: string }>> {
    const options = await this.getBugFieldOptions(workItemId);
    return options.reason;
  }

  /**
   * 获取"解决方案"字段的可选值列表
   * @param workItemId 缺陷工作项的编号
   */
  async getSolutionOptions(workItemId: string): Promise<Array<{ id: string; text: string }>> {
    const options = await this.getBugFieldOptions(workItemId);
    return options.solution;
  }

  /**
   * 更新缺陷工作项的属性
   * @param workItemId 工作项编号（如 LFY-2559）
   * @param key 属性名（如 reason, solution, jiejuefangfa）
   * @param value 属性值（枚举字段使用选项 ID，文本字段使用文本内容）
   */
  async updateBugProperty(workItemId: string, key: string, value: string): Promise<boolean> {
    const headers = this.getAuthHeaders();

    try {
      // 1. 先获取工作项以拿到内部 _id
      const workItem = await this.getWorkItem(workItemId);
      if (!workItem) {
        throw new Error(`未找到工作项: ${workItemId}`);
      }
      const internalId = (workItem as any)._id;

      // 2. 使用内部 _id 调用 /property API
      await this.client.put(
        `/api/agile/work-items/${internalId}/property`,
        { key, value, is_pure_update: 0 },
        { headers }
      );
      return true;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('登录已过期，请重新调用 login 工具登录');
      }
      throw error;
    }
  }

  /**
   * 更新"原因分析"字段
   * @param workItemId 工作项编号
   * @param reasonId 原因分析选项 ID（可通过 getReasonOptions 获取）
   */
  async updateReason(workItemId: string, reasonId: string): Promise<boolean> {
    return this.updateBugProperty(workItemId, 'reason', reasonId);
  }

  /**
   * 更新"解决方案"字段
   * @param workItemId 工作项编号
   * @param solutionId 解决方案选项 ID（可通过 getSolutionOptions 获取）
   */
  async updateSolution(workItemId: string, solutionId: string): Promise<boolean> {
    return this.updateBugProperty(workItemId, 'solution', solutionId);
  }

  /**
   * 更新"解决方法"字段（文本字段）
   * @param workItemId 工作项编号
   * @param text 解决方法的文本内容
   */
  async updateJiejuefangfa(workItemId: string, text: string): Promise<boolean> {
    return this.updateBugProperty(workItemId, 'jiejuefangfa', text);
  }
}

// 常用优先级映射（PingCode 默认配置）
export const PRIORITY_MAP: Record<string, string> = {
  '5cb9466afda1ce4ca0090001': '紧急',
  '5cb9466afda1ce4ca0090002': '高',
  '5cb9466afda1ce4ca0090003': '中',
  '5cb9466afda1ce4ca0090004': '低',
};

// 默认客户端实例
export const pingcodeClient = new PingCodeClient();
