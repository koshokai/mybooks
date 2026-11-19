/*
 * 实时翻译：对方说外语 → 语音识别 → 翻译成中文 → 屏幕字幕 + 耳机朗读
 * - 识别：浏览器自带的 SpeechRecognition（iPhone Safari 用的是系统听写）
 * - 翻译：默认免费的 MyMemory；可选 Claude（用户自己的 API Key，只存在本机）
 * - 朗读：speechSynthesis 中文语音
 */

// ---------- 语言 ----------
const LANGS = [
  ["en-US", "英语", "en"],
  ["ja-JP", "日语", "ja"],
  ["ko-KR", "韩语", "ko"],
  ["fr-FR", "法语", "fr"],
  ["de-DE", "德语", "de"],
  ["es-ES", "西班牙语", "es"],
  ["it-IT", "意大利语", "it"],
  ["pt-BR", "葡萄牙语", "pt"],
  ["ru-RU", "俄语", "ru"],
  ["th-TH", "泰语", "th"],
  ["vi-VN", "越南语", "vi"],
  ["id-ID", "印尼语", "id"],
  ["ms-MY", "马来语", "ms"],
  ["ar-SA", "阿拉伯语", "ar"],
  ["tr-TR", "土耳其语", "tr"],
  ["nl-NL", "荷兰语", "nl"],
  ["zh-HK", "粤语", "yue"],
];

// ---------- 本机存储（读写失败时不影响使用） ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("tr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tr:" + k, JSON.stringify(v)); } catch {} },
};

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const settings = {
  src: store.get("src", "en-US"),
  engine: store.get("engine", "free"),
  apiKey: store.get("apiKey", ""),
  rate: store.get("rate", 1.1),
  speak: store.get("speak", true),
  pauseWhileSpeaking: store.get("pauseWhileSpeaking", false),
};
const save = () => { for (const k in settings) store.set(k, settings[k]); };

// ---------- 页面元素 ----------
const $ = (id) => document.getElementById(id);
const el = {
  src: $("srcLang"), log: $("log"), empty: $("empty"), interim: $("interim"), status: $("status"),
  mic: $("micBtn"), speakToggle: $("speakToggle"), bigBtn: $("bigBtn"),
  bigView: $("bigView"), bigOrig: $("bigOrig"), bigText: $("bigText"),
  settings: $("settings"), settingsBtn: $("settingsBtn"), claudeBox: $("claudeBox"), apiKey: $("apiKey"),
  rate: $("rate"), rateOut: $("rateOut"), pause: $("pauseWhileSpeaking"), copy: $("copyBtn"), clear: $("clearBtn"),
};

for (const [code, name] of LANGS) el.src.add(new Option(name, code));
el.src.value = settings.src;
el.src.onchange = () => {
  settings.src = el.src.value; save();
  if (listening) restartRecognition();
};

function setStatus(text, warn = false) {
  el.status.textContent = text || "";
  el.status.classList.toggle("warn", warn);
}

// ---------- 对话记录 ----------
let history = store.get("history", []); // [{o, z, l, t}]
const MAX_HISTORY = 300;

function addCard(orig) {
  el.empty.hidden = true;
  const card = document.createElement("div");
  card.className = "card";
  const o = document.createElement("p"); o.className = "orig"; o.textContent = orig;
  const z = document.createElement("p"); z.className = "zh pending"; z.textContent = "翻译中…";
  card.append(o, z);
  el.log.append(card);
  scrollToBottom();
  return z;
}

function renderHistory() {
  for (const h of history) {
    const z = addCard(h.o);
    z.className = "zh"; z.textContent = h.z;
  }
  el.empty.hidden = history.length > 0;
}

function scrollToBottom() {
  // 用户往上翻看旧记录时不要强行拉回底部
  const nearBottom = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 160;
  if (nearBottom) requestAnimationFrame(() => { el.log.scrollTop = el.log.scrollHeight; });
}

// ---------- 翻译 ----------
const langInfo = () => LANGS.find((l) => l[0] === settings.src) || LANGS[0];

