// @vitest-environment happy-dom
/**
 * store-auth-entry.test.js —— 「数据面何时打开」的入口链路永久回归用例
 *
 * 立此用例的原因（2026-10-16 审查 EMeowAGENT 实测）：真实入口顺序是
 *   main.js: startDashboard() → app.mount('#app')
 * 而 startDashboard() 里 authed 若只看 getToken()，**有旧令牌时会在 verifyToken 之前就打开数据面**
 * （实测白打 13 个请求）—— 我上一版的探针把 store.js 换成了 mock，**没覆盖这条链路**。
 *
 * 形态照审查方探针：驱动**真实 store.js**（不 mock 被测模块），只桩外围 IO（fetch 计数 + happy-dom 的 storage/DOM）。
 * 关键：这里**不 import App.vue**，而是像 App 那样在「校验通过」后置 store.authVerified = true 再调一次。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TOKEN_KEY = 'vrc_dashboard_token';
let dashboardCalls = 0;

const mk = (body = {}, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  dashboardCalls = 0;
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (!u.includes('/api/dashboard')) return mk({});
    dashboardCalls += 1;
    if (u.includes('overview')) return mk({ auth: { authenticated: true }, ws: { status: 'connected' } });
    if (u.includes('bootstrap')) return mk({ events: [], total: 0 });
    if (u.includes('friends')) return mk({ friends: [] });
    return mk({});
  });
});

const loadStore = async () => { vi.resetModules(); return await import('./store.js'); };
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('数据面打开的入口链路（main.js 先调 startDashboard 再 mount）', () => {
  it('① 无令牌 + main.js 首次调用 ⇒ 零数据请求（双门语义）', async () => {
    const m = await loadStore();
    m.startDashboard();          // main.js:166
    await tick();
    expect(dashboardCalls, '无令牌时不得发任何 /api/dashboard 请求').toBe(0);
  });

  it('② 带旧令牌 + main.js 首次调用（verifyToken 尚未执行）⇒ 仍为零请求（🔴 的核心断言）', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'stale-token');
    const m = await loadStore();
    m.startDashboard();          // main.js:166，此刻校验还没跑
    await tick();
    expect(dashboardCalls, '旧令牌在校验之前不得打开数据面（否则白打一堆 401）').toBe(0);
  });

  it('③ 校验通过后（App 置 authVerified）再调 startDashboard ⇒ 数据面打开', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'good-token');
    const m = await loadStore();
    m.startDashboard();
    await tick();
    expect(dashboardCalls).toBe(0);
    m.store.authVerified = true;   // App.vue 在 verifyToken 成功后做的事
    m.startDashboard();
    await tick();
    expect(dashboardCalls, '校验通过后必须能起数据面（别修成永远不动）').toBeGreaterThan(0);
  });

  it('④ 已启动后重复调用 ⇒ 幂等（不重复发请求）', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'good-token');
    const m = await loadStore();
    m.store.authVerified = true;
    m.startDashboard();
    await tick();
    const n = dashboardCalls;
    m.startDashboard();
    await tick();
    expect(dashboardCalls, '第二次调用不得再发请求').toBe(n);
  });

  it('⑤ 无令牌但探针判定「未启用鉴权」（authRequired=false）⇒ 仍要放行数据面', async () => {
    const m = await loadStore();
    m.startDashboard();
    await tick();
    expect(dashboardCalls).toBe(0);
    m.store.authRequired = false;   // App.vue 在 probeAuthRequired() === false 时做的事
    m.startDashboard();
    await tick();
    expect(dashboardCalls, '未启用令牌的部署必须放行（上游原语义，不能丢）').toBeGreaterThan(0);
  });
});