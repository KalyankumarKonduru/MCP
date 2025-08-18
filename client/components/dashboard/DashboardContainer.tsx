// client/components/dashboard/DashboardContainer.tsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Pill,
  BarChart3,
  RefreshCw,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { PatientRiskPanel } from './PatientRiskPanel';
import { MedicationInteractionPanel } from './MedicationInteractionPanel';
import { PopulationHealthPanel } from './PopulationHealthPanel';
import { TemporalTrendsPanel } from './TemporalTrendsPanel';
import { MetricsCard } from './MetricsCard';

interface DashboardContainerProps {
  patientId?: string;
  onClose?: () => void;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface DashboardMetrics {
  totalPatients: number;
  activeAlerts: number;
  riskScore: number;
  lastUpdated: Date;
  systemStatus: 'healthy' | 'warning' | 'error';
}

export const DashboardContainer: React.FC<DashboardContainerProps> = ({
  patientId,
  onClose,
  className,
  isExpanded = false,
  onToggleExpand
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'patient' | 'population'>('overview');
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    totalPatients: 0,
    activeAlerts: 0,
    riskScore: 0,
    lastUpdated: new Date(),
    systemStatus: 'healthy'
  });

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
  }, [patientId]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Call MCP tools to get dashboard data
      const metricsResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getDashboardMetrics',
        arguments: { patientId }
      });

      if (metricsResponse?.content?.[0]?.text) {
        const metrics = JSON.parse(metricsResponse.content[0].text);
        setDashboardMetrics(metrics);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setDashboardMetrics(prev => ({ ...prev, systemStatus: 'error' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'patient', label: 'Patient', icon: Activity, disabled: !patientId },
    { id: 'population', label: 'Population', icon: Users }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Quick Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricsCard
                title="Total Patients"
                value={dashboardMetrics.totalPatients}
                icon={Users}
                trend={{ value: 12, direction: 'up', period: 'vs last month' }}
              />
              <MetricsCard
                title="Active Alerts"
                value={dashboardMetrics.activeAlerts}
                icon={AlertTriangle}
                trend={{ value: 8, direction: 'down', period: 'vs last week' }}
                variant={dashboardMetrics.activeAlerts > 5 ? 'warning' : 'default'}
              />
              <MetricsCard
                title="Avg Risk Score"
                value={`${dashboardMetrics.riskScore}%`}
                icon={Activity}
                trend={{ value: 3, direction: 'up', period: 'vs last month' }}
              />
              <MetricsCard
                title="System Status"
                value={dashboardMetrics.systemStatus}
                icon={TrendingUp}
                variant={dashboardMetrics.systemStatus === 'healthy' ? 'success' : 'warning'}
              />
            </div>

            {/* Main Dashboard Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {patientId && (
                <PatientRiskPanel 
                  patientId={patientId} 
                  compact={!isExpanded}
                />
              )}
              <MedicationInteractionPanel 
                patientId={patientId}
                compact={!isExpanded}
              />
              <TemporalTrendsPanel 
                patientId={patientId}
                compact={!isExpanded}
              />
              <PopulationHealthPanel 
                compact={!isExpanded}
              />
            </div>
          </div>
        );

      case 'patient':
        return patientId ? (
          <div className="space-y-6">
            <PatientRiskPanel patientId={patientId} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MedicationInteractionPanel patientId={patientId} />
              <TemporalTrendsPanel patientId={patientId} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a patient to view detailed analytics</p>
            </div>
          </div>
        );

      case 'population':
        return (
          <div className="space-y-6">
            <PopulationHealthPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Cohort Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Population-wide medication effectiveness and outcomes analysis.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Health Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Disease prevalence and treatment outcome trends over time.
                  </p>
                </CardContent>
              </Card>
            </div>
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
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-background border-l border-border h-full flex flex-col",
      isExpanded ? "w-full" : "w-96",
      className
    )}>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Analytics Dashboard</h2>
          {patientId && (
            <span className="text-xs bg-muted px-2 py-1 rounded">
              Patient: {patientId.slice(-6)}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn(
              "h-4 w-4",
              refreshing && "animate-spin"
            )} />
          </Button>
          
          {onToggleExpand && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
          
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id as any)}
            disabled={tab.disabled}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
              "border-b-2 border-transparent hover:text-primary hover:border-primary/50",
              activeTab === tab.id && "text-primary border-primary",
              tab.disabled && "opacity-50 cursor-not-allowed hover:text-muted-foreground hover:border-transparent"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {renderTabContent()}
      </div>

      {/* Footer Status */}
      <div className="p-2 border-t border-border bg-muted/50">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Last updated: {dashboardMetrics.lastUpdated.toLocaleTimeString()}</span>
          <div className="flex items-center gap-1">
            <div className={cn(
              "w-2 h-2 rounded-full",
              dashboardMetrics.systemStatus === 'healthy' && "bg-green-500",
              dashboardMetrics.systemStatus === 'warning' && "bg-yellow-500",
              dashboardMetrics.systemStatus === 'error' && "bg-red-500"
            )} />
            <span className="capitalize">{dashboardMetrics.systemStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardContainer;