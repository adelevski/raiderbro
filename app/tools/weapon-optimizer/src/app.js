(function () {
  const STORAGE_KEY = "raiderbro.weaponOptimizer.state.v4";
  const PREVIOUS_STORAGE_KEYS = [
    "raiderbro.weaponOptimizer.state.v3",
    "raiderbro.weaponOptimizer.state.v2",
    "raiderbro.weaponOptimizer.state.v1",
  ];
  const MAX_BUILDS = 3;
  const DASH = "-";
  const DEFAULT_MAX_DURABILITY = 100;
  const COINS_ICON_URL = "https://arcraiders.wiki/w/images/7/7b/Icon_Coins.png";
  const DURABILITY_VALUE_EXPONENT = 1.025;
  const RARITY_ORDER = {
    Common: 0,
    Uncommon: 1,
    Rare: 2,
    Epic: 3,
    Legendary: 4,
  };
  const weaponData = window.WEAPON_DATA || {};
  const modData = window.WEAPON_MOD_DATA || {};
  const buildGrid = document.getElementById("build-grid");
  const LOWER_IS_BETTER_STATS = new Set([
    "adsSpeed",
    "dispersionRecoveryTime",
    "durabilityBurnRate",
    "equipTime",
    "hipFireDispersion",
    "horizontalRecoil",
    "maxShotDispersion",
    "noise",
    "perShotDispersion",
    "recoil",
    "recoilRecoveryDuration",
    "reloadTime",
    "sprintToFireTime",
    "unequipTime",
    "verticalRecoil",
    "weight",
  ]);
  const floatingTooltip = createFloatingTooltip();
  const floatingSlotPopup = createFloatingSlotPopup();
  document.body.appendChild(floatingTooltip);
  document.body.appendChild(floatingSlotPopup);

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

  const uiState = {
    activeSlotBuildId: "",
    activeSlotName: "",
    pickerBuildId: "",
  };

  const state = loadState();
  normalizeState();
  bindGlobalEvents();
  render();

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.builds)) {
          return {
            builds: parsed.builds,
          };
        }
      }
    } catch (error) {
      return createDefaultState();
    }

    const migrated = migratePreviousState();
    return migrated || createDefaultState();
  }

  function migratePreviousState() {
    for (let index = 0; index < PREVIOUS_STORAGE_KEYS.length; index += 1) {
      try {
        const raw = window.localStorage.getItem(PREVIOUS_STORAGE_KEYS[index]);
        if (!raw) {
          continue;
        }
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.builds)) {
          return {
            builds: parsed.builds,
          };
        }

        const weaponName = typeof parsed.weaponName === "string" ? parsed.weaponName : "";
        if (!weaponName || !weaponData[weaponName]) {
          continue;
        }

        const level = Number.isInteger(parsed.level) ? parsed.level : 1;
        const attachmentsByWeapon = parsed.attachmentsByWeapon && typeof parsed.attachmentsByWeapon === "object"
          ? parsed.attachmentsByWeapon
          : {};

        const firstBuild = createEmptyBuild(0);
        firstBuild.weaponName = weaponName;
        firstBuild.level = level;
        firstBuild.currentDurability = Number.isFinite(Number(parsed.currentDurability))
          ? Number(parsed.currentDurability)
          : DEFAULT_MAX_DURABILITY;
        firstBuild.attachmentsBySlot = sanitizeObject(attachmentsByWeapon[weaponName]);

        return {
          builds: [firstBuild].concat(
            Array.from({ length: MAX_BUILDS - 1 }, function (_, buildIndex) {
              return createEmptyBuild(buildIndex + 1);
            })
          ),
        };
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  function createDefaultState() {
    return {
      builds: Array.from({ length: MAX_BUILDS }, function (_, index) {
        return createEmptyBuild(index);
      }),
    };
  }

  function createEmptyBuild(index) {
    return {
      id: "build-" + String(index + 1),
      weaponName: "",
      level: 1,
      currentDurability: DEFAULT_MAX_DURABILITY,
      attachmentsBySlot: {},
    };
  }

  function sanitizeObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return Object.keys(value).reduce(function (next, key) {
      if (typeof value[key] === "string") {
        next[key] = value[key];
      }
      return next;
    }, {});
  }

  function normalizeState() {
    const nextBuilds = Array.isArray(state.builds) ? state.builds.slice(0, MAX_BUILDS) : [];

    while (nextBuilds.length < MAX_BUILDS) {
      nextBuilds.push(createEmptyBuild(nextBuilds.length));
    }

    state.builds = nextBuilds.map(function (build, index) {
      const normalized = {
        id: typeof build.id === "string" ? build.id : "build-" + String(index + 1),
        weaponName: typeof build.weaponName === "string" ? build.weaponName : "",
        level: Number.isInteger(build.level) ? build.level : 1,
        currentDurability: Number.isFinite(Number(build.currentDurability))
          ? Number(build.currentDurability)
          : DEFAULT_MAX_DURABILITY,
        attachmentsBySlot: sanitizeObject(build.attachmentsBySlot),
      };
      syncBuild(normalized);
      return normalized;
    });
  }

  function saveState() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        builds: state.builds.map(function (build) {
            return {
              id: build.id,
              weaponName: build.weaponName,
              level: build.level,
              currentDurability: build.currentDurability,
              attachmentsBySlot: build.attachmentsBySlot,
            };
        }),
      })
    );
  }

  function getWeapon(weaponName) {
    return weapons.find(function (weapon) {
      return weapon.name === weaponName;
    }) || null;
  }

  function getBuild(buildId) {
    return state.builds.find(function (build) {
      return build.id === buildId;
    }) || null;
  }

  function syncBuild(build) {
    if (!build.weaponName) {
      build.level = 1;
      build.currentDurability = DEFAULT_MAX_DURABILITY;
      build.attachmentsBySlot = {};
      return;
    }

    const selectedWeapon = getWeapon(build.weaponName);
    if (!selectedWeapon) {
      build.weaponName = "";
      build.level = 1;
      build.currentDurability = DEFAULT_MAX_DURABILITY;
      build.attachmentsBySlot = {};
      return;
    }

    const availableLevels = getAvailableLevels(selectedWeapon);
    if (!availableLevels.includes(build.level)) {
      build.level = availableLevels[0];
    }

    const maxDurability = getMaxDurability(selectedWeapon, build.level);
    const normalizedDurability = Number.isFinite(Number(build.currentDurability))
      ? Math.round(Number(build.currentDurability))
      : maxDurability;
    build.currentDurability = Math.min(maxDurability, Math.max(0, normalizedDurability));

    const allowedBySlot = {};
    (selectedWeapon.data.modSlots || []).forEach(function (slot) {
      allowedBySlot[slot.name] = new Set((slot.options || []).slice());
      if (!Object.prototype.hasOwnProperty.call(build.attachmentsBySlot, slot.name)) {
        build.attachmentsBySlot[slot.name] = "";
      }
    });

    Object.keys(build.attachmentsBySlot).forEach(function (slotName) {
      if (!Object.prototype.hasOwnProperty.call(allowedBySlot, slotName)) {
        delete build.attachmentsBySlot[slotName];
        return;
      }

      const modName = build.attachmentsBySlot[slotName];
      if (modName && !allowedBySlot[slotName].has(modName)) {
        build.attachmentsBySlot[slotName] = "";
      }
    });
  }

  function getMaxDurability(selectedWeapon, level) {
    const levelRecord = getLevelRecord(selectedWeapon, level);
    const durability = toNumber(levelRecord.durability);
    return durability != null ? Math.round(durability) : DEFAULT_MAX_DURABILITY;
  }

  function getAvailableLevels(selectedWeapon) {
    const levels = (selectedWeapon.data.levels || []).map(function (levelData) {
      return Number(levelData.level);
    }).filter(function (level) {
      return Number.isFinite(level);
    });

    return levels.length ? levels : [1];
  }

  function getLevelRecord(selectedWeapon, level) {
    const levelRecords = selectedWeapon.data.levels || [];
    return levelRecords.find(function (levelData) {
      return Number(levelData.level) === level;
    }) || levelRecords[0] || { level: 1, effects: [], perkTexts: [] };
  }

  function getAttachmentSelections(selectedWeapon, attachmentsBySlot) {
    return (selectedWeapon.data.modSlots || []).map(function (slot) {
      const selectedModName = attachmentsBySlot[slot.name] || "";
      const selectedMod = selectedModName ? modData[selectedModName] || null : null;
      return {
        slot: slot,
        selectedModName: selectedModName,
        selectedMod: selectedMod,
      };
    });
  }

  function evaluateBuild(selectedWeapon, level, attachmentsBySlot, currentDurability) {
    const levelRecord = getLevelRecord(selectedWeapon, level);
    const attachmentSelections = getAttachmentSelections(selectedWeapon, attachmentsBySlot || {});
    const maxDurability = getMaxDurability(selectedWeapon, level);
    const normalizedCurrentDurability = Math.min(
      maxDurability,
      Math.max(
        0,
        Number.isFinite(Number(currentDurability)) ? Math.round(Number(currentDurability)) : maxDurability
      )
    );
    const levelEffects = (levelRecord.effects || []).map(function (effect) {
      return {
        effect: effect,
        source: "Level " + String(levelRecord.level),
      };
    });

    const attachmentEffects = [];
    let attachmentsSellValue = 0;
    let attachmentsCraftValue = 0;
    let attachmentWeight = 0;

    attachmentSelections.forEach(function (selection) {
      if (!selection.selectedMod) {
        return;
      }

      attachmentsSellValue += toNumber(selection.selectedMod.sellPrice) || 0;
      attachmentsCraftValue += toNumber(selection.selectedMod.craftValue) || 0;
      const modWeight = toNumber(selection.selectedMod.weight) || 0;
      attachmentWeight += modWeight;
      (selection.selectedMod.effects || []).forEach(function (effect) {
        attachmentEffects.push({
          effect: effect,
          source: selection.selectedModName,
        });
      });
      if (modWeight) {
        attachmentEffects.push({
          effect: {
            text: "+" + formatNumber(modWeight, { maximumFractionDigits: 2 }) + " kg Weight",
            kind: "flat",
            stat: "Weight",
            statKey: "weight",
            delta: modWeight,
          },
          source: selection.selectedModName,
        });
      }
    });

    const allEffects = levelEffects.concat(attachmentEffects);
    const magazineSizeByLevel = selectedWeapon.data.magazineSizeByLevel || {};
    const explicitMagazineSize = toNumber(
      magazineSizeByLevel[level] != null
        ? magazineSizeByLevel[level]
        : magazineSizeByLevel[String(level)]
    );
    const baseMagazineSize = explicitMagazineSize != null
      ? explicitMagazineSize
      : getBaseMagazineWithLevelEffects(selectedWeapon.data, levelRecord.effects || []);
    const attachmentMagazineDelta = sumEffectDelta(attachmentEffects, "magazineSize", "flat");
    const effectiveMagazineSize = baseMagazineSize != null ? baseMagazineSize + attachmentMagazineDelta : null;

    const fireRateBase = toNumber(selectedWeapon.data.fireRate);
    const fireRatePercent = sumEffectDelta(allEffects, "fireRate", "percent");
    const effectiveFireRate = fireRateBase != null ? applyPercent(fireRateBase, fireRatePercent) : null;

    const fireRateRpmBase = toNumber(selectedWeapon.data.fireRateRpm);
    const effectiveFireRateRpm = fireRateRpmBase != null ? applyPercent(fireRateRpmBase, fireRatePercent) : null;
    const weightBase = toNumber(selectedWeapon.data.weight);
    const effectWeight = computeEffectiveStatValue(allEffects, "weight", weightBase);
    const effectiveWeight = effectWeight != null ? effectWeight + attachmentWeight : null;
    const baseWeaponSellValue = toNumber(levelRecord.sellPrice) || 0;
    // The wiki does not currently document how durability affects sell value.
    // This exponent is a best-fit approximation from in-game stash samples.
    const weaponSellValue = maxDurability > 0
      ? Math.round(baseWeaponSellValue * Math.pow(normalizedCurrentDurability / maxDurability, DURABILITY_VALUE_EXPONENT))
      : baseWeaponSellValue;

    const projectileSensitive = hasEffect(allEffects, "projectileDamage") || hasEffect(allEffects, "projectilesPerShot");
    const relativeDpsBase = toNumber(selectedWeapon.data.relativeDps);
    const effectiveRelativeDps = (!projectileSensitive && relativeDpsBase != null && fireRateBase != null && effectiveFireRate != null)
      ? relativeDpsBase * (effectiveFireRate / fireRateBase)
      : null;

    return {
      levelRecord: levelRecord,
      attachmentSelections: attachmentSelections,
      allEffectEntries: allEffects,
      levelEffectEntries: levelEffects,
      attachmentEffectEntries: attachmentEffects,
      effectGroups: groupEffects(allEffects),
      value: {
        sell: {
          weapon: weaponSellValue,
          attachments: attachmentsSellValue,
          total: weaponSellValue + attachmentsSellValue,
        },
        craft: {
          weapon: toNumber(levelRecord.fromScratchCraftValue) || 0,
          attachments: attachmentsCraftValue,
          total: (toNumber(levelRecord.fromScratchCraftValue) || 0) + attachmentsCraftValue,
        },
      },
      stats: {
        damage: toNumber(selectedWeapon.data.damage),
        damageLabel: selectedWeapon.data.damage || DASH,
        fireRate: effectiveFireRate,
        fireRateRpm: effectiveFireRateRpm,
        relativeDps: effectiveRelativeDps,
        range: toNumber(selectedWeapon.data.range),
        rangeLabel: selectedWeapon.data.range || DASH,
        magazineSize: effectiveMagazineSize,
        durability: maxDurability,
        currentDurability: normalizedCurrentDurability,
        headshotMultiplier: selectedWeapon.data.headshotMultiplier || DASH,
        arcArmorPenetration: selectedWeapon.data.arcArmorPenetration || DASH,
        stability: selectedWeapon.data.stability || DASH,
        agility: selectedWeapon.data.agility || DASH,
        stealth: selectedWeapon.data.stealth || DASH,
        weight: effectiveWeight,
      },
    };
  }

  function computeBuild(build) {
    const selectedWeapon = getWeapon(build.weaponName);
    const current = evaluateBuild(selectedWeapon, build.level, build.attachmentsBySlot, build.currentDurability);
    const base = evaluateBuild(selectedWeapon, 1, {}, getMaxDurability(selectedWeapon, 1));
    const attachmentEffects = current.attachmentSelections.reduce(function (entries, selection) {
      if (!selection.selectedMod) {
        return entries;
      }

      (selection.selectedMod.effects || []).forEach(function (effect) {
        entries.push({
          effect: effect,
          modName: selection.selectedModName,
          modRarity: selection.selectedMod.rarity || "",
          modImageUrl: selection.selectedMod.imageUrl || "",
        });
      });
      return entries;
    }, []);
    const levelEffects = current.effectGroups.filter(function (group) {
      return group.sources.some(function (source) {
        return String(source).indexOf("Level ") === 0;
      });
    });

    return {
      selectedWeapon: selectedWeapon,
      attachmentEffects: attachmentEffects,
      current: current,
      base: base,
      levelEffects: levelEffects,
      allEffectEntries: current.allEffectEntries,
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
        ? "text:" + String(effect.text || "")
        : String(effect.kind || "") + ":" + String(effect.statKey || effect.stat || effect.text || "");

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

  function sumEffectDeltaForKeys(effectEntries, statKeys, kind) {
    const keys = Array.isArray(statKeys) ? statKeys : [statKeys];
    return keys.reduce(function (total, key) {
      return total + sumEffectDelta(effectEntries, key, kind);
    }, 0);
  }

  function computeEffectiveStatValue(effectEntries, statKeys, baseValue) {
    if (baseValue == null) {
      return null;
    }

    const percentDelta = sumEffectDeltaForKeys(effectEntries, statKeys, "percent");
    const flatDelta = sumEffectDeltaForKeys(effectEntries, statKeys, "flat");
    return applyPercent(baseValue, percentDelta) + flatDelta;
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
      return DASH;
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: settings.minimumFractionDigits != null ? settings.minimumFractionDigits : 0,
      maximumFractionDigits: settings.maximumFractionDigits != null ? settings.maximumFractionDigits : 1,
    });
  }

  function formatCoins(value) {
    return formatNumber(value, { maximumFractionDigits: 0 }) + " Coins";
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

  function getTickerData(currentValue, baseValue, options) {
    const settings = options || {};
    if (currentValue == null) {
      return {
        valueText: settings.fallback || DASH,
        deltaText: "",
        deltaClass: "",
      };
    }

    const valueText = formatNumber(currentValue, {
      maximumFractionDigits: settings.maximumFractionDigits != null ? settings.maximumFractionDigits : 1,
    }) + (settings.suffix || "");

    if (baseValue == null) {
      return {
        valueText: valueText,
        deltaText: "",
        deltaClass: "",
      };
    }

    const delta = currentValue - baseValue;
    if (Math.abs(delta) < 0.001) {
      return {
        valueText: valueText,
        deltaText: "",
        deltaClass: "",
      };
    }

    return {
      valueText: valueText,
      deltaText: (delta > 0 ? "+" : "") + formatNumber(delta, {
        maximumFractionDigits: settings.deltaFractionDigits != null ? settings.deltaFractionDigits : settings.maximumFractionDigits != null ? settings.maximumFractionDigits : 1,
      }) + (settings.suffix || ""),
      deltaClass: getEffectTone(settings.statKey || "", delta),
    };
  }

  function getModifierTickerData(delta, options) {
    const settings = options || {};
    if (delta == null || Number.isNaN(delta) || Math.abs(delta) < 0.001) {
      return {
        valueText: "0" + (settings.suffix || ""),
        deltaText: "",
        deltaClass: "",
      };
    }

    return {
      valueText: (delta > 0 ? "+" : "") + formatNumber(delta, {
        maximumFractionDigits: settings.maximumFractionDigits != null ? settings.maximumFractionDigits : 1,
      }) + (settings.suffix || ""),
      deltaText: "",
      deltaClass: getEffectTone(settings.statKey || "", delta),
    };
  }

  function render() {
    hideTooltip();
    buildGrid.innerHTML = "";

    state.builds.forEach(function (build) {
      if (!build.weaponName || uiState.pickerBuildId === build.id) {
        buildGrid.appendChild(renderPickerCard(build));
        return;
      }

      buildGrid.appendChild(renderBuildCard(build));
    });

    renderFloatingSlotPopup();
  }

  function renderPickerCard(build) {
    const card = document.createElement("article");
    card.className = "build-card build-card-picker";

    card.appendChild(renderWeaponPickerGrid(build));

    if (build.weaponName) {
      const actions = document.createElement("div");
      actions.className = "picker-actions";

      const keepButton = document.createElement("button");
      keepButton.type = "button";
      keepButton.className = "card-action";
      keepButton.textContent = "Keep Current Gun";
      keepButton.addEventListener("click", function () {
        closePicker();
        render();
      });
      actions.appendChild(keepButton);
      card.appendChild(actions);
    }

    return card;
  }

  function renderWeaponPickerGrid(build) {
    const grid = document.createElement("div");
    grid.className = "picker-weapon-grid";

    getWeaponsForPicker().forEach(function (weapon) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "picker-weapon-tile " + getRarityClass(weapon.data.rarity || "");
      tile.addEventListener("click", function () {
        applyPicker(build.id, weapon.name);
      });
      tile.addEventListener("mouseenter", function () {
        showWeaponTooltip(weapon, tile);
      });
      tile.addEventListener("mouseleave", hideTooltip);

      const icon = document.createElement("img");
      icon.className = "picker-weapon-tile-icon";
      icon.src = weapon.data.imageUrl;
      icon.alt = weapon.name;
      icon.loading = "lazy";
      tile.appendChild(icon);

      const name = document.createElement("span");
      name.className = "picker-weapon-tile-name";
      name.textContent = weapon.name;
      tile.appendChild(name);

      grid.appendChild(tile);
    });

    return grid;
  }

  function renderBuildCard(build) {
    const buildData = computeBuild(build);
    const weapon = buildData.selectedWeapon.data;
    const rarityClass = getRarityClass(weapon.rarity);

    const card = document.createElement("article");
    card.className = "build-card";

    const top = document.createElement("div");
    top.className = "build-top";

    const image = document.createElement("img");
    image.className = "build-weapon-image";
    image.src = weapon.imageUrl;
    image.alt = buildData.selectedWeapon.name;
    image.loading = "lazy";
    top.appendChild(image);

    const identity = document.createElement("div");
    identity.className = "build-identity";

    const identityTop = document.createElement("div");
    identityTop.className = "build-identity-top";

    const title = document.createElement("h2");
    title.className = "build-title" + (rarityClass ? " " + rarityClass : "");
    title.textContent = buildData.selectedWeapon.name;
    identityTop.appendChild(title);

    const changeButton = document.createElement("button");
    changeButton.type = "button";
    changeButton.className = "card-action";
    changeButton.textContent = "Change";
    changeButton.addEventListener("click", function () {
      openPicker(build.id);
    });
    identityTop.appendChild(changeButton);
    identity.appendChild(identityTop);

    const meta = document.createElement("div");
    meta.className = "build-meta-row";
    meta.appendChild(buildMetaPill(weapon.type, ""));
    meta.appendChild(buildMetaPill(weapon.ammoType, weapon.ammoTypeIconUrl));
    meta.appendChild(buildMetaPill(weapon.firingMode, ""));
    identity.appendChild(meta);

    top.appendChild(identity);
    card.appendChild(top);

    const controlBand = document.createElement("div");
    controlBand.className = "build-control-band";
    controlBand.appendChild(renderValueBubble(build, buildData));
    controlBand.appendChild(renderBuildControls(build, buildData.selectedWeapon));
    card.appendChild(controlBand);

    card.appendChild(renderMainSection(build, buildData));

    return card;
  }

  function renderBuildControls(build, selectedWeapon) {
    const wrap = document.createElement("div");
    wrap.className = "build-control-stack";

    const pills = document.createElement("div");
    pills.className = "level-pills";
    getAvailableLevels(selectedWeapon).forEach(function (level) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-pill" + (build.level === level ? " active" : "");
      button.textContent = "L" + String(level);
      button.addEventListener("click", function () {
        if (build.level === level) {
          return;
        }
        build.level = level;
        syncBuild(build);
        saveState();
        render();
      });
      pills.appendChild(button);
    });
    wrap.appendChild(pills);
    wrap.appendChild(renderSlotRail(build, selectedWeapon));

    return wrap;
  }

  function renderValueBubble(build, buildData) {
    const bubble = document.createElement("section");
    bubble.className = "value-bubble";

    bubble.appendChild(buildSectionLabel("Total Value (Gun|Attachments)"));
    bubble.appendChild(
      buildValueSummaryLine(
        buildData.current.value.sell.total,
        buildData.current.value.sell.weapon,
        buildData.current.value.sell.attachments
      )
    );
    bubble.appendChild(renderDurabilityControl(build, buildData));

    return bubble;
  }

  function buildValueSummaryLine(total, gunValue, modValue) {
    const row = document.createElement("div");
    row.className = "value-summary-line";

    const totalWrap = document.createElement("span");
    totalWrap.className = "value-summary-total";

    const coinIcon = document.createElement("img");
    coinIcon.className = "value-summary-coin";
    coinIcon.src = COINS_ICON_URL;
    coinIcon.alt = "Coins";
    coinIcon.loading = "lazy";
    totalWrap.appendChild(coinIcon);

    const totalNumber = document.createElement("strong");
    totalNumber.className = "value-summary-text";
    totalNumber.textContent = formatNumber(total, { maximumFractionDigits: 0 });
    totalWrap.appendChild(totalNumber);

    row.appendChild(totalWrap);

    const breakdown = document.createElement("span");
    breakdown.className = "value-summary-breakdown";
    breakdown.textContent =
      "(" +
      formatNumber(gunValue, { maximumFractionDigits: 0 }) +
      "|" +
      formatNumber(modValue, { maximumFractionDigits: 0 }) +
      ")";
    row.appendChild(breakdown);

    return row;
  }

  function renderDurabilityControl(build, buildData) {
    const wrap = document.createElement("div");
    wrap.className = "durability-control";

    const label = document.createElement("span");
    label.className = "durability-control-label";
    label.textContent = "Current Durability";
    wrap.appendChild(label);

    const controls = document.createElement("div");
    controls.className = "durability-control-controls";

    const input = document.createElement("input");
    input.className = "durability-control-input";
    input.type = "number";
    input.min = "0";
    input.max = String(buildData.current.stats.durability || DEFAULT_MAX_DURABILITY);
    input.step = "1";
    input.value = String(build.currentDurability);
    input.setAttribute("aria-label", "Current durability");
    const commitDurability = function () {
      const nextValue = Number(input.value);
      build.currentDurability = Number.isFinite(nextValue)
        ? Math.min(buildData.current.stats.durability || DEFAULT_MAX_DURABILITY, Math.max(0, Math.round(nextValue)))
        : buildData.current.stats.durability || DEFAULT_MAX_DURABILITY;
      saveState();
      render();
    };
    input.addEventListener("change", commitDurability);
    input.addEventListener("blur", commitDurability);
    controls.appendChild(input);

    const max = document.createElement("span");
    max.className = "durability-control-max";
    max.textContent = "/ " + formatNumber(buildData.current.stats.durability, { maximumFractionDigits: 0 });
    controls.appendChild(max);

    wrap.appendChild(controls);
    return wrap;
  }

  function renderMainSection(build, buildData) {
    const main = document.createElement("div");
    main.className = "build-main";

    const statsSection = document.createElement("section");
    statsSection.className = "build-section";
    statsSection.appendChild(buildSectionLabel("Live Stats"));
    statsSection.appendChild(renderStatList(buildData));
    main.appendChild(statsSection);

    const slotsSection = document.createElement("section");
    slotsSection.className = "build-section";
    slotsSection.appendChild(buildSectionLabel("Effects"));
    slotsSection.appendChild(renderEffectsPanel(buildData));
    main.appendChild(slotsSection);

    return main;
  }

  function buildSectionLabel(text) {
    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = text;
    return label;
  }

  function renderStatList(buildData) {
    const statList = document.createElement("div");
    statList.className = "stat-list";
    const effectEntries = buildData.allEffectEntries.map(function (entry) {
      return { effect: entry.effect };
    });

    const rows = [
      {
        label: "Damage",
        current: buildData.current.stats.damage,
        base: buildData.base.stats.damage,
        fallback: buildData.selectedWeapon.data.damage || DASH,
        maximumFractionDigits: 1,
        statKey: "projectileDamage",
      },
      {
        label: "Fire Rate",
        current: buildData.current.stats.fireRate,
        base: buildData.base.stats.fireRate,
        maximumFractionDigits: 1,
        statKey: "fireRate",
      },
      {
        label: "RPM",
        current: buildData.current.stats.fireRateRpm,
        base: buildData.base.stats.fireRateRpm,
        maximumFractionDigits: 0,
      },
      {
        label: "Relative DPS",
        current: buildData.current.stats.relativeDps,
        base: buildData.base.stats.relativeDps,
        fallback: buildData.selectedWeapon.data.relativeDps || DASH,
        maximumFractionDigits: 1,
        statKey: "relativeDps",
      },
      {
        label: "Magazine",
        current: buildData.current.stats.magazineSize,
        base: buildData.base.stats.magazineSize,
        maximumFractionDigits: 0,
        statKey: "magazineSize",
      },
      {
        label: "Range",
        current: buildData.current.stats.range,
        base: buildData.base.stats.range,
        fallback: buildData.selectedWeapon.data.range || DASH,
        maximumFractionDigits: 1,
        statKey: "range",
      },
      {
        label: "Max Durability",
        current: buildData.current.stats.durability,
        base: buildData.base.stats.durability,
        maximumFractionDigits: 0,
        statKey: "durability",
      },
      {
        label: "Weight",
        current: buildData.current.stats.weight,
        base: buildData.base.stats.weight,
        maximumFractionDigits: 2,
        deltaFractionDigits: 2,
        statKey: "weight",
      },
      {
        label: "Headshot Multiplier",
        current: null,
        base: null,
        fallback: buildData.current.stats.headshotMultiplier || DASH,
      },
      {
        label: "ARC Armor Penetration",
        current: null,
        base: null,
        fallback: buildData.current.stats.arcArmorPenetration || DASH,
      },
      {
        label: "Stability",
        current: null,
        base: null,
        fallback: buildData.current.stats.stability || DASH,
      },
      {
        label: "Agility",
        current: null,
        base: null,
        fallback: buildData.current.stats.agility || DASH,
      },
      {
        label: "Stealth",
        current: null,
        base: null,
        fallback: buildData.current.stats.stealth || DASH,
      },
      {
        label: "Reload Time",
        modifier: true,
        delta: sumEffectDeltaForKeys(effectEntries, "reloadTime", "percent"),
        statKey: "reloadTime",
        suffix: "%",
      },
    ];

    rows.forEach(function (row) {
      statList.appendChild(buildStatRow(row));
    });

    return statList;
  }

  function buildStatRow(row) {
    const ticker = row.modifier
      ? getModifierTickerData(row.delta, row)
      : getTickerData(row.current, row.base, row);

    const entry = document.createElement("div");
    entry.className = "stat-row";

    const label = document.createElement("span");
    label.className = "stat-row-label";
    label.textContent = row.label;
    entry.appendChild(label);

    const value = document.createElement("span");
    value.className = "stat-row-value" + (ticker.deltaClass ? " " + ticker.deltaClass : "");
    value.textContent = ticker.valueText;
    entry.appendChild(value);

    const delta = document.createElement("span");
    delta.className = "stat-row-delta" + (ticker.deltaClass ? " " + ticker.deltaClass : "");
    delta.textContent = ticker.deltaText ? "(" + ticker.deltaText + ")" : "";
    entry.appendChild(delta);

    return entry;
  }

  function renderSlotRail(build, selectedWeapon) {
    const wrap = document.createElement("div");
    wrap.className = "slot-rail";

    const slots = selectedWeapon.data.modSlots || [];
    if (!slots.length) {
      return wrap;
    }

    slots.forEach(function (slot) {
      wrap.appendChild(buildSlotAnchor(build, slot));
    });

    return wrap;
  }

  function buildSlotAnchor(build, slot) {
    const anchor = document.createElement("div");
    anchor.className = "slot-anchor";

    const selectedModName = build.attachmentsBySlot[slot.name] || "";
    const selectedMod = selectedModName ? modData[selectedModName] || null : null;
    const rarityClass = selectedMod ? getRarityClass(selectedMod.rarity) : "";
    const isOpen = uiState.activeSlotBuildId === build.id && uiState.activeSlotName === slot.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-pill" + (selectedMod ? " is-filled" : " is-empty") + (rarityClass ? " " + rarityClass : "") + (isOpen ? " is-open" : "");
    button.dataset.buildId = build.id;
    button.dataset.slotName = slot.name;
    button.setAttribute("aria-label", slot.name);
    button.setAttribute("title", slot.name);
    button.addEventListener("click", function () {
      toggleSlotPopup(build.id, slot.name);
    });

    if (selectedMod && selectedMod.imageUrl) {
      const modIcon = document.createElement("img");
      modIcon.className = "slot-pill-selected-icon";
      modIcon.src = selectedMod.imageUrl;
      modIcon.alt = selectedModName;
      modIcon.loading = "lazy";
      button.appendChild(modIcon);
    } else if (slot.iconUrl) {
      const slotIcon = document.createElement("img");
      slotIcon.className = "slot-pill-slot-icon";
      slotIcon.src = slot.iconUrl;
      slotIcon.alt = slot.name;
      slotIcon.loading = "lazy";
      button.appendChild(slotIcon);
    }

    anchor.appendChild(button);

    return anchor;
  }

  function renderSlotPopup(build, slot) {
    const popup = document.createElement("div");
    popup.className = "slot-popup";

    const head = document.createElement("div");
    head.className = "slot-popup-head";

    if (slot.iconUrl) {
      const icon = document.createElement("img");
      icon.className = "slot-popup-icon";
      icon.src = slot.iconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      head.appendChild(icon);
    }

    const title = document.createElement("span");
    title.className = "slot-popup-title";
    title.textContent = slot.name;
    head.appendChild(title);
    popup.appendChild(head);

    const options = document.createElement("div");
    options.className = "slot-popup-options";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "slot-option";
    clearButton.addEventListener("click", function () {
      build.attachmentsBySlot[slot.name] = "";
      saveState();
      closeSlotPopup();
      render();
    });

    if (slot.iconUrl) {
      const clearIcon = document.createElement("img");
      clearIcon.className = "slot-option-icon";
      clearIcon.src = slot.iconUrl;
      clearIcon.alt = "";
      clearIcon.loading = "lazy";
      clearButton.appendChild(clearIcon);
    }

    const clearName = document.createElement("span");
    clearName.className = "slot-option-name";
    clearName.textContent = "No attachment";
    clearButton.appendChild(clearName);
    options.appendChild(clearButton);

    (slot.options || []).forEach(function (modName) {
      const definition = modData[modName] || null;
      if (!definition) {
        return;
      }

      const option = document.createElement("button");
      option.type = "button";
      option.className = "slot-option " + getRarityClass(definition.rarity || "");
      option.addEventListener("click", function () {
        build.attachmentsBySlot[slot.name] = modName;
        syncBuild(build);
        saveState();
        closeSlotPopup();
        hideTooltip();
        render();
      });
      option.addEventListener("mouseenter", function () {
        showModTooltip(modName, definition, option);
      });
      option.addEventListener("mouseleave", hideTooltip);

      if (definition.imageUrl) {
        const icon = document.createElement("img");
        icon.className = "slot-option-icon";
        icon.src = definition.imageUrl;
        icon.alt = modName;
        icon.loading = "lazy";
        option.appendChild(icon);
      }

      const name = document.createElement("span");
      name.className = "slot-option-name";
      name.textContent = modName;
      option.appendChild(name);
      options.appendChild(option);
    });

    popup.appendChild(options);
    return popup;
  }

  function renderFloatingSlotPopup() {
    floatingSlotPopup.className = "slot-popup-floating";
    floatingSlotPopup.innerHTML = "";

    if (!uiState.activeSlotBuildId || !uiState.activeSlotName) {
      return;
    }

    const build = getBuild(uiState.activeSlotBuildId);
    if (!build || !build.weaponName) {
      closeSlotPopup();
      return;
    }

    const selectedWeapon = getWeapon(build.weaponName);
    if (!selectedWeapon) {
      closeSlotPopup();
      return;
    }

    const slot = (selectedWeapon.data.modSlots || []).find(function (entry) {
      return entry.name === uiState.activeSlotName;
    });
    const anchor = buildGrid.querySelector(
      '.slot-pill[data-build-id="' + build.id + '"][data-slot-name="' + escapeAttributeValue(slot ? slot.name : "") + '"]'
    );

    if (!slot || !anchor) {
      closeSlotPopup();
      return;
    }

    floatingSlotPopup.className = "slot-popup-floating visible";
    floatingSlotPopup.appendChild(renderSlotPopup(build, slot));
    positionSlotPopup(anchor);
    window.requestAnimationFrame(function () {
      positionSlotPopup(anchor);
    });
  }

  function renderEffectsPanel(buildData) {
    const wrap = document.createElement("div");
    wrap.className = "effect-groups";

    const groups = [];
    if (buildData.levelEffects.length) {
      groups.push({
        title: "Item Level L" + String(buildData.current.levelRecord.level),
        rarity: "",
        entries: buildData.levelEffects.map(function (group) {
          return {
            text: group.texts[0] || group.stat || "",
            statKey: group.statKey,
            delta: group.delta,
          };
        }),
      });
    }

    const attachmentMap = new Map();
    buildData.attachmentEffects.forEach(function (entry) {
      if (!attachmentMap.has(entry.modName)) {
        attachmentMap.set(entry.modName, {
          title: entry.modName,
          rarity: entry.modRarity,
          entries: [],
        });
      }
      attachmentMap.get(entry.modName).entries.push({
        text: entry.effect.text,
        statKey: entry.effect.statKey,
        delta: entry.effect.delta,
      });
    });

    attachmentMap.forEach(function (group) {
      groups.push(group);
    });

    if (!groups.length) {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = "No active level or attachment effects yet.";
      wrap.appendChild(note);
      return wrap;
    }

    groups.forEach(function (group) {
      wrap.appendChild(buildEffectGroup(group));
    });

    return wrap;
  }

  function buildEffectGroup(group) {
    const pill = document.createElement("div");
    pill.className = "effect-group" + (group.rarity ? " " + getRarityClass(group.rarity) : "");

    const title = document.createElement("p");
    title.className = "effect-group-title";
    title.textContent = group.title;
    pill.appendChild(title);

    const list = document.createElement("ul");
    list.className = "effect-group-list";

    group.entries.forEach(function (entry) {
      const item = document.createElement("li");
      item.textContent = entry.text;
      const tone = getEffectTone(entry.statKey, entry.delta);
      if (tone) {
        item.classList.add(tone);
      }
      list.appendChild(item);
    });

    pill.appendChild(list);
    return pill;
  }

  function buildMetaPill(text, iconUrl, extraClass) {
    const pill = document.createElement("span");
    pill.className = "build-meta-pill" + (extraClass ? " " + extraClass : "");

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

  function escapeAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function bindGlobalEvents() {
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".slot-pill") && !event.target.closest(".slot-popup-floating") && uiState.activeSlotBuildId) {
        closeSlotPopup();
        render();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        const hadSlotPopup = Boolean(uiState.activeSlotBuildId);
        const hadPicker = Boolean(uiState.pickerBuildId);
        closeSlotPopup();
        hideTooltip();
        if (hadPicker) {
          closePicker();
        }
        if (hadSlotPopup || hadPicker) {
          render();
        }
      }
    });

      window.addEventListener("scroll", function (event) {
        const target = event.target;
        if (target && floatingSlotPopup.contains(target)) {
          return;
        }
        hideTooltip();
        if (uiState.activeSlotBuildId) {
          renderFloatingSlotPopup();
        }
      }, true);
      window.addEventListener("resize", function () {
        hideTooltip();
        renderFloatingSlotPopup();
      });
  }

  function toggleSlotPopup(buildId, slotName) {
    if (uiState.activeSlotBuildId === buildId && uiState.activeSlotName === slotName) {
      closeSlotPopup();
      render();
      return;
    }

    uiState.activeSlotBuildId = buildId;
    uiState.activeSlotName = slotName;
    hideTooltip();
    render();
  }

  function closeSlotPopup() {
    uiState.activeSlotBuildId = "";
    uiState.activeSlotName = "";
    hideTooltip();
    floatingSlotPopup.className = "slot-popup-floating";
    floatingSlotPopup.innerHTML = "";
  }

  function getEffectTone(statKey, delta) {
    if (typeof delta !== "number" || delta === 0) {
      return "";
    }

    if (LOWER_IS_BETTER_STATS.has(statKey)) {
      return delta < 0 ? "is-positive" : "is-negative";
    }

    return delta > 0 ? "is-positive" : "is-negative";
  }

  function createFloatingTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "mod-tooltip";
    return tooltip;
  }

  function createFloatingSlotPopup() {
    const popup = document.createElement("div");
    popup.className = "slot-popup-floating";
    return popup;
  }

  function showModTooltip(modName, modDefinition, anchor) {
    floatingTooltip.className = "mod-tooltip visible " + getRarityClass(modDefinition.rarity || "");
    floatingTooltip.innerHTML = "";
    floatingTooltip.appendChild(buildModTooltipContent(modName, modDefinition));
    positionTooltip(anchor);
  }

  function showWeaponTooltip(weapon, anchor) {
    floatingTooltip.className = "mod-tooltip visible " + getRarityClass(weapon.data.rarity || "");
    floatingTooltip.innerHTML = "";
    floatingTooltip.appendChild(buildWeaponTooltipContent(weapon));
    positionTooltip(anchor);
  }

  function hideTooltip() {
    floatingTooltip.className = "mod-tooltip";
    floatingTooltip.innerHTML = "";
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

    let top = rect.top;
    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - tooltipRect.height - margin);
    }

    floatingTooltip.style.left = left + "px";
    floatingTooltip.style.top = top + "px";
  }

  function positionSlotPopup(anchor) {
    if (!floatingSlotPopup.classList.contains("visible")) {
      return;
    }

    const margin = 10;
    const rect = anchor.getBoundingClientRect();
    const popupRect = floatingSlotPopup.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let left = rect.left;
    if (left + popupRect.width > viewportWidth - margin) {
      left = rect.right - popupRect.width;
    }
    left = Math.min(Math.max(margin, left), viewportWidth - popupRect.width - margin);

    let top = rect.bottom + 6;
    if (top + popupRect.height > viewportHeight - margin) {
      top = rect.top - popupRect.height - 6;
    }
    top = Math.max(margin, top);

    floatingSlotPopup.style.left = left + "px";
    floatingSlotPopup.style.top = top + "px";
  }

  function buildModTooltipContent(modName, modDefinition) {
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.className = "mod-tooltip-header";

    if (modDefinition.imageUrl) {
      const icon = document.createElement("img");
      icon.className = "mod-tooltip-icon";
      icon.src = modDefinition.imageUrl;
      icon.alt = modName;
      icon.loading = "lazy";
      header.appendChild(icon);
    }

    const headerCopy = document.createElement("div");
    headerCopy.className = "mod-tooltip-header-copy";

    const title = document.createElement("p");
    title.className = "mod-tooltip-title " + getRarityClass(modDefinition.rarity || "");
    title.textContent = modName;
    headerCopy.appendChild(title);

    const rarity = document.createElement("p");
    rarity.className = "mod-tooltip-rarity";
    rarity.textContent = modDefinition.rarity || "";
    headerCopy.appendChild(rarity);

    header.appendChild(headerCopy);
    wrap.appendChild(header);

    const details = document.createElement("dl");
    details.className = "mod-tooltip-grid";
    appendTooltipDetail(details, "Slot", modDefinition.slot || DASH);
    appendTooltipDetail(details, "Sell", modDefinition.sellPrice ? formatCoins(toNumber(modDefinition.sellPrice) || 0) : DASH);
    appendTooltipDetail(details, "Craft", modDefinition.craftValue ? formatCoins(toNumber(modDefinition.craftValue) || 0) : DASH);
    appendTooltipDetail(details, "Unlock", modDefinition.requiredStation || DASH);
    appendTooltipDetail(details, "Materials", (modDefinition.craftingMaterials || []).join(", ") || DASH);
    wrap.appendChild(details);

    if (modDefinition.description) {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = modDefinition.description;
      wrap.appendChild(note);
    }

    const effects = document.createElement("ul");
    effects.className = "mod-tooltip-effects";

    (modDefinition.effects || []).forEach(function (effect) {
      const item = document.createElement("li");
      item.textContent = effect.text;
      const tone = getEffectTone(effect.statKey, effect.delta);
      if (tone) {
        item.classList.add(tone);
      }
      effects.appendChild(item);
    });

    if (!effects.childElementCount) {
      const item = document.createElement("li");
      item.textContent = "No explicit effect text exposed for this attachment.";
      effects.appendChild(item);
    }

    wrap.appendChild(effects);
    return wrap;
  }

  function buildWeaponTooltipContent(weapon) {
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.className = "mod-tooltip-header";

    if (weapon.data.imageUrl) {
      const icon = document.createElement("img");
      icon.className = "mod-tooltip-icon";
      icon.src = weapon.data.imageUrl;
      icon.alt = weapon.name;
      icon.loading = "lazy";
      header.appendChild(icon);
    }

    const headerCopy = document.createElement("div");
    headerCopy.className = "mod-tooltip-header-copy";

    const title = document.createElement("p");
    title.className = "mod-tooltip-title " + getRarityClass(weapon.data.rarity || "");
    title.textContent = weapon.name;
    headerCopy.appendChild(title);

    const rarity = document.createElement("p");
    rarity.className = "mod-tooltip-rarity";
    rarity.textContent = weapon.data.rarity || "";
    headerCopy.appendChild(rarity);

    header.appendChild(headerCopy);
    wrap.appendChild(header);

    const details = document.createElement("dl");
    details.className = "mod-tooltip-grid";
    appendTooltipDetail(details, "Type", weapon.data.type || DASH);
    appendTooltipDetail(details, "Ammo", weapon.data.ammoType || DASH);
    appendTooltipDetail(details, "Mode", weapon.data.firingMode || DASH);
    appendTooltipDetail(details, "Damage", weapon.data.damage || DASH);
    appendTooltipDetail(details, "Fire Rate", weapon.data.fireRate || DASH);
    appendTooltipDetail(details, "Relative DPS", weapon.data.relativeDps || DASH);
    appendTooltipDetail(details, "Range", weapon.data.range || DASH);
    appendTooltipDetail(details, "Sell", weapon.data.sellPrice ? formatCoins(toNumber(weapon.data.sellPrice) || 0) : DASH);
    appendTooltipDetail(
      details,
      "Craft",
      weapon.data.levels && weapon.data.levels[0] && weapon.data.levels[0].fromScratchCraftValue
        ? formatCoins(toNumber(weapon.data.levels[0].fromScratchCraftValue) || 0)
        : DASH
    );
    wrap.appendChild(details);

    if (weapon.data.description) {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = weapon.data.description;
      wrap.appendChild(note);
    }

    return wrap;
  }

  function appendTooltipDetail(container, label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    container.appendChild(dt);

    const dd = document.createElement("dd");
    dd.textContent = value || DASH;
    container.appendChild(dd);
  }

  function getWeaponsForPicker() {
    return weapons.slice().sort(function (left, right) {
      const leftRarity = RARITY_ORDER[left.data.rarity] != null ? RARITY_ORDER[left.data.rarity] : 99;
      const rightRarity = RARITY_ORDER[right.data.rarity] != null ? RARITY_ORDER[right.data.rarity] : 99;
      if (leftRarity !== rightRarity) {
        return leftRarity - rightRarity;
      }

      const leftType = String(left.data.type || "");
      const rightType = String(right.data.type || "");
      if (leftType !== rightType) {
        return leftType.localeCompare(rightType);
      }

      return left.name.localeCompare(right.name);
    });
  }

  function openPicker(buildId) {
    const build = getBuild(buildId);
    if (!build) {
      return;
    }
    closeSlotPopup();
    hideTooltip();
    uiState.pickerBuildId = buildId;
    render();
  }

  function closePicker() {
    uiState.pickerBuildId = "";
  }

  function applyPicker(buildId, weaponName) {
    const build = getBuild(buildId);
    if (!build || !weaponName) {
      return;
    }

    const selectedWeapon = getWeapon(weaponName);
    if (!selectedWeapon) {
      return;
    }

    build.weaponName = selectedWeapon.name;
    build.level = getAvailableLevels(selectedWeapon)[0];
    build.currentDurability = getMaxDurability(selectedWeapon, build.level);
    build.attachmentsBySlot = {};
    syncBuild(build);
    saveState();
    closeSlotPopup();
    closePicker();
    render();
  }

})();
