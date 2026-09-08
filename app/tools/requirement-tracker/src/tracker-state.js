(function () {
  function normalizeTrackerData(rawTrackerData) {
    if (!isPlainObject(rawTrackerData)) {
      return null;
    }

    if (Array.isArray(rawTrackerData.cards)) {
      return {
        schemaVersion: Number(rawTrackerData.schemaVersion || 1),
        generatedAt: rawTrackerData.generatedAt || "",
        buildId: rawTrackerData.buildId || "",
        uiIcons: rawTrackerData.uiIcons || { cards: {}, foundIn: {} },
        rewardCatalog: rawTrackerData.rewardCatalog || {},
        cards: sortCards(rawTrackerData.cards),
      };
    }

    if (!Array.isArray(rawTrackerData.stations)) {
      return null;
    }

    const cards = rawTrackerData.stations.map(function (card) {
      const workshopTitle = card.workshop || card.station || "";
      return normalizeLegacyCard(card, {
        id: "workshop-" + slugify(workshopTitle),
        title: workshopTitle,
      });
    });

    if (rawTrackerData.scrappy) {
      cards.push(normalizeLegacyCard(rawTrackerData.scrappy, { id: "scrappy", title: "Scrappy" }));
    }

    if (rawTrackerData.expedition) {
      cards.push(normalizeLegacyCard(rawTrackerData.expedition, { id: "expedition", title: "Expedition" }));
    }

    return {
      schemaVersion: 1,
      generatedAt: "",
      buildId: "legacy",
      uiIcons: rawTrackerData.uiIcons || { cards: {}, foundIn: {} },
      rewardCatalog: {},
      cards: sortCards(cards),
    };
  }

  function normalizeLegacyCard(card, defaults) {
    const normalized = {
      id: defaults.id,
      title: defaults.title,
      kindLabel: card.kindLabel || "Progress",
      scope: card.scope,
      sortOrder: Number(card.sortOrder || 0),
      iconUrl: card.iconUrl || "",
    };

    if (Array.isArray(card.variants)) {
      normalized.variants = card.variants.map(function (variant) {
        return {
          id: variant.id,
          title: variant.title || variant.label || variant.id,
          minLevel: Number(variant.minLevel || 0),
          maxLevel: Number(variant.maxLevel || 0),
          zeroLabel: variant.zeroLabel || "Not started",
          completeLabel: variant.completeLabel || "Complete",
          levels: normalizeLegacyLevels(variant.levels || []),
        };
      });
      return normalized;
    }

    normalized.minLevel = Number(card.minLevel || 0);
    normalized.maxLevel = Number(card.maxLevel || 0);
    normalized.levels = normalizeLegacyLevels(card.levels || []);
    return normalized;
  }

  function normalizeLegacyLevels(levels) {
    return levels.map(function (level) {
      return {
        level: Number(level.level),
        label: level.label,
        progressLabel: level.progressLabel,
        description: level.description,
        requirements: (level.requirements || []).map(function (requirement) {
          return {
            item: requirement.item,
            quantity: Number(requirement.quantity),
          };
        }),
        crafts: level.crafts || [],
      };
    });
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function sortCards(cards) {
    return cards.slice().sort(function (left, right) {
      const leftOrder = getSortOrder(left.sortOrder);
      const rightOrder = getSortOrder(right.sortOrder);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(left.title || "").localeCompare(String(right.title || ""));
    });
  }

  function getSortOrder(value) {
    if (value === null || value === undefined || value === "") {
      return 9999;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 9999;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function sanitizeNumberMap(value) {
    if (!isPlainObject(value)) {
      return {};
    }

    const sanitized = {};
    Object.keys(value).forEach(function (key) {
      const rawValue = value[key];
      if (typeof rawValue !== "number" && typeof rawValue !== "string") {
        return;
      }
      if (typeof rawValue === "string" && !rawValue.trim()) {
        return;
      }
      const numericValue = Number(rawValue);
      if (Number.isFinite(numericValue) && numericValue >= 0) {
        sanitized[key] = Math.floor(numericValue);
      }
    });
    return sanitized;
  }

  function sanitizeStringMap(value) {
    if (!isPlainObject(value)) {
      return {};
    }

    const sanitized = {};
    Object.keys(value).forEach(function (key) {
      const stringValue = String(value[key] || "").trim();
      if (stringValue) {
        sanitized[key] = stringValue;
      }
    });
    return sanitized;
  }

  function sanitizeState(rawState, stateVersion) {
    const allowedScopes = ["all", "workshops", "scrappy", "expedition", "projects"];
    const candidate = isPlainObject(rawState) ? rawState : {};
    return {
      version: stateVersion,
      levels: sanitizeNumberMap(candidate.levels),
      progress: sanitizeNumberMap(candidate.progress),
      variants: sanitizeStringMap(candidate.variants),
      cardOrder: Array.isArray(candidate.cardOrder)
        ? Array.from(new Set(candidate.cardOrder
          .filter(function (entry) { return typeof entry === "string"; })
          .map(function (entry) { return entry.trim(); })
          .filter(Boolean)))
        : [],
      shoppingMode: candidate.shoppingMode === "found" ? "found" : "card",
      includeFutureNeeds: Boolean(candidate.includeFutureNeeds),
      cardScope: allowedScopes.includes(candidate.cardScope) ? candidate.cardScope : "all",
    };
  }

  function arraysEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every(function (value, index) {
      return value === right[index];
    });
  }

  function formatTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }

  window.RequirementTrackerState = {
    arraysEqual: arraysEqual,
    formatTimestamp: formatTimestamp,
    normalizeTrackerData: normalizeTrackerData,
    sanitizeState: sanitizeState,
  };
})();
