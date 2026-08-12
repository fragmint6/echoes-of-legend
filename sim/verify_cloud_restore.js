/* =============================================================
   CLOUD RESTORE LOOP REGRESSION
   node sim/verify_cloud_restore.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SOURCE = fs.readFileSync(path.join(__dirname, '../js/cloud.js'), 'utf8');

let checks = 0;
let fails = 0;
function ok(condition, message) {
  checks++;
  console.log((condition ? '  PASS  ' : '  FAIL  ') + message);
  if (!condition) fails++;
}

function storage(seed) {
  const values = Object.assign({}, seed || {});
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    removeItem(key) {
      delete values[key];
    },
    values,
  };
}

async function scenario(options) {
  const local = storage({
    'eol.campaign.ch1.progress': JSON.stringify(options.localCampaign),
  });
  const session = storage(options.session || {});
  const writes = [];
  let reloads = 0;
  let authListener = null;
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: { data: options.remoteDocument }, error: null });
        },
        upsert(payload) {
          writes.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const context = {
    console,
    Promise,
    JSON,
    localStorage: local,
    sessionStorage: session,
    document: {
      addEventListener() {},
    },
    location: {
      reload() {
        reloads++;
      },
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };
  context.window = context;
  context.EOL = {
    auth: {
      configured() {
        return true;
      },
      rawClient() {
        return client;
      },
      onChange(listener) {
        authListener = listener;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/cloud.js' });
  context.EOL.cloud.init();
  const greeted = context.EOL.cloud.restored();
  authListener({ id: 'player-1' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { local, session, writes, reloads, greeted };
}

(async function () {
  const legacyCampaign = {
    v: 2,
    cleared: [1],
    unlocked: [1, 2],
    coins: 100,
    grants: [],
  };
  const migratedCampaign = {
    v: 3,
    selectedDifficulty: 'normal',
    coins: 100,
    grants: [],
    runs: {
      normal: { cleared: [1], unlocked: [1, 2] },
      heroic: { cleared: [], unlocked: [1] },
      legend: { cleared: [], unlocked: [1] },
    },
    cleared: [1],
    unlocked: [1, 2],
  };
  const remote = { v: 2, campaign: legacyCampaign };

  const first = await scenario({
    localCampaign: { v: 3, selectedDifficulty: 'normal', runs: {} },
    remoteDocument: remote,
  });
  ok(first.reloads === 1, 'an initial account restore still performs one clean reload');
  ok(first.writes.length === 0, 'the account save still wins on the first restore');
  ok(
    first.session.values['eol.cloud.restored'] === '1' &&
      !!first.session.values['eol.cloud.restoreDigest'],
    'the restore records a one-boot migration guard and exact cloud digest'
  );

  const afterRestore = await scenario({
    localCampaign: migratedCampaign,
    remoteDocument: remote,
    session: {
      'eol.cloud.restored': '1',
      'eol.cloud.restoreDigest': JSON.stringify(remote),
    },
  });
  ok(afterRestore.greeted, 'the restored-save greeting remains available to the app');
  ok(afterRestore.reloads === 0, 'a client-side campaign migration does not trigger another reload');
  ok(
    afterRestore.writes.length === 1 && afterRestore.writes[0].data.campaign.v === 3,
    'the migrated campaign document is promoted to Supabase exactly once'
  );
  ok(
    !afterRestore.session.values['eol.cloud.restoreDigest'],
    'the migration guard is consumed after the upgraded push'
  );

  const newerRemote = { v: 2, wallet: 999, campaign: legacyCampaign };
  const staleGuard = await scenario({
    localCampaign: migratedCampaign,
    remoteDocument: newerRemote,
    session: {
      'eol.cloud.restored': '1',
      'eol.cloud.restoreDigest': JSON.stringify(remote),
    },
  });
  ok(
    staleGuard.reloads === 1 && staleGuard.writes.length === 0,
    'a genuinely newer cloud document still wins over a stale restore guard'
  );

  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  ok(
    /Progress saved on this device/.test(indexSource) &&
      /Sign in or create an account for cloud backup/.test(indexSource) &&
      /Signed-out progress stays in this browser/.test(appSource),
    'signed-out account surfaces explain that progress is local and cloud backup is optional'
  );
  ok(
    /signing into an existing account restores that account’s save/.test(appSource),
    'the cloud-save copy warns truthfully that an existing account restores its own vault'
  );

  console.log('\n' + (fails ? `${fails} OF ${checks} CHECKS FAILED` : `ALL ${checks} CHECKS PASSED`));
  process.exit(fails ? 1 : 0);
})();
