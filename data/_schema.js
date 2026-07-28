/* =============================================================
 * Echoes of Legend — Card Data Registry & Schema
 * =============================================================
 * Faction files register themselves into window.EOL.factions.
 * Loaded via plain <script> tags so the game runs from file://
 * without needing a local web server.
 *
 * ---- CARD SCHEMA -------------------------------------------
 * {
 *   id:        string   unique slug, e.g. "camelot-king-arthur"
 *   name:      string   display name
 *   faction:   string   faction id (set automatically on register)
 *   rarity:    "legendary" | "epic" | "rare" | "common"
 *   role:      "Tank" | "Bruiser" | "Caster" | "Controller" | "Medic" | "Sniper"
 *   element:   "Physical" | "Magic" | "Shadow" | "Light" | "Lightning" | "Fire" | "Nature"
 *   stats:     { hp: number, atk: number, def: number (percent) }
 *   ability: {
 *     type:    "Passive" | "Active"
 *     name:    string
 *     cost:    number|null   energy cost — Actives only
 *     text:    string        full description, written as prose. Keep it to
 *                            one sentence where possible; may contain <b>.
 *     note:    string|null   trailing footnote, used for stacking caps and
 *                            limits, e.g. "Max: 5 stacks." / "Once per battle."
 *   }
 *   icon:      string        RPG Awesome class — this IS the card art
 * }
 *
 * NOTES
 *  - Passives never have a cooldown.
 *  - Cards are icon-only by design; there is no image field.
 * ============================================================= */

window.EOL = window.EOL || {};
window.EOL.factions = window.EOL.factions || [];

window.EOL.registerFaction = function (faction) {
  faction.cards.forEach(function (c) {
    c.faction = faction.id;
  });
  window.EOL.factions.push(faction);
};
