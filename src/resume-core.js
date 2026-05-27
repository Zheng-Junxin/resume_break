(function () {
  const BODY_SECTION_KEYS = ["summary", "skills", "work", "projects", "education", "awards"];
  const SECTION_KEYS = ["personal", ...BODY_SECTION_KEYS];

  const SECTION_LABELS = {
    personal: "个人信息",
    summary: "个人评价",
    skills: "专业技能",
    work: "实习 / 工作经历",
    projects: "项目经历",
    education: "教育经历",
    awards: "荣誉 / 证书"
  };

  const SECTION_ALIASES = {
    personal: ["个人信息", "基本信息", "联系方式", "contact", "personal information", "profile"],
    summary: ["个人评价", "自我评价", "职业目标", "求职意向", "summary", "objective", "about me"],
    skills: ["专业技能", "技能", "技能清单", "技术栈", "skills", "technical skills"],
    work: ["工作经历", "实习经历", "实践经历", "职业经历", "experience", "work experience", "employment", "internship"],
    projects: ["项目经历", "项目经验", "projects", "project experience"],
    education: ["教育经历", "教育背景", "education", "academic background"],
    awards: ["荣誉", "证书", "获奖", "奖项", "certifications", "certificates", "awards", "honors"]
  };

  const TECH_TERMS = [
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "php", "sql",
    "mysql", "postgresql", "redis", "mongodb", "elasticsearch", "spark", "hadoop",
    "react", "vue", "angular", "node", "express", "next.js", "flask", "django", "fastapi",
    "spring", "spring boot", "docker", "kubernetes", "linux", "git", "ci/cd", "aws", "azure",
    "api", "rest", "graphql", "microservice", "机器学习", "深度学习", "大模型", "自然语言处理",
    "数据分析", "数据挖掘", "数据可视化", "算法", "后端", "前端", "全栈", "测试", "自动化",
    "项目管理", "产品设计", "用户增长", "运营", "跨部门", "沟通", "英文", "文档", "安全",
    "性能优化", "高并发", "分布式", "云服务", "数据库", "接口", "系统设计", "prompt",
    "llm", "rag", "agent", "excel", "power bi", "tableau", "pytorch", "tensorflow"
  ];

  const STOP_WORDS = new Set([
    "and", "the", "for", "with", "from", "that", "this", "you", "are", "will", "our", "your",
    "job", "role", "team", "work", "have", "has", "can", "all", "岗位", "职位", "职责", "要求",
    "任职", "负责", "具备", "相关", "优先", "能力", "经验", "工作", "进行", "以及", "能够", "我们"
  ]);

  let pdfJsPromise = null;

  function emptyProfile() {
    return {
      personal: "",
      summary: "",
      skills: "",
      work: "",
      projects: "",
      education: "",
      awards: "",
      raw: "",
      avatarDataUrl: "",
      sectionOrder: defaultSectionOrder()
    };
  }

  function defaultSectionOrder() {
    return BODY_SECTION_KEYS.slice();
  }

  function parseResumeText(rawText) {
    const text = cleanText(rawText);
    const profile = emptyProfile();
    profile.raw = text;
    if (!text) {
      return profile;
    }

    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let current = "personal";
    const buckets = emptyProfile();

    lines.forEach((line) => {
      const section = detectSection(line);
      if (section) {
        current = section;
        return;
      }
      buckets[current] = appendLine(buckets[current], line);
    });

    SECTION_KEYS.forEach((key) => {
      profile[key] = buckets[key].trim();
    });

    if (!hasStructuredContent(profile)) {
      inferProfile(lines, profile);
    } else {
      fillObviousMissingSections(lines, profile);
    }

    profile.sectionOrder = defaultSectionOrder();
    return profile;
  }

  function hasStructuredContent(profile) {
    return SECTION_KEYS.filter((key) => cleanText(profile[key])).length >= 2;
  }

  function inferProfile(lines, profile) {
    const personal = [];
    const skills = [];
    const education = [];
    const work = [];
    const projects = [];
    const awards = [];

    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (index < 6 || /@|\+?\d[\d\s-]{7,}|github|linkedin|邮箱|电话|手机/.test(lower)) {
        personal.push(line);
      } else if (/大学|学院|本科|硕士|博士|学士|gpa|university|college|bachelor|master|phd/i.test(line)) {
        education.push(line);
      } else if (/奖|证书|cert|award|honor|英语|cet|托福|雅思/i.test(line)) {
        awards.push(line);
      } else if (/项目|系统|平台|应用|project|system|platform|app/i.test(line)) {
        projects.push(line);
      } else if (TECH_TERMS.some((term) => lower.includes(term.toLowerCase()))) {
        skills.push(line);
      } else {
        work.push(line);
      }
    });

    profile.personal = uniqueLines(personal).join("\n");
    profile.skills = uniqueLines(skills).join("\n");
    profile.education = uniqueLines(education).join("\n");
    profile.awards = uniqueLines(awards).join("\n");
    profile.projects = uniqueLines(projects).join("\n");
    profile.work = uniqueLines(work).join("\n");
    return profile;
  }

  function fillObviousMissingSections(lines, profile) {
    if (!profile.personal) {
      profile.personal = lines.slice(0, 5).join("\n");
    }

    if (!profile.skills) {
      profile.skills = lines
        .filter((line) => TECH_TERMS.some((term) => line.toLowerCase().includes(term.toLowerCase())))
        .slice(0, 12)
        .join("\n");
    }
  }

  function detectSection(line) {
    const normalized = normalizeHeading(line);
    if (!normalized || normalized.length > 36) {
      return "";
    }

    for (const key of SECTION_KEYS) {
      const aliases = SECTION_ALIASES[key] || [];
      for (const alias of aliases) {
        const normalizedAlias = normalizeHeading(alias);
        if (normalized === normalizedAlias || normalized.includes(normalizedAlias)) {
          return key;
        }
      }
    }
    return "";
  }

  function normalizeHeading(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[：:|｜/\\_\-\s#*·.]/g, "")
      .trim();
  }

  function extractKeywords(text, limit) {
    const clean = cleanText(text).toLowerCase();
    const scores = new Map();

    TECH_TERMS.forEach((term) => {
      const key = term.toLowerCase();
      const hits = countOccurrences(clean, key);
      if (hits > 0) {
        scores.set(term, (scores.get(term) || 0) + hits * 5 + 4);
      }
    });

    const tokens = clean.match(/[a-z][a-z0-9.+#/-]{2,}|[\u4e00-\u9fa5]{2,8}/g) || [];
    tokens.forEach((token) => {
      if (STOP_WORDS.has(token) || token.length > 28) {
        return;
      }
      scores.set(token, (scores.get(token) || 0) + 1);
    });

    return Array.from(scores.entries())
      .map(([term, score]) => ({ term, score }))
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
      .slice(0, limit || 28);
  }

  function tailorResume(profile, jdText) {
    const source = normalizeProfile(profile);
    const keywords = extractKeywords(jdText, 32);
    const keywordTerms = keywords.map((item) => item.term);
    const resumeText = SECTION_KEYS.map((key) => source[key]).join("\n").toLowerCase();
    const matched = keywordTerms.filter((term) => resumeText.includes(term.toLowerCase())).slice(0, 12);
    const missing = keywordTerms.filter((term) => !resumeText.includes(term.toLowerCase())).slice(0, 10);

    const tailored = {
      personal: source.personal,
      summary: buildSummary(source, matched, keywordTerms),
      skills: rankLines(source.skills, keywordTerms).join("\n"),
      work: rankLines(source.work, keywordTerms).join("\n"),
      projects: rankLines(source.projects, keywordTerms).join("\n"),
      education: source.education,
      awards: rankLines(source.awards, keywordTerms).join("\n"),
      raw: source.raw,
      avatarDataUrl: source.avatarDataUrl,
      sectionOrder: rankSectionOrder(source, keywordTerms)
    };

    const suggestions = buildSuggestions(source, keywordTerms, matched, missing);
    return {
      profile: tailored,
      keywords,
      matched,
      missing,
      suggestions
    };
  }

  function rankSectionOrder(profile, keywordTerms) {
    const order = normalizeSectionOrder(profile.sectionOrder);
    return order
      .map((key, index) => ({
        key,
        index,
        score: scoreText(profile[key], keywordTerms)
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.key);
  }

  function buildSummary(profile, matched, allTerms) {
    const base = cleanText(profile.summary);
    const focusTerms = (matched.length ? matched : allTerms.slice(0, 6)).slice(0, 6);
    if (!focusTerms.length) {
      return base;
    }

    const focus = focusTerms.join("、");
    if (base) {
      return `${base}\n岗位匹配重点：突出与 ${focus} 相关的经历、工具和结果指标。`;
    }
    return `围绕 ${focus} 展示与目标岗位相关的能力和经历，重点呈现可验证的项目结果与业务贡献。`;
  }

  function buildSuggestions(profile, keywordTerms, matched, missing) {
    const suggestions = [];
    if (!cleanText(profile.summary)) {
      suggestions.push({
        title: "补充个人评价",
        body: "在简历顶部用 2 到 3 行概括与目标岗位最相关的能力、项目类型和量化结果。"
      });
    }

    if (matched.length) {
      suggestions.push({
        title: "保留并前置匹配内容",
        body: `当前简历已覆盖：${matched.slice(0, 8).join("、")}。这些关键词对应的经历应放在项目或工作经历前半部分。`
      });
    }

    if (missing.length) {
      suggestions.push({
        title: "检查缺失关键词",
        body: `JD 中出现但简历未明显体现：${missing.slice(0, 8).join("、")}。如果真实具备，请补到技能或经历描述中。`
      });
    }

    if (!/\d|%|万|kpi|qps|ms|小时|天|month|year/i.test(profile.work + profile.projects)) {
      suggestions.push({
        title: "增加量化结果",
        body: "项目和经历中尽量加入规模、性能、转化率、准确率、节省时间等数字，提升 ATS 和面试可读性。"
      });
    }

    if (keywordTerms.length && !cleanText(profile.skills)) {
      suggestions.push({
        title: "补齐专业技能",
        body: "把与 JD 直接相关的工具、语言、框架和方法论整理为技能清单，便于招聘方快速扫描。"
      });
    }

    return suggestions.slice(0, 6);
  }

  function rankLines(value, keywordTerms) {
    const lines = splitLines(value);
    if (!lines.length || !keywordTerms.length) {
      return lines;
    }

    return lines
      .map((line, index) => ({
        line,
        index,
        score: scoreText(line, keywordTerms)
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.line);
  }

  function scoreText(value, keywordTerms) {
    const lower = String(value || "").toLowerCase();
    return keywordTerms.reduce((score, term) => {
      return score + (lower.includes(term.toLowerCase()) ? 1 : 0);
    }, 0);
  }

  function renderResumeHtml(profile) {
    const data = normalizeProfile(profile);
    const name = extractName(data.personal) || "姓名";
    const contact = removeFirstLine(data.personal, name);
    const sectionOrder = normalizeSectionOrder(data.sectionOrder);
    const sectionHtml = sectionOrder
      .filter((key) => cleanText(data[key]))
      .map((key) => {
        const lines = splitLines(data[key]);
        const body = lines.length > 1
          ? `<ul>${lines.map((line) => `<li>${escapeHtml(stripBullet(line))}</li>`).join("")}</ul>`
          : `<p>${escapeHtml(lines[0] || "")}</p>`;
        return `<section class="resume__section"><h2>${SECTION_LABELS[key]}</h2>${body}</section>`;
      })
      .join("");

    const avatar = data.avatarDataUrl
      ? `<img class="resume__avatar" src="${escapeAttribute(data.avatarDataUrl)}" alt="头像">`
      : "";

    return [
      '<article class="resume">',
      '<header class="resume__header">',
      '<div class="resume__header-main">',
      `<h1 class="resume__name">${escapeHtml(name)}</h1>`,
      `<div class="resume__contact">${linesToBreaks(contact)}</div>`,
      '</div>',
      avatar,
      '</header>',
      sectionHtml || '<section class="resume__section"><h2>简历内容</h2><p>请先解析或编辑简历内容。</p></section>',
      '</article>'
    ].join("");
  }

  function downloadWord(profile, filename) {
    const html = [
      '<!doctype html>',
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="zh-CN">',
      '<head><meta charset="utf-8"><title>Resume</title>',
      '<style>',
      'body{font-family:Georgia,"Times New Roman","Noto Serif SC",serif;color:#151a22;}',
      '.resume__header{display:flex;gap:18px;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid #1b365d;}',
      '.resume__avatar{width:86px;height:108px;border:1px solid #c7d1df;object-fit:cover;}',
      '.resume__name{margin:0;font-size:30px;line-height:1.15;}',
      '.resume__contact{margin-top:8px;color:#4a5567;font-family:Arial,sans-serif;font-size:12px;}',
      '.resume__section{margin-top:17px;}',
      '.resume__section h2{margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #c7d1df;color:#1b365d;font-family:Arial,sans-serif;font-size:14px;}',
      '.resume__section p,.resume__section li{font-size:13px;line-height:1.55;}',
      '</style></head><body>',
      renderResumeHtml(profile),
      '</body></html>'
    ].join("");

    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeFilename(filename || "tailored-resume") + ".doc";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function extractTextFromFile(file) {
    validateResumeFile(file);
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "docx") {
      return extractDocxText(await file.arrayBuffer());
    }
    if (ext === "pdf") {
      return extractPdfText(await file.arrayBuffer());
    }
    return readFileAsText(file);
  }

  function validateResumeFile(file) {
    if (!file) {
      throw new Error("请选择文件。");
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("文件过大，请使用 8MB 以内的简历文件。");
    }
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["txt", "md", "html", "htm", "doc", "docx", "pdf"].includes(ext)) {
      throw new Error("当前版本支持 TXT、Markdown、HTML、DOC、DOCX、PDF。");
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(cleanText(stripHtml(String(reader.result || ""))));
      reader.onerror = () => reject(new Error("文件读取失败。"));
      reader.readAsText(file, "utf-8");
    });
  }

  async function extractPdfText(buffer) {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: chrome.runtime.getURL("lib/pdfjs/cmaps/"),
      cMapPacked: true,
      useWorkerFetch: false,
      disableFontFace: true
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let currentY = null;
      let currentLine = [];

      content.items.forEach((item) => {
        const y = Math.round(item.transform[5]);
        if (currentY !== null && Math.abs(y - currentY) > 5) {
          lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
          currentLine = [];
        }
        currentY = y;
        if (item.str) {
          currentLine.push(item.str);
        }
      });
      if (currentLine.length) {
        lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
      }
      pages.push(lines.filter(Boolean).join("\n"));
    }
    const text = cleanText(pages.join("\n\n"));
    if (!text) {
      throw new Error("PDF 未提取到可用文本，可能是扫描件图片。请先 OCR 后粘贴文本。");
    }
    return text;
  }

  async function getPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import(chrome.runtime.getURL("lib/pdfjs/pdf.min.mjs")).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }

  async function extractDocxText(buffer) {
    const entries = readZipEntries(new Uint8Array(buffer));
    const documentEntry = entries.find((entry) => entry.name === "word/document.xml");
    if (!documentEntry) {
      throw new Error("未找到 Word 正文内容。");
    }
    const xmlBytes = await decompressZipEntry(documentEntry);
    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"));
    const lines = paragraphs.map((paragraph) => {
      return Array.from(paragraph.getElementsByTagNameNS("*", "t"))
        .map((node) => node.textContent || "")
        .join("");
    }).map((line) => line.trim()).filter(Boolean);
    return cleanText(lines.join("\n"));
  }

  function readZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder("utf-8");
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error("DOCX 文件结构无效。");
    }

    const total = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = [];
    for (let index = 0; index < total; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        break;
      }
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name,
        method,
        compressedSize,
        uncompressedSize,
        data: bytes.slice(dataOffset, dataOffset + compressedSize)
      });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function decompressZipEntry(entry) {
    if (entry.method === 0) {
      return entry.data;
    }
    if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器无法解压该 DOCX，请复制简历文本后粘贴。");
    }

    const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  function normalizeProfile(profile) {
    const data = Object.assign(emptyProfile(), profile || {});
    data.sectionOrder = normalizeSectionOrder(data.sectionOrder);
    return data;
  }

  function normalizeSectionOrder(sectionOrder) {
    const incoming = Array.isArray(sectionOrder) ? sectionOrder : [];
    const seen = new Set();
    const order = [];
    incoming.forEach((key) => {
      if (BODY_SECTION_KEYS.includes(key) && !seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    });
    BODY_SECTION_KEYS.forEach((key) => {
      if (!seen.has(key)) {
        order.push(key);
      }
    });
    return order;
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }

  function splitLines(value) {
    return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function uniqueLines(lines) {
    const seen = new Set();
    return lines.filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function appendLine(current, line) {
    return current ? `${current}\n${line}` : line;
  }

  function countOccurrences(text, term) {
    if (!term) {
      return 0;
    }
    return text.split(term).length - 1;
  }

  function extractName(personal) {
    return splitLines(personal).find((line) => {
      return line.length <= 24 && !/@|电话|手机|邮箱|email|phone|\d{5,}/i.test(line);
    });
  }

  function removeFirstLine(text, firstLine) {
    const lines = splitLines(text);
    if (lines[0] === firstLine) {
      return lines.slice(1).join("\n");
    }
    return lines.join("\n");
  }

  function linesToBreaks(value) {
    return splitLines(value).map(escapeHtml).join("<br>");
  }

  function stripBullet(value) {
    return String(value || "").replace(/^[-*•·]\s*/, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function sanitizeFilename(value) {
    return String(value || "resume")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80);
  }

  window.ResumeCore = {
    SECTION_KEYS,
    BODY_SECTION_KEYS,
    SECTION_LABELS,
    emptyProfile,
    defaultSectionOrder,
    normalizeSectionOrder,
    parseResumeText,
    extractKeywords,
    tailorResume,
    renderResumeHtml,
    downloadWord,
    extractTextFromFile,
    cleanText,
    normalizeProfile
  };
})();
