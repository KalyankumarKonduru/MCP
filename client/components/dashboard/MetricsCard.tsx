// client/components/dashboard/MetricsCard.tsx
import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { Card, CardContent } from '../ui/Card';

interface MetricsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: 'up' | 'down';
    period: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
  className
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          border: 'border-green-200 dark:border-green-800',
          bg: 'bg-green-50 dark:bg-green-950/50',
          icon: 'text-green-600 dark:text-green-400'
        };
      case 'warning':
        return {
          border: 'border-yellow-200 dark:border-yellow-800',
          bg: 'bg-yellow-50 dark:bg-yellow-950/50',
          icon: 'text-yellow-600 dark:text-yellow-400'
        };
      case 'danger':
        return {
          border: 'border-red-200 dark:border-red-800',
          bg: 'bg-red-50 dark:bg-red-950/50',
          icon: 'text-red-600 dark:text-red-400'
        };
      default:
        return {
          border: 'border-border',
          bg: 'bg-card',
          icon: 'text-primary'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200 hover:shadow-md",
      styles.border,
      styles.bg,
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {title}
            </p>
            <p className="text-2xl font-bold text-foreground">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  trend.direction === 'up' ? "text-green-600" : "text-red-600"
                )}>
                  {trend.direction === 'up' ? '+' : '-'}{trend.value}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {trend.period}
                </span>
              </div>
            )}
          </div>
          
          <div className={cn(
            "p-3 rounded-lg",
            styles.icon,
            "bg-background/50"
          )}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};