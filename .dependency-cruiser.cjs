// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    {
      // A warning for now (2026-11-11): the mafia game's command, its phases and its DMs import each
      // other, breaking the load-order cycle with dynamic imports. When the phases take what they
      // call as arguments instead, this goes and cycles are errors again.
      name: "no-circular",
      severity: "warn",
    },
  ],
};
