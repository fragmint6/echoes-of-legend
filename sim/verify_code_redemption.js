/* =============================================================
   SHOP CODE REDEMPTION REGRESSION
   node sim/verify_code_redemption.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ECONOMY = fs.readFileSync(path.join(ROOT, 'js/economy.js'), 'utf8');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-08.sql'), 'utf8');

let checks = 0;
let fails = 0;
function ok(condition, message) {
  checks++;
  console.log((condition ? '  PASS  ' : '  FAIL  ') + message);
  if (!condition) fails++;
}

function makeStorage(seed) {
  const values = Object.assign({}, seed || {});
  return {
    values,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    removeItem(key) {
      delete values[key];
    },
  };
}

function loadEconomy(responseFactory, options) {
  options = options || {};
  const storage = makeStorage({
    'eol.wallet.v1': String(options.wallet == null ? 250 : options.wallet),
    'eol.econ.migrated.v1': '1',
  });
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        single() {
          return Promise.resolve(responseFactory(name, args));
        },
      };
    },
  };
  const context = {
    console,
    Promise,
    JSON,
    Math,
    Object,
    Array,
    String,
    localStorage: storage,
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    document: {
      addEventListener() {},
      dispatchEvent() {},
    },
  };
  context.window = context;
  context.EOL = {
    factions: [],
    auth: {
      configured() {
        return true;
      },
      user() {
        return options.signedOut ? null : { id: 'user-1' };
      },
      rawClient() {
        return options.signedOut ? null : client;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(ECONOMY, context, { filename: 'js/economy.js' });
  return { econ: context.EOL.econ, storage, calls };
}

(async function () {
  const granted = loadEconomy(() => ({
    data: {
      result_status: 'granted',
      result_code: 'ONE-WINNER',
      reward_coins: 5000,
      single_user_only: true,
      wallet_balance: 5250,
    },
    error: null,
  }));
  const first = await granted.econ.redeemCode(' one-winner ');
  ok(
    granted.calls.length === 1 &&
      granted.calls[0].name === 'redeem_shop_code' &&
      granted.calls[0].args.p_code === 'ONE-WINNER' &&
      granted.calls[0].args.p_wallet === 250,
    'a signed-in claim is normalized and sent to the atomic redemption RPC'
  );
  ok(
    first.ok && first.singleUserOnly && first.source === 'server' && granted.econ.coins() === 5250,
    'a globally single-user server claim applies the returned authoritative wallet'
  );
  ok(
    granted.econ.hasRedeemedCode('ONE-WINNER'),
    'a successful server claim is cached in the local/cloud redemption list'
  );
  const repeat = granted.econ.redeemCode('ONE-WINNER');
  ok(
    !repeat.ok && repeat.status === 'redeemed' && granted.calls.length === 1,
    'the same account cannot send or receive the same claim twice'
  );

  const claimed = loadEconomy(() => ({
    data: {
      result_status: 'claimed',
      result_code: 'ONE-WINNER',
      reward_coins: 5000,
      single_user_only: true,
      wallet_balance: 250,
    },
    error: null,
  }));
  const lostRace = await claimed.econ.redeemCode('ONE-WINNER');
  ok(
    !lostRace.ok &&
      lostRace.status === 'claimed' &&
      claimed.econ.coins() === 250 &&
      !claimed.econ.hasRedeemedCode('ONE-WINNER'),
    'a code claimed by another user grants nothing and is not misrecorded locally'
  );

  const missing = loadEconomy(() => ({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function redeem_shop_code' },
  }));
  const fallback = await missing.econ.redeemCode('CREATOR5000');
  ok(
    fallback.ok && fallback.source === 'local' && missing.econ.coins() === 5250,
    'the public CREATOR5000 code keeps its per-save fallback before migration 08 is installed'
  );

  ok(
    /single_user_only boolean not null default false/.test(MIGRATION) &&
      /primary key \(code, user_id\)/.test(MIGRATION),
    'migration 08 defines both policy modes and a once-per-account claim key'
  );
  ok(
    /where c\.code = normalized\s+for update;/.test(MIGRATION) &&
      /if any_claim then\s+return query\s+select 'claimed'/s.test(MIGRATION),
    'single-user claims lock the code row and reject every claimant after the first'
  );
  ok(
    /revoke all on table public\.shop_codes from anon, authenticated/.test(MIGRATION) &&
      /grant execute on function public\.redeem_shop_code\(text, bigint\) to authenticated/.test(
        MIGRATION
      ),
    'the catalog and claim ledger are private while authenticated users receive only the RPC'
  );
  ok(
    /values \('CREATOR5000', 5000, false, true\)/.test(MIGRATION),
    'the backend seeds CREATOR5000 as every-account-once, not globally single-user'
  );

  console.log('\n' + (fails ? `${fails} OF ${checks} CHECKS FAILED` : `ALL ${checks} CHECKS PASSED`));
  process.exit(fails ? 1 : 0);
})();
