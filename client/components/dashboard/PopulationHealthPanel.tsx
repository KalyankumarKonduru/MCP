// client/components/dashboard/PopulationHealthPanel.tsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { 
  Users, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  AlertTriangle,
  RefreshCw,
  Filter,
  Download
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { cn } from '/imports/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface PopulationHealthPanelProps {
  patientId?: string;
  cohortId?: string;
  compact?: boolean;
  className?: string;
}

interface CohortData {
  id: string;
  name: string;
  totalPatients: number;
  demographics: {
    ageGroups: Array<{ range: string; count: number; percentage: number }>;
    gender: Array<{ type: string; count: number; percentage: number }>;
    ethnicity: Array<{ group: string; count: number; percentage: number }>;
  };
}

interface HealthMetric {
  condition: string;
  prevalence: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  changePercent: number;
  riskLevel: 'low' | 'moderate' | 'high';
  affectedCount: number;
}

interface OutcomeMetric {
  name: string;
  value: number;
  unit: string;
  benchmarkValue: number;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
  timeframe: string;
}

interface ComparisonData {
  category: string;
  patientValue: number;
  cohortAverage: number;
  nationalAverage: number;
}

const TREND_COLORS = {
  increasing: '#ef4444',
  stable: '#6b7280',
  decreasing: '#22c55e',
  improving: '#22c55e',
  declining: '#ef4444'
};

const RISK_COLORS = {
  low: '#22c55e',
  moderate: '#eab308',
  high: '#ef4444'
};

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', 
  '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'
];

export const PopulationHealthPanel: React.FC<PopulationHealthPanelProps> = ({
  patientId,
  cohortId,
  compact = false,
  className
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohortData, setCohortData] = useState<CohortData | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMetric[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonData[]>([]);
  const [selectedView, setSelectedView] = useState<'overview' | 'demographics' | 'conditions' | 'outcomes'>('overview');

  useEffect(() => {
    loadPopulationData();
  }, [patientId, cohortId]);

  const loadPopulationData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load cohort demographics
      const cohortResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getPopulationAnalytics',
        arguments: { 
          analysisType: 'cohort_demographics',
          patientId: patientId,
          cohortId: cohortId
        }
      });

      if (cohortResponse?.content?.cohort) {
        setCohortData(cohortResponse.content.cohort);
      }

      // Load health metrics
      const metricsResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getPopulationAnalytics',
        arguments: { 
          analysisType: 'health_metrics',
          patientId: patientId,
          cohortId: cohortId
        }
      });

      if (metricsResponse?.content?.metrics) {
        setHealthMetrics(metricsResponse.content.metrics);
      }

      // Load outcome metrics
      const outcomesResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getPopulationAnalytics',
        arguments: { 
          analysisType: 'outcome_metrics',
          patientId: patientId,
          cohortId: cohortId
        }
      });

      if (outcomesResponse?.content?.outcomes) {
        setOutcomes(outcomesResponse.content.outcomes);
      }

      // Load patient comparisons if patientId provided
      if (patientId) {
        const comparisonResponse = await Meteor.callAsync('mcp.callTool', {
          name: 'getPatientComparison',
          arguments: { 
            patientId: patientId,
            cohortId: cohortId
          }
        });

        if (comparisonResponse?.content?.comparisons) {
          setComparisons(comparisonResponse.content.comparisons);
        }
      }

    } catch (err) {
      console.error('Error loading population data:', err);
      setError('Failed to load population health data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadPopulationData();
  };

  const renderOverviewView = () => (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium">Total Patients</span>
          </div>
          <p className="text-lg font-semibold">{cohortData?.totalPatients || 0}</p>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium">Active Conditions</span>
          </div>
          <p className="text-lg font-semibold">{healthMetrics.length}</p>
        </div>
      </div>

      {/* Top Health Risks */}
      {healthMetrics.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Top Health Conditions</h4>
          <div className="space-y-2">
            {healthMetrics.slice(0, compact ? 3 : 5).map((metric, index) => {
              const TrendIcon = metric.trend === 'increasing' ? TrendingUp : 
                              metric.trend === 'decreasing' ? TrendingDown : Activity;
              
              return (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div className="flex items-center gap-2 flex-1">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: RISK_COLORS[metric.riskLevel] }}
                    />
                    <span className="text-sm font-medium">{metric.condition}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {metric.prevalence.toFixed(1)}%
                    </span>
                    <TrendIcon 
                      className={cn("h-3 w-3", {
                        'text-red-500': metric.trend === 'increasing',
                        'text-green-500': metric.trend === 'decreasing',
                        'text-gray-500': metric.trend === 'stable'
                      })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Patient Comparison (if available) */}
      {comparisons.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Patient vs Population</h4>
          <div className="space-y-1">
            {comparisons.slice(0, 3).map((comparison, index) => (
              <div key={index} className="flex justify-between text-xs">
                <span>{comparison.category}</span>
                <div className="flex gap-2">
                  <span className="font-medium">{comparison.patientValue}</span>
                  <span className="text-muted-foreground">vs {comparison.cohortAverage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDemographicsView = () => (
    <div className="space-y-4">
      {cohortData?.demographics.ageGroups && (
        <div>
          <h4 className="text-sm font-medium mb-2">Age Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cohortData.demographics.ageGroups}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {cohortData?.demographics.gender && (
        <div>
          <h4 className="text-sm font-medium mb-2">Gender Distribution</h4>
          <ResponsiveContainer width="100%" height={150}>
            <RechartsPieChart>
              <Pie
                data={cohortData.demographics.gender}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={50}
                label={({ name, percentage }) => `${name}: ${percentage}%`}
              >
                {cohortData.demographics.gender.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const renderConditionsView = () => (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={healthMetrics.slice(0, 8)} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" fontSize={10} />
          <YAxis dataKey="condition" type="category" width={80} fontSize={10} />
          <Tooltip formatter={(value) => [`${value}%`, 'Prevalence']} />
          <Bar dataKey="prevalence" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const renderOutcomesView = () => (
    <div className="space-y-4">
      {outcomes.map((outcome, index) => {
        const TrendIcon = outcome.trend === 'improving' ? TrendingUp : 
                        outcome.trend === 'declining' ? TrendingDown : Activity;
        
        return (
          <div key={index} className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h5 className="font-medium text-sm">{outcome.name}</h5>
              <TrendIcon 
                className={cn("h-4 w-4", {
                  'text-green-500': outcome.trend === 'improving',
                  'text-red-500': outcome.trend === 'declining',
                  'text-gray-500': outcome.trend === 'stable'
                })}
              />
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-lg font-semibold">{outcome.value}</span>
                <span className="text-sm text-muted-foreground ml-1">{outcome.unit}</span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">vs Benchmark</div>
                <div className="text-sm font-medium">{outcome.benchmarkValue} {outcome.unit}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {outcome.changePercent > 0 ? '+' : ''}{outcome.changePercent}% over {outcome.timeframe}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-500" />
            Population Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading population data...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-500" />
            Population Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-500" />
            Population Health
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* View Selector */}
        {!compact && (
          <div className="flex gap-1 mt-2">
            {['overview', 'demographics', 'conditions', 'outcomes'].map((view) => (
              <Button
                key={view}
                variant={selectedView === view ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedView(view as any)}
                className="text-xs h-7"
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-auto">
        {compact || selectedView === 'overview' ? renderOverviewView() : 
         selectedView === 'demographics' ? renderDemographicsView() :
         selectedView === 'conditions' ? renderConditionsView() :
         renderOutcomesView()}
      </CardContent>
    </Card>
  );
};