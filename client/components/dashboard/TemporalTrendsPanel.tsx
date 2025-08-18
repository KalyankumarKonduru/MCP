// client/components/dashboard/TemporalTrendsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Activity,
  Pill,
  Heart,
  BarChart3,
  LineChart as LineChartIcon,
  RefreshCw,
  Filter,
  ChevronDown,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ScatterChart,
  Scatter
} from 'recharts';
import { cn } from '/imports/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface TemporalTrendsPanelProps {
  patientId: string;
  timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'all';
  compact?: boolean;
  className?: string;
}

interface LabValueTrend {
  id: string;
  labName: string;
  unit: string;
  normalRange: { min: number; max: number };
  values: Array<{
    date: Date;
    value: number;
    status: 'normal' | 'low' | 'high' | 'critical';
  }>;
  trend: 'improving' | 'stable' | 'declining';
  lastValue: number;
  changeFromBaseline: number;
}

interface MedicationAdherence {
  medication: string;
  adherenceData: Array<{
    date: Date;
    adherenceRate: number;
    daysSupply: number;
    refillDate?: Date;
  }>;
  overallAdherence: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface SymptomProgression {
  symptom: string;
  severity: Array<{
    date: Date;
    severity: number; // 0-10 scale
    notes?: string;
  }>;
  trend: 'improving' | 'stable' | 'worsening';
  currentSeverity: number;
}

interface TreatmentResponse {
  treatment: string;
  startDate: Date;
  endDate?: Date;
  responseMetrics: Array<{
    date: Date;
    metric: string;
    value: number;
    improvement: number;
  }>;
  overallResponse: 'excellent' | 'good' | 'moderate' | 'poor';
}

const TREND_COLORS = {
  improving: '#22c55e',
  stable: '#6b7280',
  declining: '#ef4444',
  worsening: '#ef4444'
};

const STATUS_COLORS = {
  normal: '#22c55e',
  low: '#eab308',
  high: '#f97316',
  critical: '#ef4444'
};

export const TemporalTrendsPanel: React.FC<TemporalTrendsPanelProps> = ({
  patientId,
  timeRange = 'quarter',
  compact = false,
  className
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labTrends, setLabTrends] = useState<LabValueTrend[]>([]);
  const [medicationAdherence, setMedicationAdherence] = useState<MedicationAdherence[]>([]);
  const [symptomProgression, setSymptomProgression] = useState<SymptomProgression[]>([]);
  const [treatmentResponse, setTreatmentResponse] = useState<TreatmentResponse[]>([]);
  const [selectedView, setSelectedView] = useState<'labs' | 'medications' | 'symptoms' | 'treatments'>('labs');
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  useEffect(() => {
    loadTemporalData();
  }, [patientId, timeRange]);

  const loadTemporalData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load lab value trends
      const labResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getLabValueTrends',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (labResponse?.content?.labTrends) {
        setLabTrends(labResponse.content.labTrends);
      }

