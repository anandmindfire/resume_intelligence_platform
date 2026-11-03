import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Briefcase, FileText, Menu, Upload, X } from 'lucide-react';
import type { LayoutProps } from '../types';
import { COPY } from '../constants';

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen font-sans text-brand-text-primary bg-gradient-to-br from-secondary-400 via-secondary-500 to-secondary-600">
      <nav className="bg-white/95 backdrop-blur-lg border-b border-secondary-200/50 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-md transform hover:scale-105 transition-transform">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold font-display text-gradient bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                {COPY.APP_NAME}
              </h1>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md scale-105'
                      : 'text-neutral-600 hover:bg-primary-50 hover:text-primary-600'
                  }`
                }
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </NavLink>
              <NavLink
                to="/upload"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md scale-105'
                      : 'text-neutral-600 hover:bg-primary-50 hover:text-primary-600'
                  }`
                }
              >
                <Upload className="w-4 h-4" />
                Upload
              </NavLink>
              <NavLink
                to="/resumes"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md scale-105'
                      : 'text-neutral-600 hover:bg-primary-50 hover:text-primary-600'
                  }`
                }
              >
                <FileText className="w-4 h-4" />
                Resumes
              </NavLink>
              <NavLink
                to="/jobs"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md scale-105'
                      : 'text-neutral-600 hover:bg-primary-50 hover:text-primary-600'
                  }`
                }
              >
                <Briefcase className="w-4 h-4" />
                Jobs
              </NavLink>
            </div>

            <button
              className="md:hidden p-2 rounded-lg text-neutral-600 hover:bg-neutral-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-neutral-200 animate-slide-up">
              <div className="flex flex-col gap-2">
                <NavLink
                  to="/"
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                        : 'text-neutral-600 hover:bg-primary-50'
                    }`
                  }
                >
                  <BarChart3 className="w-5 h-5" />
                  Analytics
                </NavLink>
                <NavLink
                  to="/upload"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                        : 'text-neutral-600 hover:bg-primary-50'
                    }`
                  }
                >
                  <Upload className="w-5 h-5" />
                  Upload
                </NavLink>
                <NavLink
                  to="/resumes"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                        : 'text-neutral-600 hover:bg-primary-50'
                    }`
                  }
                >
                  <FileText className="w-5 h-5" />
                  Resumes
                </NavLink>
                <NavLink
                  to="/jobs"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                        : 'text-neutral-600 hover:bg-primary-50'
                    }`
                  }
                >
                  <Briefcase className="w-5 h-5" />
                  Jobs
                </NavLink>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
};
