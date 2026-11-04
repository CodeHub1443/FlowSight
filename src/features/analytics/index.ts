// /analytics is a lazy route: app/routes.tsx imports ./AnalyticsPage dynamically. Do not re-export page, chart or
// widget code from here, or ECharts would reach the /live entry chunk.
export {};
