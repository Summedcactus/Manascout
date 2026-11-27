const { cohort } = require("../fixtures/ctr-experiment.json");

// Overlay the current CTR experiment while retaining the historical research fixture.
module.exports = (slug, historical) => ({ ...historical, ...cohort[slug]?.new });
