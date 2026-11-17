/* Public configuration only. Prepared but disabled: no Plausible account is
 * assumed. See docs/product-analytics.md before enabling on the production host. */
window.ManaScoutAnalyticsConfig = Object.freeze({
  enabled: false,
  provider: null, // 'plausible' on production; 'debug' on localhost only.
  domain: 'manascout.co.uk',
  debug: false
});
