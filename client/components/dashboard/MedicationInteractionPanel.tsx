// client/components/dashboard/MedicationInteractionPanel.tsx
import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { 
  AlertTriangle, 
  Pill, 
  Shield, 
  AlertCircle,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface MedicationInteractionPanelProps {
  patientId: string;
  medications?: string[];
  compact?: boolean;
  className?: string;
}

interface DrugInteraction {
  id: string;
  drug1: string;
  drug2: string;
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated';
  description: string;
  clinicalEffect: string;
  mechanism: string;
  management: string;
  evidence: 'theoretical' | 'probable' | 'established';
  lastChecked: Date;
}

interface MedicationAlert {
  id: string;
  type: 'interaction' | 'allergy' | 'duplication' | 'dosing' | 'contraindication';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  medication: string;
  title: string;
  description: string;
  recommendation: string;
  urgent: boolean;
}

const SEVERITY_CONFIG = {
  minor: {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Info,
    priority: 1
  },
  moderate: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertTriangle,
    priority: 2
  },
  major: {
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: AlertCircle,
    priority: 3
  },
  contraindicated: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: AlertTriangle,
    priority: 4
  }
};

const ALERT_SEVERITY_CONFIG = {
  low: {
    color: 'bg-blue-100 text-blue-800',
    icon: Info
  },
  moderate: {
    color: 'bg-yellow-100 text-yellow-800',
    icon: AlertTriangle
  },
  high: {
    color: 'bg-orange-100 text-orange-800',
    icon: AlertCircle
  },
  critical: {
    color: 'bg-red-100 text-red-800',
    icon: AlertTriangle
  }
};

export const MedicationInteractionPanel: React.FC<MedicationInteractionPanelProps> = ({
  patientId,
  medications = [],
  compact = false,
  className
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [alerts, setAlerts] = useState<MedicationAlert[]>([]);
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null);
  const [currentMedications, setCurrentMedications] = useState<string[]>(medications);

  useEffect(() => {
    loadMedicationData();
  }, [patientId, medications]);

  const loadMedicationData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get current medications if not provided
      if (medications.length === 0) {
        const patientResponse = await Meteor.callAsync('mcp.callTool', {
          name: 'analyzePatientHistory',
          arguments: { 
            patientId,
            analysisType: 'current_medications'
          }
        });
        
        if (patientResponse?.content?.medications) {
          setCurrentMedications(patientResponse.content.medications);
        }
      } else {
        setCurrentMedications(medications);
      }

      // Check for drug interactions
      const interactionResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'checkDrugInteractions',
        arguments: { 
          patientId,
          medications: currentMedications
        }
      });

      if (interactionResponse?.content?.interactions) {
        setInteractions(interactionResponse.content.interactions);
      }

      // Get medication alerts
      const alertResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'getMedicationAlerts',
        arguments: { 
          patientId,
          medications: currentMedications
        }
      });

      if (alertResponse?.content?.alerts) {
        setAlerts(alertResponse.content.alerts);
      }

    } catch (err) {
      console.error('Error loading medication data:', err);
      setError('Failed to load medication interaction data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadMedicationData();
  };

  const toggleInteractionExpanded = (interactionId: string) => {
    setExpandedInteraction(expandedInteraction === interactionId ? null : interactionId);
  };

  const sortedInteractions = interactions.sort((a, b) => {
    const severityA = SEVERITY_CONFIG[a.severity].priority;
    const severityB = SEVERITY_CONFIG[b.severity].priority;
    return severityB - severityA;
  });

  const sortedAlerts = alerts.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const severityOrder = { critical: 4, high: 3, moderate: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Pill className="h-5 w-5 text-orange-500" />
            Medication Interactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Checking interactions...</span>
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
            <Pill className="h-5 w-5 text-orange-500" />
            Medication Interactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
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
            <Pill className="h-5 w-5 text-orange-500" />
            Medication Safety
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Summary Statistics */}
        <div className="flex gap-2 mt-2">
          <Badge variant="secondary" className="text-xs">
            {currentMedications.length} Medications
          </Badge>
          <Badge 
            variant={interactions.length > 0 ? "destructive" : "secondary"} 
            className="text-xs"
          >
            {interactions.length} Interactions
          </Badge>
          <Badge 
            variant={sortedAlerts.some(a => a.urgent) ? "destructive" : "secondary"} 
            className="text-xs"
          >
            {alerts.length} Alerts
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto space-y-4">
        {/* Critical Alerts Section */}
        {sortedAlerts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Active Alerts</h4>
            {sortedAlerts.slice(0, compact ? 3 : 10).map((alert) => {
              const config = ALERT_SEVERITY_CONFIG[alert.severity];
              const Icon = config.icon;
              
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border",
                    config.color,
                    alert.urgent && "ring-2 ring-red-500"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">{alert.title}</p>
                        {alert.urgent && (
                          <Badge variant="destructive" className="text-xs">
                            URGENT
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs opacity-90 mb-2">{alert.description}</p>
                      <p className="text-xs font-medium">
                        Recommendation: {alert.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Drug Interactions Section */}
        {sortedInteractions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Drug Interactions</h4>
            {sortedInteractions.slice(0, compact ? 3 : 10).map((interaction) => {
              const config = SEVERITY_CONFIG[interaction.severity];
              const Icon = config.icon;
              const isExpanded = expandedInteraction === interaction.id;
              
              return (
                <div
                  key={interaction.id}
                  className={cn("border rounded-lg", config.color)}
                >
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => toggleInteractionExpanded(interaction.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">
                            {interaction.drug1} + {interaction.drug2}
                          </p>
                          <p className="text-xs opacity-90">
                            {interaction.severity.toUpperCase()} - {interaction.clinicalEffect}
                          </p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-current/20">
                      <div>
                        <p className="text-xs font-medium mb-1">Description:</p>
                        <p className="text-xs opacity-90">{interaction.description}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium mb-1">Mechanism:</p>
                        <p className="text-xs opacity-90">{interaction.mechanism}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium mb-1">Management:</p>
                        <p className="text-xs opacity-90">{interaction.management}</p>
                      </div>
                      
                      <div className="flex items-center justify-between pt-1">
                        <Badge variant="outline" className="text-xs">
                          Evidence: {interaction.evidence}
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Details
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Current Medications List */}
        {currentMedications.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Current Medications</h4>
            <div className="flex flex-wrap gap-1">
              {currentMedications.slice(0, compact ? 6 : 20).map((med, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {med}
                </Badge>
              ))}
              {currentMedications.length > (compact ? 6 : 20) && (
                <Badge variant="outline" className="text-xs">
                  +{currentMedications.length - (compact ? 6 : 20)} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {interactions.length === 0 && alerts.length === 0 && currentMedications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Shield className="h-12 w-12 text-green-500 mb-3" />
            <h3 className="font-medium text-sm mb-1">No Interactions Found</h3>
            <p className="text-xs text-muted-foreground">
              No medication interactions or alerts detected
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};