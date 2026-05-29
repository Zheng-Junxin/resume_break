(function () {
  if (window.__resumeTailorAutopilotLoaded) {
    return;
  }
  window.__resumeTailorAutopilotLoaded = true;

  const APPLY_ENTRY_LABELS = [
    "立即申请", "申请职位", "投递简历", "立即投递", "我要申请", "申请", "投递",
    "apply now", "easy apply", "quick apply", "apply"
  ];
  const SAVED_RESUME_LABELS = [
    "使用在线简历", "使用默认简历", "使用已上传简历", "选择已有简历", "选择在线简历",
    "use existing resume", "use saved resume", "use my resume", "continue with profile",
    "apply with profile", "resume on file"
  ];
  const NEXT_STEP_LABELS = [
    "下一步", "继续", "保存并继续", "继续申请", "查看申请", "确认信息", "下一页",
    "next", "continue", "save and continue", "review", "confirm details"
  ];
  const FINAL_SUBMIT_LABELS = [
    "提交申请", "确认投递", "确认申请", "发送申请", "最终提交", "完成投递", "提交", "投递",
    "submit application", "submit", "send application", "complete application", "apply"
  ];
  const UNSAFE_CONTROL_PATTERN = /收藏|保存职位|分享|取消|返回|关闭|删除|移除|撤回|登录|注册|save job|share|cancel|back|close|remove|delete|withdraw|sign in|log in|register/i;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === "AUTOPILOT_EXTRACT_JOB_LINKS") {
      sendResponse({ ok: true, links: extractJobLinks() });
      return true;
    }

    if (message.type === "AUTOPILOT_APPLY_JOB") {
      applyToCurrentJob(message.payload || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({
          ok: false,
          error: error && error.message ? error.message : "自动投递失败。"
        }));
      return true;
    }

    return false;
  });

  function extractJobLinks() {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const seen = new Set();
    return anchors
      .map((anchor) => {
        const href = normalizeHref(anchor.getAttribute("href"));
        const text = cleanText(anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label") || "");
        const nearby = cleanText(anchor.closest("article, li, section, div")?.innerText || "");
        return {
          href,
          text: text || nearby.slice(0, 120),
          snippet: nearby.slice(0, 400),
          sourceUrl: location.href
        };
      })
      .filter((item) => {
        if (!/^https?:\/\//i.test(item.href) || seen.has(item.href)) {
          return false;
        }
        seen.add(item.href);
        const haystack = `${item.href} ${item.text} ${item.snippet}`.toLowerCase();
        if (/login|signin|signup|register|privacy|policy|help|support|account|passport|登录|注册|隐私|帮助/.test(haystack)) {
          return false;
        }
        return /job|jobs|career|position|recruit|apply|zhaopin|liepin|lagou|boss|careerbuilder|职位|岗位|招聘|工程师|实习|开发|产品|运营/.test(haystack);
      })
      .slice(0, 80);
  }

  function normalizeHref(rawHref) {
    try {
      const url = new URL(rawHref || "", location.href);
      const unwrapped = unwrapRedirectUrl(url);
      unwrapped.hash = "";
      return unwrapped.href;
    } catch (error) {
      return "";
    }
  }

  function unwrapRedirectUrl(url) {
    const keys = ["url", "u", "q", "target", "redirect", "redirect_url", "redirectUrl", "to"];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (!value) {
        continue;
      }
      const decoded = decodeMaybeUrl(value);
      if (/^https?:\/\//i.test(decoded)) {
        return new URL(decoded);
      }
    }
    return url;
  }

  function decodeMaybeUrl(value) {
    try {
      const decoded = decodeURIComponent(value);
      if (/^https?:\/\//i.test(decoded)) {
        return decoded;
      }
      const candidate = decoded.startsWith("a1") ? decoded.slice(2) : decoded;
      const base64 = candidate.replace(/-/g, "+").replace(/_/g, "/");
      try {
        const unwrapped = atob(base64);
        return /^https?:\/\//i.test(unwrapped) ? unwrapped : decoded;
      } catch (error) {
        return decoded;
      }
    } catch (error) {
      return value;
    }
  }

  async function applyToCurrentJob(payload) {
    const candidate = payload.candidate || {};
    const coverLetter = payload.coverLetter || "";
    const autoSubmit = Boolean(payload.autoSubmit);
    const maxSteps = Math.min(10, Math.max(1, Number(payload.maxSteps) || 6));
    const actions = [];
    let filledCount = 0;
    let submitted = false;
    let needsManualFileUpload = false;
    let needsLogin = detectLoginWall();
    let blockingRequiredFields = false;

    for (let step = 0; step < maxSteps; step += 1) {
      if (needsLogin) {
        break;
      }

      const before = document.body ? document.body.innerText.length : 0;
      const savedResumeClicked = clickSavedResumeOption(actions);
      if (savedResumeClicked) {
        await wait(900);
      }

      if (step === 0) {
        const initialApply = findControl(APPLY_ENTRY_LABELS);
        if (initialApply) {
          clickElement(initialApply);
          actions.push("clicked_apply_entry");
          await wait(1400);
        }
      }

      const filled = fillApplicationFields(candidate, coverLetter);
      filledCount += filled.count;
      actions.push(...filled.actions);

      clickSavedResumeOption(actions);
      needsLogin = detectLoginWall();
      needsManualFileUpload = hasVisibleFileInput();
      blockingRequiredFields = hasBlockingRequiredFields();

      if (needsLogin || needsManualFileUpload) {
        break;
      }

      if (autoSubmit && !blockingRequiredFields) {
        const submit = findControl(FINAL_SUBMIT_LABELS);
        if (submit) {
          clickElement(submit);
          submitted = true;
          actions.push("clicked_final_submit");
          await wait(1000);
          break;
        }
      }

      const next = findControl(NEXT_STEP_LABELS);
      if (next && !blockingRequiredFields) {
        clickElement(next);
        actions.push("clicked_next_step");
        await wait(1200);
        continue;
      }

      const after = document.body ? document.body.innerText.length : 0;
      if (before === after || blockingRequiredFields) {
        break;
      }
      await wait(500);
    }

    const unresolvedRequiredFields = !submitted && hasBlockingRequiredFields();
    return {
      url: location.href,
      title: cleanText(document.title || ""),
      actions,
      filledCount,
      needsManualFileUpload,
      needsLogin,
      blockingRequiredFields: unresolvedRequiredFields,
      submitted,
      status: submitted
        ? "submitted"
        : needsLogin
          ? "needs_login"
          : needsManualFileUpload
            ? "needs_manual_resume_upload"
            : unresolvedRequiredFields
              ? "needs_manual_required_fields"
              : "prepared"
    };
  }

  function clickSavedResumeOption(actions) {
    const control = findControl(SAVED_RESUME_LABELS);
    if (!control) {
      return false;
    }
    clickElement(control);
    actions.push("clicked_saved_resume_option");
    return true;
  }

  function hasVisibleFileInput() {
    return Array.from(document.querySelectorAll("input[type='file']")).some(isVisible);
  }

  function detectLoginWall() {
    const passwordField = Array.from(document.querySelectorAll("input[type='password']")).some(isVisible);
    if (passwordField) {
      return true;
    }
    const body = cleanText(document.body ? document.body.innerText : "").toLowerCase();
    return /登录后|请登录|注册后|sign in to apply|log in to apply|create an account|login to apply/.test(body);
  }

  function hasBlockingRequiredFields() {
    const fields = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((field) => isVisible(field) && !field.disabled && !field.readOnly);
    return fields.some((field) => {
      const required = field.required || field.getAttribute("aria-required") === "true";
      if (!required || field.type === "hidden" || field.type === "button" || field.type === "submit") {
        return false;
      }
      if (field.type === "file") {
        return true;
      }
      if (field.type === "checkbox" || field.type === "radio") {
        if (field.name) {
          const group = Array.from(document.querySelectorAll(`input[name='${CSS.escape(field.name)}']`));
          return !group.some((item) => item.checked);
        }
        return !field.checked;
      }
      return !String(field.value || "").trim();
    });
  }

  function fillApplicationFields(candidate, coverLetter) {
    const actions = [];
    let count = 0;
    const fields = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']")).filter(isVisible);
    fields.forEach((field) => {
      if (field.disabled || field.readOnly || field.type === "file" || field.type === "hidden") {
        return;
      }
      if (field.type === "checkbox" || field.type === "radio" || field.type === "button" || field.type === "submit") {
        return;
      }
      const descriptor = getFieldDescriptor(field);
      const value = pickFieldValue(descriptor, candidate, coverLetter, field);
      if (!value) {
        return;
      }
      setNativeValue(field, value);
      count += 1;
      actions.push(`filled_${descriptor.slice(0, 24) || field.tagName.toLowerCase()}`);
    });
    return { actions, count };
  }

  function pickFieldValue(descriptor, candidate, coverLetter, field) {
    const text = descriptor.toLowerCase();
    const nameParts = splitName(candidate.name || "");
    if (/first name|given name|名\b|名字/.test(text)) {
      return nameParts.first || candidate.name || "";
    }
    if (/last name|family name|surname|姓\b/.test(text)) {
      return nameParts.last || candidate.name || "";
    }
    if (/姓名|名字|name|full name/.test(text)) {
      return candidate.name || "";
    }
    if (/邮箱|邮件|email|e-mail/.test(text)) {
      return candidate.email || "";
    }
    if (/手机|电话|联系方式|phone|mobile|tel/.test(text)) {
      return candidate.phone || "";
    }
    if (/linkedin|领英|portfolio|github|作品|主页|website|url|link/.test(text)) {
      return candidate.portfolio || "";
    }
    if (field.tagName.toLowerCase() === "textarea" || field.isContentEditable || /求职信|自我介绍|cover|message|intro|summary/.test(text)) {
      return coverLetter || "";
    }
    return "";
  }

  function splitName(name) {
    const clean = cleanText(name);
    if (!clean) {
      return { first: "", last: "" };
    }
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return { first: clean, last: clean };
    }
    return {
      first: parts.slice(0, -1).join(" "),
      last: parts[parts.length - 1]
    };
  }

  function getFieldDescriptor(field) {
    const attrs = [
      field.name,
      field.id,
      field.placeholder,
      field.getAttribute("aria-label"),
      field.getAttribute("autocomplete"),
      field.getAttribute("data-testid")
    ];
    const id = field.id;
    if (id) {
      const label = document.querySelector(`label[for='${CSS.escape(id)}']`);
      if (label) {
        attrs.push(label.innerText || label.textContent || "");
      }
    }
    const parentLabel = field.closest("label");
    if (parentLabel) {
      attrs.push(parentLabel.innerText || parentLabel.textContent || "");
    }
    const container = field.closest("[aria-label], [data-label], .field, .form-group, .ant-form-item, .el-form-item");
    if (container) {
      attrs.push(container.getAttribute("aria-label") || container.getAttribute("data-label") || container.innerText || "");
    }
    return cleanText(attrs.filter(Boolean).join(" "));
  }

  function findControl(labels) {
    const controls = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']"))
      .filter(isVisible)
      .filter((control) => !control.disabled && control.getAttribute("aria-disabled") !== "true");
    const normalizedLabels = labels.map((label) => label.toLowerCase());
    return controls
      .map((control) => {
        const text = cleanText(control.innerText || control.textContent || control.value || control.getAttribute("aria-label") || "").toLowerCase();
        return { control, text, score: scoreControl(text, normalizedLabels) };
      })
      .filter((item) => item.score > 0 && !UNSAFE_CONTROL_PATTERN.test(item.text))
      .sort((a, b) => b.score - a.score)[0]?.control || null;
  }

  function scoreControl(text, labels) {
    if (!text) {
      return 0;
    }
    let score = 0;
    labels.forEach((label) => {
      if (text === label) {
        score = Math.max(score, 100);
      } else if (text.includes(label)) {
        score = Math.max(score, 50 + label.length);
      }
    });
    return score;
  }

  function clickElement(element) {
    element.scrollIntoView({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.click();
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  function setNativeValue(field, value) {
    field.focus();
    if (field.isContentEditable) {
      field.textContent = value;
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(field, value);
      } else {
        field.value = value;
      }
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
