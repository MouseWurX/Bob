// Turbo's tricks as the parts of an engine start (Nov 26, the owner: "test all the turbo features to make sure they
// still add speed with the other tricks, and that GUPPI can compensate and optimize those tricks too"). The same
// functions Bob's own start uses (engine-extras.js), gathered for a start that isn't Bob's: GUPPI calibrates this PC
// (its Turbo pass) and the Turbo test matrix (model-lab/turbo-start.mjs). Nothing here reads the computer.
//   turboParts(cfg, model, { caps, ctx, args, be, build, mtp }) -> { extra, env, perWord, said }
//     caps: the engine's chat memory types ({ q3, q2, tiers, sink }, from its --help)
//     args: the start's other flags (stand-ins need the expert copy cache, --moe-cache-mib)
//     mtp: the brain's own guesser flags (mtpArgs) when keep more guesses should have a drafter to work on
import { memArgs, memTypeOf, tiersEnv, sinkEnv, turboStandins, STANDIN_ENV, turboDriveStandins, DRIVE_STANDIN_ENV, keepGuessesArgs, keepGuessesEnv, turboExperts, draftNumArgs, TURBO_TRICKS, TURBO_TRICK_NAMES, turboTricksOn, withTurboDrop } from './engine-extras.js';

export { TURBO_TRICKS, TURBO_TRICK_NAMES, turboTricksOn, withTurboDrop };

export function turboParts(cfg, model, { caps = {}, ctx = 8192, args = [], be = 0, build = 0, mtp = [] } = {}) {
  const extra = [...memArgs(cfg, model, null, caps)];
  // a drafter for keep more guesses: the brain's own guesser, 8 ahead (the Lab's MTP default)
  if (mtp.length && !args.includes('--spec-type')) extra.push(...mtp, ...draftNumArgs(build, 8));
  const all = [...args, ...extra];
  extra.push(...keepGuessesArgs(cfg, { args: all, be }));
  const env = {};
  if (all.includes('--moe-cache-mib') && turboStandins(cfg)) Object.assign(env, STANDIN_ENV);
  else if (all.includes('--moe-cache-mib') && turboDriveStandins(cfg)) Object.assign(env, DRIVE_STANDIN_ENV);
  Object.assign(env, keepGuessesEnv(cfg, { args: [...args, ...extra], be }), tiersEnv(cfg, model, ctx, { ...caps, handArgs: all }), sinkEnv(cfg, model, ctx, { ...caps, handArgs: all }));
  return { extra, env, perWord: turboExperts(cfg), mem: memTypeOf(cfg, model, caps) };
}
// the same start with and without a trick: true when leaving it out changes nothing (it does nothing on this start)
export function sameStart(a, b) {
  const key = (p) => JSON.stringify([p.extra, Object.entries(p.env).sort(), p.perWord]);
  return key(a) === key(b);
}
