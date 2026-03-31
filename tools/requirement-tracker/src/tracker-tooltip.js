(function () {
  function createTooltipManager(catalogs, helpers) {
    const itemData = catalogs.items || {};
    const formatNumber = helpers.formatNumber;
    const getRarityClass = helpers.getRarityClass;
    const floatingTooltip = createFloatingTooltip();

    function buildTooltipHeader(entryName, imageUrl, rarity, modSlots) {
      const header = document.createElement("span");
      header.className = "tooltip-header";

      if (imageUrl) {
        const icon = document.createElement("img");
        icon.className = "item-icon";
        icon.src = imageUrl;
        icon.alt = entryName;
        icon.loading = "lazy";
        header.appendChild(icon);
      }

      const titleWrap = document.createElement("span");
      titleWrap.className = "tooltip-title-wrap" + (modSlots && modSlots.length ? " with-mod-slots" : "");

      const titleMeta = document.createElement("span");
      titleMeta.className = "tooltip-title-meta" + (rarity ? " " + getRarityClass(rarity) : "");

      const title = document.createElement("p");
      title.className = "tooltip-title";
      title.textContent = entryName;
      titleMeta.appendChild(title);

      if (rarity) {
        const rarityElement = document.createElement("p");
        rarityElement.className = "tooltip-rarity";
        rarityElement.textContent = rarity;
        titleMeta.appendChild(rarityElement);
      }

      titleWrap.appendChild(titleMeta);

      if (modSlots && modSlots.length) {
        titleWrap.appendChild(buildModSlotPills(modSlots));
      }

      header.appendChild(titleWrap);
      return header;
    }

    function buildModSlotPills(modSlots) {
      const pills = document.createElement("span");
      pills.className = "tooltip-mod-pills";

      modSlots.forEach(function (modSlot) {
        const pill = document.createElement("span");
        pill.className = "tooltip-mod-pill";
        pill.setAttribute("title", modSlot.name || "");
        pill.setAttribute("aria-label", modSlot.name || "Mod slot");

        if (modSlot.iconUrl) {
          const icon = document.createElement("img");
          icon.className = "tooltip-mod-pill-icon";
          icon.src = modSlot.iconUrl;
          icon.alt = modSlot.name || "";
          icon.loading = "lazy";
          pill.appendChild(icon);
        } else if (modSlot.name) {
          pill.textContent = modSlot.name;
        }

        pills.appendChild(pill);
      });

      return pills;
    }

    function buildItemTooltipContent(itemName, item) {
      const tooltip = document.createElement("div");
      tooltip.appendChild(buildTooltipHeader(itemName, item.imageUrl, item.rarity, []));

      const details = document.createElement("dl");
      details.className = "tooltip-grid";
      appendIconEntryDetail(details, "Category", item.category, item.categoryIconUrl, "None");
      appendIconEntryDetail(details, "Sell Price", formatNumber(item.sellPrice), item.sellPriceIconUrl, "None");
      appendDetail(details, "Stack Size", item.stackSize);
      appendIconEntriesDetail(details, "Found In", item.foundInEntries || item.foundIn || [], "Unknown");
      appendListDetail(details, "Recycles To", item.recycleEntries || [], item.recycleStatus || "None", itemData, getRarityClass);
      appendListDetail(details, "Uses", item.usesEntries || [], "None", itemData, getRarityClass);
      tooltip.appendChild(details);

      return tooltip;
    }

    function buildWeaponTooltipContent(weaponName, weapon) {
      const tooltip = document.createElement("div");
      tooltip.appendChild(buildTooltipHeader(
        weaponName,
        weapon.imageUrl,
        weapon.rarity,
        weapon.modSlots || []
      ));

      const details = document.createElement("dl");
      details.className = "tooltip-grid";
      appendDetail(details, "Type", weapon.type);
      appendIconEntryDetail(details, "Ammo Type", weapon.ammoType, weapon.ammoTypeIconUrl, "None");
      appendDetail(details, "Firing Mode", weapon.firingMode);
      appendDetail(details, "Damage", formatNumber(weapon.damage));
      appendDetail(details, "Fire Rate", formatNumber(weapon.fireRate));
      appendDetail(details, "Relative DPS", formatNumber(weapon.relativeDps));
      appendDetail(details, "Range", formatNumber(weapon.range));
      tooltip.appendChild(details);

      return tooltip;
    }

    function buildTooltipContent(entryName, catalogEntry) {
      if (catalogEntry.kind === "weapon") {
        return buildWeaponTooltipContent(entryName, catalogEntry.data);
      }
      return buildItemTooltipContent(entryName, catalogEntry.data);
    }

    function showTooltip(entryName, catalogEntry, anchor) {
      const rarityClass = getRarityClass(catalogEntry.data.rarity || "");
      floatingTooltip.className = "floating-tooltip visible" + (rarityClass ? " " + rarityClass : "");
      floatingTooltip.innerHTML = "";
      floatingTooltip.appendChild(buildTooltipContent(entryName, catalogEntry));
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

  function appendIconEntryDetail(container, label, text, iconUrl, fallbackText) {
    const entries = text ? [{ text: text, iconUrl: iconUrl || "" }] : [];
    appendIconEntriesDetail(container, label, entries, fallbackText || "None");
  }

  function appendIconEntriesDetail(container, label, entries, fallbackText) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    const normalizedEntries = normalizeIconEntries(entries);

    if (!normalizedEntries.length) {
      dd.textContent = fallbackText;
      container.append(dt, dd);
      return;
    }

    const row = document.createElement("span");
    row.className = "tooltip-detail-inline" + (normalizedEntries.length > 1 ? " is-multi" : "");

    normalizedEntries.forEach(function (entry) {
      const entryElement = document.createElement("span");
      entryElement.className = "tooltip-detail-entry";

      const text = document.createElement("span");
      text.className = "tooltip-detail-entry-text";
      text.textContent = entry.text;
      entryElement.appendChild(text);

      if (entry.iconUrl) {
        const icon = document.createElement("img");
        icon.className = "tooltip-detail-icon";
        icon.src = entry.iconUrl;
        icon.alt = entry.text;
        icon.loading = "lazy";
        entryElement.appendChild(icon);
      }

      row.appendChild(entryElement);
    });

    dd.appendChild(row);
    container.append(dt, dd);
  }

  function appendListDetail(container, label, entries, fallbackText, itemData, getRarityClass) {
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
      list.appendChild(buildTooltipListItem(entry, itemData, getRarityClass));
    });

    dd.appendChild(list);
    container.append(dt, dd);
  }

  function buildTooltipListItem(entry, itemData, getRarityClass) {
    const item = document.createElement("li");

    if (typeof entry === "string") {
      item.textContent = entry;
      return item;
    }

    if (entry.item) {
      const row = document.createElement("span");
      row.className = "tooltip-list-item";
      const itemInfo = itemData[entry.item] || null;
      const rarityClass = itemInfo && itemInfo.rarity ? getRarityClass(itemInfo.rarity) : "";
      if (rarityClass) {
        row.className += " " + rarityClass;
      }

      const text = document.createElement("span");
      text.textContent = entry.text;
      row.appendChild(text);

      if (entry.iconUrl || (itemInfo && itemInfo.imageUrl)) {
        const icon = document.createElement("img");
        icon.className = "tooltip-list-icon";
        icon.src = entry.iconUrl || itemInfo.imageUrl;
        icon.alt = entry.item;
        icon.loading = "lazy";
        row.appendChild(icon);
      }
      item.appendChild(row);
      return item;
    }

    if (entry.iconUrl) {
      const row = document.createElement("span");
      row.className = "tooltip-list-item";

      const text = document.createElement("span");
      text.textContent = entry.text;
      row.appendChild(text);

      const icon = document.createElement("img");
      icon.className = "tooltip-list-icon";
      icon.src = entry.iconUrl;
      icon.alt = entry.text || "";
      icon.loading = "lazy";
      row.appendChild(icon);

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

  function normalizeIconEntries(entries) {
    return (entries || [])
      .map(function (entry) {
        if (!entry) {
          return null;
        }
        if (typeof entry === "string") {
          return { text: formatDetailValue(entry), iconUrl: "" };
        }

        const text = formatDetailValue(entry.text || entry.label || entry.name || "");
        if (!text || text === "None") {
          return null;
        }

        return {
          text: text,
          iconUrl: entry.iconUrl || "",
        };
      })
      .filter(Boolean);
  }

  window.RequirementTrackerTooltip = {
    createTooltipManager: createTooltipManager,
  };
})();
