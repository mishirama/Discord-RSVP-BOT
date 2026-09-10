const ROLE_EMOJIS = {
  "Main Ball": "⚔️",
  Shotcaller: "📢",
  Builder: "🔨",
  Elephant: "<:Elephant:1546531178734166016>",
  Flag: "<:FlagMan:1546531119610990602>",
  FT: "<:FlameTower:1546531150846099516>",
  Hwacha: "<:Hwacha:1546531091580723210>",
  Shai: "<:Shai:1546531223294316564>",
  "Witch/Wizard": "🧙",
};

// JS Date/moment .day(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
// Saturday (6) intentionally has no key, mirroring the original's default-to-MON behavior
const DAY_KEYS = { 0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI" };

const ROLE_BUTTONS = [
  { role: "Main Ball", customId: "rsvp_main", emoji: "⚔️" },
  { role: "Builder", customId: "rsvp_builder", emoji: "🔨" },
  { role: "Elephant", customId: "rsvp_elephant", emoji: { id: "1546531178734166016", name: "Elephant" } },
  { role: "Flag", customId: "rsvp_flag", emoji: { id: "1546531119610990602", name: "FlagMan" } },
  { role: "FT", customId: "rsvp_ft", emoji: { id: "1546531150846099516", name: "FlameTower" } },
  { role: "Hwacha", customId: "rsvp_hwacha", emoji: { id: "1546531091580723210", name: "Hwacha" } },
  { role: "Shai", customId: "rsvp_shai", emoji: { id: "1546531223294316564", name: "Shai" } },
  { role: "Shotcaller", customId: "rsvp_shotcaller", emoji: "📢" },
];

const SIEGE_ROLE_BUTTONS = [
  { role: "Builder", customId: "rsvp_builder", emoji: "🔨" },
  { role: "Elephant", customId: "rsvp_elephant", emoji: { id: "1546531178734166016", name: "Elephant" } },
  { role: "Flag", customId: "rsvp_flag", emoji: { id: "1546531119610990602", name: "FlagMan" } },
  { role: "FT", customId: "rsvp_ft", emoji: { id: "1546531150846099516", name: "FlameTower" } },
  { role: "Hwacha", customId: "rsvp_hwacha", emoji: { id: "1546531091580723210", name: "Hwacha" } },
  { role: "Shai", customId: "rsvp_shai", emoji: { id: "1546531223294316564", name: "Shai" } },
  { role: "Shotcaller", customId: "rsvp_shotcaller", emoji: "📢" },
  { role: "Witch/Wizard", customId: "rsvp_witch_wizard", emoji: "🧙" },
  { role: "Main Ball", customId: "rsvp_main", emoji: "⚔️" },
];

const CUSTOM_ID_TO_ROLE = Object.fromEntries(ROLE_BUTTONS.map((b) => [b.customId, b.role]));
for (const button of SIEGE_ROLE_BUTTONS) CUSTOM_ID_TO_ROLE[button.customId] = button.role;
CUSTOM_ID_TO_ROLE["rsvp_cancel"] = "Cancel";

// Every role except Main Ball (which stays tier-controlled) can have its
// slot count configured from the dashboard. These are the fallback values
// used if the config file doesn't have a valid number saved yet.
const DEFAULT_ROLE_LIMITS = {
  Builder: 1,
  Elephant: 1,
  Flag: 1,
  FT: 2,
  Hwacha: 1,
  Shai: 3,
  Shotcaller: 1,
};

// Maps each configurable role to the config.json / dashboard field name that holds its limit
const ROLE_CONFIG_KEYS = {
  Builder: "LIMIT_BUILDER",
  Elephant: "LIMIT_ELEPHANT",
  Flag: "LIMIT_FLAG",
  FT: "LIMIT_FT",
  Hwacha: "LIMIT_HWACHA",
  Shai: "LIMIT_SHAI",
  Shotcaller: "LIMIT_SHOTCALLER",
};

const SIEGE_ROLE_CONFIG_KEYS = {
  Builder: "SIEGE_LIMIT_BUILDER",
  Elephant: "SIEGE_LIMIT_ELEPHANT",
  Flag: "SIEGE_LIMIT_FLAG",
  FT: "SIEGE_LIMIT_FT",
  Hwacha: "SIEGE_LIMIT_HWACHA",
  Shai: "SIEGE_LIMIT_SHAI",
  Shotcaller: "SIEGE_LIMIT_SHOTCALLER",
  "Witch/Wizard": "SIEGE_LIMIT_WITCH_WIZARD",
};

const DEFAULT_SIEGE_ROLE_LIMITS = {
  Builder: 1,
  Elephant: 1,
  Flag: 1,
  FT: 2,
  Hwacha: 1,
  Shai: 3,
  Shotcaller: 1,
  "Witch/Wizard": 0,
};

// Main Ball's slot count depends on both day and tier. These are the
// fallback numbers if the config file doesn't have valid values saved yet.
const DEFAULT_MAIN_BALL_LIMITS = {
  SUN: { "Tier 1": 20, "Tier 2": 35 },
  MON: { "Tier 1": 15, "Tier 2": 25 },
  TUE: { "Tier 1": 20, "Tier 2": 25 },
  WED: { "Tier 1": 15, "Tier 2": 25 },
  THU: { "Tier 1": 20, "Tier 2": 25 },
  FRI: { "Tier 1": 15, "Tier 2": 35 },
};

// Maps each day+tier combo to its config.json / dashboard field name
const MAIN_BALL_CONFIG_KEYS = {
  SUN: { "Tier 1": "MAINBALL_SUN_T1", "Tier 2": "MAINBALL_SUN_T2" },
  MON: { "Tier 1": "MAINBALL_MON_T1", "Tier 2": "MAINBALL_MON_T2" },
  TUE: { "Tier 1": "MAINBALL_TUE_T1", "Tier 2": "MAINBALL_TUE_T2" },
  WED: { "Tier 1": "MAINBALL_WED_T1", "Tier 2": "MAINBALL_WED_T2" },
  THU: { "Tier 1": "MAINBALL_THU_T1", "Tier 2": "MAINBALL_THU_T2" },
  FRI: { "Tier 1": "MAINBALL_FRI_T1", "Tier 2": "MAINBALL_FRI_T2" },
};

// Official total Node War squad sizes. These totals include Main Ball and
// every special role together.
const OFFICIAL_TOTAL_PAX = {
  SUN: { "Tier 1": 30, "Tier 2": 50 },
  MON: { "Tier 1": 25, "Tier 2": 40 },
  TUE: { "Tier 1": 30, "Tier 2": 40 },
  WED: { "Tier 1": 25, "Tier 2": 40 },
  THU: { "Tier 1": 30, "Tier 2": 40 },
  FRI: { "Tier 1": 25, "Tier 2": 50 },
};

module.exports = {
  ROLE_EMOJIS,
  DAY_KEYS,
  ROLE_BUTTONS,
  SIEGE_ROLE_BUTTONS,
  CUSTOM_ID_TO_ROLE,
  DEFAULT_ROLE_LIMITS,
  ROLE_CONFIG_KEYS,
  SIEGE_ROLE_CONFIG_KEYS,
  DEFAULT_SIEGE_ROLE_LIMITS,
  DEFAULT_MAIN_BALL_LIMITS,
  MAIN_BALL_CONFIG_KEYS,
  OFFICIAL_TOTAL_PAX,
};
