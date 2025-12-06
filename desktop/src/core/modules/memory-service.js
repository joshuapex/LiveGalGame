const DEFAULT_TIMEOUT_MS = 5000;

/**
 * MemoryService
 * 结构化 Profile/Event 侧车的轻量客户端（无向量召回）。
 * 仅在配置了 baseUrl 时工作；否则返回空结果以保证安全降级。
 */
export default class MemoryService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.MEMORY_API_BASE_URL || process.env.MEM_SERVICE_BASE_URL || '';
    this.defaultTimeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  buildUrl(pathname, query = {}) {
    const url = new URL(pathname, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item) => url.searchParams.append(k, item));
        } else {
          url.searchParams.set(k, v);
        }
      });
    return url.toString();
  }

  async request(pathname, { method = 'GET', query = {}, body = undefined, timeout = this.defaultTimeout } = {}) {
    if (!this.enabled) {
      return { ok: true, disabled: true, data: null };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('memory request timeout')), timeout);

    try {
      const url = this.buildUrl(pathname, query);
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MemoryService HTTP ${res.status}: ${text}`);
      }

      const data = await res.json().catch(() => null);
      return { ok: true, data };
    } catch (error) {
      console.error('[MemoryService] request failed', { pathname, error: error.message });
      return { ok: false, error };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 查询画像（topic/sub_topic/tag/time 结构化过滤）。
   */
  async queryProfiles(params = {}) {
    const { userId, projectId, topics, subTopics, tags, timeFrom, timeTo, limit = 20 } = params;
    const resp = await this.request('profiles', {
      query: {
        user_id: userId,
        project_id: projectId,
        topic: topics,
        sub_topic: subTopics,
        tag: tags,
        time_from: timeFrom,
        time_to: timeTo,
        limit
      }
    });

    if (!resp.ok) return { profiles: [], error: resp.error?.message };
    if (resp.disabled) return { profiles: [], disabled: true };
    const profiles = Array.isArray(resp.data) ? resp.data : resp.data?.profiles || [];
    return { profiles };
  }

  /**
   * 查询事件（time / tag / topic 过滤）。
   */
  async queryEvents(params = {}) {
    const { userId, projectId, topics, tags, timeFrom, timeTo, limit = 50 } = params;
    const resp = await this.request('events', {
      query: {
        user_id: userId,
        project_id: projectId,
        topic: topics,
        tag: tags,
        time_from: timeFrom,
        time_to: timeTo,
        limit
      }
    });

    if (!resp.ok) return { events: [], error: resp.error?.message };
    if (resp.disabled) return { events: [], disabled: true };
    const events = Array.isArray(resp.data) ? resp.data : resp.data?.events || [];
    return { events };
  }

  /**
   * 可扩展：推送画像/事件。当前未暴露到 UI，保留占位。
   */
  async upsertProfile(payload = {}) {
    const resp = await this.request('profiles', { method: 'POST', body: payload });
    if (!resp.ok) return { success: false, error: resp.error?.message };
    if (resp.disabled) return { success: false, disabled: true };
    return { success: true, data: resp.data };
  }

  async upsertEvent(payload = {}) {
    const resp = await this.request('events', { method: 'POST', body: payload });
    if (!resp.ok) return { success: false, error: resp.error?.message };
    if (resp.disabled) return { success: false, disabled: true };
    return { success: true, data: resp.data };
  }
}
