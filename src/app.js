(function () {
  const core = window.ResumeCore;
  const state = {
    profile: core.emptyProfile(),
    tailoredProfile: null,
    jd: null,
    keywords: [],
    suggestions: [],
    llmSettings: {
      baseUrl: "",
      model: "",
      apiKey: ""
    }
  };

  const els = {
    resumeFile: document.getElementById("resume-file"),
    avatarFile: document.getElementById("avatar-file"),
    avatarPreview: document.getElementById("avatar-preview"),
    removeAvatar: document.getElementById("remove-avatar"),
    rawResume: document.getElementById("raw-resume"),
    parseResume: document.getElementById("parse-resume"),
    clearResume: document.getElementById("clear-resume"),
    fileStatus: document.getElementById("file-status"),
    resumeState: document.getElementById("resume-state"),
    jdText: document.getElementById("jd-text"),
    jdState: document.getElementById("jd-state"),
    captureJd: document.getElementById("capture-jd"),
    analyzeJd: document.getElementById("analyze-jd"),
    llmAnalyzeJd: document.getElementById("llm-analyze-jd"),
    tailorResume: document.getElementById("tailor-resume"),
    llmTailorResume: document.getElementById("llm-tailor-resume"),
    llmFormatAll: document.getElementById("llm-format-all"),
    applyTailored: document.getElementById("apply-tailored"),
    saveData: document.getElementById("save-data"),
    exportPdf: document.getElementById("export-pdf"),
    exportWord: document.getElementById("export-word"),
    keywords: document.getElementById("keywords"),
    suggestions: document.getElementById("suggestions"),
    preview: document.getElementById("resume-preview"),
    previewState: document.getElementById("preview-state"),
    sectionEditor: document.getElementById("section-editor"),
    llmBaseUrl: document.getElementById("llm-base-url"),
    llmModel: document.getElementById("llm-model"),
    llmApiKey: document.getElementById("llm-api-key"),
    saveSettings: document.getElementById("save-settings"),
    testLlm: document.getElementById("test-llm"),
    llmState: document.getElementById("llm-state"),
    addSection: document.getElementById("add-section"),
    resumeTemplate: document.getElementById("resume-template")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await restoreState();
    renderAll();
  }

  function bindEvents() {
    els.resumeFile.addEventListener("change", handleFileUpload);
    els.avatarFile.addEventListener("change", handleAvatarUpload);
    els.removeAvatar.addEventListener("click", removeAvatar);
    els.parseResume.addEventListener("click", parseResume);
    els.clearResume.addEventListener("click", clearResume);
    els.captureJd.addEventListener("click", () => runWithBusy(els.captureJd, "抓取中", captureJd));
    els.analyzeJd.addEventListener("click", analyzeJd);
    els.llmAnalyzeJd.addEventListener("click", () => runWithBusy(els.llmAnalyzeJd, "解析中", analyzeJdWithLlm));
    els.tailorResume.addEventListener("click", generateTailoredResume);
    els.llmTailorResume.addEventListener("click", () => runWithBusy(els.llmTailorResume, "定制中", generateTailoredResumeWithLlm));
    els.llmFormatAll.addEventListener("click", () => runWithBusy(els.llmFormatAll, "整理中", formatAllWithLlm));
    els.applyTailored.addEventListener("click", applyTailoredProfile);
    els.saveData.addEventListener("click", saveState);
    els.exportPdf.addEventListener("click", exportPdf);
    els.exportWord.addEventListener("click", exportWord);
    els.saveSettings.addEventListener("click", saveSettings);
    els.testLlm.addEventListener("click", () => runWithBusy(els.testLlm, "测试中", testLlmConnection));
    els.addSection.addEventListener("click", addCustomSection);
    els.resumeTemplate.addEventListener("change", () => {
      collectProfileFromEditors();
      state.profile.template = els.resumeTemplate.value;
      if (state.tailoredProfile) {
        state.tailoredProfile.template = els.resumeTemplate.value;
      }
      renderPreview(state.tailoredProfile || state.profile, state.tailoredProfile ? "定制稿" : "基础版");
      saveState();
    });
    els.jdText.addEventListener("input", () => {
      state.jd = Object.assign({}, state.jd || {}, { text: els.jdText.value });
      updateJdState();
    });
  }

  async function restoreState() {
    const stored = await chrome.storage.local.get([
      "resumeProfile",
      "rawResumeText",
      "currentJD",
      "tailoredProfile",
      "llmSettings"
    ]);
    state.profile = core.normalizeProfile(stored.resumeProfile);
    state.tailoredProfile = stored.tailoredProfile ? core.normalizeProfile(stored.tailoredProfile) : null;
    state.jd = stored.currentJD || null;
    state.llmSettings = Object.assign(state.llmSettings, stored.llmSettings || {});
    els.rawResume.value = stored.rawResumeText || state.profile.raw || "";
    els.jdText.value = state.jd && state.jd.text ? state.jd.text : "";
    els.llmBaseUrl.value = state.llmSettings.baseUrl || "";
    els.llmModel.value = state.llmSettings.model || "";
    els.llmApiKey.value = state.llmSettings.apiKey || "";
    els.resumeTemplate.value = core.normalizeTemplateId((state.tailoredProfile || state.profile).template);
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    try {
      setFileStatus("正在读取文件...");
      const text = await core.extractTextFromFile(file);
      els.rawResume.value = text;
      setFileStatus(`已读取：${file.name}`);
      parseResume();
    } catch (error) {
      setFileStatus(error.message || "文件读取失败。");
    }
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    try {
      validateAvatarFile(file);
      state.profile.avatarDataUrl = await readFileAsDataUrl(file);
      if (state.tailoredProfile) {
        state.tailoredProfile.avatarDataUrl = state.profile.avatarDataUrl;
      }
      updateAvatarPreview();
      renderPreview(state.tailoredProfile || state.profile, state.tailoredProfile ? "定制稿" : "基础版");
      await saveState();
    } catch (error) {
      setFileStatus(error.message || "头像读取失败。");
    }
  }

  function validateAvatarFile(file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      throw new Error("头像仅支持 PNG、JPG、WebP。");
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("头像文件请控制在 2MB 以内。");
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("文件读取失败。"));
      reader.readAsDataURL(file);
    });
  }

  function removeAvatar() {
    state.profile.avatarDataUrl = "";
    if (state.tailoredProfile) {
      state.tailoredProfile.avatarDataUrl = "";
    }
    els.avatarFile.value = "";
    updateAvatarPreview();
    renderPreview(state.tailoredProfile || state.profile, state.tailoredProfile ? "定制稿" : "基础版");
    saveState();
  }

  function parseResume() {
    const previousAvatar = state.profile.avatarDataUrl;
    const previousTemplate = els.resumeTemplate.value || state.profile.template;
    state.profile = core.parseResumeText(els.rawResume.value);
    state.profile.avatarDataUrl = previousAvatar;
    state.profile.template = previousTemplate;
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "基础版");
    updateResumeState();
    saveState();
  }

  function clearResume() {
    state.profile = core.emptyProfile();
    state.tailoredProfile = null;
    els.rawResume.value = "";
    els.avatarFile.value = "";
    renderAll();
    saveState();
  }

  async function captureJd() {
    try {
      els.jdState.textContent = "抓取中";
      const tab = await selectJobSourceTab();
      if (!tab) {
        throw new Error("没有找到可抓取的招聘网页标签页。");
      }
      await ensureTabHostAccess(tab);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"]
      });
      const response = await chrome.tabs.sendMessage(tab.id, { type: "RESUME_TAILOR_EXTRACT_JD" });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "页面未返回 JD 内容。");
      }
      state.jd = response.jd;
      els.jdText.value = response.jd.text || "";
      analyzeJd();
      await saveState();
    } catch (error) {
      els.jdState.textContent = "抓取失败";
      setSuggestions([{ title: "JD 抓取失败", body: error.message || "请手动粘贴岗位 JD。" }]);
    }
  }

  async function selectJobSourceTab() {
    let tabs = await chrome.tabs.query({ currentWindow: true });
    let candidates = getHttpTabs(tabs);

    if (!candidates.length && chrome.permissions) {
      const granted = await chrome.permissions.request({ permissions: ["tabs"] });
      if (granted) {
        tabs = await chrome.tabs.query({ currentWindow: true });
        candidates = getHttpTabs(tabs);
      }
    }

    return candidates[0];
  }

  function getHttpTabs(tabs) {
    return tabs
      .filter((tab) => tab.id && /^https?:\/\//i.test(tab.url || ""))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  }

  async function ensureTabHostAccess(tab) {
    if (!chrome.permissions || !tab.url) {
      return;
    }

    const origin = new URL(tab.url).origin + "/*";
    const hasAccess = await chrome.permissions.contains({ origins: [origin] });
    if (hasAccess) {
      return;
    }

    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      throw new Error("未授权读取该招聘网页，请回到 JD 页面点击扩展弹窗抓取，或手动粘贴 JD。");
    }
  }

  function analyzeJd() {
    const jdText = core.cleanText(els.jdText.value);
    state.jd = Object.assign({}, state.jd || {}, { text: jdText });
    state.keywords = core.extractKeywords(jdText, 24);
    renderKeywords();
    updateJdState();
    saveState();
  }

  async function analyzeJdWithLlm() {
    const jdText = core.cleanText(els.jdText.value);
    if (!jdText) {
      setSuggestions([{ title: "缺少 JD", body: "请先抓取或粘贴岗位 JD。" }]);
      return;
    }

    const content = await callLlm([
      {
        role: "system",
        content: "你是严谨的招聘 JD 解析器。只能解析 JD，不要改写简历，不要生成简历。必须返回 JSON。"
      },
      {
        role: "user",
        content: [
          "请解析下面 JD，返回 JSON：",
          "{",
          '  "title": "岗位名称",',
          '  "keywords": ["关键词"],',
          '  "responsibilities": ["岗位职责"],',
          '  "requirements": ["硬性要求"],',
          '  "nice_to_have": ["加分项"],',
          '  "warnings": ["简历匹配时需要注意的点"]',
          "}",
          "JD：",
          limitText(jdText, 14000)
        ].join("\n")
      }
    ]);

    const data = parseJsonFromText(content);
    const keywords = normalizeStringList(data.keywords).slice(0, 24);
    state.keywords = keywords.map((term, index) => ({ term, score: keywords.length - index }));
    state.suggestions = [
      ...sectionSuggestions("岗位职责", data.responsibilities),
      ...sectionSuggestions("硬性要求", data.requirements),
      ...sectionSuggestions("加分项", data.nice_to_have),
      ...sectionSuggestions("注意事项", data.warnings)
    ].slice(0, 10);
    state.jd = Object.assign({}, state.jd || {}, {
      text: jdText,
      title: typeof data.title === "string" ? data.title : state.jd && state.jd.title
    });
    renderKeywords();
    setSuggestions(state.suggestions);
    updateJdState();
    await saveState();
  }

  function generateTailoredResume() {
    collectProfileFromEditors();
    const jdText = core.cleanText(els.jdText.value);
    if (!jdText) {
      setSuggestions([{ title: "缺少 JD", body: "请先抓取或粘贴岗位 JD，再生成定制简历。" }]);
      return;
    }

    const result = core.tailorResume(state.profile, jdText);
    state.tailoredProfile = result.profile;
    state.keywords = result.keywords;
    state.suggestions = result.suggestions;
    renderSectionEditor();
    renderKeywords();
    setSuggestions(state.suggestions);
    renderPreview(state.tailoredProfile, "本地定制稿");
    saveState();
  }

  async function generateTailoredResumeWithLlm() {
    collectProfileFromEditors();
    const jdText = core.cleanText(els.jdText.value);
    if (!jdText) {
      setSuggestions([{ title: "缺少 JD", body: "请先抓取或粘贴岗位 JD，再生成定制简历。" }]);
      return;
    }

    const content = await callLlm([
      {
        role: "system",
        content: [
          "你是专业中文简历优化顾问。",
          "只能基于用户已有简历事实进行取舍、排序、压缩和表达优化；不得编造经历、学历、公司、项目、数字或证书。",
          "必须返回 JSON，不要输出 Markdown。"
        ].join("\n")
      },
      {
        role: "user",
        content: [
          "根据 JD 生成岗位专属定制简历。返回 JSON：",
          "{",
          '  "profile": {',
          '    "personal": "...",',
          '    "summary": "...",',
          '    "skills": "...",',
          '    "work": "...",',
          '    "projects": "...",',
          '    "education": "...",',
          '    "awards": "...",',
          '    "sectionOrder": ["summary","skills","work","projects","education","awards"]',
          "  },",
          '  "keywords": ["关键词"],',
          '  "suggestions": [{"title":"建议标题","body":"建议内容"}]',
          "}",
          "要求：",
          "1. 经历按 JD 相关度排序。",
          "2. 每条经历尽量使用动作 + 方法 + 结果。",
          "3. 如果缺少 JD 要求，只能在 suggestions 中提醒补充，不能虚构。",
          "4. personal 保留联系方式，不要改造为夸张营销文案。",
          "简历 JSON：",
          JSON.stringify(serializeProfileForLlm(state.profile), null, 2),
          "JD：",
          limitText(jdText, 14000)
        ].join("\n")
      }
    ]);

    const data = parseJsonFromText(content);
    const profile = mergeLlmProfile(data.profile || data);
    state.tailoredProfile = profile;
    state.keywords = normalizeStringList(data.keywords).slice(0, 24).map((term, index) => ({ term, score: 24 - index }));
    if (!state.keywords.length) {
      state.keywords = core.extractKeywords(jdText, 24);
    }
    state.suggestions = normalizeSuggestionList(data.suggestions);
    if (!state.suggestions.length) {
      state.suggestions = core.tailorResume(state.profile, jdText).suggestions;
    }
    renderSectionEditor();
    renderKeywords();
    setSuggestions(state.suggestions);
    renderPreview(state.tailoredProfile, "LLM 定制稿");
    await saveState();
  }

  async function formatSectionWithLlm(sectionKey) {
    collectProfileFromEditors();
    const value = core.cleanText(state.profile[sectionKey]);
    const sectionTitle = core.getSectionTitle(state.profile, sectionKey);
    if (!value) {
      setSuggestions([{ title: "内容为空", body: `请先填写${sectionTitle}。` }]);
      return;
    }

    const content = await callLlm([
      {
        role: "system",
        content: "你是专业中文简历编辑。只能调整格式、语言和顺序，不得编造事实。必须返回 JSON。"
      },
      {
        role: "user",
        content: [
          `请整理简历模块「${sectionTitle}」。`,
          '返回 JSON：{"content":"整理后的文本"}',
          "要求：保留真实信息，表达专业、简洁，适合简历展示。",
          "原文：",
          value
        ].join("\n")
      }
    ]);

    const data = parseJsonFromText(content);
    if (typeof data.content !== "string" || !data.content.trim()) {
      throw new Error("模型没有返回 content 字段。");
    }
    state.profile[sectionKey] = data.content.trim();
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "LLM 已整理");
    await saveState();
  }

  async function formatAllWithLlm() {
    collectProfileFromEditors();
    const content = await callLlm([
      {
        role: "system",
        content: "你是专业中文简历编辑。只能调整格式、语言、分段和顺序，不得编造事实。必须返回 JSON。"
      },
      {
        role: "user",
        content: [
          "请统一整理下面结构化简历。返回 JSON：",
          "{",
          '  "profile": {',
          '    "personal": "...",',
          '    "summary": "...",',
          '    "skills": "...",',
          '    "work": "...",',
          '    "projects": "...",',
          '    "education": "...",',
          '    "awards": "...",',
          '    "sectionOrder": ["summary","skills","work","projects","education","awards"]',
          "  }",
          "}",
          "简历 JSON：",
          JSON.stringify(serializeProfileForLlm(state.profile), null, 2)
        ].join("\n")
      }
    ]);
    const data = parseJsonFromText(content);
    state.profile = mergeLlmProfile(data.profile || data);
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "LLM 已整理");
    await saveState();
  }

  function applyTailoredProfile() {
    if (!state.tailoredProfile) {
      setSuggestions([{ title: "没有定制稿", body: "请先生成定制简历，再应用到编辑区。" }]);
      return;
    }
    state.profile = core.normalizeProfile(state.tailoredProfile);
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "已应用");
    updateResumeState();
    saveState();
  }

  function collectProfileFromEditors() {
    document.querySelectorAll("[data-section]").forEach((textarea) => {
      state.profile[textarea.dataset.section] = textarea.value;
    });
    document.querySelectorAll("[data-section-title]").forEach((input) => {
      state.profile.sectionTitles = state.profile.sectionTitles || {};
      state.profile.sectionTitles[input.dataset.sectionTitle] = input.value.trim();
    });
    state.profile.raw = els.rawResume.value || state.profile.raw || "";
    state.profile.template = els.resumeTemplate.value;
    state.profile.sectionOrder = core.normalizeSectionOrder(state.profile.sectionOrder, state.profile);
  }

  function renderAll() {
    updateResumeState();
    updateJdState();
    updateLlmState();
    updateAvatarPreview();
    renderSectionEditor();
    analyzeJd();
    renderPreview(state.tailoredProfile || state.profile, state.tailoredProfile ? "定制稿" : "基础版");
  }

  function renderSectionEditor() {
    const data = core.normalizeProfile(state.profile);
    state.profile = data;
    const orderedKeys = ["personal", ...core.normalizeSectionOrder(data.sectionOrder, data)];
    els.sectionEditor.innerHTML = "";
    orderedKeys.forEach((key, index) => {
      els.sectionEditor.appendChild(createSectionCard(key, index, key !== "personal"));
    });
  }

  function createSectionCard(key, index, movable) {
    const card = document.createElement("div");
    card.className = "section-card";
    card.dataset.sectionCard = key;

    const head = document.createElement("div");
    head.className = "section-card__head";

    const title = document.createElement("div");
    title.className = "section-card__title";
    const number = document.createElement("span");
    number.className = "section-card__index";
    number.textContent = String(index + 1);
    const titleInput = document.createElement("input");
    titleInput.className = "section-title-input";
    titleInput.dataset.sectionTitle = key;
    titleInput.type = "text";
    titleInput.value = core.getSectionTitle(state.profile, key);
    titleInput.addEventListener("input", () => {
      state.profile.sectionTitles = state.profile.sectionTitles || {};
      state.profile.sectionTitles[key] = titleInput.value.trim();
      state.tailoredProfile = null;
      renderPreview(state.profile, "基础版");
    });
    title.append(number, titleInput);

    const controls = document.createElement("div");
    controls.className = "section-card__controls";
    if (movable) {
      controls.append(
        makeCardButton("上移", () => moveSection(key, -1)),
        makeCardButton("下移", () => moveSection(key, 1))
      );
    }
    if (core.isCustomSectionKey(key)) {
      controls.append(makeCardButton("删除", () => removeCustomSection(key)));
    }
    controls.append(makeCardButton("LLM格式", () => runWithBusy(null, "", () => formatSectionWithLlm(key))));
    head.append(title, controls);

    const textarea = document.createElement("textarea");
    textarea.dataset.section = key;
    textarea.rows = key === "work" || key === "projects" ? 7 : key === "skills" ? 5 : 4;
    textarea.value = state.profile[key] || "";
    textarea.addEventListener("input", () => {
      state.profile[key] = textarea.value;
      state.tailoredProfile = null;
      renderPreview(state.profile, "基础版");
    });

    card.append(head, textarea);
    return card;
  }

  function makeCardButton(label, handler) {
    const button = document.createElement("button");
    button.className = "button button--compact";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function moveSection(key, direction) {
    collectProfileFromEditors();
    const order = core.normalizeSectionOrder(state.profile.sectionOrder, state.profile);
    const index = order.indexOf(key);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= order.length) {
      return;
    }
    [order[index], order[next]] = [order[next], order[index]];
    state.profile.sectionOrder = order;
    if (state.tailoredProfile) {
      state.tailoredProfile.sectionOrder = order;
    }
    renderSectionEditor();
    renderPreview(state.tailoredProfile || state.profile, state.tailoredProfile ? "定制稿" : "基础版");
    saveState();
  }

  function addCustomSection() {
    collectProfileFromEditors();
    const key = core.createCustomSectionKey();
    state.profile.sectionTitles = Object.assign({}, state.profile.sectionTitles, { [key]: "自定义模块" });
    state.profile.sectionOrder = [...core.normalizeSectionOrder(state.profile.sectionOrder, state.profile), key];
    state.profile[key] = "";
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "基础版");
    saveState();
  }

  function removeCustomSection(key) {
    if (!core.isCustomSectionKey(key)) {
      return;
    }
    collectProfileFromEditors();
    delete state.profile[key];
    if (state.profile.sectionTitles) {
      delete state.profile.sectionTitles[key];
    }
    state.profile.sectionOrder = core.normalizeSectionOrder(state.profile.sectionOrder, state.profile).filter((item) => item !== key);
    state.tailoredProfile = null;
    renderSectionEditor();
    renderPreview(state.profile, "基础版");
    saveState();
  }

  function renderPreview(profile, label) {
    const template = els.resumeTemplate.value || core.normalizeTemplateId(profile && profile.template);
    els.resumeTemplate.value = template;
    els.preview.innerHTML = core.renderResumeHtml(Object.assign({}, profile, { template }), template);
    els.previewState.textContent = label;
  }

  function renderKeywords() {
    els.keywords.innerHTML = "";
    normalizeKeywordItems(state.keywords).slice(0, 24).forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "keyword";
      pill.textContent = item.term;
      els.keywords.appendChild(pill);
    });
  }

  function setSuggestions(items) {
    els.suggestions.innerHTML = "";
    normalizeSuggestionList(items).forEach((item) => {
      const node = document.createElement("div");
      node.className = "suggestion";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const body = document.createElement("span");
      body.textContent = item.body;
      node.append(title, body);
      els.suggestions.appendChild(node);
    });
  }

  async function saveState() {
    collectProfileFromEditors();
    await chrome.storage.local.set({
      resumeProfile: state.profile,
      rawResumeText: els.rawResume.value,
      currentJD: Object.assign({}, state.jd || {}, { text: els.jdText.value }),
      tailoredProfile: state.tailoredProfile,
      llmSettings: readSettingsFromInputs()
    });
    state.llmSettings = readSettingsFromInputs();
    updateResumeState();
    updateJdState();
    updateLlmState();
    setFileStatus("已保存到浏览器本地。");
  }

  async function saveSettings() {
    state.llmSettings = readSettingsFromInputs();
    await chrome.storage.local.set({ llmSettings: state.llmSettings });
    updateLlmState();
    setFileStatus("模型设置已保存。");
  }

  async function testLlmConnection() {
    const content = await callLlm([
      { role: "system", content: "你只返回 JSON。" },
      { role: "user", content: '返回 {"ok": true, "message": "connected"}' }
    ]);
    const data = parseJsonFromText(content);
    if (!data.ok) {
      throw new Error("模型返回异常，请检查配置。");
    }
    setSuggestions([{ title: "模型连接成功", body: data.message || "已收到模型响应。" }]);
  }

  async function exportPdf() {
    collectProfileFromEditors();
    const profile = Object.assign({}, state.tailoredProfile || state.profile, { template: els.resumeTemplate.value });
    await chrome.storage.local.set({ exportResume: profile });
    await chrome.tabs.create({ url: chrome.runtime.getURL("export.html") });
  }

  function exportWord() {
    collectProfileFromEditors();
    const profile = Object.assign({}, state.tailoredProfile || state.profile, { template: els.resumeTemplate.value });
    core.downloadWord(profile, "tailored-resume", els.resumeTemplate.value);
  }

  function updateResumeState() {
    const filled = core.getAllSectionKeys(state.profile).filter((key) => core.cleanText(state.profile[key])).length;
    els.resumeState.textContent = filled ? `已解析 ${filled} 项` : "未解析";
  }

  function updateJdState() {
    const text = core.cleanText(els.jdText.value);
    els.jdState.textContent = text ? `${text.length} 字符` : "未载入";
  }

  function updateAvatarPreview() {
    const avatar = state.profile.avatarDataUrl || "";
    if (avatar) {
      els.avatarPreview.src = avatar;
      els.avatarPreview.classList.add("is-visible");
    } else {
      els.avatarPreview.removeAttribute("src");
      els.avatarPreview.classList.remove("is-visible");
    }
  }

  function updateLlmState() {
    const settings = readSettingsFromInputs();
    els.llmState.textContent = settings.baseUrl && settings.model && settings.apiKey ? "已配置" : "未配置";
  }

  function setFileStatus(message) {
    els.fileStatus.textContent = message;
  }

  async function runWithBusy(button, busyText, task) {
    const target = button || document.activeElement;
    const originalText = target && target.textContent;
    try {
      if (target && target.tagName === "BUTTON") {
        target.disabled = true;
        if (busyText) {
          target.textContent = busyText;
        }
      }
      await task();
    } catch (error) {
      setSuggestions([{ title: "操作失败", body: error.message || "请检查配置或输入内容。" }]);
    } finally {
      if (target && target.tagName === "BUTTON") {
        target.disabled = false;
        if (originalText) {
          target.textContent = originalText;
        }
      }
    }
  }

  function readSettingsFromInputs() {
    return {
      baseUrl: els.llmBaseUrl.value.trim(),
      model: els.llmModel.value.trim(),
      apiKey: els.llmApiKey.value.trim()
    };
  }

  async function callLlm(messages) {
    const settings = readSettingsFromInputs();
    validateLlmSettings(settings);
    await ensureLlmHostAccess(settings.baseUrl);
    const endpoint = toChatCompletionsUrl(settings.baseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`模型调用失败：HTTP ${response.status} ${limitText(errorText, 240)}`);
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";
    if (!content) {
      throw new Error("模型响应为空。");
    }
    return content;
  }

  function validateLlmSettings(settings) {
    if (!settings.baseUrl || !settings.model || !settings.apiKey) {
      throw new Error("请先填写 Base URL、Model 和 API Key。");
    }
    try {
      new URL(settings.baseUrl);
    } catch (error) {
      throw new Error("Base URL 格式无效。");
    }
  }

  async function ensureLlmHostAccess(baseUrl) {
    if (!chrome.permissions) {
      return;
    }
    const origin = new URL(baseUrl).origin + "/*";
    const hasAccess = await chrome.permissions.contains({ origins: [origin] });
    if (hasAccess) {
      return;
    }
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      throw new Error("未授权访问模型服务地址。");
    }
  }

  function toChatCompletionsUrl(baseUrl) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/chat/completions`;
  }

  function parseJsonFromText(value) {
    const text = String(value || "").trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;
    try {
      return JSON.parse(candidate);
    } catch (error) {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }
      throw new Error("模型未返回有效 JSON。");
    }
  }

  function mergeLlmProfile(llmProfile) {
    const base = core.normalizeProfile(state.profile);
    const incoming = llmProfile && typeof llmProfile === "object" ? llmProfile : {};
    core.getAllSectionKeys(Object.assign({}, base, incoming)).forEach((key) => {
      if (typeof incoming[key] === "string") {
        base[key] = incoming[key].trim();
      }
    });
    if (Array.isArray(incoming.sectionOrder)) {
      base.sectionOrder = core.normalizeSectionOrder(incoming.sectionOrder, Object.assign({}, base, incoming));
    }
    if (incoming.sectionTitles && typeof incoming.sectionTitles === "object") {
      base.sectionTitles = Object.assign({}, base.sectionTitles, incoming.sectionTitles);
    }
    if (incoming.template) {
      base.template = core.normalizeTemplateId(incoming.template);
    }
    base.avatarDataUrl = state.profile.avatarDataUrl;
    base.raw = state.profile.raw;
    return base;
  }

  function serializeProfileForLlm(profile) {
    const data = core.normalizeProfile(profile);
    const payload = {};
    core.getAllSectionKeys(data).forEach((key) => {
      payload[key] = limitText(data[key], 6000);
    });
    payload.sectionOrder = data.sectionOrder;
    payload.sectionTitles = data.sectionTitles;
    payload.template = data.template;
    return payload;
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function normalizeKeywordItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item, index) => {
        if (typeof item === "string") {
          return { term: item, score: items.length - index };
        }
        return { term: String(item.term || "").trim(), score: Number(item.score || 0) };
      })
      .filter((item) => item.term);
  }

  function normalizeSuggestionList(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => {
        if (typeof item === "string") {
          return { title: "建议", body: item };
        }
        return {
          title: String(item.title || "建议").trim(),
          body: String(item.body || item.content || "").trim()
        };
      })
      .filter((item) => item.body);
  }

  function sectionSuggestions(title, value) {
    const list = normalizeStringList(value);
    if (!list.length) {
      return [];
    }
    return [{
      title,
      body: list.slice(0, 6).join("；")
    }];
  }

  function limitText(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}\n[内容过长，已截断]`;
  }
})();
