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

// Simple Badge component if not available
const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  className?: string;
}> = ({ children, variant = 'default', className }) => {
  const baseClasses = 'inline-flex items-center px-2 py-1 text-xs font-medium rounded-md';
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    destructive: 'bg-red-100 text-red-800',
    outline: 'border border-gray-300 bg-white text-gray-700',
    secondary: 'bg-blue-100 text-blue-800'
  };
  
  return (
    <span className={cn(baseClasses, variantClasses[variant], className)}>
      {children}
    </span>
  );
};

interface MedicationInteractionPanelProps {
  patientId?: string; // Made optional
  medications?: string[];
  compact?: boolean;
  className?: string;
}

// ... rest of interfaces remain the same ...

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
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    if (patientId) {
      loadInteractionData();
    } else {
      // Handle case when no patient is selected
      setIsLoading(false);
      setInteractions([]);
      setAlerts([]);
    }
  }, [patientId, medications]);

  const loadInteractionData = async () => {
    if (!patientId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Call MCP tools to get medication interaction data
      const interactionResponse = await Meteor.callAsync('mcp.callTool', {
        name: 'checkMedicationInteractions',
        arguments: { 
          patientId,
          medications: medications.length > 0 ? medications : undefined
        }
      });

      // Handle different response structures
      if (interactionResponse && typeof interactionResponse === 'object') {
        let data;
        
        // If response has content array
        if ((interactionResponse as any).content?.[0]?.text) {
          data = JSON.parse((interactionResponse as any).content[0].text);
        }
        // If response has direct content
        else if ((interactionResponse as any).content) {
          data = (interactionResponse as any).content;
        }
        // If response is the data directly
        else {
          data = interactionResponse;
        }
        
        setInteractions(data.interactions || []);
        setAlerts(data.alerts || []);
        setLastChecked(new Date());
      }
    } catch (error) {
      console.error('Failed to load medication interactions:', error);
      setError('Failed to load medication interaction data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadInteractionData();
  };

  const toggleInteractionExpansion = (interactionId: string) => {
    setExpandedInteraction(
      expandedInteraction === interactionId ? null : interactionId
    );
  };

  const getSeverityIcon = (severity: keyof typeof SEVERITY_CONFIG) => {
    const IconComponent = SEVERITY_CONFIG[severity].icon;
    return <IconComponent className="h-4 w-4" />;
  };

  const getAlertIcon = (severity: keyof typeof ALERT_SEVERITY_CONFIG) => {
    const IconComponent = ALERT_SEVERITY_CONFIG[severity].icon;
    return <IconComponent className="h-4 w-4" />;
  };

  if (!patientId) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Pill className="h-4 w-4" />
            Medication Interactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Pill className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No patient selected</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Pill className="h-4 w-4" />
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
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Pill className="h-4 w-4" />
            Medication Interactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <p>{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  const highSeverityInteractions = interactions.filter(
    interaction => interaction.severity === 'major' || interaction.severity === 'contraindicated'
  );

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Pill className="h-4 w-4" />
            Medication Interactions
            {(criticalAlerts.length > 0 || highSeverityInteractions.length > 0) && (
              <Badge variant="destructive" className="ml-2">
                {criticalAlerts.length + highSeverityInteractions.length}
              </Badge>
            )}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        {alerts.length === 0 && interactions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Shield className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>No interactions detected</p>
              <p className="text-xs mt-1">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-destructive mb-2">
                  Critical Alerts
                </h4>
                <div className="space-y-2">
                  {criticalAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3 border border-red-200 bg-red-50 rounded-lg"
                    >
                      <div className="flex items-start gap-2">
                        {getAlertIcon(alert.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm text-red-800">
                              {alert.title}
                            </p>
                            {alert.urgent && (
                              <Badge variant="destructive" className="text-xs">
                                URGENT
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-red-700 mb-2">
                            {alert.description}
                          </p>
                          <div className="bg-red-100 p-2 rounded text-xs text-red-800">
                            <strong>Recommendation:</strong> {alert.recommendation}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drug Interactions */}
            {interactions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Drug Interactions ({interactions.length})
                </h4>
                <div className="space-y-2">
                  {interactions
                    .sort((a, b) => SEVERITY_CONFIG[b.severity].priority - SEVERITY_CONFIG[a.severity].priority)
                    .map((interaction) => (
                      <div
                        key={interaction.id}
                        className={cn(
                          "border rounded-lg overflow-hidden",
                          SEVERITY_CONFIG[interaction.severity].color.includes('red') && "border-red-200",
                          SEVERITY_CONFIG[interaction.severity].color.includes('orange') && "border-orange-200",
                          SEVERITY_CONFIG[interaction.severity].color.includes('yellow') && "border-yellow-200",
                          SEVERITY_CONFIG[interaction.severity].color.includes('blue') && "border-blue-200"
                        )}
                      >
                        <button
                          onClick={() => toggleInteractionExpansion(interaction.id)}
                          className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {getSeverityIcon(interaction.severity)}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {interaction.drug1} + {interaction.drug2}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge 
                                    variant="secondary" 
                                    className={cn("text-xs", SEVERITY_CONFIG[interaction.severity].color)}
                                  >
                                    {interaction.severity}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {interaction.description}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {expandedInteraction === interaction.id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        </button>

                        {expandedInteraction === interaction.id && (
                          <div className="px-3 pb-3 border-t bg-gray-50/50">
                            <div className="space-y-3 pt-3">
                              <div>
                                <h5 className="text-xs font-medium text-gray-700 mb-1">
                                  Clinical Effect
                                </h5>
                                <p className="text-xs text-gray-600">
                                  {interaction.clinicalEffect}
                                </p>
                              </div>

                              <div>
                                <h5 className="text-xs font-medium text-gray-700 mb-1">
                                  Mechanism
                                </h5>
                                <p className="text-xs text-gray-600">
                                  {interaction.mechanism}
                                </p>
                              </div>

                              <div>
                                <h5 className="text-xs font-medium text-gray-700 mb-1">
                                  Management
                                </h5>
                                <p className="text-xs text-gray-600">
                                  {interaction.management}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {interaction.evidence}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    evidence
                                  </span>
                                </div>
                                <Button variant="ghost" size="sm" className="h-6 text-xs">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Learn More
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Other Alerts */}
            {alerts.filter(alert => alert.severity !== 'critical').length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Other Alerts
                </h4>
                <div className="space-y-2">
                  {alerts
                    .filter(alert => alert.severity !== 'critical')
                    .map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          "p-3 border rounded-lg",
                          ALERT_SEVERITY_CONFIG[alert.severity].color.includes('yellow') && "border-yellow-200 bg-yellow-50",
                          ALERT_SEVERITY_CONFIG[alert.severity].color.includes('orange') && "border-orange-200 bg-orange-50",
                          ALERT_SEVERITY_CONFIG[alert.severity].color.includes('blue') && "border-blue-200 bg-blue-50"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {getAlertIcon(alert.severity)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm mb-1">
                              {alert.title}
                            </p>
                            <p className="text-xs text-muted-foreground mb-2">
                              {alert.description}
                            </p>
                            {alert.recommendation && (
                              <div className="bg-white/50 p-2 rounded text-xs">
                                <strong>Recommendation:</strong> {alert.recommendation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {!compact && (
        <div className="px-4 py-2 border-t bg-muted/50">
          <p className="text-xs text-muted-foreground">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        </div>
      )}
    </Card>
  );
};

export default MedicationInteractionPanel;