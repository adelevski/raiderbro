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
  const rewardData = trackerData.rewardCatalog || {};
  const state = loadState();
  const cardsGrid = document.getElementById("cards-grid");
  const maxedCount = document.getElementById("maxed-count");
  const shoppingList = document.getElementById("shopping-list");
  const shoppingSummaryLabel = document.getElementById("shopping-summary-label");
  const resetButton = document.getElementById("reset-progress");
  const exportButton = document.getElementById("export-progress");
  const importButton = document.getElementById("import-progress");
  const importFileInput = document.getElementById("import-progress-file");
  const buildInfo = document.getElementById("tracker-build-info");
  const groupByCardButton = document.getElementById("group-by-card");
  const groupByFoundButton = document.getElementById("group-by-found");
  const includeFutureNeedsToggle = document.getElementById("include-future-needs");
  const scopeAllButton = document.getElementById("scope-all");
  const scopeWorkshopsButton = document.getElementById("scope-workshops");
  const scopeScrappyButton = document.getElementById("scope-scrappy");
  const scopeExpeditionButton = document.getElementById("scope-expedition");
  const scopeProjectsButton = document.getElementById("scope-projects");
  const tooltipManager = createTooltipManager({
    items: itemData,
    weapons: weaponData,
    rewards: rewardData,
  }, {
    formatNumber: formatNumber,
    getRarityClass: getRarityClass,
  });
  const floatingTooltip = tooltipManager.element;
  const dragState = { cardName: "", targetName: "", placeAfter: false };
  let saveStateTimer = 0;
  let shoppingResizeTimer = 0;

  document.body.appendChild(floatingTooltip);
  window.addEventListener("scroll", tooltipManager.hideTooltip, true);
  window.addEventListener("resize", tooltipManager.hideTooltip);
  window.addEventListener("resize", function () {
    window.clearTimeout(shoppingResizeTimer);
    shoppingResizeTimer = window.setTimeout(renderSummary, 80);
  });
  window.addEventListener("pagehide", flushSaveState);
  setBuildInfo();

  resetButton.addEventListener("click", function () {
    const confirmed = window.confirm("Clear tracked wipe progress for workshops, Scrappy, and Expedition while keeping long-term project progress?");
    if (!confirmed) {
      return;
    }

    resetWipeProgress();
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

  includeFutureNeedsToggle.addEventListener("click", function () {
    state.includeFutureNeeds = !state.includeFutureNeeds;
    render();
  });

  scopeAllButton.addEventListener("click", function () {
    if (state.cardScope === "all") {
      return;
    }
    state.cardScope = "all";
    render();
  });

  scopeWorkshopsButton.addEventListener("click", function () {
    if (state.cardScope === "workshops") {
      return;
    }
    state.cardScope = "workshops";
    render();
  });

  scopeScrappyButton.addEventListener("click", function () {
    if (state.cardScope === "scrappy") {
      return;
    }
    state.cardScope = "scrappy";
    render();
  });

  scopeExpeditionButton.addEventListener("click", function () {
    if (state.cardScope === "expedition") {
      return;
    }
    state.cardScope = "expedition";
    render();
  });

  if (scopeProjectsButton) {
    scopeProjectsButton.addEventListener("click", function () {
      if (state.cardScope === "projects") {
        return;
      }
      state.cardScope = "projects";
      render();
    });
  }

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

  function resetWipeProgress() {
    const wipeCardIds = getAllCards()
      .filter(function (card) {
        return card.resetOnWipe !== false;
      })
      .map(function (card) {
        return card.id;
      });

    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(legacyStorageKey);
    state.levels = filterNumberMapByCardIds(state.levels, wipeCardIds, false);
    state.progress = filterNumberMapByCardIds(state.progress, wipeCardIds, false);
    state.variants = filterStringMapByCardIds(state.variants, wipeCardIds, false);
    state.cardOrder = [];
  }

  function filterNumberMapByCardIds(map, cardIds, keepMatches) {
    const filtered = {};
    Object.keys(map || {}).forEach(function (key) {
      const shouldMatch = cardIds.includes(getCardIdFromStateKey(key));
      if ((keepMatches && shouldMatch) || (!keepMatches && !shouldMatch)) {
        filtered[key] = map[key];
      }
    });
    return filtered;
  }

  function filterStringMapByCardIds(map, cardIds, keepMatches) {
    const filtered = {};
    Object.keys(map || {}).forEach(function (key) {
      const shouldMatch = cardIds.includes(getCardIdFromStateKey(key));
      if ((keepMatches && shouldMatch) || (!keepMatches && !shouldMatch)) {
        filtered[key] = map[key];
      }
    });
    return filtered;
  }

  function getCardIdFromStateKey(key) {
    return String(key || "").split("::")[0];
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
        state.includeFutureNeeds = importedState.includeFutureNeeds;
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

  function getLevelBounds(context) {
    return {
      minimumLevel: Number(context.activeCard.minLevel || context.baseCard.minLevel || 0),
      maximumLevel: Number(context.activeCard.maxLevel || context.baseCard.maxLevel || 0),
    };
  }

  function getStoredCurrentLevel(context) {
    const bounds = getLevelBounds(context);
    const level = Number(state.levels[context.levelStateKey] ?? bounds.minimumLevel);
    return Math.max(bounds.minimumLevel, Math.min(level, bounds.maximumLevel));
  }

  function shouldAutoAdvanceCard(context) {
    return context.baseCard.scope === "workshops" || context.baseCard.scope === "projects";
  }

  function isLevelCompleteForProgress(context, levelInfo) {
    return (levelInfo.requirements || []).every(function (requirement) {
      const key = progressKey(context, levelInfo.level, requirement.item);
      const have = Number(state.progress[key] || 0);
      const clampedHave = Math.max(0, Math.min(have, Number(requirement.quantity)));
      return clampedHave >= Number(requirement.quantity);
    });
  }

  function syncAutoAdvancedLevel(context) {
    const bounds = getLevelBounds(context);
    const originalLevel = getStoredCurrentLevel(context);
    let resolvedLevel = originalLevel;

    if (shouldAutoAdvanceCard(context)) {
      while (resolvedLevel < bounds.maximumLevel) {
        const nextLevel = getNextLevelData(context, resolvedLevel);
        if (!nextLevel || !isLevelCompleteForProgress(context, nextLevel)) {
          break;
        }
        resolvedLevel += 1;
      }
    }

    if (resolvedLevel !== originalLevel) {
      state.levels[context.levelStateKey] = resolvedLevel;
      return { changed: true, level: resolvedLevel };
    }

    return { changed: false, level: originalLevel };
  }

  function getCurrentLevel(context) {
    return getStoredCurrentLevel(context);
  }

  function getNextLevelData(context, currentLevel) {
    const targetLevel = currentLevel + 1;
    return context.activeCard.levels.find(function (levelInfo) {
      return levelInfo.level === targetLevel;
    }) || null;
  }

  function getSummaryLevels(context, currentLevel) {
    if (state.includeFutureNeeds) {
      return context.activeCard.levels.filter(function (levelInfo) {
        return levelInfo.level > currentLevel;
      });
    }

    const nextLevel = getNextLevelData(context, currentLevel);
    return nextLevel ? [nextLevel] : [];
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
    const previousScrollY = window.scrollY;
    const previousGridHeight = cardsGrid.getBoundingClientRect().height;
    const previousShoppingListHeight = shoppingList.getBoundingClientRect().height;
    if (previousGridHeight > 0) {
      cardsGrid.style.minHeight = Math.ceil(previousGridHeight) + "px";
    } else {
      cardsGrid.style.minHeight = "";
    }
    if (previousShoppingListHeight > 0) {
      shoppingList.style.minHeight = Math.ceil(previousShoppingListHeight) + "px";
    } else {
      shoppingList.style.minHeight = "";
    }
    cardsGrid.innerHTML = "";

    getVisibleCards().forEach(function (card) {
      const context = getCardContext(card);
      const currentLevel = getCurrentLevel(context);
      const nextLevel = getNextLevelData(context, currentLevel);
      cardsGrid.appendChild(renderTrackerCard(context, currentLevel, nextLevel));
    });

    renderSummary();
    shoppingList.style.minHeight = "";
    preserveCardsGridHeight(previousScrollY);
  }

  function renderSummary() {
    let maxedCards = 0;
    const needEntries = [];
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

      getSummaryLevels(context, currentLevel).forEach(function (levelInfo) {
        levelInfo.requirements.forEach(function (requirement) {
          const key = progressKey(context, levelInfo.level, requirement.item);
          const have = Number(state.progress[key] || 0);
          const need = Math.max(requirement.quantity - have, 0);
          if (need <= 0) {
            return;
          }

          const item = itemData[requirement.item] || {};
          needEntries.push({
            item: requirement.item,
            need: need,
            category: item.category || "Unknown type",
            foundIn: item.foundIn || [],
            cardId: context.baseCard.id,
            cardScope: context.baseCard.scope,
            cardTitle: context.baseCard.title,
            cardLabel: context.displayTitle,
            milestoneId: context.levelStateKey + "::" + levelInfo.level,
            milestoneLabel: getMilestoneLabel(context.activeCard, levelInfo),
            milestoneOrder: Number(levelInfo.level),
          });
        });
      });
    });

    maxedCount.textContent = maxedCards + " / " + allCards.length;
    if (shoppingSummaryLabel) {
      shoppingSummaryLabel.textContent = state.includeFutureNeeds
        ? "Need Across Future Levels"
        : "Need Right Now";
    }
    includeFutureNeedsToggle.classList.toggle("active", Boolean(state.includeFutureNeeds));
    includeFutureNeedsToggle.setAttribute("aria-pressed", state.includeFutureNeeds ? "true" : "false");
    groupByCardButton.classList.toggle("active", state.shoppingMode !== "found");
    groupByFoundButton.classList.toggle("active", state.shoppingMode === "found");
    scopeAllButton.classList.toggle("active", state.cardScope === "all");
    scopeWorkshopsButton.classList.toggle("active", state.cardScope === "workshops");
    scopeScrappyButton.classList.toggle("active", state.cardScope === "scrappy");
    scopeExpeditionButton.classList.toggle("active", state.cardScope === "expedition");
    if (scopeProjectsButton) {
      scopeProjectsButton.classList.toggle("active", state.cardScope === "projects");
    }
    getCardOrder();
    renderShoppingList(needEntries);
    scheduleSaveState();
  }

  function preserveCardsGridHeight(previousScrollY) {
    const naturalMetrics = measureCardsGridNaturalMetrics();
    const naturalMaxScrollY = Math.max(naturalMetrics.documentHeight - window.innerHeight, 0);

    if (previousScrollY <= naturalMaxScrollY + 1) {
      cardsGrid.style.minHeight = "";
      return;
    }

    const neededExtraHeight = previousScrollY - naturalMaxScrollY;
    cardsGrid.style.minHeight = Math.ceil(naturalMetrics.gridHeight + neededExtraHeight) + "px";

    const stabilizedMaxScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    if (stabilizedMaxScrollY + 1 >= previousScrollY) {
      window.scrollTo(0, previousScrollY);
    }
  }

  function measureCardsGridNaturalMetrics() {
    const previousMinHeight = cardsGrid.style.minHeight;
    cardsGrid.style.minHeight = "0px";
    const metrics = {
      gridHeight: cardsGrid.getBoundingClientRect().height,
      documentHeight: document.documentElement.scrollHeight,
    };
    cardsGrid.style.minHeight = previousMinHeight;
    return metrics;
  }

  function renderShoppingList(needEntries) {
    shoppingList.innerHTML = "";

    if (!needEntries.length) {
      const done = document.createElement("p");
      done.className = "shopping-empty";
      done.textContent = "You are caught up on every tracked upgrade right now.";
      shoppingList.appendChild(done);
      return;
    }

    const boardColumns = getShoppingBoardColumnCount();
    shoppingList.style.setProperty("--shopping-board-columns", String(boardColumns));

    const grouped = state.shoppingMode === "found"
      ? groupNeedsByFoundIn(needEntries)
      : groupNeedsByCard(needEntries);

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
        const groupLayout = getShoppingGroupLayout(group, boardColumns);
        groupCard.className = "shopping-group";
        groupCard.dataset.shoppingGroupId = groupId;
        groupCard.classList.toggle("is-reorderable", state.shoppingMode === "card");
        groupCard.draggable = state.shoppingMode === "card";
        groupCard.style.setProperty("--shopping-group-span", String(groupLayout.span));

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

        if (group.sections && group.sections.length) {
          const sectionWrap = document.createElement("div");
          sectionWrap.className = "shopping-section-list";
          const sectionColumns = getShoppingSectionColumnCount(group, groupLayout, boardColumns);
          sectionWrap.style.setProperty("--shopping-section-columns", String(sectionColumns));

          group.sections.forEach(function (section) {
            const sectionCard = document.createElement("section");
            sectionCard.className = "shopping-section";
            sectionCard.classList.toggle("is-grid-tile", sectionColumns > 1);

            const sectionTitle = document.createElement("h4");
            sectionTitle.className = "shopping-section-title";
            sectionTitle.textContent = section.title;
            sectionCard.appendChild(sectionTitle);

            const sectionList = document.createElement("div");
            sectionList.className = "shopping-group-list";
            applyShoppingListLayout(sectionList, section.items.length, groupLayout, boardColumns, {
              effectiveSpan: sectionColumns > 1
                ? Math.max(1, Math.floor(Number(groupLayout.span || 1) / sectionColumns))
                : Number(groupLayout.span || 1),
            });
            renderShoppingItems(sectionList, section.items);
            sectionCard.appendChild(sectionList);
            sectionWrap.appendChild(sectionCard);
          });

          groupCard.appendChild(sectionWrap);
        } else {
          const groupList = document.createElement("div");
          groupList.className = "shopping-group-list";
          applyShoppingListLayout(groupList, group.items.length, groupLayout, boardColumns);
          renderShoppingItems(groupList, group.items);
          groupCard.appendChild(groupList);
        }
        shoppingList.appendChild(groupCard);
      });
  }

  function renderShoppingItems(container, items) {
    items
      .sort(function (a, b) {
        return a.item.localeCompare(b.item);
      })
      .forEach(function (itemEntry) {
        const row = document.createElement("div");
        row.className = "shopping-item";

        const head = document.createElement("div");
        head.className = "shopping-item-head";
        const subtitleNode = renderShoppingSecondaryContent(itemEntry);
        const extraSourceNode = itemEntry.alsoFoundIn && itemEntry.alsoFoundIn.length
          ? renderExtraFoundIn(itemEntry.alsoFoundIn)
          : null;
        const itemInline = createItemInline(itemEntry.item, {
          extraNode: subtitleNode,
          extraContent: extraSourceNode,
        });

        const total = document.createElement("span");
        total.className = "shopping-total";
        total.textContent = formatShoppingTotal(itemEntry.item, itemEntry.total);
        head.append(itemInline, total);
        row.appendChild(head);
        container.appendChild(row);
      });
  }

  function renderExtraFoundIn(entries) {
    const footer = document.createElement("span");
    footer.className = "shopping-extra-sources";

    const label = document.createElement("span");
    label.className = "shopping-extra-sources-label";
    label.textContent = "Can also be found in ";
    footer.appendChild(label);

    entries.forEach(function (entry, index) {
      if (index > 0) {
        footer.appendChild(document.createTextNode(", "));
      }

      const source = document.createElement("span");
      source.className = "shopping-extra-source";

      const text = document.createElement("span");
      text.textContent = entry.text;
      source.appendChild(text);

      if (entry.iconUrl) {
        const icon = document.createElement("img");
        icon.className = "shopping-extra-source-icon";
        icon.src = entry.iconUrl;
        icon.alt = entry.text;
        icon.loading = "lazy";
        source.appendChild(icon);
      }

      footer.appendChild(source);
    });

    return footer;
  }

  function renderShoppingSecondaryContent(itemEntry) {
    if (state.shoppingMode === "card") {
      return renderFoundInSubtitle(itemEntry.item);
    }

    if (!itemEntry.secondaryLabel) {
      return null;
    }

    const subtitle = document.createElement("span");
    subtitle.className = "item-need shopping-subtitle";
    subtitle.textContent = itemEntry.secondaryLabel;
    return subtitle;
  }

  function renderFoundInSubtitle(itemName) {
    const primaryEntry = getPrimaryFoundInEntry(itemName);
    const subtitle = document.createElement("span");
    subtitle.className = "item-need shopping-subtitle";

    const label = document.createElement("span");
    label.className = "shopping-subtitle-label";
    label.textContent = "Found in ";
    subtitle.appendChild(label);

    const entry = document.createElement("span");
    entry.className = "shopping-subtitle-entry";

    const text = document.createElement("span");
    text.className = "shopping-subtitle-text";
    text.textContent = primaryEntry.text;
    entry.appendChild(text);

    if (primaryEntry.iconUrl) {
      const icon = document.createElement("img");
      icon.className = "shopping-subtitle-icon";
      icon.src = primaryEntry.iconUrl;
      icon.alt = primaryEntry.text;
      icon.loading = "lazy";
      entry.appendChild(icon);
    }

    subtitle.appendChild(entry);
    return subtitle;
  }

  function getPrimaryFoundInEntry(itemName) {
    const item = itemData[itemName] || {};
    const entries = Array.isArray(item.foundInEntries) && item.foundInEntries.length
      ? item.foundInEntries
      : (item.foundIn || []).map(function (sourceName) {
          return {
            text: sourceName,
            iconUrl: uiIcons.foundIn[sourceName] || "",
          };
        });

    if (!entries.length) {
      return { text: "Unknown", iconUrl: "" };
    }

    return entries[0];
  }

  function getPrimaryFoundInSourceName(itemName) {
    return getPrimaryFoundInEntry(itemName).text;
  }

  function getShoppingBoardColumnCount() {
    const width = shoppingList.clientWidth || window.innerWidth || 1440;
    if (width <= 560) {
      return 1;
    }
    if (width <= 900) {
      return 6;
    }
    return 12;
  }

  function getShoppingGroupMetrics(group) {
    const listCounts = group.sections && group.sections.length
      ? group.sections.map(function (section) {
          return section.items.length;
        })
      : [group.items.length];

    return {
      totalItems: listCounts.reduce(function (sum, count) {
        return sum + count;
      }, 0),
      maxListItems: listCounts.reduce(function (maxCount, count) {
        return Math.max(maxCount, count);
      }, 0),
      sectionCount: listCounts.length,
    };
  }

  function getShoppingGroupLayout(group, boardColumns) {
    const metrics = getShoppingGroupMetrics(group);
    const columns = Number(boardColumns || 12);
    let span = columns === 1 ? 1 : 3;

    if (metrics.maxListItems >= 4 || metrics.totalItems >= 6) {
      span = columns >= 12 ? 4 : Math.min(columns, 4);
    }

    if (metrics.maxListItems >= 7 || metrics.totalItems >= 9) {
      span = columns >= 12 ? 6 : columns;
    }

    if (metrics.maxListItems >= 14 || metrics.totalItems >= 18) {
      span = columns >= 12 ? 8 : columns;
    }

    if (metrics.sectionCount >= 3 && columns >= 12) {
      span = Math.max(span, 6);
    }

    span = Math.max(1, Math.min(span, columns));
    return {
      span: span,
      maxListItems: metrics.maxListItems,
    };
  }

  function getShoppingSectionColumnCount(group, groupLayout, boardColumns) {
    if (!group.sections || group.sections.length <= 1) {
      return 1;
    }

    const columns = Number(boardColumns || 12);
    const groupSpan = Number((groupLayout && groupLayout.span) || 1);
    const sectionCount = group.sections.length;
    const largestSection = group.sections.reduce(function (maxCount, section) {
      return Math.max(maxCount, Array.isArray(section.items) ? section.items.length : 0);
    }, 0);

    if (columns <= 6) {
      if (groupSpan >= 6 && sectionCount >= 3 && largestSection <= 4) {
        return 2;
      }
      return 1;
    }

    if (groupSpan >= 8 && sectionCount >= 4 && largestSection <= 4) {
      return Math.min(3, sectionCount);
    }

    if (groupSpan >= 6 && sectionCount >= 2) {
      return Math.min(2, sectionCount);
    }

    return 1;
  }

  function applyShoppingListLayout(container, itemCount, groupLayout, boardColumns, options) {
    const settings = options || {};
    const itemColumns = getShoppingItemColumnCount(itemCount, groupLayout, boardColumns, settings);
    container.style.setProperty("--shopping-item-columns", String(itemColumns));
  }

  function getShoppingItemColumnCount(itemCount, groupLayout, boardColumns, options) {
    const settings = options || {};
    const columns = Number(boardColumns || 12);
    const groupSpan = Number(settings.effectiveSpan || (groupLayout && groupLayout.span) || 1);
    const count = Number(itemCount || 0);

    if (columns <= 1) {
      return 1;
    }

    if (columns >= 12 && groupSpan >= 8 && count >= 18) {
      return 4;
    }

    if (columns >= 12 && groupSpan >= 6 && count >= 10) {
      return 3;
    }

    if (groupSpan >= 4 && count >= 6) {
      return 2;
    }

    return 1;
  }

  function buildNeedLabel(needEntry) {
    if (needEntry.cardScope === "projects") {
      const suffixMatch = String(needEntry.milestoneLabel || "").match(/\(\d+\/\d+\)/);
      if (suffixMatch) {
        return needEntry.cardTitle + " " + suffixMatch[0];
      }
    }

    return needEntry.cardLabel + " " + needEntry.milestoneLabel;
  }

  function buildShoppingItems(needEntries, secondaryLabelBuilder, extraEntryBuilder) {
    const aggregated = new Map();

    needEntries.forEach(function (needEntry) {
      if (!aggregated.has(needEntry.item)) {
        aggregated.set(needEntry.item, {
          item: needEntry.item,
          total: 0,
          secondaryLabels: [],
          extraEntries: new Map(),
        });
      }

      const aggregateEntry = aggregated.get(needEntry.item);
      aggregateEntry.total += needEntry.need;
      const secondaryLabel = secondaryLabelBuilder ? secondaryLabelBuilder(needEntry) : "";
      if (secondaryLabel && !aggregateEntry.secondaryLabels.includes(secondaryLabel)) {
        aggregateEntry.secondaryLabels.push(secondaryLabel);
      }

      const extraEntries = extraEntryBuilder ? extraEntryBuilder(needEntry) : [];
      extraEntries.forEach(function (entry) {
        if (!entry || !entry.text) {
          return;
        }
        aggregateEntry.extraEntries.set(entry.text, entry);
      });
    });

    return Array.from(aggregated.values()).map(function (aggregateEntry) {
      return {
        item: aggregateEntry.item,
        total: aggregateEntry.total,
        secondaryLabel: aggregateEntry.secondaryLabels.sort(function (a, b) {
          return a.localeCompare(b);
        }).join(", "),
        alsoFoundIn: Array.from(aggregateEntry.extraEntries.values()).sort(function (a, b) {
          return a.text.localeCompare(b.text);
        }),
      };
    });
  }

  function groupNeedsByCard(needEntries) {
    const grouped = new Map();

    needEntries.forEach(function (needEntry) {
      if (!grouped.has(needEntry.cardId)) {
        grouped.set(needEntry.cardId, {
          title: needEntry.cardTitle,
          entries: [],
          sectionsById: new Map(),
        });
      }

      const group = grouped.get(needEntry.cardId);
      if (state.includeFutureNeeds) {
        if (!group.sectionsById.has(needEntry.milestoneId)) {
          group.sectionsById.set(needEntry.milestoneId, {
            title: needEntry.milestoneLabel,
            order: needEntry.milestoneOrder,
            entries: [],
          });
        }
        group.sectionsById.get(needEntry.milestoneId).entries.push(needEntry);
      } else {
        group.entries.push(needEntry);
      }
    });

    Array.from(grouped.values()).forEach(function (group) {
      if (state.includeFutureNeeds) {
        group.sections = Array.from(group.sectionsById.values())
          .sort(function (a, b) {
            return a.order - b.order;
          })
          .map(function (section) {
            return {
              title: section.title,
              items: buildShoppingItems(section.entries, null, function (needEntry) {
                return getSecondaryFoundInEntries(needEntry.item, getPrimaryFoundInSourceName(needEntry.item));
              }),
            };
          });
      } else {
        group.items = buildShoppingItems(group.entries, null, function (needEntry) {
          return getSecondaryFoundInEntries(needEntry.item, getPrimaryFoundInSourceName(needEntry.item));
        });
      }
      delete group.entries;
      delete group.sectionsById;
    });

    return grouped;
  }

  function groupNeedsByFoundIn(needEntries) {
    const grouped = new Map();

    needEntries.forEach(function (needEntry) {
      const foundInValues = needEntry.foundIn && needEntry.foundIn.length ? needEntry.foundIn : ["Unknown"];
      const primarySource = foundInValues[0];

      if (!grouped.has(primarySource)) {
        grouped.set(primarySource, {
          title: primarySource,
          entries: [],
        });
      }

      grouped.get(primarySource).entries.push(needEntry);
    });

    Array.from(grouped.values()).forEach(function (group) {
      group.items = buildShoppingItems(group.entries, buildNeedLabel, function (needEntry) {
        return getSecondaryFoundInEntries(needEntry.item, group.title);
      });
      delete group.entries;
    });

    return grouped;
  }

  function getSecondaryFoundInEntries(itemName, primarySource) {
    const item = itemData[itemName] || {};
    const entries = Array.isArray(item.foundInEntries) && item.foundInEntries.length
      ? item.foundInEntries
      : (item.foundIn || []).map(function (sourceName) {
          return {
            text: sourceName,
            iconUrl: uiIcons.foundIn[sourceName] || "",
          };
        });

    return entries.filter(function (entry) {
      return entry && entry.text && entry.text !== primarySource;
    });
  }

  function renderTrackerCard(context, currentLevel, nextLevel) {
    const card = document.createElement("article");
    card.className = "tracker-card";
    card.dataset.cardKey = context.levelStateKey;
    card.dataset.baseCardId = context.baseCard.id;
    const isWorkshopCard = context.baseCard.scope === "workshops";
    const isScrappyCard = context.baseCard.id === "scrappy";
    const isProjectCard = context.baseCard.scope === "projects";
    const hasVariants = Array.isArray(context.baseCard.variants) && context.baseCard.variants.length;

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

    if (isWorkshopCard) {
      top.append(titleWrap, renderProgressDots(context, currentLevel, { displayMode: "target-milestone" }));
    } else if (isScrappyCard) {
      top.append(titleWrap, renderProgressDots(context, currentLevel));
    } else if (isProjectCard) {
      top.append(titleWrap, renderProgressDots(context, currentLevel, { displayMode: "target-milestone" }));
    } else {
      const status = document.createElement("div");
      status.className = "status-pill" + (currentLevel >= context.activeCard.maxLevel ? " maxed" : "");
      status.textContent = currentLevel >= context.activeCard.maxLevel
        ? (context.activeCard.completeLabel || "Complete")
        : "Next: " + getMilestoneLabel(context.activeCard, nextLevel);
      top.append(titleWrap, status);
    }

    card.appendChild(top);

    if (!isWorkshopCard && !isScrappyCard && hasVariants) {
      const levelRow = document.createElement("div");
      levelRow.className = "level-row";

      if (hasVariants) {
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
    const pendingLevels = getSummaryLevels(context, currentLevel);

    if (!pendingLevels.length) {
      const empty = document.createElement("p");
      empty.className = "empty-upgrade";
      empty.textContent = getEmptyMessage(context);
      nextUpgradePanel.appendChild(empty);
      appendCompletionPageSections(nextUpgradePanel, context);
      card.appendChild(nextUpgradePanel);
      return card;
    }

    pendingLevels.forEach(function (levelInfo, index) {
      nextUpgradePanel.appendChild(renderUpgradeSection(context, levelInfo, index > 0));
    });

    if (context.activeCard.completionRewards && context.activeCard.completionRewards.length) {
      nextUpgradePanel.appendChild(renderChipSection("Completion Rewards", context.activeCard.completionRewards, "reward", true));
    }

    card.appendChild(nextUpgradePanel);
    return card;
  }

  function renderUpgradeSection(context, levelInfo, addDivider) {
    const section = document.createElement("div");
    section.className = "upgrade-section";
    section.classList.toggle("is-separated", addDivider);

    const heading = document.createElement("h3");
    heading.textContent = "Requirements for " + getMilestoneLabel(context.activeCard, levelInfo);
    section.appendChild(heading);

    if (levelInfo.description) {
      const description = document.createElement("p");
      description.className = "stage-description";
      description.textContent = levelInfo.description;
      section.appendChild(description);
    }

    const requirementList = document.createElement("div");
    requirementList.className = "requirement-list";

    levelInfo.requirements.forEach(function (requirement) {
      const key = progressKey(context, levelInfo.level, requirement.item);
      const have = Number(state.progress[key] || 0);
      const clampedHave = Math.max(0, Math.min(have, requirement.quantity));

      if (clampedHave !== have) {
        state.progress[key] = clampedHave;
      }

      const row = document.createElement("div");
      row.className = "requirement";
      row.dataset.progressKey = key;
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
        if (syncAutoAdvancedLevel(context).changed) {
          render();
          return;
        }
        renderSummary();
      });

      const count = document.createElement("span");
      count.className = "requirement-count";
      count.textContent = "/" + formatRequirementValue(requirement.quantity);

      progress.append(input, count);
      row.append(main, progress);
      requirementList.appendChild(row);
    });

    section.appendChild(requirementList);

    if (levelInfo.crafts && levelInfo.crafts.length > 0) {
      section.appendChild(
        renderChipSection("Unlocks at " + getMilestoneLabel(context.activeCard, levelInfo), levelInfo.crafts, "unlock")
      );
    }

    if (levelInfo.rewards && levelInfo.rewards.length > 0) {
      section.appendChild(
        renderChipSection(getRewardSectionTitle(context, levelInfo), levelInfo.rewards, "reward")
      );
    }

    return section;
  }

  function renderChipSection(titleText, entries, variant, addDivider) {
    const section = document.createElement("div");
    section.className = "unlocks" + (variant === "reward" ? " rewards" : "");
    if (addDivider) {
      section.classList.add("is-separated");
    }

    const title = document.createElement("h4");
    title.textContent = titleText;
    section.appendChild(title);

    const list = document.createElement("div");
    list.className = "unlock-list";

    entries.forEach(function (entry) {
      const normalizedEntry = typeof entry === "string"
        ? { item: entry, quantity: 1 }
        : entry;
      const catalogEntry = resolveCatalogEntry(normalizedEntry.item);
      const rarityClass = getCatalogEntryRarityClass(catalogEntry);
      const chip = document.createElement("span");
      chip.className = (variant === "reward" ? "reward-chip" : "unlock-chip") + (rarityClass ? " " + rarityClass : "");
      chip.appendChild(createItemInline(normalizedEntry.item, {
        iconOnly: true,
        label: variant === "reward" && Number(normalizedEntry.quantity || 1) > 1
          ? formatRequirementValue(normalizedEntry.quantity) + "x " + normalizedEntry.item
          : normalizedEntry.item,
      }));

      if (variant === "reward" && Number(normalizedEntry.quantity || 1) > 1) {
        const quantityBadge = document.createElement("span");
        quantityBadge.className = "reward-qty";
        quantityBadge.textContent = "x" + formatRequirementValue(normalizedEntry.quantity);
        chip.appendChild(quantityBadge);
      }

      list.appendChild(chip);
    });

    section.appendChild(list);
    return section;
  }

  function appendCompletionPageSections(container, context) {
    if (context.baseCard.scope === "workshops") {
      appendLevelChipSections(container, context, {
        titleBuilder: function (levelInfo) {
          return "Crafts Unlocked at " + getMilestoneLabel(context.activeCard, levelInfo);
        },
        entryKey: "crafts",
        variant: "unlock",
      });
      return;
    }

    if (context.baseCard.scope === "projects") {
      const appendedStageRewards = appendLevelChipSections(container, context, {
        titleBuilder: function (levelInfo) {
          return getRewardSectionTitle(context, levelInfo);
        },
        entryKey: "rewards",
        variant: "reward",
      });

      if (context.activeCard.completionRewards && context.activeCard.completionRewards.length) {
        container.appendChild(
          renderChipSection("Completion Rewards", context.activeCard.completionRewards, "reward", appendedStageRewards)
        );
      }
    }
  }

  function appendLevelChipSections(container, context, options) {
    const settings = options || {};
    let appendedCount = 0;

    context.activeCard.levels.forEach(function (levelInfo) {
      const entries = Array.isArray(levelInfo[settings.entryKey]) ? levelInfo[settings.entryKey] : [];
      if (!entries.length) {
        return;
      }

      container.appendChild(
        renderChipSection(
          settings.titleBuilder
            ? settings.titleBuilder(levelInfo)
            : getMilestoneLabel(context.activeCard, levelInfo),
          entries,
          settings.variant,
          appendedCount > 0
        )
      );
      appendedCount += 1;
    });

    return appendedCount > 0;
  }

  function getRewardSectionTitle(context, levelInfo) {
    const milestoneLabel = getMilestoneLabel(context.activeCard, levelInfo);
    if (context.baseCard.scope === "projects") {
      return "Rewards for " + milestoneLabel;
    }
    return "Rewards at " + milestoneLabel;
  }

  function renderProgressDots(context, currentLevel, options) {
    const settings = options || {};
    const isTargetMilestoneMode = settings.displayMode === "target-milestone";
    const dots = document.createElement("div");
    dots.className = "progress-dots" + (isTargetMilestoneMode ? " project-stage-dots" : "");
    dots.setAttribute("role", "radiogroup");
    dots.setAttribute("aria-label", context.baseCard.title + " progress");

    const minimumLevel = Number(context.activeCard.minLevel || context.baseCard.minLevel || 0);
    const maximumLevel = Number(context.activeCard.maxLevel || context.baseCard.maxLevel || 0);

    for (let level = minimumLevel; level <= maximumLevel; level += 1) {
      const dot = document.createElement("button");
      const isCompleteOption = isTargetMilestoneMode && level === maximumLevel;
      dot.type = "button";
      dot.className = "level-dot"
        + (level === currentLevel ? " active" : "")
        + (isCompleteOption ? " is-complete-option" : "");
      dot.textContent = isTargetMilestoneMode
        ? (isCompleteOption ? "\u2713" : String(level + 1))
        : String(level);
      dot.title = isTargetMilestoneMode
        ? getTargetMilestoneLabel(context, level)
        : (level === 0 ? "Unbuilt" : "Level " + level);
      dot.setAttribute("aria-label", dot.title);
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
    if (rewardData[entryName]) {
      return { kind: "reward", data: rewardData[entryName] };
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

      if (settings.extraNode) {
        copy.appendChild(settings.extraNode);
      }

      if (settings.extraContent) {
        copy.appendChild(settings.extraContent);
      }

      wrapper.appendChild(copy);
    }

    if (catalogEntry) {
      if (hideCopy) {
        wrapper.setAttribute("aria-label", settings.label || itemName);
        wrapper.title = settings.label || itemName;
      }
      wrapper.tabIndex = 0;
      wrapper.addEventListener("mouseenter", function () {
        tooltipManager.showTooltip(settings.label || itemName, catalogEntry, wrapper);
      });
      wrapper.addEventListener("mousemove", function () {
        tooltipManager.positionTooltip(wrapper);
      });
      wrapper.addEventListener("mouseleave", tooltipManager.hideTooltip);
      wrapper.addEventListener("focus", function () {
        tooltipManager.showTooltip(settings.label || itemName, catalogEntry, wrapper);
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
      return card.zeroLabel || "Not started";
    }

    const levelInfo = card.levels.find(function (entry) {
      return entry.level === level;
    });

    if (!levelInfo) {
      return "Level " + level;
    }

    return levelInfo.progressLabel || levelInfo.label || ("Level " + level);
  }

  function getTargetMilestoneLabel(context, completedLevel) {
    const maximumLevel = Number(context.activeCard.maxLevel || 0);
    if (completedLevel >= maximumLevel) {
      return getCompletionMessage(context);
    }

    const nextLevelInfo = context.activeCard.levels.find(function (entry) {
      return entry.level === completedLevel + 1;
    });

    if (!nextLevelInfo) {
      return context.baseCard.scope === "workshops"
        ? "Level " + (completedLevel + 1)
        : "Stage " + (completedLevel + 1);
    }

    return nextLevelInfo.label || ("Stage " + (completedLevel + 1));
  }

  function getEmptyMessage(context) {
    if (context.baseCard.id === "expedition") {
      return "These tracked expedition stages are complete. Move the expedition selector when you start the next expedition.";
    }

    if (context.baseCard.scope === "workshops") {
      return getCompletionMessage(context);
    }

    if (context.baseCard.scope === "projects") {
      return getCompletionMessage(context);
    }

    return "No materials needed here right now.";
  }

  function getCompletionMessage(context) {
    if (context.baseCard.scope === "workshops") {
      return "Max station level reached.";
    }

    if (context.baseCard.scope === "projects") {
      return "Project completed.";
    }

    return context.activeCard.completeLabel || "Complete";
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
