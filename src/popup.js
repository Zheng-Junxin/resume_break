(function () {
  const status = document.getElementById("status");
  const captureOpen = document.getElementById("capture-open");
  const openWorkspace = document.getElementById("open-workspace");

  captureOpen.addEventListener("click", async () => {
    setStatus("正在抓取当前页面 JD...");
    try {
      const jd = await captureFromActiveTab();
      await chrome.storage.local.set({ currentJD: jd });
      setStatus("已抓取 JD，正在打开工作台。");
      await openApp();
    } catch (error) {
      setStatus(error.message || "抓取失败，可以打开工作台后手动粘贴 JD。");
    }
  });

  openWorkspace.addEventListener("click", async () => {
    await openApp();
  });

  async function captureFromActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id || !/^https?:\/\//i.test(tab.url || "")) {
      throw new Error("当前页面不支持抓取，请在招聘 JD 网页中使用。");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, { type: "RESUME_TAILOR_EXTRACT_JD" });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "页面未返回 JD 内容。");
    }
    return response.jd;
  }

  async function openApp() {
    await chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  }

  function setStatus(message) {
    status.textContent = message;
  }
})();
