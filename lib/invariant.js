//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-voice-input`.
* @module @deepseek-ai/dsh-client-ui-voice-input/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-client-ui-voice-input";
/** Cordis companion plugin name. */
const name = "ui-voice-input-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the mic control is a pure client-surface component
* whose recognition wiring is pinned by its jsdom component tests; there is no
* owned state or observation stream to assert.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
