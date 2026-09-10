const fs = require("fs");
const moment = require("moment-timezone");

const JAKARTA_TZ = "Asia/Jakarta";
const CONFIG_FILE = "config.json";
const DATA_FILE = "rsvp_data.json";
const HISTORY_FILE = "rsvp_history.json";
const SIEGE_DATA_FILE = "siege_data.json";

function log(cat, msg) {
  const time = moment().tz(JAKARTA_TZ).format("HH:mm:ss");
  console.log(`[${time}] [${cat.padEnd(7)}] ${msg}`);
}

const DEFAULT_CONFIG = {
  SERVER_ID: "",
  CHANNEL_ID: "0",
  LOG_CHANNEL_ID: "0",
  AUTHORIZED_ROLE_ID: "0",
  ALLIANCE_ROLE_ID: "0",
  SIEGE_CHANNEL_ID: "0",
  SIEGE_TOTAL_PAX: "100",
  SIEGE_LIMIT_BUILDER: "1",
  SIEGE_LIMIT_ELEPHANT: "1",
  SIEGE_LIMIT_FLAG: "1",
  SIEGE_LIMIT_FT: "2",
  SIEGE_LIMIT_HWACHA: "1",
  SIEGE_LIMIT_SHAI: "3",
  SIEGE_LIMIT_SHOTCALLER: "1",
  SIEGE_LIMIT_WITCH_WIZARD: "0",
  SUN_TIER: "Tier 1",
  MON_TIER: "Tier 1",
  TUE_TIER: "Tier 1",
  WED_TIER: "Tier 1",
  THU_TIER: "Tier 1",
  FRI_TIER: "Tier 1",
  SUN_VOTE_TARGET: "",
  MON_VOTE_TARGET: "",
  TUE_VOTE_TARGET: "",
  WED_VOTE_TARGET: "",
  THU_VOTE_TARGET: "",
  FRI_VOTE_TARGET: "",
  LIMIT_BUILDER: "1",
  LIMIT_ELEPHANT: "1",
  LIMIT_FLAG: "1",
  LIMIT_FT: "2",
  LIMIT_HWACHA: "1",
  LIMIT_SHAI: "3",
  LIMIT_SHOTCALLER: "1",
  MAINBALL_SUN_T1: "20",
  MAINBALL_SUN_T2: "35",
  MAINBALL_MON_T1: "15",
  MAINBALL_MON_T2: "25",
  MAINBALL_TUE_T1: "20",
  MAINBALL_TUE_T2: "25",
  MAINBALL_WED_T1: "15",
  MAINBALL_WED_T2: "25",
  MAINBALL_THU_T1: "20",
  MAINBALL_THU_T2: "25",
  MAINBALL_FRI_T1: "15",
  MAINBALL_FRI_T2: "35",
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    // Tokens belong only in .env, never in the dashboard configuration file.
    let changed = false;
    for (const legacyKey of ["TOKEN", "WEB_PASSWORD"]) {
      if (!Object.hasOwn(config, legacyKey)) continue;
      delete config[legacyKey];
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4));
    }
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Shared, mutable config object — other modules import this same reference
// and mutate its settings directly, so changes are visible everywhere without
// needing to re-import.
const CONFIG = loadConfig();

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4));
}

module.exports = {
  JAKARTA_TZ,
  CONFIG_FILE,
  DATA_FILE,
  HISTORY_FILE,
  SIEGE_DATA_FILE,
  DEFAULT_CONFIG,
  log,
  CONFIG,
  saveConfig,
};
