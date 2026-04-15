(function () {
  const STORAGE_KEY = "raiderbro.weaponOptimizer.state.v1";
  const weaponData = window.WEAPON_DATA || {};
  const modData = window.WEAPON_MOD_DATA || {};

  const weaponTypeSelect = document.getElementById("weapon-type-select");
  const weaponSelect = document.getElementById("weapon-select");
  const weaponLevels = document.getElementById("weapon-levels");
  const weaponOverview = document.getElementById("weapon-overview");
  const weaponStats = document.getElementById("weapon-stats");
  const modSlotGrid = document.getElementById("mod-slot-grid");
  const buildEffects = document.getElementById("build-effects");

  const weapons = Object.keys(weaponData)
    .map(function (name) {
      return {
        name: name,
        data: weaponData[name],
      };
    })
    .sort(function (left, right) {
      const leftType = String(left.data.type || "");
      const rightType = String(right.data.type || "");
      if (leftType !== rightType) {
        return leftType.localeCompare(rightType);
      }
      return left.name.localeCompare(right.name);
    });

  if (!weapons.length) {
    document.body.innerHTML = "<p style='padding:24px;font-family:sans-serif'>Missing weapon dataset. Run python scripts/convert_wiki_tables.py first.</p>";
    return;
  }

  const weaponTypes = ["All"].concat(
    Array.from(
      new Set(
        weapons.map(function (weapon) {
          return weapon.data.type;
        })
      )
    ).sort(function (left, right) {
      return String(left).localeCompare(String(right));
    })
  );

  const state = loadState();

  buildWeaponTypeOptions();
  syncState();
  render();

  weaponTypeSelect.addEventListener("change", function (event) {
    state.type = event.target.value;
    syncState();
    saveState();
    render();
  });

  weaponSelect.addEventListener("change", function (event) {
    state.weaponName = event.target.value;
    syncState();
    saveState();
    render();
  });

  function loadState() {
    const fallback = {
      type: "All",
      weaponName: weapons[0].name,
      level: 1,
      attachmentsByWeapon: {},
    };

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw);
      return {
        type: typeof parsed.type === "string" ? parsed.type : fallback.type,
        weaponName: typeof parsed.weaponName === "string" ? parsed.weaponName : fallback.weaponName,
        level: Number.isInteger(parsed.level) ? parsed.level : fallback.level,
        attachmentsByWeapon: parsed.attachmentsByWeapon && typeof parsed.attachmentsByWeapon === "object"
          ? parsed.attachmentsByWeapon
          : fallback.attachmentsByWeapon,
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function buildWeaponTypeOptions() {
    weaponTypeSelect.innerHTML = "";
    weaponTypes.forEach(function (type) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      weaponTypeSelect.appendChild(option);
    });
  }

  function getFilteredWeapons() {
    return weapons.filter(function (weapon) {
      return state.type === "All" || weapon.data.type === state.type;
    });
  }

  function syncState() {
    if (!weaponTypes.includes(state.type)) {
      state.type = "All";
    }

    const filteredWeapons = getFilteredWeapons();
    if (!filteredWeapons.length) {
      state.type = "All";
    }

    const nextFilteredWeapons = getFilteredWeapons();
    if (!nextFilteredWeapons.some(function (weapon) { return weapon.name === state.weaponName; })) {
      state.weaponName = nextFilteredWeapons[0].name;
    }

    const selectedWeapon = getSelectedWeapon();
    const availableLevels = getAvailableLevels(selectedWeapon);
    if (!availableLevels.includes(state.level)) {
      state.level = availableLevels[0];
    }

    syncWeaponAttachments(selectedWeapon);
  }

  function syncWeaponAttachments(selectedWeapon) {
    const weaponAttachments = getWeaponAttachments(selectedWeapon.name);
    const allowedBySlot = {};

    (selectedWeapon.data.modSlots || []).forEach(function (slot) {
      allowedBySlot[slot.name] = new Set((slot.options || []).slice());
      if (!Object.prototype.hasOwnProperty.call(weaponAttachments, slot.name)) {
        weaponAttachments[slot.name] = "";
      }
    });

    Object.keys(weaponAttachments).forEach(function (slotName) {
      if (!Object.prototype.hasOwnProperty.call(allowedBySlot, slotName)) {
        delete weaponAttachments[slotName];
        return;
      }
      if (weaponAttachments[slotName] && !allowedBySlot[slotName].has(weaponAttachments[slotName])) {
        weaponAttachments[slotName] = "";
      }
    });
  }

  function getWeaponAttachments(weaponName) {
    if (!state.attachmentsByWeapon[weaponName] || typeof state.attachmentsByWeapon[weaponName] !== "object") {
      state.attachmentsByWeapon[weaponName] = {};
    }
    return state.attachmentsByWeapon[weaponName];
  }

  function getSelectedWeapon() {
    return weapons.find(function (weapon) {
      return weapon.name === state.weaponName;
    }) || weapons[0];
  }

  function getAvailableLevels(selectedWeapon) {
    const levels = (selectedWeapon.data.levels || []).map(function (levelData) {
      return Number(levelData.level);
    }).filter(function (level) {
      return Number.isFinite(level);
    });

    return levels.length ? levels : [1];
  }

  function getLevelRecord(selectedWeapon) {
    const levelRecords = selectedWeapon.data.levels || [];
    return levelRecords.find(function (levelData) {
      return Number(levelData.level) === state.level;
    }) || levelRecords[0] || { level: 1, effects: [], perkTexts: [] };
  }

  function getAttachmentSelections(selectedWeapon) {
    const slotSelections = getWeaponAttachments(selectedWeapon.name);
    return (selectedWeapon.data.modSlots || []).map(function (slot) {
      const selectedModName = slotSelections[slot.name] || "";
      const selectedMod = selectedModName ? modData[selectedModName] || null : null;
      return {
        slot: slot,
        selectedModName: selectedModName,
        selectedMod: selectedMod,
      };
    });
  }

  function render() {
    const selectedWeapon = getSelectedWeapon();
    const build = computeBuild(selectedWeapon);

    weaponTypeSelect.value = state.type;
    syncWeaponOptions();
    renderLevelPills(selectedWeapon);
    renderOverview(selectedWeapon, build);
    renderStats(build);
    renderEffects(build);
    renderSlots(selectedWeapon, build);
  }

  function syncWeaponOptions() {
    const filteredWeapons = getFilteredWeapons();
    weaponSelect.innerHTML = "";
    filteredWeapons.forEach(function (weapon) {
      const option = document.createElement("option");
      option.value = weapon.name;
      option.textContent = weapon.name;
      option.selected = weapon.name === state.weaponName;
      weaponSelect.appendChild(option);
    });
    weaponSelect.value = state.weaponName;
  }

  function renderLevelPills(selectedWeapon) {
    const availableLevels = getAvailableLevels(selectedWeapon);
    const maxDisplayLevel = Math.max(4, availableLevels[availableLevels.length - 1] || 1);

    weaponLevels.innerHTML = "";
    for (let level = 1; level <= maxDisplayLevel; level += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-pill" + (state.level === level ? " active" : "");
      button.textContent = "L" + level;
      button.disabled = !availableLevels.includes(level);
      button.classList.toggle("is-disabled", button.disabled);
      button.addEventListener("click", function () {
        if (button.disabled || state.level === level) {
          return;
        }
        state.level = level;
        saveState();
        render();
      });
      weaponLevels.appendChild(button);
    }
  }

  function computeBuild(selectedWeapon) {
    const levelRecord = getLevelRecord(selectedWeapon);
    const attachmentSelections = getAttachmentSelections(selectedWeapon);
    const levelEffects = (levelRecord.effects || []).map(function (effect) {
      return {
        effect: effect,
        source: "Level " + levelRecord.level,
        sourceType: "level",
      };
    });

    const attachmentEffects = [];
    const equippedMods = [];
    let attachmentValue = 0;

    attachmentSelections.forEach(function (selection) {
      if (!selection.selectedMod) {
        return;
      }

      equippedMods.push(selection.selectedModName);
      attachmentValue += toNumber(selection.selectedMod.sellPrice) || 0;

      (selection.selectedMod.effects || []).forEach(function (effect) {
        attachmentEffects.push({
          effect: effect,
          source: selection.selectedModName,
          sourceType: "attachment",
        });
      });
    });

    const allEffects = levelEffects.concat(attachmentEffects);
    const magazineSizeByLevel = selectedWeapon.data.magazineSizeByLevel || {};
    const explicitMagazineSize = toNumber(
      magazineSizeByLevel[state.level] != null
        ? magazineSizeByLevel[state.level]
        : magazineSizeByLevel[String(state.level)]
    );
    const baseMagazineSize = explicitMagazineSize != null
      ? explicitMagazineSize
      : getBaseMagazineWithLevelEffects(selectedWeapon.data, levelRecord.effects || []);
    const attachmentMagazineDelta = sumEffectDelta(attachmentEffects, "magazineSize", "flat");
    const effectiveMagazineSize = baseMagazineSize != null ? baseMagazineSize + attachmentMagazineDelta : null;

    const baseFireRate = toNumber(selectedWeapon.data.fireRate);
    const fireRatePercent = sumEffectDelta(allEffects, "fireRate", "percent");
    const effectiveFireRate = baseFireRate != null ? applyPercent(baseFireRate, fireRatePercent) : null;
    const baseFireRateRpm = toNumber(selectedWeapon.data.fireRateRpm);
    const effectiveFireRateRpm = baseFireRateRpm != null ? applyPercent(baseFireRateRpm, fireRatePercent) : null;

    const projectileSensitive = hasEffect(allEffects, "projectileDamage") || hasEffect(allEffects, "projectilesPerShot");
    const baseRelativeDps = toNumber(selectedWeapon.data.relativeDps);
    const estimatedRelativeDps = (!projectileSensitive && baseRelativeDps != null && baseFireRate != null && effectiveFireRate != null)
      ? baseRelativeDps * (effectiveFireRate / baseFireRate)
      : null;

    const totalValue = (toNumber(levelRecord.sellPrice) || 0) + attachmentValue;
    const durability = levelRecord.durability != null ? Number(levelRecord.durability) : null;

    return {
      selectedWeapon: selectedWeapon,
      levelRecord: levelRecord,
      attachmentSelections: attachmentSelections,
      equippedMods: equippedMods,
      levelEffects: levelEffects,
      attachmentEffects: attachmentEffects,
      effectGroups: groupEffects(allEffects),
      slotCount: (selectedWeapon.data.modSlots || []).length,
      stats: {
        damage: toNumber(selectedWeapon.data.damage),
        damageLabel: selectedWeapon.data.damage || "—",
        fireRateBase: baseFireRate,
        fireRateCurrent: effectiveFireRate,
        fireRateRpmBase: baseFireRateRpm,
        fireRateRpmCurrent: effectiveFireRateRpm,
        relativeDpsBase: baseRelativeDps,
        relativeDpsCurrent: estimatedRelativeDps,
        relativeDpsDerived: !projectileSensitive && estimatedRelativeDps != null,
        range: toNumber(selectedWeapon.data.range),
        rangeLabel: selectedWeapon.data.range || "—",
        magazineSizeBase: baseMagazineSize,
        magazineSizeCurrent: effectiveMagazineSize,
        durability: durability,
        headshotMultiplier: selectedWeapon.data.headshotMultiplier || "",
        arcArmorPenetration: selectedWeapon.data.arcArmorPenetration || "",
        stability: selectedWeapon.data.stability || "",
        agility: selectedWeapon.data.agility || "",
        stealth: selectedWeapon.data.stealth || "",
        weight: selectedWeapon.data.weight || "",
      },
      value: {
        weapon: toNumber(levelRecord.sellPrice) || 0,
        attachments: attachmentValue,
        total: totalValue,
      },
    };
  }

  function getBaseMagazineWithLevelEffects(weapon, levelEffects) {
    const baseMagazine = toNumber(weapon.magazineSize);
    if (baseMagazine == null) {
      return null;
    }
    return baseMagazine + sumEffectDelta(
      (levelEffects || []).map(function (effect) {
        return { effect: effect };
      }),
      "magazineSize",
      "flat"
    );
  }

  function groupEffects(effectEntries) {
    const groups = new Map();

    effectEntries.forEach(function (entry) {
      const effect = entry.effect || {};
      const key = effect.kind === "text"
        ? "text:" + effect.text
        : effect.kind + ":" + String(effect.statKey || effect.stat || effect.text);

      if (!groups.has(key)) {
        groups.set(key, {
          key: key,
          kind: effect.kind || "text",
          stat: effect.stat || "",
          statKey: effect.statKey || "",
          delta: 0,
          texts: [],
          sources: [],
        });
      }

      const group = groups.get(key);
      if (typeof effect.delta === "number") {
        group.delta += effect.delta;
      }
      if (effect.text) {
        group.texts.push(effect.text);
      }
      if (entry.source) {
        group.sources.push(entry.source);
      }
    });

    return Array.from(groups.values())
      .map(function (group) {
        group.sources = Array.from(new Set(group.sources));
        return group;
      })
      .sort(function (left, right) {
        const leftPriority = left.kind === "text" ? 1 : 0;
        const rightPriority = right.kind === "text" ? 1 : 0;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return String(left.stat || left.texts[0] || "").localeCompare(String(right.stat || right.texts[0] || ""));
      });
  }

  function sumEffectDelta(effectEntries, statKey, kind) {
    return effectEntries.reduce(function (total, entry) {
      const effect = entry.effect || {};
      if ((effect.statKey || "") !== statKey || effect.kind !== kind || typeof effect.delta !== "number") {
        return total;
      }
      return total + effect.delta;
    }, 0);
  }

  function hasEffect(effectEntries, statKey) {
    return effectEntries.some(function (entry) {
      return (entry.effect && entry.effect.statKey) === statKey;
    });
  }

  function applyPercent(value, delta) {
    return value * (1 + delta / 100);
  }

  function toNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return value;
    }
    const normalized = String(value).replace(/,/g, "").replace(/x$/i, "").trim();
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function formatNumber(value, options) {
    const settings = options || {};
    if (value == null || Number.isNaN(value)) {
      return "—";
    }
    const maximumFractionDigits = settings.maximumFractionDigits != null ? settings.maximumFractionDigits : 1;
    const minimumFractionDigits = settings.minimumFractionDigits != null ? settings.minimumFractionDigits : 0;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: minimumFractionDigits,
      maximumFractionDigits: maximumFractionDigits,
    });
  }

  function formatCoins(value) {
    return formatNumber(value, { maximumFractionDigits: 0 }) + " Coins";
  }

  function formatDelta(group) {
    if (group.kind === "percent") {
      const value = group.delta;
      return (value > 0 ? "+" : "") + formatNumber(value, { maximumFractionDigits: 2 }) + "%";
    }
    if (group.kind === "flat") {
      const value = group.delta;
      return (value > 0 ? "+" : "") + formatNumber(value, { maximumFractionDigits: 2 });
    }
    return group.texts[0] || "";
  }

  function formatValueWithBase(currentValue, baseValue, suffix) {
    if (currentValue == null) {
      return { value: "—", context: "" };
    }

    const formattedValue = formatNumber(currentValue, { maximumFractionDigits: 1 }) + (suffix || "");
    if (baseValue == null || Math.abs(currentValue - baseValue) < 0.001) {
      return { value: formattedValue, context: "" };
    }

    return {
      value: formattedValue,
      context: "Base " + formatNumber(baseValue, { maximumFractionDigits: 1 }) + (suffix || ""),
    };
  }

  function renderOverview(selectedWeapon, build) {
    const weapon = selectedWeapon.data;
    const rarityClass = getRarityClass(weapon.rarity);

    weaponOverview.innerHTML = "";

    const card = document.createElement("div");
    card.className = "weapon-card";

    const head = document.createElement("div");
    head.className = "weapon-card-head";

    const image = document.createElement("img");
    image.className = "weapon-image";
    image.src = weapon.imageUrl;
    image.alt = selectedWeapon.name;
    image.loading = "lazy";
    head.appendChild(image);

    const copy = document.createElement("div");

    const kicker = document.createElement("p");
    kicker.className = "panel-kicker";
    kicker.textContent = "Selected Weapon";
    copy.appendChild(kicker);

    const title = document.createElement("h2");
    title.className = "weapon-name" + (rarityClass ? " " + rarityClass : "");
    title.textContent = selectedWeapon.name;
    copy.appendChild(title);

    const metaRow = document.createElement("div");
    metaRow.className = "weapon-meta-row";
    metaRow.appendChild(buildMetaPill(weapon.rarity, "", rarityClass));
    metaRow.appendChild(buildMetaPill(weapon.type, ""));
    metaRow.appendChild(buildMetaPill(weapon.ammoType, weapon.ammoTypeIconUrl));
    metaRow.appendChild(buildMetaPill("Level " + build.levelRecord.level, ""));
    copy.appendChild(metaRow);

    const valueRow = document.createElement("div");
    valueRow.className = "weapon-value-row";
    valueRow.appendChild(buildValuePill("Weapon", formatCoins(build.value.weapon)));
    valueRow.appendChild(buildValuePill("Attachments", formatCoins(build.value.attachments)));
    valueRow.appendChild(buildValuePill("Build", formatCoins(build.value.total), "is-strong"));
    copy.appendChild(valueRow);

    head.appendChild(copy);
    card.appendChild(head);

    const note = document.createElement("p");
    note.className = "weapon-note";
    note.textContent = weapon.description || "No wiki description is available for this weapon yet.";
    card.appendChild(note);

    const equippedMods = build.attachmentSelections.filter(function (selection) {
      return selection.selectedMod;
    });

    if (equippedMods.length) {
      const equippedWrap = document.createElement("div");
      equippedWrap.className = "equipped-mods";

      const equippedLabel = document.createElement("p");
      equippedLabel.className = "panel-kicker";
      equippedLabel.textContent = "Equipped Attachments";
      equippedWrap.appendChild(equippedLabel);

      const equippedList = document.createElement("div");
      equippedList.className = "equipped-mod-list";
      equippedMods.forEach(function (selection) {
        equippedList.appendChild(buildAttachmentChip(selection.selectedModName, selection.selectedMod));
      });
      equippedWrap.appendChild(equippedList);
      card.appendChild(equippedWrap);
    }

    weaponOverview.appendChild(card);
  }

  function buildMetaPill(text, iconUrl, extraClass) {
    const pill = document.createElement("span");
    pill.className = "meta-pill" + (extraClass ? " " + extraClass : "");

    if (iconUrl) {
      const icon = document.createElement("img");
      icon.src = iconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      pill.appendChild(icon);
    }

    const copy = document.createElement("span");
    copy.textContent = text;
    pill.appendChild(copy);
    return pill;
  }

  function buildValuePill(label, value, extraClass) {
    const pill = document.createElement("div");
    pill.className = "value-pill" + (extraClass ? " " + extraClass : "");

    const smallLabel = document.createElement("span");
    smallLabel.className = "value-pill-label";
    smallLabel.textContent = label;
    pill.appendChild(smallLabel);

    const copy = document.createElement("strong");
    copy.className = "value-pill-value";
    copy.textContent = value;
    pill.appendChild(copy);
    return pill;
  }

  function buildAttachmentChip(modName, modDefinition) {
    const rarityClass = getRarityClass(modDefinition.rarity);
    const chip = document.createElement("a");
    chip.className = "attachment-chip" + (rarityClass ? " " + rarityClass : "");
    chip.href = modDefinition.pageUrl;
    chip.target = "_blank";
    chip.rel = "noreferrer";

    const icon = document.createElement("img");
    icon.className = "attachment-chip-icon";
    icon.src = modDefinition.imageUrl;
    icon.alt = modName;
    icon.loading = "lazy";
    chip.appendChild(icon);

    const copy = document.createElement("span");
    copy.className = "attachment-chip-copy";
    copy.textContent = modName;
    chip.appendChild(copy);

    return chip;
  }

  function renderStats(build) {
    const stats = [
      {
        label: "Damage",
        value: build.stats.damageLabel,
        context: "",
      },
      (function () {
        const formatted = formatValueWithBase(build.stats.fireRateCurrent, build.stats.fireRateBase, "");
        return { label: "Fire Rate", value: formatted.value, context: formatted.context };
      })(),
      (function () {
        const formatted = formatValueWithBase(build.stats.fireRateRpmCurrent, build.stats.fireRateRpmBase, " RPM");
        return { label: "Fire Rate (RPM)", value: formatted.value, context: formatted.context };
      })(),
      {
        label: "Relative DPS",
        value: build.stats.relativeDpsCurrent != null
          ? formatNumber(build.stats.relativeDpsCurrent, { maximumFractionDigits: 1 })
          : (build.selectedWeapon.data.relativeDps || "—"),
        context: build.stats.relativeDpsDerived
          ? "Base " + build.selectedWeapon.data.relativeDps
          : "Build modifiers can affect exact DPS beyond the current estimate.",
      },
      (function () {
        const formatted = formatValueWithBase(build.stats.magazineSizeCurrent, build.stats.magazineSizeBase, "");
        return { label: "Magazine Size", value: formatted.value, context: formatted.context };
      })(),
      {
        label: "Range",
        value: build.stats.rangeLabel,
        context: "",
      },
      {
        label: "Durability",
        value: build.stats.durability != null ? String(build.stats.durability) : "—",
        context: build.stats.durability == null ? "The current wiki page does not expose a durability row for this weapon." : "",
      },
      {
        label: "ARC Armor Pen",
        value: build.stats.arcArmorPenetration || "—",
        context: "",
      },
      {
        label: "Headshot Multiplier",
        value: build.stats.headshotMultiplier || "—",
        context: "",
      },
      {
        label: "Stability",
        value: build.stats.stability || "—",
        context: "",
      },
      {
        label: "Agility",
        value: build.stats.agility || "—",
        context: "",
      },
      {
        label: "Stealth",
        value: build.stats.stealth || "—",
        context: "",
      },
      {
        label: "Weight",
        value: build.stats.weight || "—",
        context: "",
      },
      {
        label: "Weapon Value",
        value: formatCoins(build.value.weapon),
        context: "Current weapon level only",
      },
      {
        label: "Attachment Value",
        value: formatCoins(build.value.attachments),
        context: build.equippedMods.length ? build.equippedMods.length + " attachment(s) equipped" : "No attachments equipped",
      },
      {
        label: "Total Build Value",
        value: formatCoins(build.value.total),
        context: "Weapon + attachments",
        strong: true,
      },
    ];

    weaponStats.innerHTML = "";
    stats.forEach(function (stat) {
      const card = document.createElement("article");
      card.className = "stat-card" + (stat.strong ? " is-strong" : "");

      const label = document.createElement("p");
      label.className = "stat-label";
      label.textContent = stat.label;
      card.appendChild(label);

      const value = document.createElement("p");
      value.className = "stat-value";
      value.textContent = stat.value;
      card.appendChild(value);

      const context = document.createElement("p");
      context.className = "stat-context";
      context.textContent = stat.context || "";
      card.appendChild(context);

      weaponStats.appendChild(card);
    });
  }

  function renderEffects(build) {
    buildEffects.innerHTML = "";

    if (!build.effectGroups.length) {
      const empty = document.createElement("p");
      empty.className = "weapon-note";
      empty.textContent = "This build is at the base weapon level with no attachments equipped yet.";
      buildEffects.appendChild(empty);
      return;
    }

    build.effectGroups.forEach(function (group) {
      const card = document.createElement("article");
      card.className = "effect-card";

      const head = document.createElement("div");
      head.className = "effect-head";

      const label = document.createElement("p");
      label.className = "effect-label";
      label.textContent = group.stat || group.texts[0] || "Effect";
      head.appendChild(label);

      const delta = document.createElement("p");
      delta.className = "effect-delta";
      if (group.kind === "percent" || group.kind === "flat") {
        delta.textContent = formatDelta(group);
        delta.classList.add(group.delta > 0 ? "is-positive" : "is-negative");
      } else {
        delta.textContent = group.texts[0] || "";
      }
      head.appendChild(delta);

      card.appendChild(head);

      const sourceList = document.createElement("div");
      sourceList.className = "effect-sources";
      group.sources.forEach(function (source) {
        const chip = document.createElement("span");
        chip.className = "effect-source-chip";
        chip.textContent = source;
        sourceList.appendChild(chip);
      });
      card.appendChild(sourceList);

      buildEffects.appendChild(card);
    });
  }

  function renderSlots(selectedWeapon, build) {
    const slots = selectedWeapon.data.modSlots || [];
    modSlotGrid.innerHTML = "";

    if (!slots.length) {
      const empty = document.createElement("p");
      empty.className = "weapon-note";
      empty.textContent = "This weapon does not expose attachment slots in the current dataset.";
      modSlotGrid.appendChild(empty);
      return;
    }

    const weaponAttachments = getWeaponAttachments(selectedWeapon.name);

    slots.forEach(function (slot) {
      const card = document.createElement("article");
      card.className = "slot-card";

      const head = document.createElement("div");
      head.className = "slot-head";

      if (slot.iconUrl) {
        const icon = document.createElement("img");
        icon.className = "slot-icon";
        icon.src = slot.iconUrl;
        icon.alt = slot.name;
        icon.loading = "lazy";
        head.appendChild(icon);
      }

      const name = document.createElement("p");
      name.className = "slot-name";
      name.textContent = slot.name;
      head.appendChild(name);
      card.appendChild(head);

      const select = document.createElement("select");
      select.className = "slot-select";

      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "No attachment";
      select.appendChild(noneOption);

      (slot.options || []).forEach(function (modName) {
        const modDefinition = modData[modName] || {};
        const option = document.createElement("option");
        option.value = modName;
        option.textContent = modName;
        if (modDefinition.rarity) {
          option.textContent += " | " + modDefinition.rarity;
        }
        select.appendChild(option);
      });

      select.value = weaponAttachments[slot.name] || "";
      select.addEventListener("change", function (event) {
        weaponAttachments[slot.name] = event.target.value;
        saveState();
        render();
      });
      card.appendChild(select);

      const selectedModName = weaponAttachments[slot.name] || "";
      const selectedMod = selectedModName ? modData[selectedModName] || null : null;

      if (!selectedMod) {
        const empty = document.createElement("p");
        empty.className = "slot-status";
        empty.textContent = "No attachment equipped in this slot.";
        card.appendChild(empty);
      } else {
        card.classList.add("is-equipped");
        const preview = buildSlotPreview(selectedModName, selectedMod);
        card.appendChild(preview);
      }

      modSlotGrid.appendChild(card);
    });
  }

  function buildSlotPreview(modName, modDefinition) {
    const wrap = document.createElement("div");
    wrap.className = "slot-preview";

    const rarityClass = getRarityClass(modDefinition.rarity);
    const summary = document.createElement("a");
    summary.className = "slot-preview-head" + (rarityClass ? " " + rarityClass : "");
    summary.href = modDefinition.pageUrl;
    summary.target = "_blank";
    summary.rel = "noreferrer";

    const icon = document.createElement("img");
    icon.className = "slot-preview-icon";
    icon.src = modDefinition.imageUrl;
    icon.alt = modName;
    icon.loading = "lazy";
    summary.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "slot-preview-copy";

    const name = document.createElement("p");
    name.className = "slot-preview-name";
    name.textContent = modName;
    copy.appendChild(name);

    const meta = document.createElement("p");
    meta.className = "slot-preview-meta";
    meta.textContent = [
      modDefinition.rarity || "",
      modDefinition.sellPrice ? formatCoins(toNumber(modDefinition.sellPrice) || 0) : "",
      modDefinition.requiredStation || "",
    ].filter(Boolean).join(" | ");
    copy.appendChild(meta);

    summary.appendChild(copy);
    wrap.appendChild(summary);

    const effectList = document.createElement("ul");
    effectList.className = "slot-effect-list";
    if (modDefinition.effects && modDefinition.effects.length) {
      modDefinition.effects.forEach(function (effect) {
        const item = document.createElement("li");
        item.textContent = effect.text;
        effectList.appendChild(item);
      });
    } else {
      const item = document.createElement("li");
      item.textContent = "No explicit effect text is exposed on the current wiki page for this attachment.";
      effectList.appendChild(item);
    }
    wrap.appendChild(effectList);

    return wrap;
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
