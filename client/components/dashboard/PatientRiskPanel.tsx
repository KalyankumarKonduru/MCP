import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Shield,
  RefreshCw
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { cn } from '/imports/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface PatientRiskPanelProps {
  patientId: string;
  compact?: boolean;
  className?: string;
}

interface RiskData {
  overallRisk: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskFactors: Array<{
    category: string;
    score: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    description: string;
  }>;
  recommendations: string[];
  lastUpdated: Date;
}

const RISK_COLORS = {
  low: '#22c55e',
  moderate: '#eab308', 
  high: '#f97316',
  critical: '#ef4444'
};

export const PatientRiskPanel: React.FC<PatientRiskPanelProps> = ({
  patientId,
  compact = false,
  className
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskData, setRiskData] = useState<RiskData>({
    overallRisk: 0,
    riskLevel: 'low',
    riskFactors: [],
    recommendations: [],
    lastUpdated: new Date()
  });

  useEffect(() => {
    loadRiskData();
  }, [patientId]);

  const loadRiskData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call your existing medical analytics service via MCP
      const response = await Meteor.callAsync('mcp.callTool', {
        name: 'analyzePatientHistory',
        arguments: { 
          patientId,
          analysisType: 'risk_assessment'
        }
      });

      // Handle different response structures properly
      if (response && typeof response === 'object') {
        let data;
        
        // Check if response has content array with text
        if ('content' in response && Array.isArray((response as any).content) && (response as any).content[0]?.text) {
          data = JSON.parse((response as any).content[0].text);
        }
        // Check if response has direct content object
        else if ('content' in response && typeof (response as any).content === 'object') {
          data = (response as any).content;
        }
        // If response is the data directly
        else if ('riskData' in response || 'overallRisk' in response) {
          data = response;
        }
        
        if (data?.riskData) {
          setRiskData({
            ...data.riskData,
            lastUpdated: new Date(data.riskData.lastUpdated || new Date())
          });
        } else if (data?.overallRisk !== undefined) {
          setRiskData({
            ...data,
            lastUpdated: new Date(data.lastUpdated || new Date())
          });
        }
      }
    } catch (err) {
      console.error('Error loading risk data:', err);
      setError('Failed to load risk assessment data');
      
      // Mock data for development/testing
      setRiskData({
        overallRisk: 45,
        riskLevel: 'moderate',
        riskFactors: [
          {
            category: 'Cardiovascular',
            score: 65,
            trend: 'stable',
            description: 'Blood pressure and cholesterol levels within acceptable range'
          },
          {
            category: 'Diabetes',
            score: 30,
            trend: 'decreasing',
            description: 'HbA1c improving with current treatment plan'
          },
          {
            category: 'Medication Adherence',
            score: 85,
            trend: 'increasing',
            description: 'Recent missed doses detected'
          }
        ],
        recommendations: [
          'Schedule follow-up appointment within 2 weeks',
          'Monitor blood pressure daily',
          'Review medication adherence with patient'
        ],
        lastUpdated: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskLevel = (score: number): RiskData['riskLevel'] => {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'moderate';
    return 'low';
  };

  const getRiskColor = (level: RiskData['riskLevel']) => RISK_COLORS[level];

  const getRiskBadgeVariant = (level: RiskData['riskLevel']) => {
    switch (level) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'moderate':
        return 'warning';
      default:
        return 'success';
    }
  };

  const riskGaugeData = [
    { name: 'Risk', value: riskData.overallRisk, color: getRiskColor(riskData.riskLevel) },
    { name: 'Safe', value: 100 - riskData.overallRisk, color: '#e5e7eb' }
  ];

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
            Risk Assessment Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadRiskData}
          >
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
          <Shield className="h-5 w-5" />
          Patient Risk Assessment
          <Badge variant={getRiskBadgeVariant(riskData.riskLevel)}>
            {riskData.riskLevel.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Risk Score Gauge */}
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskGaugeData}
                  cx="50%"
                  cy="50%"
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {riskGaugeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold">{riskData.overallRisk}</div>
                <div className="text-xs text-muted-foreground">Risk Score</div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 space-y-2">
            <h4 className="font-medium">Risk Factors</h4>
            {riskData.riskFactors.slice(0, compact ? 2 : 4).map((factor, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{factor.category}</span>
                  {factor.trend === 'increasing' && <TrendingUp className="h-3 w-3 text-red-500" />}
                  {factor.trend === 'decreasing' && <TrendingDown className="h-3 w-3 text-green-500" />}
                  {factor.trend === 'stable' && <div className="w-3 h-0.5 bg-gray-400" />}
                </div>
                <span className="font-medium">{factor.score}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Factor Chart */}
        {!compact && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData.riskFactors}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="category" 
                  fontSize={12}
                  tick={{ fontSize: 10 }}
                />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="score" fill={getRiskColor(riskData.riskLevel)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recommendations */}
        {!compact && riskData.recommendations.length > 0 && (
          <div>
            <h4 className="font-medium mb-3">Recommendations</h4>
            <div className="space-y-2">
              {riskData.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground">
          Last updated: {riskData.lastUpdated.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientRiskPanel;