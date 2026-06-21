import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { useSettings } from "../store/settings";

export default function EChart({
  option,
  height = 320,
}: {
  option: echarts.EChartsOption;
  height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current, theme === "dark" ? "dark" : undefined);
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={ref}
      style={{ height, width: "100%", background: "transparent" }}
    />
  );
}
