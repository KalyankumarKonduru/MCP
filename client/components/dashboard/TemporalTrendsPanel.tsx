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

      // Handle different response structures properly
      if (labResponse && typeof labResponse === 'object') {
        let labData;
        
        if ('content' in labResponse && Array.isArray((labResponse as any).content) && (labResponse as any).content[0]?.text) {
          labData = JSON.parse((labResponse as any).content[0].text);
        } else if ('content' in labResponse && typeof (labResponse as any).content === 'object') {
          labData = (labResponse as any).content;
        } else {
          labData = labResponse;
        }

        if (labData?.labTrends) {
          setLabTrends(labData.labTrends);
        }
      }

      // Load medication adherence
      const medicationResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getMedicationAdherence',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (medicationResponse && typeof medicationResponse === 'object') {
        let medicationData;
        
        if ('content' in medicationResponse && Array.isArray((medicationResponse as any).content) && (medicationResponse as any).content[0]?.text) {
          medicationData = JSON.parse((medicationResponse as any).content[0].text);
        } else if ('content' in medicationResponse && typeof (medicationResponse as any).content === 'object') {
          medicationData = (medicationResponse as any).content;
        } else {
          medicationData = medicationResponse;
        }

        if (medicationData?.adherence) {
          setMedicationAdherence(medicationData.adherence);
        }
      }

      // Load symptom progression
      const symptomResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getSymptomProgression',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (symptomResponse && typeof symptomResponse === 'object') {
        let symptomData;
        
        if ('content' in symptomResponse && Array.isArray((symptomResponse as any).content) && (symptomResponse as any).content[0]?.text) {
          symptomData = JSON.parse((symptomResponse as any).content[0].text);
        } else if ('content' in symptomResponse && typeof (symptomResponse as any).content === 'object') {
          symptomData = (symptomResponse as any).content;
        } else {
          symptomData = symptomResponse;
        }

        if (symptomData?.symptoms) {
          setSymptomProgression(symptomData.symptoms);
        }
      }

      // Load treatment response
      const treatmentResponseData = await Meteor.callAsync('mcp.callTool', {
        name: 'getTreatmentResponse',
        arguments: { 
          patientId,
          timeRange
        }
      });

      if (treatmentResponseData && typeof treatmentResponseData === 'object') {
        let treatmentData;
        
        if ('content' in treatmentResponseData && Array.isArray((treatmentResponseData as any).content) && (treatmentResponseData as any).content[0]?.text) {
          treatmentData = JSON.parse((treatmentResponseData as any).content[0].text);
        } else if ('content' in treatmentResponseData && typeof (treatmentResponseData as any).content === 'object') {
          treatmentData = (treatmentResponseData as any).content;
        } else {
          treatmentData = treatmentResponseData;
        }

        if (treatmentData?.treatments) {
          setTreatmentResponse(treatmentData.treatments);
        }
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
            { date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), value: 7.2, status: 'high' },
            { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), value: 6.8, status: 'high' },
            { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), value: 6.5, status: 'high' },
            { date: new Date(), value: 6.1, status: 'normal' }
          ],
          trend: 'improving',
          lastValue: 6.1,
          changeFromBaseline: -1.1
        },
        {
          id: 'glucose',
          labName: 'Glucose',
          unit: 'mg/dL',
          normalRange: { min: 70, max: 99 },
          values: [
            { date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), value: 145, status: 'high' },
            { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), value: 132, status: 'high' },
            { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), value: 118, status: 'high' },
            { date: new Date(), value: 95, status: 'normal' }
          ],
          trend: 'improving',
          lastValue: 95,
          changeFromBaseline: -50
        }
      ]);

      setMedicationAdherence([
        {
          medication: 'Metformin',
          adherenceData: [
            { date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), adherenceRate: 85, daysSupply: 30 },
            { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), adherenceRate: 92, daysSupply: 30 },
            { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), adherenceRate: 88, daysSupply: 30 },
            { date: new Date(), adherenceRate: 94, daysSupply: 30 }
          ],
          overallAdherence: 90,
          trend: 'improving'
        }
      ]);

      setSymptomProgression([
        {
          symptom: 'Fatigue',
          severity: [
            { date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), severity: 7, notes: 'Severe fatigue' },
            { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), severity: 5, notes: 'Moderate fatigue' },
            { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), severity: 4, notes: 'Mild fatigue' },
            { date: new Date(), severity: 2, notes: 'Minimal fatigue' }
          ],
          trend: 'improving',
          currentSeverity: 2
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining':
      case 'worsening':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendClassName = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'text-green-500';
      case 'declining':
      case 'worsening':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatChartData = (values: Array<{ date: Date; value: number; status?: string }>) => {
    return values.map(v => ({
      ...v,
      date: v.date.toLocaleDateString(),
      dateObj: v.date
    }));
  };

  const renderLabTrends = () => (
    <div className="space-y-4">
      {labTrends.map((lab) => (
        <div key={lab.id} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{lab.labName}</h4>
              {getTrendIcon(lab.trend)}
              <Badge variant={lab.trend === 'improving' ? 'success' : lab.trend === 'declining' ? 'destructive' : 'secondary'}>
                {lab.trend}
              </Badge>
            </div>
            <div className="text-right">
              <div className="font-semibold">{lab.lastValue} {lab.unit}</div>
              <div className="text-xs text-muted-foreground">
                Normal: {lab.normalRange.min}-{lab.normalRange.max} {lab.unit}
              </div>
            </div>
          </div>
          
          {!compact && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formatChartData(lab.values)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={TREND_COLORS[lab.trend]} 
                    strokeWidth={2}
                    dot={{ fill: TREND_COLORS[lab.trend] }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderMedicationAdherence = () => (
    <div className="space-y-4">
      {medicationAdherence.map((med, index) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4" />
              <h4 className="font-medium">{med.medication}</h4>
              {getTrendIcon(med.trend)}
            </div>
            <div className="text-right">
              <div className="font-semibold">{med.overallAdherence}%</div>
              <div className="text-xs text-muted-foreground">Adherence</div>
            </div>
          </div>
          
          {!compact && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formatChartData(med.adherenceData.map(d => ({ 
                  date: d.date, 
                  value: d.adherenceRate 
                })))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="value" fill={TREND_COLORS[med.trend]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderSymptomProgression = () => (
    <div className="space-y-4">
      {symptomProgression.map((symptom, index) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              <h4 className="font-medium">{symptom.symptom}</h4>
              {getTrendIcon(symptom.trend)}
            </div>
            <div className="text-right">
              <div className="font-semibold">{symptom.currentSeverity}/10</div>
              <div className="text-xs text-muted-foreground">Current Severity</div>
            </div>
          </div>
          
          {!compact && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formatChartData(symptom.severity.map(s => ({ 
                  date: s.date, 
                  value: s.severity 
                })))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis domain={[0, 10]} fontSize={10} />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={TREND_COLORS[symptom.trend]} 
                    fill={TREND_COLORS[symptom.trend]} 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
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
            Trends Analysis Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={loadTemporalData}>
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
          <LineChartIcon className="h-5 w-5" />
          Temporal Trends
          <Badge variant="secondary">
            {timeRange}
          </Badge>
        </CardTitle>
        
        {!compact && (
          <div className="flex gap-1">
            {[
              { id: 'labs', label: 'Lab Values', icon: Activity },
              { id: 'medications', label: 'Medications', icon: Pill },
              { id: 'symptoms', label: 'Symptoms', icon: Heart },
              { id: 'treatments', label: 'Treatments', icon: BarChart3 }
            ].map((view) => (
              <Button
                key={view.id}
                variant={selectedView === view.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedView(view.id as any)}
                className="text-xs"
              >
                <view.icon className="h-3 w-3 mr-1" />
                {view.label}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {selectedView === 'labs' && renderLabTrends()}
        {selectedView === 'medications' && renderMedicationAdherence()}
        {selectedView === 'symptoms' && renderSymptomProgression()}
        {selectedView === 'treatments' && (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Treatment response data will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TemporalTrendsPanel;