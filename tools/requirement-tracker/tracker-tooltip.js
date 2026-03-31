(function () {
  function createTooltipManager(itemData, helpers) {
    const formatNumber = helpers.formatNumber;
    const getRarityClass = helpers.getRarityClass;
    const floatingTooltip = createFloatingTooltip();

    function buildTooltipContent(itemName, item) {
      const tooltip = document.createElement("div");
      const header = document.createElement("span");
      header.className = "tooltip-header";

      if (item.imageUrl) {
        const icon = document.createElement("img");
        icon.className = "item-icon";
        icon.src = item.imageUrl;
        icon.alt = itemName;
        icon.loading = "lazy";
        header.appendChild(icon);
      }

      const titleWrap = document.createElement("span");
      const title = document.createElement("p");
      title.className = "tooltip-title";
      title.textContent = itemName;
      const rarity = document.createElement("p");
      rarity.className = "tooltip-rarity";
      rarity.textContent = item.rarity;
      titleWrap.append(title, rarity);
      header.appendChild(titleWrap);
      tooltip.appendChild(header);

      const details = document.createElement("dl");
      details.className = "tooltip-grid";
      appendDetail(details, "Category", item.category);
      appendDetail(details, "Sell Price", formatNumber(item.sellPrice));
      appendDetail(details, "Stack Size", item.stackSize);
      appendDetail(details, "Found In", item.foundIn && item.foundIn.length ? item.foundIn.join(" | ") : "Unknown");
      appendListDetail(details, "Recycles To", item.recycleEntries || [], item.recycleStatus || "None", itemData);
      appendListDetail(details, "Uses", item.usesEntries || [], "None", itemData);
      tooltip.appendChild(details);

      return tooltip;
    }

    function showTooltip(itemName, item, anchor) {
      floatingTooltip.className = "floating-tooltip visible " + getRarityClass(item.rarity);
      floatingTooltip.innerHTML = "";
      floatingTooltip.appendChild(buildTooltipContent(itemName, item));
      positionTooltip(anchor);
    }

    function positionTooltip(anchor) {
      if (!floatingTooltip.classList.contains("visible")) {
        return;
      }

      const margin = 12;
      const rect = anchor.getBoundingClientRect();
      const tooltipRect = floatingTooltip.getBoundingClientRect();

      let left = rect.right + margin;
      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = Math.max(margin, rect.left - tooltipRect.width - margin);
      }

      let top = rect.bottom + margin;
      if (top + tooltipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - tooltipRect.height - margin);
      }

      floatingTooltip.style.left = left + "px";
      floatingTooltip.style.top = top + "px";
    }

    function hideTooltip() {
      floatingTooltip.className = "floating-tooltip";
      floatingTooltip.innerHTML = "";
    }

    return {
      element: floatingTooltip,
      hideTooltip: hideTooltip,
      positionTooltip: positionTooltip,
      showTooltip: showTooltip,
    };
  }

  function createFloatingTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "floating-tooltip";
    return tooltip;
  }

  function appendDetail(container, label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = formatDetailValue(value);
    container.append(dt, dd);
  }

  function appendListDetail(container, label, entries, fallbackText, itemData) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");

    if (!entries.length) {
      dd.textContent = fallbackText;
      container.append(dt, dd);
      return;
    }

    const list = document.createElement("ul");
    list.className = "tooltip-list";

    entries.forEach(function (entry) {
      list.appendChild(buildTooltipListItem(entry, itemData));
    });

    dd.appendChild(list);
    container.append(dt, dd);
  }

  function buildTooltipListItem(entry, itemData) {
    const item = document.createElement("li");

    if (typeof entry === "string") {
      item.textContent = entry;
      return item;
    }

    if (entry.item) {
      const row = document.createElement("span");
      row.className = "tooltip-list-item";
      const itemInfo = itemData[entry.item] || null;

      const text = document.createElement("span");
      text.textContent = entry.text;
      row.appendChild(text);

      if (itemInfo && itemInfo.imageUrl) {
        const icon = document.createElement("img");
        icon.className = "tooltip-list-icon";
        icon.src = itemInfo.imageUrl;
        icon.alt = entry.item;
        icon.loading = "lazy";
        row.appendChild(icon);
      }
      item.appendChild(row);
      return item;
    }

    if (entry.category) {
      const category = document.createElement("span");
      category.className = "tooltip-list-category";
      category.textContent = entry.category + ": ";
      item.appendChild(category);
    }
    item.appendChild(document.createTextNode(entry.text));
    return item;
  }

  function formatDetailValue(value) {
    if (value && value.trim) {
      return value.trim() || "None";
    }
    return value || "None";
  }

  window.RequirementTrackerTooltip = {
    createTooltipManager: createTooltipManager,
  };
})();
