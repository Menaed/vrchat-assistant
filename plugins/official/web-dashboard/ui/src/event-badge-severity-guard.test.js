/**
 * event-badge-severity-guard.test.js —— 事件徽章 severity 的**定点防打字漂移**护栏
 *
 * 立此用例的原因（2026-10-16 审查 EMeowAGENT ⚠️1/💡2）：某事件类型曾写成 `status: 'warning'`，
 * 而 PrimeVue 的 Tag severity 只认 `warn`（构建产物里 `p-tag-warning` 0 命中、`p-tag-warn` 2 命中）
 * ⇒ 该徽章静默走**默认色**而非预期的橙色告警色。
 *
 * 说明：这是**定点**护栏（防已知的拼写漂移），不是「全表白名单」—— 后者需要 severity 映射有独立导出，
 * 而当前 `constants/event-types.js` 把 label / icon / severity 混在同一批对象里，无法安全地按形状区分。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.join(import.meta.dirname, 'constants', 'event-types.js'), 'utf8');

describe('事件徽章 severity 护栏（定点）', () => {
  it('不得出现非法 severity 字样（PrimeVue 只认 secondary/success/info/warn/danger/contrast）', () => {
    for (const bad of ["'warning'", '"warning"', "'err'", "'error'", "'ok'"]) {
      expect(SRC.includes(bad), '出现非法 severity 字样 ' + bad + '（会静默走默认色）').toBe(false);
    }
  });

  it('「状态变更」用的合法 warn 仍在（别把修复改回去）', () => {
    expect(SRC).toMatch(/status:\s*'warn'/);
  });
});