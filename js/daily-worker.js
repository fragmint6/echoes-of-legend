/* =============================================================
   DAILY PUZZLE WEB WORKER
   Runs the existing depth-4 forge away from the UI thread. A signed-in
   browser only starts it after winning the database's 6:55 generation
   lease (or while recovering a missed reset).
   ============================================================= */
'use strict';

self.window = self;
self.document = {
  body: { dataset: {} },
  getElementById: function () {
    return null;
  },
  addEventListener: function () {},
};
self.EOL = {};

importScripts(
  '../data/_schema.js',
  '../data/roles.js',
  '../data/camelot.js',
  '../data/olympus.js',
  '../data/yamato.js',
  '../data/grimmwood.js',
  '../data/sherwood.js',
  '../data/huaxia.js',
  '../data/roma.js',
  '../data/takamagahara.js',
  '../data/duat.js',
  '../data/battlefields.js',
  '../data/draft-ai.js',
  'engine.js',
  'ai.js',
  'daily.js'
);

function randomInt32() {
  var a = new Uint32Array(1);
  self.crypto.getRandomValues(a);
  return a[0] | 0;
}

self.addEventListener('message', async function (event) {
  if (!event.data || event.data.kind !== 'generate') return;
  var generationSeed = randomInt32();
  var started = Date.now();
  try {
    var rec = await self.EOL.daily._generatePosition(generationSeed);
    if (rec.futureSeed == null || !rec.certificate) {
      throw new Error('Daily forge did not return a winning-line certificate');
    }
    var futureSeed = rec.futureSeed | 0;
    var position = self.EOL.daily._serializeBattle(rec.candidate.state, futureSeed);
    var rebuilt = self.EOL.daily._deserializeBattle(position);
    var roundTrip = self.EOL.daily._serializeBattle(rebuilt, futureSeed);
    if (JSON.stringify(roundTrip) !== JSON.stringify(position)) {
      throw new Error('Daily position failed serialization round-trip');
    }
    var metrics = {
      round: rec.candidate.round,
      wins: rec.wins,
      trials: rec.trials,
      rate: rec.rate,
      forgeMs: Date.now() - started,
      certificate: rec.certificate,
    };
    self.postMessage({
      kind: 'complete',
      token: event.data.token,
      puzzleDay: event.data.puzzleDay,
      payload: {
        v: 1,
        position: position,
        meta: metrics,
        generatedAt: new Date().toISOString(),
      },
      metrics: metrics,
    });
  } catch (error) {
    self.postMessage({
      kind: 'error',
      token: event.data.token,
      message: error && error.message ? error.message : 'Puzzle generation failed',
    });
  }
});