async function translateFree(text) {
  const src = langInfo()[2] === "yue" ? "zh-HK" : langInfo()[2];
  // MyMemory 单次最多约 500 字节，长句按标点切开
  const parts = splitText(text, 400);
  const out = [];
  for (const p of parts) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(p)}&langpair=${encodeURIComponent(src)}|zh-CN`;
    const res = await fetch(url);
    if (res.status === 429) throw new Error("今天的免费额度用完了，可在设置里换成 Claude");
    if (!res.ok) throw new Error("翻译服务暂时不可用（" + res.status + "）");
    const data = await res.json();
    const t = data?.responseData?.translatedText || "";
    if (data.responseStatus && Number(data.responseStatus) !== 200) throw new Error(t || "翻译失败");
    if (/MYMEMORY WARNING/i.test(t)) throw new Error("今天的免费额度用完了，可在设置里换成 Claude");
    out.push(decodeEntities(t));
  }
  return out.join("");
}

function splitText(text, max) {
  if (new TextEncoder().encode(text).length <= max) return [text];
  const pieces = text.match(/[^.!?。！？,，;；]+[.!?。！？,，;；]*\s*/g) || [text];
  const out = []; let cur = "";
  for (const p of pieces) {
    if (new TextEncoder().encode(cur + p).length > max && cur) { out.push(cur); cur = ""; }
    cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

function decodeEntities(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

let anthropicClient = null;
let anthropicKey = "";
async function getClaude() {
  if (!settings.apiKey) throw new Error("请先在设置里填写 API Key");
  if (!anthropicClient || anthropicKey !== settings.apiKey) {
    const { default: Anthropic } = await import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm");
    // 纯前端应用：Key 由用户自己填写、只存在本机，所以允许在浏览器里直接调用
    anthropicClient = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
    anthropicKey = settings.apiKey;
  }
  return anthropicClient;
}

async function translateClaude(text, onPartial) {
  const client = await getClaude();
  const langName = langInfo()[1];
  const recent = history.slice(-4).map((h) => h.o).join("\n");
  const system =
    `你是现场口译员。用户发来的是从${langName}语音识别出来的一句话，请翻译成自然、口语化的简体中文。` +
    `语音识别可能有错字或漏词，请结合上下文合理理解。只输出译文本身，不要解释、不要加引号。`;
  const content = (recent ? `<之前的对话>\n${recent}\n</之前的对话>\n\n` : "") + `<要翻译的话>\n${text}\n</要翻译的话>`;

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" }, // 实时场景优先速度
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 万一被安全策略拒答，自动换模型重试
    system,
    messages: [{ role: "user", content }],
  });
  let acc = "";
  stream.on("text", (delta) => { acc += delta; onPartial?.(acc); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("这句话没有翻译");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

async function translate(text, onPartial) {
  if (settings.engine === "claude") {
    try {
      return await translateClaude(text, onPartial);
    } catch (e) {
      const status = e?.status;
      if (status === 401) throw new Error("API Key 无效，请在设置里检查");
      if (status === 429) throw new Error("请求太频繁或额度不足，稍后再试");
      if (e instanceof Error && !status && /Key/.test(e.message)) throw e;
      // 网络或服务问题：退回免费引擎，至少有个译文
      console.warn("Claude 翻译失败，改用免费引擎", e);
      return await translateFree(text);
    }
  }
  return translateFree(text);
}

// ---------- 朗读 ----------
let zhVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  zhVoice =
    voices.find((v) => v.lang === "zh-CN" && /Tingting|婷婷/i.test(v.name)) ||
    voices.find((v) => v.lang === "zh-CN") ||
    voices.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) ||
    null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

let speaking = 0;
function speak(text) {
  return new Promise((resolve) => {
    if (!settings.speak || !text || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    if (zhVoice) u.voice = zhVoice;
    u.rate = settings.rate;
    let done = false;
    const finish = () => {
      if (done) return; done = true; clearTimeout(guard);
      speaking--; if (speaking === 0) onSpeakingEnd();
      resolve();
    };
    // iOS 偶尔不触发 onend，按字数估一个最长时间兜底
    const guard = setTimeout(finish, 2500 + (text.length * 420) / settings.rate);
    u.onend = finish; u.onerror = finish;
    speaking++; onSpeakingStart();
    speechSynthesis.speak(u);
  });
}

function unlockSpeech() {
  // iPhone 要求第一次朗读发生在用户点击里，先播一段空语音解锁
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

function onSpeakingStart() {
  if (settings.pauseWhileSpeaking && listening && rec) {
    pausedForSpeech = true;
    stopRecognitionInstance();
  }
}
function onSpeakingEnd() {
  if (pausedForSpeech) {
    pausedForSpeech = false;
    if (listening) startRecognition();
  }
}

// 译文按说话顺序朗读，即使后一句先翻译完
let speakChain = Promise.resolve();

// ---------- 语音识别 ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let generation = 0;           // 每个识别实例一个编号，旧实例的回调一律忽略
let listening = false;        // 用户希望处于收听状态
let pausedForSpeech = false;  // 正在朗读，暂时停止收音
let interimText = "";
let silenceTimer = null;
let restartTimer = null;
let errorStreak = 0;
const SILENCE_MS = isIOS ? 1300 : 1600;

function startRecognition() {
  clearTimeout(restartTimer);
  if (!listening || pausedForSpeech) return;
  const gen = ++generation;
  const r = new SR();
  r.lang = settings.src;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  const committed = new Set();

  r.onresult = (e) => {
    if (gen !== generation) return;
    errorStreak = 0;
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const t = res[0].transcript;
      if (res.isFinal) {
        if (!committed.has(i)) { committed.add(i); commit(t); }
      } else {
        interim += t;
      }
    }
    showInterim(interim);
  };

  r.onerror = (e) => {
    if (gen !== generation) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopListening();
      setStatus(
        isIOS
          ? "无法使用麦克风或语音识别：请在 Safari 中打开，允许麦克风，并在「设置 → Siri」中开启听写。"
          : "无法使用麦克风：请在浏览器设置里允许麦克风权限。",
        true
      );
      return;
    }
    if (e.error === "language-not-supported") {
      stopListening();
      setStatus("这台设备暂不支持识别这种语言", true);
      return;
    }
    if (e.error !== "no-speech" && e.error !== "aborted") {
      errorStreak++;
      console.warn("识别出错", e.error);
    }
  };

  r.onend = () => {
    if (gen !== generation) return;
    flushInterim();
    rec = null;
    if (listening && !pausedForSpeech) {
      // 识别会在静音或一段时间后自动结束，这里自动续上；连续出错时放慢重试
      const delay = errorStreak > 3 ? 2000 : 150;
      if (errorStreak > 8) setStatus("网络不稳定，语音识别连接不上，正在重试…", true);
      restartTimer = setTimeout(startRecognition, delay);
    }
  };

  try {
    r.start();
    rec = r;
  } catch (err) {
    console.warn(err);
    restartTimer = setTimeout(startRecognition, 500);
  }
}

function stopRecognitionInstance() {
  clearTimeout(silenceTimer);
  clearTimeout(restartTimer);
  flushInterim();
  generation++; // 让旧实例的回调失效
  if (rec) { try { rec.abort(); } catch {} rec = null; }
}

function restartRecognition() {
  stopRecognitionInstance();
  startRecognition();
}

function showInterim(text) {
  interimText = text.trim();
  el.interim.textContent = interimText;
  clearTimeout(silenceTimer);
  if (interimText) {
    // iPhone 上句子常常迟迟不给“最终结果”，停顿一下就当一句话说完了
    silenceTimer = setTimeout(() => {
      if (!interimText) return;
      flushInterim();
      restartRecognition();
    }, SILENCE_MS);
  }
}

function flushInterim() {
  clearTimeout(silenceTimer);
  const t = interimText;
  interimText = "";
  el.interim.textContent = "";
  if (t) commit(t);
}

function commit(raw) {
  const text = raw.trim();
  if (!text) return;
  interimText = "";
  el.interim.textContent = "";
  clearTimeout(silenceTimer);

  const zhEl = addCard(text);
  const job = translate(text, (partial) => {
    zhEl.textContent = partial;
    showBig(text, partial);
    scrollToBottom();
  }).then(
    (zh) => {
      zhEl.className = "zh";
      zhEl.textContent = zh || "（没有译文）";
      showBig(text, zh);
      history.push({ o: text, z: zh, l: settings.src, t: Date.now() });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      store.set("history", history);
      scrollToBottom();
      if (errorStreak <= 8) setStatus(listening ? "正在听…" : "");
      return zh;
    },
    (err) => {
      zhEl.className = "zh error";
      zhEl.textContent = err?.message || "翻译失败";
      return "";
    }
  );
  speakChain = speakChain.then(() => job).then((zh) => speak(zh));
}

// ---------- 开始 / 停止 ----------
let wakeLock = null;
async function keepScreenOn() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && listening) {
    keepScreenOn();
    if (!rec && !pausedForSpeech) startRecognition();
  }
});

function startListening() {
  if (!SR) {
    setStatus(isIOS ? "当前浏览器不支持语音识别，请用 Safari 打开。" : "当前浏览器不支持语音识别，请用 Chrome 或 Safari 打开。", true);
    return;
  }
  unlockSpeech();
  listening = true;
  errorStreak = 0;
  el.mic.classList.add("on");
  el.mic.setAttribute("aria-label", "停止收听");
  setStatus("正在听…");
  keepScreenOn();
  startRecognition();
}

function stopListening() {
  listening = false;
  pausedForSpeech = false;
  stopRecognitionInstance();
  el.mic.classList.remove("on");
  el.mic.setAttribute("aria-label", "开始收听");
  setStatus("");
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}

el.mic.onclick = () => (listening ? stopListening() : startListening());

// ---------- 朗读开关 / 大字幕 ----------
function syncSpeakBtn() {
  el.speakToggle.setAttribute("aria-pressed", String(settings.speak));
  el.speakToggle.querySelector(".side-icon").textContent = settings.speak ? "🔊" : "🔇";
}
el.speakToggle.onclick = () => {
  settings.speak = !settings.speak; save(); syncSpeakBtn();
  if (!settings.speak && "speechSynthesis" in window) speechSynthesis.cancel();
  else unlockSpeech();
};
syncSpeakBtn();

function showBig(orig, zh) {
  if (el.bigView.hidden) return;
  el.bigOrig.textContent = orig;
  el.bigText.textContent = zh;
}
el.bigBtn.onclick = () => {
  const last = history[history.length - 1];
  el.bigOrig.textContent = last?.o || "";
  el.bigText.textContent = last?.z || "等待对方说话…";
  el.bigView.hidden = false;
};
el.bigView.onclick = () => { el.bigView.hidden = true; };

// ---------- 设置 ----------
const engineRadios = [...document.querySelectorAll('input[name="engine"]')];
function syncSettingsUI() {
  for (const r of engineRadios) r.checked = r.value === settings.engine;
  el.claudeBox.hidden = settings.engine !== "claude";
  el.apiKey.value = settings.apiKey;
  el.rate.value = settings.rate; el.rateOut.textContent = settings.rate;
  el.pause.checked = settings.pauseWhileSpeaking;
}
for (const r of engineRadios) r.onchange = () => { settings.engine = r.value; el.claudeBox.hidden = r.value !== "claude"; save(); };
el.apiKey.onchange = () => { settings.apiKey = el.apiKey.value.trim(); save(); };
el.rate.oninput = () => { settings.rate = Number(el.rate.value); el.rateOut.textContent = settings.rate; save(); };
el.pause.onchange = () => { settings.pauseWhileSpeaking = el.pause.checked; save(); };
el.settingsBtn.onclick = () => { syncSettingsUI(); el.settings.showModal(); };
el.settings.addEventListener("close", () => { settings.apiKey = el.apiKey.value.trim(); save(); });
el.settings.addEventListener("click", (e) => { if (e.target === el.settings) el.settings.close(); });

el.copy.onclick = async () => {
  const text = history.map((h) => `${h.o}\n${h.z}`).join("\n\n");
  try { await navigator.clipboard.writeText(text); el.copy.textContent = "已复制"; }
  catch { el.copy.textContent = "复制失败"; }
  setTimeout(() => { el.copy.textContent = "复制全部"; }, 1500);
};
el.clear.onclick = () => {
  if (!confirm("清空全部翻译记录？")) return;
  history = []; store.set("history", history);
  el.log.querySelectorAll(".card").forEach((c) => c.remove());
  el.empty.hidden = false;
};

renderHistory();
el.log.scrollTop = el.log.scrollHeight;
