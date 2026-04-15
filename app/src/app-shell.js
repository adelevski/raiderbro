(function () {
  const tools = [
    {
      id: "requirement-tracker",
      label: "Requirement Tracker",
      page: "tools/requirement-tracker/index.html",
      icon:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6.5l1.8 1.8L8.8 5"/><path d="M4 12.5l1.8 1.8 3-3.3"/><path d="M4 18.5l1.8 1.8 3-3.3"/></svg>',
    },
    {
      id: "weapon-optimizer",
      label: "Weapon Optimizer",
      page: "tools/weapon-optimizer/index.html",
      icon:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4"/><path d="M12 17.5v4"/><path d="M2.5 12h4"/><path d="M17.5 12h4"/><circle cx="12" cy="12" r="1.8"/></svg>',
    },
  ];

  const toolNav = document.getElementById("tool-nav");
  const toolFrame = document.getElementById("tool-frame");

  function getToolFromHash() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    return tools.find(function (tool) {
      return tool.id === hash;
    }) || tools[0];
  }

  function renderNav(activeToolId) {
    toolNav.innerHTML = "";

    tools.forEach(function (tool) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-button" + (tool.id === activeToolId ? " active" : "");
      button.setAttribute("aria-pressed", tool.id === activeToolId ? "true" : "false");
      button.innerHTML =
        '<span class="nav-icon">' + tool.icon + "</span>" +
        '<span class="nav-copy">' +
        '<span class="nav-label">' + tool.label + "</span>" +
        "</span>";

      button.addEventListener("click", function () {
        if (window.location.hash === "#" + tool.id) {
          return;
        }
        window.location.hash = tool.id;
      });

      toolNav.appendChild(button);
    });
  }

  function renderActiveTool() {
    const activeTool = getToolFromHash();
    if (window.location.hash !== "#" + activeTool.id) {
      window.location.replace("#" + activeTool.id);
      return;
    }

    renderNav(activeTool.id);
    if (toolFrame.getAttribute("src") !== activeTool.page) {
      toolFrame.setAttribute("src", activeTool.page);
    }
    document.title = "Raiderbro | " + activeTool.label;
  }

  window.addEventListener("hashchange", renderActiveTool);
  renderActiveTool();
})();