      // Load medication adherence
      const medicationResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getMedicationAdherence',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (medicationResponse?.content?.adherence) {
        setMedicationAdherence(medicationResponse.content.adherence);
      }

      // Load symptom progression
      const symptomResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getSymptomProgression',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (symptomResponse?.content?.symptoms) {
        setSymptomProgression(symptomResponse.content.symptoms);
      }

      // Load treatment response
      const treatmentResponseData = await Meteor.callAsync('mcp.callTool', {
        name: 'getTreatmentResponse',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (treatmentResponseData?.content?.treatments) {
        setTreatmentResponse(treatmentResponseData.content.treatments);
      }

    } catch (err) {
      console.error('Error loading temporal data:', err);
      setError('Failed to load temporal trends data');
      
      // Mock data for development
      setLabTrends([
        {
          id: 'hba1c',
          labName: 'HbA1c',
          unit: '%',
          normalRange: { min: 4.0, max: 5.7 },
          values: [
            { date: new Date('2024-01-01'), value: 8.2, status: 'high' },
            { date: new Date('2024-02-01'), value: 7.8, status: 'high' },
            { date: new Date('2024-03-01'), value: 7.4, status: 'high' },
            { date: new Date('2024-04-01'), value: 7.1, status: 'high' },
            { date: new Date('2024-05-01'), value: 6.8, status: 'high' },
            { date: new Date('2024-06-01'), value: 6.5, status: 'high' }
          ],
          trend: 'improving',
          lastValue: 6.5,
          changeFromBaseline: -1.7
        },
        {
          id: 'ldl',
          labName: 'LDL Cholesterol',
          unit: 'mg/dL',
          normalRange: { min: 0, max: 100 },
          values: [
            { date: new Date('2024-01-01'), value: 145, status: 'high' },
            { date: new Date('2024-02-01'), value: 138, status: 'high' },
            { date: new Date('2024-03-01'), value: 125, status: 'high' },
            { date: new Date('2024-04-01'), value: 118, status: 'high' },
            { date: new Date('2024-05-01'), value: 105, status: 'high' },
            { date: new Date('2024-06-01'), value: 98, status: 'normal' }
          ],
          trend: 'improving',
          lastValue: 98,
          changeFromBaseline: -47
        }
      ]);

      setMedicationAdherence([
        {
          medication: 'Metformin 500mg',
          adherenceData: [
            { date: new Date('2024-01-01'), adherenceRate: 85, daysSupply: 30 },
            { date: new Date('2024-02-01'), adherenceRate: 92, daysSupply: 30 },
            { date: new Date('2024-03-01'), adherenceRate: 88, daysSupply: 30 },
            { date: new Date('2024-04-01'), adherenceRate: 95, daysSupply: 30 },
            { date: new Date('2024-05-01'), adherenceRate: 97, daysSupply: 30 },
            { date: new Date('2024-06-01'), adherenceRate: 94, daysSupply: 30 }
          ],
          overallAdherence: 92,
          trend: 'improving'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadTemporalData();
  };

  const getTrendIcon = (trend: 'improving' | 'stable' | 'declining' | 'worsening') => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining':
      case 'worsening': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).format(date);
  };

  const renderLabTrends = () => (
    <div className="space-y-4">
      {labTrends.map((lab) => (
        <Card key={lab.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4" />
                {lab.labName}
                <Badge variant={lab.trend === 'improving' ? 'default' : lab.trend === 'declining' ? 'destructive' : 'secondary'}>
                  {getTrendIcon(lab.trend)}
                  {lab.trend}
                </Badge>
              </CardTitle>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Current: {lab.lastValue} {lab.unit}</p>
                <p className={cn(
                  "text-xs",
                  lab.changeFromBaseline > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {lab.changeFromBaseline > 0 ? '+' : ''}{lab.changeFromBaseline} from baseline
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lab.values}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    fontSize={12}
                  />
                  <YAxis 
                    domain={['dataMin - 10', 'dataMax + 10']}
                    fontSize={12}
                  />
                  <Tooltip 
                    labelFormatter={(date) => formatDate(new Date(date))}
                    formatter={(value: number) => [`${value} ${lab.unit}`, lab.labName]}
                  />
                  {/* Normal range area */}
                  <Area
                    dataKey={() => lab.normalRange.max}
                    fill="#22c55e"
                    fillOpacity={0.1}
                    stroke="none"
                  />
                  <Area
                    dataKey={() => lab.normalRange.min}
                    fill="#ffffff"
                    fillOpacity={1}
                    stroke="none"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    dot={(props) => {
                      const status = lab.values[props.index]?.status;
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill={STATUS_COLORS[status] || '#2563eb'}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
              <span>Normal range: {lab.normalRange.min} - {lab.normalRange.max} {lab.unit}</span>
              <div className="flex gap-3">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Normal
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  High
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  Critical
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderMedicationAdherence = () => (
    <div className="space-y-4">
      {medicationAdherence.map((med, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4" />
                {med.medication}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={med.overallAdherence >= 80 ? 'default' : 'destructive'}>
                  {med.overallAdherence}% adherence
                </Badge>
                {getTrendIcon(med.trend)}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={med.adherenceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    fontSize={12}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    fontSize={12}
                  />
                  <Tooltip 
                    labelFormatter={(date) => formatDate(new Date(date))}
                    formatter={(value: number) => [`${value}%`, 'Adherence']}
                  />
                  <Area
                    type="monotone"
                    dataKey="adherenceRate"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.3}
                  />
                  {/* Target adherence line */}
                  <Line
                    type="monotone"
                    dataKey={() => 80}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Target adherence: 80% (red dashed line)
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderContent = () => {
    switch (selectedView) {
      case 'labs':
        return renderLabTrends();
      case 'medications':
        return renderMedicationAdherence();
      case 'symptoms':
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Symptom progression data will be displayed here</p>
          </div>
        );
      case 'treatments':
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Treatment response data will be displayed here</p>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading temporal trends...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LineChartIcon className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Temporal Trends</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => {
              // Handle time range change
              loadTemporalData();
            }}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
            <option value="all">All Time</option>
          </select>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* View Selector */}
      <div className="flex gap-2">
        {[
          { key: 'labs', label: 'Lab Values', icon: Heart },
          { key: 'medications', label: 'Medications', icon: Pill },
          { key: 'symptoms', label: 'Symptoms', icon: Activity },
          { key: 'treatments', label: 'Treatments', icon: BarChart3 }
        ].map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={selectedView === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView(key as any)}
            className="flex items-center gap-2"
          >
            <Icon className="h-4 w-4" />
            {!compact && label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        renderContent()
      )}
    </div>
  );
};