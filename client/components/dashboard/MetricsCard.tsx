// client/components/dashboard/MetricsCard.tsx
import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Activity
} from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'percentage' | 'absolute' | 'none';
  trend?: 'up' | 'down' | 'stable';
  trendPeriod?: string;
  benchmark?: number;
  unit?: string;
  description?: string;
  status?: 'good' | 'warning' | 'critical' | 'info';
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  showBenchmark?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

interface MetricGroupProps {
  title?: string;
  metrics: Omit<MetricsCardProps, 'size'>[];
  className?: string;
}

const STATUS_CONFIG = {
  good: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: CheckCircle
  },
  warning: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: AlertTriangle
  },
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertTriangle
  },
  info: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Info
  }
};

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  change,
  changeType = 'percentage',
  trend,
  trendPeriod = 'vs last period',
  benchmark,
  unit = '',
  description,
  status,
  icon,
  size = 'md',
  orientation = 'vertical',
  showBenchmark = false,
  loading = false,
  onClick,
  className
}) => {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`;
      } else if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`;
      } else if (val % 1 !== 0) {
        return val.toFixed(1);
      }
      return val.toString();
    }
    return val;
  };

  const formatChange = (changeVal: number): string => {
    const absChange = Math.abs(changeVal);
    const prefix = changeVal >= 0 ? '+' : '';
    
    if (changeType === 'percentage') {
      return `${prefix}${changeVal.toFixed(1)}%`;
    } else if (changeType === 'absolute') {
      return `${prefix}${formatValue(changeVal)}${unit}`;
    }
    return '';
  };

  const getTrendIcon = () => {
    if (!change && !trend) return null;
    
    const trendDirection = trend || (change! > 0 ? 'up' : change! < 0 ? 'down' : 'stable');
    const isPositive = change ? change > 0 : trend === 'up';
    const iconClass = cn(
      "h-4 w-4",
      isPositive ? "text-green-500" : change! < 0 ? "text-red-500" : "text-gray-500"
    );

    switch (trendDirection) {
      case 'up':
        return <TrendingUp className={iconClass} />;
      case 'down':
        return <TrendingDown className={iconClass} />;
      case 'stable':
        return <Minus className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  const getChangeColor = () => {
    if (!change) return 'text-gray-500';
    return change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500';
  };

  const statusConfig = status ? STATUS_CONFIG[status] : null;
  const StatusIcon = statusConfig?.icon;

  const cardSizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };

  const valueSizeClasses = {
    sm: 'text-lg font-semibold',
    md: 'text-2xl font-bold',
    lg: 'text-3xl font-bold'
  };

  const titleSizeClasses = {
    sm: 'text-xs font-medium',
    md: 'text-sm font-medium',
    lg: 'text-base font-medium'
  };

  if (loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className={cardSizeClasses[size]}>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "transition-all duration-200",
        statusConfig && statusConfig.bgColor,
        statusConfig && statusConfig.borderColor,
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      <CardContent className={cardSizeClasses[size]}>
        {orientation === 'vertical' ? (
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className={cn(
                  titleSizeClasses[size],
                  statusConfig ? statusConfig.color : 'text-gray-600'
                )}>
                  {title}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {icon && <div className="text-gray-400">{icon}</div>}
                {StatusIcon && <StatusIcon className={cn("h-4 w-4", statusConfig?.color)} />}
              </div>
            </div>

            {/* Value */}
            <div className="flex items-baseline gap-2">
              <span className={cn(
                valueSizeClasses[size],
                statusConfig ? statusConfig.color : 'text-gray-900'
              )}>
                {formatValue(value)}{unit}
              </span>
            </div>

            {/* Change and Trend */}
            {(change !== undefined || trend) && (
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                {change !== undefined && (
                  <span className={cn("text-sm font-medium", getChangeColor())}>
                    {formatChange(change)}
                  </span>
                )}
                <span className="text-xs text-gray-500">{trendPeriod}</span>
              </div>
            )}

            {/* Benchmark */}
            {showBenchmark && benchmark !== undefined && (
              <div className="text-xs text-gray-500">
                Benchmark: {formatValue(benchmark)}{unit}
              </div>
            )}

            {/* Description */}
            {description && (
              <p className="text-xs text-gray-500 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        ) : (
          /* Horizontal Layout */
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {icon && <div className="text-gray-400">{icon}</div>}
                <p className={cn(
                  titleSizeClasses[size],
                  statusConfig ? statusConfig.color : 'text-gray-600'
                )}>
                  {title}
                </p>
                {StatusIcon && <StatusIcon className={cn("h-4 w-4", statusConfig?.color)} />}
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  valueSizeClasses[size],
                  statusConfig ? statusConfig.color : 'text-gray-900'
                )}>
                  {formatValue(value)}{unit}
                </span>
                
                {(change !== undefined || trend) && (
                  <div className="flex items-center gap-1">
                    {getTrendIcon()}
                    {change !== undefined && (
                      <span className={cn("text-sm font-medium", getChangeColor())}>
                        {formatChange(change)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {description && (
                <p className="text-xs text-gray-500 mt-1">
                  {description}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Metrics Group Component for displaying multiple related metrics
export const MetricsGroup: React.FC<MetricGroupProps> = ({
  title,
  metrics,
  className
}) => {
  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <MetricsCard
            key={index}
            {...metric}
            size="md"
          />
        ))}
      </div>
    </div>
  );
};

// Predefined metric configurations for common healthcare metrics
export const HealthcareMetrics = {
  patientSatisfaction: (value: number, change?: number): MetricsCardProps => ({
    title: 'Patient Satisfaction',
    value: value,
    change: change,
    unit: '%',
    status: value >= 90 ? 'good' : value >= 80 ? 'warning' : 'critical',
    description: 'Average patient satisfaction score'
  }),
  
  readmissionRate: (value: number, change?: number): MetricsCardProps => ({
    title: 'Readmission Rate',
    value: value,
    change: change,
    unit: '%',
    status: value <= 10 ? 'good' : value <= 15 ? 'warning' : 'critical',
    description: '30-day readmission rate'
  }),
  
  averageLengthOfStay: (value: number, change?: number): MetricsCardProps => ({
    title: 'Avg Length of Stay',
    value: value,
    change: change,
    unit: ' days',
    status: value <= 4 ? 'good' : value <= 6 ? 'warning' : 'critical',
    description: 'Average hospital length of stay'
  }),
  
  costPerPatient: (value: number, change?: number): MetricsCardProps => ({
    title: 'Cost per Patient',
    value: value,
    change: change,
    unit: '',
    changeType: 'absolute' as const,
    description: 'Average cost per patient episode'
  }),
  
  mortalityRate: (value: number, change?: number): MetricsCardProps => ({
    title: 'Mortality Rate',
    value: value,
    change: change,
    unit: '%',
    status: value <= 2 ? 'good' : value <= 5 ? 'warning' : 'critical',
    description: 'In-hospital mortality rate'
  })
};