# Icon system

Echoes of Legend uses two icon libraries with separate jobs. The distinction is semantic, not decorative.

## Remix Icon: interface layer

Use Remix Icon for the site and its controls:

- navigation, tabs, buttons, menus, and links;
- account, authentication, settings, and generic people/avatar fallbacks;
- page mastheads, empty states, loading, and progress;
- mode selection and matchmaking chrome;
- dialogue controls and prompts;
- tips, coaching, success/error feedback, and other generic status messages.

A control stays Remix even when it performs a game action. For example, **Confirm bans**, **Field your six**, **Forfeit**, and **Rematch** are interface controls, so their icons are Remix.

Markup uses the icon class directly:

```html
<i class="ri-sword-line"></i>
```

## RPG Awesome: game-domain layer

Use RPG Awesome only when the glyph communicates game content or a rule:

- cards and pack/card ceremony;
- factions, rarities, roles, and elements;
- HP, ATK, DEF, Energy, abilities, and combat previews;
- buffs, debuffs, status effects, and keywords;
- battlefield identities and effects;
- in-world rivals, rewards, formations, teams, and fight-card state.

Every rendered RPG Awesome `<i>` must declare that decision:

```html
<i data-icon-domain="game" class="ra ra-burning-embers"></i>
```

The `data-icon-domain` attribute has no visual behavior. It is a review marker and an audit boundary. Dynamic renderers must emit the same attribute when they produce an RPG Awesome element. Plain icon-name data such as `icon: 'ra-burning-embers'` does not need the attribute until it is rendered.

## Decision test

1. Is this navigation, a control, site identity, or generic feedback? Use Remix.
2. Does the glyph name a specific game entity, property, rule, or in-world concept? RPG Awesome is allowed.
3. If both seem plausible, use Remix. RPG Awesome is the narrow exception.

Do not choose a library because one version of an icon merely looks better. The same semantic role should use the same library throughout the site.

## Audit

Run:

```sh
node tools/audit_icons.js
```

The audit rejects unmarked RPG Awesome markup and unmarked imperative assignments of the RPG Awesome base class. It also verifies that the Remix classes used by the interface exist in the pinned Remix Icon 4.5.0 catalog loaded by `index.html`.
