# Echoes of Legend — First-Boot Tutorial (Ends After Defeating The Recruiter)

**Scope:** This tutorial runs automatically on first boot and ends the moment the player defeats The Recruiter (Gate I). It teaches **everything** a new player needs to know before they can freely explore the rest of the game.

**Delivery:** Coach overlays + in-dialogue tips + result screen messages. The tutorial state is tracked in `localStorage` (`eol.tutorial.completed`).

---

## 0. Automatic First-Boot Flow

1. Player opens the game for the first time.
2. **Starter deck is seeded** (Grimmwood 12 — exactly 2 of every role).
3. A **Welcome coach overlay** appears immediately on the Home screen.

**Welcome Coach (first time only):**
> "Welcome to Echoes of Legend.  
> Your Grimmwood deck is ready.  
> The Campaign will teach you everything you need to know — one gate at a time.  
> Let's begin with your first story."

**Button:** "Begin the Road" (opens Campaign → Chapter 1 automatically)

---

## 1. The Recruiter — The Complete First Tutorial

This single stage teaches **every core system** the player will ever use.

### Step 1: Opening Dialogue (Lore + Expectations)

- The Recruiter explains the Road of Echoes.
- Coach tips appear inline during dialogue:
  - *"This is the only place you'll see story. Everything else is pure gameplay."*
  - *"Your goal right now: survive your first battle."*

### Step 2: Deck Selection

- Only the starter Grimmwood deck is available.
- Coach tip:
  > "This is your starting squad. Later you'll build your own 12-card decks."

### Step 3: Preparation Screen (The Full Prep Tutorial)

This is the **most important teaching moment**.

**Bans Phase (Coach overlays appear one by one):**
1. "The enemy will ban 2 of your cards. You do the same to them."
2. "Tap any enemy card to ban it. You can change your mind until you confirm."
3. "Bans are permanent for this battle."

**Fielding Phase (after bans lock):**
1. "Now choose which 6 of your remaining 10 will fight."
2. "Front row (slots 0-2) = Tanks & Bruisers. They take the hits."
3. "Back row (slots 3-5) = everyone else. They deal damage and support."
4. "Tap a hero to move them between rows. Your formation matters."

**Coach tip on formation:**
> "A good front line protects your damage dealers. Never leave your back row exposed."

### Step 4: Battle — The Complete Combat Tutorial

The battle on **The Colosseum** is heavily coached.

**Round 1 (Basic Skills only):**
- Coach appears before first action:
  > "Round 1: Only basic attacks are available. Use this round to position your front line."

**Energy Economy (first time a skill is used):**
- Overlay when energy bar appears:
  > "Energy pays for skills. You get more every round. Unspent energy carries over (up to 150)."

**Turn Flow:**
- Coach before first enemy turn:
  > "You and the enemy take turns making **one action each**. Plan ahead — you can't act twice in a row."

**Front / Back Row Rules (first time a back-row hero is attacked):**
- Coach:
  > "Back-row heroes can only be hit by skills. Basic attacks from the front row are blocked until the front line falls."

**Signature Skills (Round 2+):**
- Coach when signatures unlock:
  > "Powerful Signature skills are now available. They cost more energy but change the battle."

**Status Effects (as they appear):**
- First time a hero is **Marked**:
  > "Marks are promises. The next damaging skill that hits this target will consume the mark for bonus effects."
- First time **Burn** lands:
  > "Burn deals true damage every turn and ignores shields and defense."
- First time **Provoke (Taunt)** is used:
  > "Provoke forces all attacks onto this hero. Use it to protect your back line."

**Passing / End Turn:**
- Coach on the End Turn button:
  > "You can pass to save energy or wait for the enemy. Two consecutive passes end the round."

### Step 5: Victory → Result Screen

- Victory message includes tutorial summary:
  > "You survived your first battle.  
  > You now understand: energy, formation, basic vs signature skills, and status effects."

### Step 6: Epilogue Dialogue (Tutorial Completion)

After the Recruiter epilogue, a final coach overlay appears:

**Tutorial Complete Coach:**
> "Congratulations. You have completed the onboarding tutorial.  
> You now know everything you need to play the rest of the game.  
>  
> The Road continues — but the tutorial is over.  
> Explore Classic, Draft, or continue the Campaign at your own pace."

**Buttons:**
- "Return to Home"
- "Continue the Campaign" (unlocks Gate II)

**Persistent flag set:** `eol.tutorial.completed = true`

---

## 2. What the Player Now Knows (Complete Coverage)

By the end of the Recruiter fight, the player has been explicitly taught:

| Category | Mechanics Covered |
|----------|-------------------|
| **Core Loop** | Alternating turns, energy income + carry-over, comeback bonus |
| **Formation** | Front row (Tanks/Bruisers), back row targeting rules, broken frontline penalty |
| **Skills** | Basic attacks vs Signature skills, Round 1 restriction |
| **Status Effects** | Mark, Burn, Provoke (Taunt), Silence (mentioned), Shields |
| **Preparation** | Bans (2 per side), fielding 6 heroes, row assignment |
| **Unabridged** | Mentioned as future content ("you'll learn sets later") |
| **Progression** | Named card rewards, currency, codex (teased) |
| **Lore** | The Road of Echoes concept (light) |

**Nothing is left for the player to discover by accident.**

---

## 3. Post-Tutorial State

After defeating The Recruiter:

- Tutorial flag is set.
- Gate II is unlocked.
- All other modes (Classic, Draft) become available without coach interference.
- The full rulebook is now accessible.
- Future coach tips are reduced to optional "Tips on" setting.

---

## 4. Implementation Notes (for developers)

- The tutorial is **not** the full 10-stage campaign.
- It is a **linear, heavily coached** experience that ends after Stage 1 victory.
- All coach content should be stored in `js/campaign.js` or a dedicated `tutorial.js` module.
- The Recruiter battle uses the existing `startPrep` + `BATTLE().start` flow with `campaignStage: 1` and extra `tutorial: true` flag.
- No Unabridged, Draft, or advanced mechanics are taught here — they are explicitly deferred.

---

**End of First-Boot Tutorial**

This is now the **official onboarding experience**. It is short, complete, and ends exactly when the player defeats The Recruiter. All future documentation and coach content should reference this version.