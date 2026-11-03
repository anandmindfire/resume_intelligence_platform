import React from 'react';
import Chart from 'react-apexcharts';
import type { SkillsPieChartProps } from '../types';
import { CHART_COLORS } from '../constants';
import { baseColors, chartColors } from '../theme';

export const SkillsPieChart: React.FC<SkillsPieChartProps> = ({
  data,
  limit = 10,
  height = 400,
}) => {
  const displayData = data.slice(0, limit);

  if (displayData.length === 0) {
    return <div className="text-center py-12 text-neutral-500">No data available</div>;
  }

  const options = {
    chart: {
      type: 'pie' as const,
      fontFamily: 'Inter, sans-serif',
    },
    labels: displayData.map((item) => item.skill),
    colors: CHART_COLORS.slice(0, displayData.length),
    legend: {
      position: 'bottom' as const,
      fontSize: '12px',
      labels: {
        colors: chartColors.axis,
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${val.toFixed(1)}%`,
      style: {
        fontSize: '12px',
        fontWeight: 600,
        colors: [baseColors.white],
      },
      dropShadow: {
        enabled: true,
        color: baseColors.black,
        blur: 3,
        opacity: 0.5,
      },
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: (val: number) => {
          const total = displayData.reduce((sum, d) => sum + d.count, 0);
          const percentage = ((val / total) * 100).toFixed(1);
          return `${val} resumes (${percentage}%)`;
        },
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '0%',
        },
        expandOnClick: true,
      },
    },
  };

  const series = displayData.map((item) => item.count);

  return <Chart options={options} series={series} type="pie" height={height} />;
};
