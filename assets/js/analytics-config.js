/* Public configuration only. See docs/monetisation-setup.md before activation. */
window.ManaScoutAnalyticsConfig = Object.freeze({
  enabled: false,
  provider: null, // 'plausible' or 'ga4' on production. 'debug' on localhost.
  domain: 'manascout.co.uk',
  ga4MeasurementId: null,
  debug: false
});
