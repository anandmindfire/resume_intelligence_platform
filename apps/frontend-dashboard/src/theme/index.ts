import tokens from './tokens.json';

/**
 * Design tokens for places that can't use a Tailwind class (chart libraries take color strings).
 * tokens.json is also what tailwind.config.js builds its palette from, so classes and charts can't drift.
 * Never write a hex/rgb literal anywhere else in src: add a token here instead.
 */
export const baseColors = tokens.base;
export const chartColors = tokens.chart;
export const colorScales = tokens.colors;
