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

      // Handle different response structures properly
      if (cohortResponse && typeof cohortResponse === 'object') {
        let cohortData;
        
        if ('content' in cohortResponse && Array.isArray((cohortResponse as any).content) && (cohortResponse as any).content[0]?.text) {
          cohortData = JSON.parse((cohortResponse as any).content[0].text);
        } else if ('content' in cohortResponse && typeof (cohortResponse as any).content === 'object') {
          cohortData = (cohortResponse as any).content;
        } else {
          cohortData = cohortResponse;
        }

        if (cohortData?.cohort) {
          setCohortData(cohortData.cohort);
        }
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

      // Handle response structure
      if (metricsResponse && typeof metricsResponse === 'object') {
        let metricsData;
        
        if ('content' in metricsResponse && Array.isArray((metricsResponse as any).content) && (metricsResponse as any).content[0]?.text) {
          metricsData = JSON.parse((metricsResponse as any).content[0].text);
        } else if ('content' in metricsResponse && typeof (metricsResponse as any).content === 'object') {
          metricsData = (metricsResponse as any).content;
        } else {
          metricsData = metricsResponse;
        }

        if (metricsData?.metrics) {
          setHealthMetrics(metricsData.metrics);
        }
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

        if (comparisonResponse && typeof comparisonResponse === 'object') {
          let comparisonData;
          
          if ('content' in comparisonResponse && Array.isArray((comparisonResponse as any).content) && (comparisonResponse as any).content[0]?.text) {
            comparisonData = JSON.parse((comparisonResponse as any).content[0].text);
          } else if ('content' in comparisonResponse && typeof (comparisonResponse as any).content === 'object') {
            comparisonData = (comparisonResponse as any).content;
          } else {
            comparisonData = comparisonResponse;
          }

          if (comparisonData?.comparisons) {
            setComparisons(comparisonData.comparisons);
          }
        }
      }

    } catch (err) {
      console.error('Error loading population data:', err);
      setError('Failed to load population health data');
      
      // Mock data for development
      setCohortData({
        id: 'cohort-1',
        name: 'Primary Care Patients',
        totalPatients: 1247,
        demographics: {
          ageGroups: [
            { range: '18-30', count: 156, percentage: 12.5 },
            { range: '31-50', count: 423, percentage: 33.9 },
            { range: '51-70', count: 498, percentage: 39.9 },
            { range: '70+', count: 170, percentage: 13.6 }
          ],
          gender: [
            { type: 'Female', count: 634, percentage: 50.8 },
            { type: 'Male', count: 613, percentage: 49.2 }
          ],
          ethnicity: [
            { group: 'White', count: 749, percentage: 60.1 },
            { group: 'Hispanic', count: 224, percentage: 18.0 },
            { group: 'Black', count: 174, percentage: 14.0 },
            { group: 'Asian', count: 100, percentage: 8.0 }
          ]
        }
      });

      setHealthMetrics([
        {
          condition: 'Hypertension',
          prevalence: 34.5,
          trend: 'increasing',
          changePercent: 2.3,
          riskLevel: 'moderate',
          affectedCount: 430
        },
        {
          condition: 'Diabetes',
          prevalence: 18.7,
          trend: 'stable',
          changePercent: 0.1,
          riskLevel: 'moderate',
          affectedCount: 233
        },
        {
          condition: 'Depression',
          prevalence: 12.3,
          trend: 'increasing',
          changePercent: 4.2,
          riskLevel: 'high',
          affectedCount: 153
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadPopulationData();
  };

  const getTrendClassName = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return 'text-red-500';
      case 'decreasing':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
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
                    <TrendIcon className={cn("h-3 w-3", getTrendClassName(metric.trend))} />
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

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Population Health Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Population Health
          {cohortData && (
            <Badge variant="secondary">
              {cohortData.totalPatients} patients
            </Badge>
          )}
        </CardTitle>
        
        {!compact && (
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'demographics', label: 'Demographics' },
              { id: 'conditions', label: 'Conditions' },
              { id: 'outcomes', label: 'Outcomes' }
            ].map((view) => (
              <Button
                key={view.id}
                variant={selectedView === view.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedView(view.id as any)}
                className="text-xs"
              >
                {view.label}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {selectedView === 'overview' && renderOverviewView()}
        
        {selectedView === 'demographics' && cohortData && (
          <div className="space-y-4">
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
          </div>
        )}
        
        {selectedView === 'conditions' && (
          <div className="space-y-3">
            {healthMetrics.map((metric, index) => (
              <div key={index} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{metric.condition}</h4>
                  <Badge variant={metric.riskLevel === 'high' ? 'destructive' : 'secondary'}>
                    {metric.prevalence.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{metric.affectedCount} patients affected</span>
                  <span className={getTrendClassName(metric.trend)}>
                    {metric.trend} {metric.changePercent > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {selectedView === 'outcomes' && (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Outcome metrics will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PopulationHealthPanel;