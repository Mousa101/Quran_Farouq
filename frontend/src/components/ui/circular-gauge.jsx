import React from 'react';
import { cn } from '../../lib/utils';

/**
 * CircularGauge - مكون لعرض النسب بشكل دائري مثل عداد السيارة
 * @param {number} value - القيمة الحالية (0-100)
 * @param {number} maxValue - القيمة القصوى (افتراضي 100)
 * @param {string} label - النص أسفل القيمة
 * @param {string} color - لون المؤشر (emerald, blue, amber, purple, pink)
 * @param {string} size - الحجم (sm, md, lg)
 */
const CircularGauge = ({ 
  value = 0, 
  maxValue = 100, 
  label = '', 
  color = 'emerald',
  size = 'md',
  showPercentage = true,
  icon: Icon = null,
  className = ''
}) => {
  // حساب النسبة المئوية
  const percentage = Math.min(Math.max((value / maxValue) * 100, 0), 100);
  
  // حساب محيط الدائرة
  const sizeConfig = {
    sm: { width: 100, strokeWidth: 8, radius: 40, fontSize: 'text-lg', labelSize: 'text-xs' },
    md: { width: 140, strokeWidth: 10, radius: 55, fontSize: 'text-2xl', labelSize: 'text-sm' },
    lg: { width: 180, strokeWidth: 12, radius: 70, fontSize: 'text-3xl', labelSize: 'text-base' }
  };
  
  const config = sizeConfig[size] || sizeConfig.md;
  const circumference = 2 * Math.PI * config.radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // ألوان المؤشر
  const colorConfig = {
    emerald: { stroke: 'stroke-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/20', glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' },
    blue: { stroke: 'stroke-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/20', glow: 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' },
    amber: { stroke: 'stroke-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/20', glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' },
    purple: { stroke: 'stroke-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/20', glow: 'drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' },
    pink: { stroke: 'stroke-pink-500', text: 'text-pink-400', bg: 'bg-pink-500/20', glow: 'drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' },
    cyan: { stroke: 'stroke-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/20', glow: 'drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]' },
    red: { stroke: 'stroke-red-500', text: 'text-red-400', bg: 'bg-red-500/20', glow: 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' }
  };
  
  const colors = colorConfig[color] || colorConfig.emerald;
  
  // تحديد اللون بناءً على القيمة (للعدادات الديناميكية)
  const getProgressColor = () => {
    if (percentage >= 80) return colorConfig.emerald;
    if (percentage >= 60) return colorConfig.blue;
    if (percentage >= 40) return colorConfig.amber;
    return colorConfig.red;
  };
  
  const progressColors = color === 'dynamic' ? getProgressColor() : colors;

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className="relative" style={{ width: config.width, height: config.width }}>
        {/* خلفية الدائرة */}
        <svg className="w-full h-full transform -rotate-90">
          {/* دائرة الخلفية */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            className="text-slate-700/50"
          />
          {/* دائرة التقدم */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeLinecap="round"
            className={cn(progressColors.stroke, progressColors.glow, 'transition-all duration-700 ease-out')}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
            }}
          />
        </svg>
        
        {/* المحتوى الداخلي */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && (
            <Icon className={cn('mb-1', progressColors.text, size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6')} />
          )}
          <span className={cn(config.fontSize, 'font-bold', progressColors.text)}>
            {showPercentage ? `${Math.round(percentage)}%` : value}
          </span>
        </div>
      </div>
      
      {/* التسمية */}
      {label && (
        <p className={cn(config.labelSize, 'text-slate-400 mt-2 text-center font-medium')}>
          {label}
        </p>
      )}
    </div>
  );
};

export { CircularGauge };
export default CircularGauge;
