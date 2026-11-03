import React from 'react';
import Chart from 'react-apexcharts';
import type { ExperienceChartProps } from '../types';
import { chartColors } from '../theme';

export const ExperienceChart: React.FC<ExperienceChartProps> = ({ data, height = 300 }) => {
  const options = {
    chart: {
      type: 'bar' as const,
      toolbar: {
        show: false,
      },
      fontFamily: 'Inter, sans-serif',
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        horizontal: false,
        columnWidth: '50%',
        dataLabels: {
          position: 'top',
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${val.toFixed(1)} years`,
      offsetY: -20,
      style: {
        fontSize: '12px',
        colors: [chartColors.axis],
        fontWeight: 600,
      },
    },
    xaxis: {
      categories: ['Average', 'Minimum', 'Maximum'],
      labels: {
        style: {
          colors: chartColors.axis,
          fontSize: '12px',
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: chartColors.axis,
          fontSize: '12px',
        },
        formatter: (val: number) => `${val.toFixed(1)} yrs`,
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.3,
        gradientToColors: [chartColors.blue],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 0.8,
        stops: [0, 100],
      },
    },
    colors: [chartColors.blue],
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: (val: number) => `${val.toFixed(1)} years`,
      },
    },
  };

  const series = [
    {
      name: 'Years of Experience',
      data: [data.avg_years || 0, data.min_years || 0, data.max_years || 0],
    },
  ];

  return <Chart options={options} series={series} type="bar" height={height} />;
};
