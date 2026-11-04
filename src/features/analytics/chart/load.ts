/** The ECharts chunk (ChartCanvas). One loader, shared by <Chart> and the preload. */
export const loadChartCanvas = () => import('./ChartCanvas');

/** Start loading the ECharts chunk early (the Performance tab calls it on mount, while its widgets fetch data). */
export function preloadChart(): void {
  void loadChartCanvas();
}
