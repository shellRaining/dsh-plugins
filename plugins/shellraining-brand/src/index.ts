// Host half: no host-side behavior. The brand lives entirely in the browser
// bundle (client.js), registered through ctx.slots from the sidebar and
// conversation declarations. This file exists because the Loader row points at
// it and client-modules resolves the package root from its module location.
export const name = "dsh-shellraining-brand"

export const inject = []

export function apply() {}
