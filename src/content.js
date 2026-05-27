(function () {
  if (window.__jdResumeTailorContentLoaded) {
    return;
  }

  window.__jdResumeTailorContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "RESUME_TAILOR_EXTRACT_JD") {
      return false;
    }

    try {
      sendResponse({
        ok: true,
        jd: extractJobDescription()
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "无法读取页面内容"
      });
    }
    return true;
  });

  function extractJobDescription() {
    const title = extractTitle();
    const text = pickBestText();
    return {
      title,
      url: location.href,
      capturedAt: new Date().toISOString(),
      text
    };
  }

  function extractTitle() {
    const headings = Array.from(document.querySelectorAll("h1, h2"))
      .map((node) => cleanText(node.innerText || node.textContent || ""))
      .filter(Boolean);
    return headings[0] || cleanText(document.title || "岗位 JD");
  }

  function pickBestText() {
    const selectors = [
      "main",
      "article",
      "[role='main']",
      "[class*='job']",
      "[id*='job']",
      "[class*='description']",
      "[id*='description']",
      "[class*='position']",
      "[id*='position']",
      "[class*='detail']",
      "[id*='detail']",
      "[class*='content']"
    ];

    const candidates = [];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!isVisible(node)) {
          return;
        }
        const text = cleanText(node.innerText || node.textContent || "");
        if (text.length >= 180) {
          candidates.push({ node, text, score: scoreCandidate(text) });
        }
      });
    });

    const bodyText = cleanText(document.body ? document.body.innerText : "");
    candidates.push({ node: document.body, text: bodyText, score: scoreCandidate(bodyText) - 200 });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] ? candidates[0].text : bodyText;
    return best.slice(0, 24000);
  }

  function scoreCandidate(text) {
    const keywordHits = (text.match(/岗位|职位|职责|要求|资格|经验|技能|任职|薪资|福利|responsibilities|qualifications|requirements|experience|skills|job description/gi) || []).length;
    const navigationNoise = (text.match(/登录|注册|分享|收藏|cookie|privacy|导航|首页|footer|subscribe/gi) || []).length;
    return Math.min(text.length, 9000) + keywordHits * 450 - navigationNoise * 80;
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
})();
