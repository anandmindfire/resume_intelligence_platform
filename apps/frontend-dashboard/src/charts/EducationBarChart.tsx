import React from 'react';
import Chart from 'react-apexcharts';
import type { EducationBarChartProps } from '../types';
import { chartColors } from '../theme';

export const EducationBarChart: React.FC<EducationBarChartProps> = ({ data, height = 300 }) => {
  const displayData = data.slice(0, 10).map((item) => ({
    ...item,
    institution:
      item.institution && item.institution.length > 20
        ? item.institution.substring(0, 20) + '...'
        : item.institution || 'Unknown',
  }));

  if (displayData.length === 0) {
    return <div className="text-center py-12 text-neutral-500">No education data available</div>;
  }

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
        columnWidth: '60%',
        dataLabels: {
          position: 'top',
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => val.toString(),
      offsetY: -20,
      style: {
        fontSize: '12px',
        colors: [chartColors.axis],
      },
    },
    xaxis: {
      categories: displayData.map((item) => item.institution),
      labels: {
        style: {
          colors: chartColors.axis,
          fontSize: '12px',
        },
        rotate: -45,
        rotateAlways: true,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: chartColors.axis,
          fontSize: '12px',
        },
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.3,
        gradientToColors: [chartColors.emerald],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 0.8,
        stops: [0, 100],
      },
    },
    colors: [chartColors.emerald],
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: 'light',
      style: {
        fontSize: '12px',
      },
    },
  };

  const series = [
    {
      name: 'Resume Count',
      data: displayData.map((item) => item.count),
    },
  ];

  return <Chart options={options} series={series} type="bar" height={height} />;
};
