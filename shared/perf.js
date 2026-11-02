/*
 * 自动画质（3D 世界共用）
 * 持续测量真实帧时间：设备跑不动（平均低于约 33 帧）就逐级降低渲染分辨率，最后一级关掉泛光；
 * 如果一直很流畅，会试着升回一档，升上去又卡了就退回来，并且本次不再尝试。
 * 选定的档位记在本机，下次进来直接用。
 *
 * 用法：
 *   const q = autoQuality({ id: "flora", maxPR: 2, setPR: (pr) => {...}, setBloom: (on) => {...} });
 *   每帧调用 q.tick(真实帧间隔秒数)。
 */
export function autoQuality({ id, maxPR, setPR, setBloom, warmup = 3, slowMs = 30 }) {
  const top = Math.max(0.75, Math.min(maxPR || 1, 2));
  // 档位：从设备像素比逐级降到 0.75；最后一档再关闭泛光
  const prs = [...new Set([top, Math.min(top, 1.5), Math.min(top, 1.25), 1, 0.85, 0.75].map((v) => +v.toFixed(2)))].sort((a, b) => b - a);
  const levels = prs.map((pr) => ({ pr, bloom: true })).concat([{ pr: prs[prs.length - 1], bloom: false }]);
  const key = `wx.quality.${id}`;
  let level = 0;
  try { level = Math.min(levels.length - 1, Math.max(0, parseInt(localStorage.getItem(key), 10) || 0)); } catch {}

  let settle = warmup, acc = 0, frames = 0, spikes = 0;
  let smooth = 0, probing = 0, probeFailed = false, ups = 0;
  const apply = () => {
    const L = levels[level];
    setPR(L.pr);
    setBloom && setBloom(L.bloom);
    try { localStorage.setItem(key, String(level)); } catch {}
    settle = 1.2; acc = 0; frames = 0;
  };
  apply();

  const api = {
    get pr() { return levels[level].pr; },
    get level() { return level; },
    levels,
    tick(rawDt) {
      if (!(rawDt > 0) || document.hidden) return;
      // 单次超过 1 秒的卡顿（编译着色器、切回前台）当作偶发尖峰忽略；连续 3 帧都这么慢才算数
      if (rawDt > 1) { if (++spikes < 3) return; } else spikes = 0;
      if (settle > 0) { settle -= rawDt; return; } // 刚进入 / 刚换档，等画面稳定
      acc += rawDt; frames++;
      if (acc < 1.5) return;
      const avgMs = (acc / frames) * 1000;
      acc = 0; frames = 0;
      if (probing > 0) probing--;
      if (avgMs > slowMs) {
        smooth = 0;
        if (level < levels.length - 1) {
          if (probing > 0) probeFailed = true; // 刚升上来就卡：退回，并且本次不再尝试
          level++; probing = 0; apply();
        }
      } else if (avgMs < slowMs * 0.62) {
        // 稳定流畅约 6 秒：试着升一档（每次进入最多 2 次）
        if (++smooth >= 4 && level > 0 && !probeFailed && ups < 2) { level--; ups++; smooth = 0; probing = 3; apply(); }
      } else smooth = 0;
    },
    reset() { level = 0; apply(); }, // 调试：恢复最高画质
  };
  window.__quality = api;
  return api;
}
