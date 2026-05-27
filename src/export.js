(function () {
  const core = window.ResumeCore;
  const root = document.getElementById("export-root");
  const printButton = document.getElementById("print-pdf");
  const wordButton = document.getElementById("download-word");
  let exportProfile = core.emptyProfile();

  document.addEventListener("DOMContentLoaded", async () => {
    const stored = await chrome.storage.local.get(["exportResume", "tailoredProfile", "resumeProfile"]);
    exportProfile = stored.exportResume || stored.tailoredProfile || stored.resumeProfile || core.emptyProfile();
    root.innerHTML = core.renderResumeHtml(exportProfile);
  });

  printButton.addEventListener("click", () => {
    window.print();
  });

  wordButton.addEventListener("click", () => {
    core.downloadWord(exportProfile, "tailored-resume");
  });
})();
