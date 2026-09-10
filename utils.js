const { PermissionsBitField } = require("discord.js");
const { CONFIG, log } = require("./config");
const {
  ROLE_EMOJIS,
  DAY_KEYS,
  DEFAULT_ROLE_LIMITS,
  ROLE_CONFIG_KEYS,
  SIEGE_ROLE_CONFIG_KEYS,
  DEFAULT_SIEGE_ROLE_LIMITS,
  DEFAULT_MAIN_BALL_LIMITS,
  MAIN_BALL_CONFIG_KEYS,
  OFFICIAL_TOTAL_PAX,
} = require("./constants");

function getLimits(targetDate) {
  const weekday = targetDate.getDay();
  const dayPrefix = DAY_KEYS[weekday] || "MON";
  const tier = CONFIG[`${dayPrefix}_TIER`] || "Tier 1";

  const limits = {};
  for (const [role, configKey] of Object.entries(ROLE_CONFIG_KEYS)) {
    const configured = parseInt(CONFIG[configKey], 10);
    limits[role] =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ROLE_LIMITS[role];
  }

  const mainBallKey = MAIN_BALL_CONFIG_KEYS[dayPrefix][tier];
  const configuredMainBall = parseInt(CONFIG[mainBallKey], 10);
  limits["Main Ball"] =
    Number.isFinite(configuredMainBall) && configuredMainBall > 0
      ? configuredMainBall
      : DEFAULT_MAIN_BALL_LIMITS[dayPrefix][tier];

  const total = Object.values(limits).reduce((a, b) => a + b, 0);
  log("RSVP", `Squad limits compiled for ${dayPrefix} (${tier}) -> Total: ${total} slots.`);
  return limits;
}

function getSiegeLimits() {
  const limits = {};
  let remaining = 100;
  for (const [role, key] of Object.entries(SIEGE_ROLE_CONFIG_KEYS)) {
    const configured = parseInt(CONFIG[key], 10);
    const requested = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_SIEGE_ROLE_LIMITS[role];
    limits[role] = Math.min(requested, remaining);
    remaining -= limits[role];
  }
  const specialRoleTotal = Object.values(limits).reduce((total, value) => total + value, 0);
  const configuredTotal = parseInt(CONFIG.SIEGE_TOTAL_PAX, 10);
  const total = Number.isFinite(configuredTotal) ? Math.min(Math.max(configuredTotal, specialRoleTotal), 100) : 100;
  limits["Main Ball"] = total - specialRoleTotal;
  return limits;
}

function isAuthorized(member) {
  const authId = String(CONFIG.AUTHORIZED_ROLE_ID || "0");
  if (authId !== "0" && member.roles.cache.has(authId)) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function configuredLimit(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Compare every day's active tier configuration with the official total pax.
// Main Ball and all special roles are intentionally counted together.
function getCapacityWarnings(config = CONFIG) {
  const specialRoleTotal = Object.entries(ROLE_CONFIG_KEYS).reduce(
    (total, [role, key]) => total + configuredLimit(config[key], DEFAULT_ROLE_LIMITS[role]),
    0
  );

  return Object.entries(OFFICIAL_TOTAL_PAX).flatMap(([day, totals]) => {
    const tier = config[`${day}_TIER`] === "Tier 2" ? "Tier 2" : "Tier 1";
    const mainBallKey = MAIN_BALL_CONFIG_KEYS[day][tier];
    const mainBall = configuredLimit(config[mainBallKey], DEFAULT_MAIN_BALL_LIMITS[day][tier]);
    const expected = totals[tier];
    const actual = specialRoleTotal + mainBall;

    // Only warn when a roster exceeds its official maximum. Being below the
    // limit is allowed and should not create a dashboard or Discord alert.
    if (actual <= expected) return [];
    return [{ day, tier, expected, actual, difference: actual - expected }];
  });
}

module.exports = { getLimits, getSiegeLimits, isAuthorized, getCapacityWarnings };
