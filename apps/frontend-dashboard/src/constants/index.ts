import { chartColors } from '../theme';

export { API_BASE_URL, API_PATHS } from './api';
export { COPY } from './copy';
export {
  TABLE_SKELETON_VARIANTS,
  SKELETON_COLUMN_WIDTHS,
  CHART_SKELETON_BAR_HEIGHTS,
} from './skeleton';

export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

/** Categorical series colors, in the order series are assigned. */
export const CHART_COLORS = [
  chartColors.indigo,
  chartColors.emerald,
  chartColors.amber,
  chartColors.red,
  chartColors.blue,
  chartColors.violet,
  chartColors.pink,
  chartColors.teal,
  chartColors.orange,
  chartColors.cyan,
];

export const STATUS_COLORS: Record<string, string> = {
  uploaded: chartColors.blue,
  processing: chartColors.amber,
  parsed: chartColors.violet,
  matched: chartColors.emerald,
  completed: chartColors.emerald,
  failed: chartColors.red,
  error: chartColors.red,
  pending: chartColors.axis,
  queued: chartColors.axis,
};
