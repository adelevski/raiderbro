(function () {
  const storageKey = "raiderbro-requirement-tracker-v1";
  const legacyStorageKey = "raiderbro-station-tracker-v1";
  const stateVersion = 2;
  const stateUtils = window.RequirementTrackerState || {};
  const tooltipUtils = window.RequirementTrackerTooltip || {};
  const normalizeTrackerData = stateUtils.normalizeTrackerData;
  const sanitizeState = stateUtils.sanitizeState;
  const arraysEqual = stateUtils.arraysEqual;
  const formatTimestamp = stateUtils.formatTimestamp;
  const createTooltipManager = tooltipUtils.createTooltipManager;
  const rawTrackerData = window.REQUIREMENT_TRACKER_DATA || window.STATION_TRACKER_DATA;
  const itemData = window.ITEM_DATA || {};
  const weaponData = window.WEAPON_DATA || {};

  if (!normalizeTrackerData || !sanitizeState || !arraysEqual || !formatTimestamp || !createTooltipManager) {
    document.body.innerHTML = "<p style='padding:24px;font-family:sans-serif'>Missing tracker runtime scripts. Reload the requirement tracker files.</p>";
    return;
  }

  const trackerData = normalizeTrackerData(rawTrackerData);
  if (!trackerData || !Array.isArray(trackerData.cards)) {
    document.body.innerHTML = "<p style='padding:24px;font-family:sans-serif'>Missing requirement tracker data. Run python scripts/convert_wiki_tables.py first.</p>";
    return;
  }

  const uiIcons = trackerData.uiIcons || { cards: {}, foundIn: {} };
  const state = loadState();
  const cardsGrid = document.getElementById("cards-grid");
  const maxedCount = document.getElementById("maxed-count");
  const openUpgrades = document.getElementById("open-upgrades");
  const shoppingList = document.getElementById("shopping-list");
  const resetButton = document.getElementById("reset-progress");
  const exportButton = document.getElementById("export-progress");
  const importButton = document.getElementById("import-progress");
  const importFileInput = document.getElementById("import-progress-file");
  const buildInfo = document.getElementById("tracker-build-info");
  const groupByCardButton = document.getElementById("group-by-card");
  const groupByFoundButton = document.getElementById("group-by-found");
  const scopeAllButton = document.getElementById("scope-all");
  const scopeWorkshopsButton = document.getElementById("scope-workshops");
  const scopeScrappyButton = document.getElementById("scope-scrappy");
  const scopeExpeditionButton = document.getElementById("scope-expedition");
  const tooltipManager = createTooltipManager({
    items: itemData,
    weapons: weaponData,
  }, {
    formatNumber: formatNumber,
    getRarityClass: getRarityClass,
  });
  const floatingTooltip = tooltipManager.element;
  const dragState = { cardName: "", targetName: "", placeAfter: false };
  let saveStateTimer = 0;

  document.body.appendChild(floatingTooltip);
  window.addEventListener("scroll", tooltipManager.hideTooltip, true);
  window.addEventListener("resize", tooltipManager.hideTooltip);
  window.addEventListener("pagehide", flushSaveState);
  setBuildInfo();

  resetButton.addEventListener("click", function () {
    const confirmed = window.confirm("Clear all tracked workshop, Scrappy, Expedition, and material progress for the next wipe?");
    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(legacyStorageKey);
    state.levels = {};
    state.progress = {};
    state.variants = {};
    state.cardOrder = [];
    render();
  });

  exportButton.addEventListener("click", exportProgress);
  importButton.addEventListener("click", function () {
    importFileInput.click();
  });
  importFileInput.addEventListener("change", importProgress);

  groupByCardButton.addEventListener("click", function () {
    state.shoppingMode = "card";
    renderSummary();
  });

  groupByFoundButton.addEventListener("click", function () {
    state.shoppingMode = "found";
    renderSummary();
  });

  scopeAllButton.addEventListener("click", function () {
    state.cardScope = "all";
    render();
  });

  scopeWorkshopsButton.addEventListener("click", function () {
    state.cardScope = "workshops";
    render();
  });

  scopeScrappyButton.addEventListener("click", function () {
    state.cardScope = "scrappy";
    render();
  });

  scopeExpeditionButton.addEventListener("click", function () {
    state.cardScope = "expedition";
    render();
  });

  render();

  function loadState() {
    const fallback = sanitizeState({});

    try {
      const raw = window.localStorage.getItem(storageKey);
      const fallbackRaw = raw || window.localStorage.getItem(legacyStorageKey);
      if (!fallbackRaw) {
        return fallback;
      }

      return sanitizeState(JSON.parse(fallbackRaw));
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    window.localStorage.setItem(storageKey, JSON.stringify(serializeState()));
  }

  function scheduleSaveState() {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
    }
    saveStateTimer = window.setTimeout(function () {
      saveStateTimer = 0;
      saveState();
    }, 150);
  }

  function flushSaveState() {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
      saveStateTimer = 0;
    }
    saveState();
  }

  function serializeState() {
    return sanitizeState(state);
  }

  function setBuildInfo() {
    if (!buildInfo) {
      return;
    }

    const details = [];
    if (trackerData.buildId) {
      details.push("Build " + trackerData.buildId);
    }
    if (trackerData.generatedAt) {
      details.push("Generated " + formatTimestamp(trackerData.generatedAt));
    }
    if (trackerData.schemaVersion) {
      details.push("Schema v" + trackerData.schemaVersion);
    }

    buildInfo.textContent = details.length ? details.join("  |  ") : "Data build unavailable.";
  }

  function exportProgress() {
    const payload = {
      type: "raiderbro.requirement-tracker-progress",
      version: stateVersion,
      exportedAt: new Date().toISOString(),
      trackerBuildId: trackerData.buildId || "",
      state: serializeState(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildExportFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function importProgress(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", function () {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const importedState = sanitizeState(parsed && parsed.state ? parsed.state : parsed);
        state.levels = importedState.levels;
        state.progress = importedState.progress;
        state.variants = importedState.variants;
        state.cardOrder = importedState.cardOrder;
        state.shoppingMode = importedState.shoppingMode;
        state.cardScope = importedState.cardScope;
        tooltipManager.hideTooltip();
        render();
      } catch (error) {
        window.alert("Could not import progress from that file.");
      } finally {
        importFileInput.value = "";
      }
    });
    reader.addEventListener("error", function () {
      window.alert("Could not read that progress file.");
      importFileInput.value = "";
    });
    reader.readAsText(file);
  }

  function buildExportFileName() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return "raiderbro-requirement-tracker-" + year + month + day + ".json";
  }

  function getAllCards() {
    return trackerData.cards || [];
  }

  function getVisibleCards() {
    return getAllCards().filter(function (card) {
      return state.cardScope === "all" || card.scope === state.cardScope;
    });
  }

  function getDefaultCardOrder() {
    return getAllCards().map(function (card) {
      return card.id;
    });
  }

  function getCardOrder() {
    const defaultOrder = getDefaultCardOrder();
    const storedOrder = Array.isArray(state.cardOrder)
      ? state.cardOrder.filter(function (name) {
          return defaultOrder.includes(name);
        })
      : [];

    defaultOrder.forEach(function (name) {
      if (!storedOrder.includes(name)) {
        storedOrder.push(name);
      }
    });

    if (!arraysEqual(storedOrder, state.cardOrder)) {
      state.cardOrder = storedOrder;
    }

    return storedOrder;
  }

  function reorderCardGroups(draggedName, targetName, placeAfter) {
    if (!draggedName || !targetName || draggedName === targetName) {
      return;
    }

    const nextOrder = getCardOrder().slice();
    const draggedIndex = nextOrder.indexOf(draggedName);
    const targetIndex = nextOrder.indexOf(targetName);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    nextOrder.splice(draggedIndex, 1);
    const adjustedTargetIndex = nextOrder.indexOf(targetName) + (placeAfter ? 1 : 0);
    nextOrder.splice(adjustedTargetIndex, 0, draggedName);
    state.cardOrder = nextOrder;
  }

  function clearDragHints() {
    Array.from(shoppingList.querySelectorAll(".shopping-group")).forEach(function (group) {
      group.classList.remove("drag-target-before", "drag-target-after");
    });
  }

  function clearDragState() {
    dragState.cardName = "";
    dragState.targetName = "";
    dragState.placeAfter = false;
    clearDragHints();
    Array.from(shoppingList.querySelectorAll(".shopping-group")).forEach(function (group) {
      group.classList.remove("is-dragging");
    });
  }

  function getCardContext(card) {
    const hasVariants = Array.isArray(card.variants) && card.variants.length > 0;
    const selectedVariantId = hasVariants
      ? state.variants[card.id] || card.variants[0].id
      : "";
    const activeCard = hasVariants
      ? card.variants.find(function (variant) {
          return variant.id === selectedVariantId;
        }) || card.variants[0]
      : card;

    if (hasVariants && state.variants[card.id] !== activeCard.id) {
      state.variants[card.id] = activeCard.id;
    }

    return {
      baseCard: card,
      activeCard: activeCard,
      variantId: hasVariants ? activeCard.id : "",
      displayTitle: hasVariants ? activeCard.title : card.title,
      levelStateKey: hasVariants ? [card.id, activeCard.id].join("::") : card.id,
      iconUrl: card.iconUrl || uiIcons.cards[card.title] || uiIcons.cards[card.id] || "",
      kindLabel: card.kindLabel || "Progress",
    };
  }

  function getCurrentLevel(context) {
    const minimumLevel = Number(context.activeCard.minLevel || context.baseCard.minLevel || 0);
    const maximumLevel = Number(context.activeCard.maxLevel || context.baseCard.maxLevel || 0);
    const level = Number(state.levels[context.levelStateKey] ?? minimumLevel);
    return Math.max(minimumLevel, Math.min(level, maximumLevel));
  }

  function getNextLevelData(context, currentLevel) {
    const targetLevel = currentLevel + 1;
    return context.activeCard.levels.find(function (levelInfo) {
      return levelInfo.level === targetLevel;
    }) || null;
  }

  function progressKey(context, level, itemName) {
    const keyParts = [context.baseCard.id];
    if (context.variantId) {
      keyParts.push(context.variantId);
    }
    keyParts.push(level, itemName);
    return keyParts.join("::");
  }

  function render() {
    cardsGrid.innerHTML = "";

    getVisibleCards().forEach(function (card) {
      const context = getCardContext(card);
      const currentLevel = getCurrentLevel(context);
      const nextLevel = getNextLevelData(context, currentLevel);
      cardsGrid.appendChild(renderTrackerCard(context, currentLevel, nextLevel));
    });

    renderSummary();
  }

  function renderSummary() {
    let maxedCards = 0;
    let upgradeCount = 0;
    const aggregateNeeds = new Map();
    const allCards = getAllCards();

    allCards.forEach(function (card) {
      const context = getCardContext(card);
      const currentLevel = getCurrentLevel(context);
      const nextLevel = getNextLevelData(context, currentLevel);

      if (currentLevel >= context.activeCard.maxLevel) {
        maxedCards += 1;
      }

      if (!nextLevel) {
        return;
      }

      upgradeCount += 1;
      nextLevel.requirements.forEach(function (requirement) {
        const key = progressKey(context, nextLevel.level, requirement.item);
        const have = Number(state.progress[key] || 0);
        const need = Math.max(requirement.quantity - have, 0);
        if (need <= 0) {
          return;
        }

        if (!aggregateNeeds.has(requirement.item)) {
          const item = itemData[requirement.item] || {};
          aggregateNeeds.set(requirement.item, {
            item: requirement.item,
            total: 0,
            category: item.category || "Unknown",
            foundIn: item.foundIn || [],
            cards: [],
          });
        }

        const aggregateEntry = aggregateNeeds.get(requirement.item);
        aggregateEntry.total += need;
        aggregateEntry.cards.push({
          cardId: context.baseCard.id,
          cardTitle: context.baseCard.title,
          cardLabel: context.displayTitle,
          need: need,
        });
      });
    });

    maxedCount.textContent = maxedCards + " / " + allCards.length;
    openUpgrades.textContent = String(upgradeCount);
    groupByCardButton.classList.toggle("active", state.shoppingMode !== "found");
    groupByFoundButton.classList.toggle("active", state.shoppingMode === "found");
    scopeAllButton.classList.toggle("active", state.cardScope === "all");
    scopeWorkshopsButton.classList.toggle("active", state.cardScope === "workshops");
    scopeScrappyButton.classList.toggle("active", state.cardScope === "scrappy");
    scopeExpeditionButton.classList.toggle("active", state.cardScope === "expedition");
    getCardOrder();
    renderShoppingList(aggregateNeeds);
    scheduleSaveState();
  }

  function renderShoppingList(aggregateNeeds) {
    shoppingList.innerHTML = "";

    if (aggregateNeeds.size === 0) {
      const done = document.createElement("p");
      done.className = "shopping-empty";
      done.textContent = "You are caught up on every tracked upgrade right now.";
      shoppingList.appendChild(done);
      return;
    }

    const grouped = state.shoppingMode === "found"
      ? groupNeedsByFoundIn(aggregateNeeds)
      : groupNeedsByCard(aggregateNeeds);

    const orderedEntries = Array.from(grouped.entries());
    if (state.shoppingMode === "card") {
      const cardOrder = getCardOrder();
      orderedEntries.sort(function (a, b) {
        return cardOrder.indexOf(a[0]) - cardOrder.indexOf(b[0]);
      });
    } else {
      orderedEntries.sort(function (a, b) {
        return a[1].title.localeCompare(b[1].title);
      });
    }

    orderedEntries
      .forEach(function (groupEntry) {
        const groupId = groupEntry[0];
        const group = groupEntry[1];
        const groupCard = document.createElement("section");
        groupCard.className = "shopping-group";
        groupCard.classList.toggle("is-reorderable", state.shoppingMode === "card");
        groupCard.draggable = state.shoppingMode === "card";

        if (state.shoppingMode === "card") {
          groupCard.addEventListener("dragstart", function (event) {
            dragState.cardName = groupId;
            dragState.targetName = "";
            dragState.placeAfter = false;
            groupCard.classList.add("is-dragging");
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", groupId);
            }
          });

          groupCard.addEventListener("dragover", function (event) {
            if (!dragState.cardName || dragState.cardName === groupId) {
              return;
            }

            event.preventDefault();
            clearDragHints();
            const rect = groupCard.getBoundingClientRect();
            const placeAfter = event.clientX > rect.left + rect.width / 2;
            dragState.targetName = groupId;
            dragState.placeAfter = placeAfter;
            groupCard.classList.add(placeAfter ? "drag-target-after" : "drag-target-before");
          });

          groupCard.addEventListener("drop", function (event) {
            if (!dragState.cardName || dragState.cardName === groupId) {
              clearDragState();
              return;
            }

            event.preventDefault();
            reorderCardGroups(dragState.cardName, groupId, dragState.placeAfter);
            clearDragState();
            renderSummary();
          });

          groupCard.addEventListener("dragend", clearDragState);
        }

        const title = document.createElement("div");
        title.className = "shopping-group-head";

        const iconUrl = state.shoppingMode === "found"
          ? (uiIcons.foundIn[groupId] || "")
          : (uiIcons.cards[group.title] || uiIcons.cards[groupId] || "");

        if (iconUrl) {
          const icon = document.createElement("img");
          icon.className = "group-icon";
          icon.src = iconUrl;
          icon.alt = group.title;
          icon.loading = "lazy";
          title.appendChild(icon);
        }

        const groupTitle = document.createElement("h3");
        groupTitle.className = "shopping-group-title";
        groupTitle.textContent = group.title;
        title.appendChild(groupTitle);
        groupCard.appendChild(title);

        const groupList = document.createElement("div");
        groupList.className = "shopping-group-list";

        group.items
          .sort(function (a, b) {
            return a.item.localeCompare(b.item);
          })
          .forEach(function (itemEntry) {
            const row = document.createElement("div");
            row.className = "shopping-item";

            const head = document.createElement("div");
            head.className = "shopping-item-head";
            const itemInline = createItemInline(itemEntry.item, {
              extraText: itemEntry.secondaryLabel,
            });

            const total = document.createElement("span");
            total.className = "shopping-total";
            total.textContent = formatShoppingTotal(itemEntry.item, itemEntry.total);
            head.append(itemInline, total);
            row.appendChild(head);
            groupList.appendChild(row);
          });

        groupCard.appendChild(groupList);
        shoppingList.appendChild(groupCard);
      });
  }

  function groupNeedsByCard(aggregateNeeds) {
    const grouped = new Map();

    Array.from(aggregateNeeds.values()).forEach(function (entry) {
      const cardIds = Array.from(new Set(entry.cards.map(function (cardEntry) {
        return cardEntry.cardId;
      })));

      cardIds.forEach(function (cardId) {
        if (!grouped.has(cardId)) {
          grouped.set(cardId, {
            title: entry.cards.find(function (cardEntry) {
              return cardEntry.cardId === cardId;
            }).cardTitle,
            items: [],
          });
        }

        grouped.get(cardId).items.push({
          item: entry.item,
          total: entry.cards
            .filter(function (cardEntry) {
              return cardEntry.cardId === cardId;
            })
            .reduce(function (sum, cardEntry) {
              return sum + cardEntry.need;
            }, 0),
          secondaryLabel: entry.category || "Unknown type",
        });
      });
    });

    return grouped;
  }

  function groupNeedsByFoundIn(aggregateNeeds) {
    const grouped = new Map();

    Array.from(aggregateNeeds.values()).forEach(function (entry) {
      const foundInValues = entry.foundIn && entry.foundIn.length ? entry.foundIn : ["Unknown"];

      foundInValues.forEach(function (sourceName) {
        if (!grouped.has(sourceName)) {
          grouped.set(sourceName, {
            title: sourceName,
            items: [],
          });
        }

        grouped.get(sourceName).items.push({
          item: entry.item,
          total: entry.total,
          secondaryLabel: buildCardLabel(entry.cards),
        });
      });
    });

    return grouped;
  }

  function buildCardLabel(cards) {
    const names = Array.from(new Set(cards.map(function (cardEntry) {
      return cardEntry.cardLabel || cardEntry.cardTitle;
    }))).sort(function (a, b) {
      return a.localeCompare(b);
    });
    return names.join(", ");
  }

  function renderTrackerCard(context, currentLevel, nextLevel) {
    const card = document.createElement("article");
    card.className = "tracker-card";
    const isWorkshopCard = context.baseCard.scope === "workshops";
    const isScrappyCard = context.baseCard.id === "scrappy";

    const top = document.createElement("div");
    top.className = "card-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "card-title-wrap";

    if (context.iconUrl) {
      const icon = document.createElement("img");
      icon.className = "card-icon";
      icon.src = context.iconUrl;
      icon.alt = context.baseCard.title;
      icon.loading = "lazy";
      titleWrap.appendChild(icon);
    }

    const titleCopy = document.createElement("div");
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = context.kindLabel;
    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = context.baseCard.title;
    titleCopy.append(meta, title);

    if (context.variantId) {
      const subtitle = document.createElement("p");
      subtitle.className = "card-subtitle";
      subtitle.textContent = context.displayTitle;
      titleCopy.appendChild(subtitle);
    }

    titleWrap.appendChild(titleCopy);

    if (isWorkshopCard || isScrappyCard) {
      top.append(titleWrap, renderProgressDots(context, currentLevel));
    } else {
      const status = document.createElement("div");
      status.className = "status-pill" + (currentLevel >= context.activeCard.maxLevel ? " maxed" : "");
      status.textContent = currentLevel >= context.activeCard.maxLevel
        ? (context.activeCard.completeLabel || "Complete")
        : "Next: " + getMilestoneLabel(context.activeCard, nextLevel);
      top.append(titleWrap, status);
    }

    card.appendChild(top);

    if (!isWorkshopCard && !isScrappyCard) {
      const levelRow = document.createElement("div");
      levelRow.className = "level-row";

      if (Array.isArray(context.baseCard.variants) && context.baseCard.variants.length) {
        const variantGroup = document.createElement("div");
        variantGroup.className = "control-group";
        const variantLabel = document.createElement("label");
        variantLabel.className = "label";
        variantLabel.textContent = "Current Track";
        const variantSelect = document.createElement("select");

        context.baseCard.variants.forEach(function (variant) {
          const option = document.createElement("option");
          option.value = variant.id;
          option.textContent = variant.title;
          option.selected = variant.id === context.variantId;
          variantSelect.appendChild(option);
        });

        variantSelect.addEventListener("change", function (event) {
          state.variants[context.baseCard.id] = event.target.value;
          render();
        });

        variantGroup.append(variantLabel, variantSelect);
        levelRow.appendChild(variantGroup);
      }

      const progressGroup = document.createElement("div");
      progressGroup.className = "control-group";
      const progressLabel = document.createElement("label");
      progressLabel.className = "label";
      progressLabel.textContent = "Current Progress";
      const progressSelect = document.createElement("select");

      const minimumLevel = Number(context.activeCard.minLevel || context.baseCard.minLevel || 0);
      const maximumLevel = Number(context.activeCard.maxLevel || context.baseCard.maxLevel || 0);
      for (let level = minimumLevel; level <= maximumLevel; level += 1) {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = getProgressOptionLabel(context.activeCard, level);
        option.selected = level === currentLevel;
        progressSelect.appendChild(option);
      }

      progressSelect.addEventListener("change", function (event) {
        state.levels[context.levelStateKey] = Number(event.target.value);
        render();
      });

      progressGroup.append(progressLabel, progressSelect);
      levelRow.appendChild(progressGroup);

      card.appendChild(levelRow);
    }

    const nextUpgradePanel = document.createElement("section");
    nextUpgradePanel.className = "next-upgrade";

    if (!nextLevel) {
      const empty = document.createElement("p");
      empty.className = "empty-upgrade";
      empty.textContent = getEmptyMessage(context);
      nextUpgradePanel.appendChild(empty);
      card.appendChild(nextUpgradePanel);
      return card;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Requirements for " + getMilestoneLabel(context.activeCard, nextLevel);
    nextUpgradePanel.appendChild(heading);

    if (nextLevel.description) {
      const description = document.createElement("p");
      description.className = "stage-description";
      description.textContent = nextLevel.description;
      nextUpgradePanel.appendChild(description);
    }

    const requirementList = document.createElement("div");
    requirementList.className = "requirement-list";

    nextLevel.requirements.forEach(function (requirement) {
      const key = progressKey(context, nextLevel.level, requirement.item);
      const have = Number(state.progress[key] || 0);
      const clampedHave = Math.max(0, Math.min(have, requirement.quantity));

      if (clampedHave !== have) {
        state.progress[key] = clampedHave;
      }

      const row = document.createElement("div");
      row.className = "requirement";
      row.classList.toggle("is-complete", clampedHave >= requirement.quantity);

      const main = document.createElement("div");
      main.className = "requirement-main";
      main.appendChild(createItemInline(requirement.item));

      const progress = document.createElement("div");
      progress.className = "requirement-progress";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(requirement.quantity);
      input.step = "1";
      input.value = String(clampedHave);
      input.setAttribute("aria-label", requirement.item + " count");
      input.classList.toggle("wide-input", requirement.quantity >= 1000);
      input.addEventListener("wheel", function (event) {
        event.preventDefault();
      }, { passive: false });
      input.addEventListener("input", function (event) {
        const nextValue = Number(event.target.value || 0);
        const safeValue = Math.max(0, Math.min(nextValue, requirement.quantity));
        state.progress[key] = safeValue;
        input.value = String(safeValue);
        row.classList.toggle("is-complete", safeValue >= requirement.quantity);
        renderSummary();
      });

      const count = document.createElement("span");
      count.className = "requirement-count";
      count.textContent = "/" + formatRequirementValue(requirement.quantity);

      progress.append(input, count);
      row.append(main, progress);
      requirementList.appendChild(row);
    });

    nextUpgradePanel.appendChild(requirementList);

    if (nextLevel.crafts && nextLevel.crafts.length > 0) {
      const unlocks = document.createElement("div");
      unlocks.className = "unlocks";
      const unlockTitle = document.createElement("h4");
      unlockTitle.textContent = "Unlocks at " + getMilestoneLabel(context.activeCard, nextLevel);
      unlocks.appendChild(unlockTitle);

      const unlockList = document.createElement("div");
      unlockList.className = "unlock-list";
      nextLevel.crafts.forEach(function (craft) {
        const catalogEntry = resolveCatalogEntry(craft);
        const rarityClass = getCatalogEntryRarityClass(catalogEntry);
        const chip = document.createElement("span");
        chip.className = "unlock-chip" + (rarityClass ? " " + rarityClass : "");
        chip.appendChild(createItemInline(craft, { iconOnly: true }));
        unlockList.appendChild(chip);
      });

      unlocks.appendChild(unlockList);
      nextUpgradePanel.appendChild(unlocks);
    }

    card.appendChild(nextUpgradePanel);
    return card;
  }

  function renderProgressDots(context, currentLevel) {
    const dots = document.createElement("div");
    dots.className = "progress-dots";
    dots.setAttribute("role", "radiogroup");
    dots.setAttribute("aria-label", context.baseCard.title + " progress");

    const minimumLevel = Number(context.activeCard.minLevel || context.baseCard.minLevel || 0);
    const maximumLevel = Number(context.activeCard.maxLevel || context.baseCard.maxLevel || 0);

    for (let level = minimumLevel; level <= maximumLevel; level += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "level-dot" + (level === currentLevel ? " active" : "");
      dot.textContent = String(level);
      dot.title = level === 0 ? "Unbuilt" : "Level " + level;
      dot.setAttribute("aria-pressed", level === currentLevel ? "true" : "false");
      dot.addEventListener("click", function () {
        state.levels[context.levelStateKey] = level;
        render();
      });
      dots.appendChild(dot);
    }

    return dots;
  }

  function resolveCatalogEntry(entryName) {
    if (itemData[entryName]) {
      return { kind: "item", data: itemData[entryName] };
    }
    if (weaponData[entryName]) {
      return { kind: "weapon", data: weaponData[entryName] };
    }
    return null;
  }

  function getCatalogEntryRarityClass(catalogEntry) {
    if (!catalogEntry || !catalogEntry.data || !catalogEntry.data.rarity) {
      return "";
    }
    return getRarityClass(catalogEntry.data.rarity);
  }

  function createItemInline(itemName, options) {
    const settings = options || {};
    const catalogEntry = resolveCatalogEntry(itemName);
    const visualData = catalogEntry ? catalogEntry.data : null;
    const rarityClass = getCatalogEntryRarityClass(catalogEntry);
    const hideCopy = Boolean(settings.iconOnly && visualData && visualData.imageUrl);

    const wrapper = document.createElement("span");
    wrapper.className = "item-inline"
      + (catalogEntry ? " has-tooltip" : "")
      + (rarityClass ? " " + rarityClass : "")
      + (hideCopy ? " icon-only" : "");

    if (visualData && visualData.imageUrl) {
      const icon = document.createElement("img");
      icon.className = "item-icon";
      icon.src = visualData.imageUrl;
      icon.alt = itemName;
      icon.loading = "lazy";
      wrapper.appendChild(icon);
    }

    if (!hideCopy) {
      const copy = document.createElement("span");
      copy.className = "item-copy";

      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = itemName;
      copy.appendChild(name);

      if (settings.extraText) {
        const extra = document.createElement("span");
        extra.className = "item-need";
        extra.textContent = settings.extraText;
        copy.appendChild(extra);
      }

      wrapper.appendChild(copy);
    }

    if (catalogEntry) {
      if (hideCopy) {
        wrapper.setAttribute("aria-label", itemName);
        wrapper.title = itemName;
      }
      wrapper.tabIndex = 0;
      wrapper.addEventListener("mouseenter", function () {
        tooltipManager.showTooltip(itemName, catalogEntry, wrapper);
      });
      wrapper.addEventListener("mousemove", function () {
        tooltipManager.positionTooltip(wrapper);
      });
      wrapper.addEventListener("mouseleave", tooltipManager.hideTooltip);
      wrapper.addEventListener("focus", function () {
        tooltipManager.showTooltip(itemName, catalogEntry, wrapper);
      });
      wrapper.addEventListener("blur", tooltipManager.hideTooltip);
    }

    return wrapper;
  }

  function getMilestoneLabel(card, levelInfo) {
    if (!levelInfo) {
      return "";
    }
    return levelInfo.label || ("Level " + levelInfo.level);
  }

  function getProgressOptionLabel(card, level) {
    if (level === 0) {
      return card.zeroLabel || "Not built yet";
    }

    const levelInfo = card.levels.find(function (entry) {
      return entry.level === level;
    });

    if (!levelInfo) {
      return "Level " + level;
    }

    return levelInfo.progressLabel || levelInfo.label || ("Level " + level);
  }

  function getEmptyMessage(context) {
    if (context.baseCard.id === "expedition") {
      return "These tracked expedition stages are complete. Move the expedition selector when you start the next expedition.";
    }

    if (context.baseCard.scope === "workshops") {
      return "No materials needed here. Set this back down if you want to re-plan a fresh wipe path.";
    }

    return "No materials needed here right now.";
  }

  function formatRequirementValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : String(value);
  }

  function formatShoppingTotal(itemName, value) {
    const number = Number(value);
    const formatted = Number.isFinite(number) ? number.toLocaleString() : String(value);
    return "x" + formatted;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number.toLocaleString();
    }
    return value;
  }

  function getRarityClass(rarity) {
    const normalized = String(rarity || "").trim().toLowerCase();
    if (normalized === "common") return "rarity-common";
    if (normalized === "uncommon") return "rarity-uncommon";
    if (normalized === "rare") return "rarity-rare";
    if (normalized === "epic") return "rarity-epic";
    if (normalized === "legendary") return "rarity-legendary";
    return "";
  }
})();
