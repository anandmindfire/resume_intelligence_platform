import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LoadingProps } from '../../types/loading';
import { COPY } from '../../constants';

export const Loading: React.FC<LoadingProps> = ({ message = COPY.LOADING.DEFAULT }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
    <p className="text-lg font-medium text-neutral-700">{message}</p>
  </div>
);
