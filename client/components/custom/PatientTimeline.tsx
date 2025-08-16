// client/components/custom/PatientTimeline.tsx
// Interactive Patient Timeline Component for Medical History Visualization
// Compatible with existing MedQuery chat interface

import React, { useState, useEffect, useMemo } from 'react';
import { Meteor } from 'meteor/meteor';
import { 
  Calendar, 
  FileText, 
  Activity, 
  AlertTriangle, 
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Pill,
  Stethoscope,
  ClipboardList,
  Heart
} from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { Button } from '../ui/Button';
import { Markdown } from './Markdown';

interface TimelineEvent {
  id: string;
  date: Date;
  type: 'document' | 'diagnosis' | 'medication' | 'procedure' | 'lab' | 'visit';
  title: string;
  description: string;
  severity?: 'low' | 'normal' | 'high' | 'critical';
  entities?: {
    conditions: string[];
    medications: string[];
    procedures: string[];
  };
  documentId?: string;
  metadata?: {
    provider?: string;
    facility?: string;
    documentType?: string;
  };
}

interface TimelineProps {
  patientId: string;
  onEventClick?: (event: TimelineEvent) => void;
  className?: string;
  showFilters?: boolean;
  maxEvents?: number;
}

interface TimelineFilters {
  dateRange: 'all' | '30d' | '90d' | '1y';
  eventTypes: Set<string>;
  severity: Set<string>;
  searchTerm: string;
}

const eventTypeIcons = {
  document: FileText,
  diagnosis: Stethoscope,
  medication: Pill,
  procedure: ClipboardList,
  lab: Activity,
  visit: Heart
};

const eventTypeColors = {
  document: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  diagnosis: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  medication: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  procedure: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  lab: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
  visit: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
};

const severityColors = {
  low: 'border-l-green-400',
  normal: 'border-l-blue-400',
  high: 'border-l-yellow-400',
  critical: 'border-l-red-400'
};

export const PatientTimeline: React.FC<TimelineProps> = ({
  patientId,
  onEventClick,
  className,
  showFilters = true,
  maxEvents = 50
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<TimelineFilters>({
    dateRange: 'all',
    eventTypes: new Set(['document', 'diagnosis', 'medication', 'procedure', 'lab', 'visit']),
    severity: new Set(['low', 'normal', 'high', 'critical']),
    searchTerm: ''
  });

  // Load timeline data
  useEffect(() => {
    const loadTimeline = async () => {
      if (!patientId) return;

      setIsLoading(true);
      setError(null);

      try {
        console.log(`📅 Loading timeline for patient: ${patientId}`);

        // Fetch patient documents and extract timeline events
        const documents = await Meteor.callAsync('medical.searchDocuments', {
          query: '',
          filters: { patientId },
          limit: maxEvents
        });

        // Transform documents into timeline events
        const timelineEvents = await transformDocumentsToEvents(documents);
        
        // Sort events by date (most recent first)
        const sortedEvents = timelineEvents.sort((a, b) => 
          b.date.getTime() - a.date.getTime()
        );

        setEvents(sortedEvents);
        console.log(`✅ Loaded ${sortedEvents.length} timeline events`);

      } catch (error) {
        console.error('Failed to load patient timeline:', error);
        setError(error instanceof Error ? error.message : 'Failed to load timeline');
      } finally {
        setIsLoading(false);
      }
    };

    loadTimeline();
  }, [patientId, maxEvents]);

  // Transform documents to timeline events
  const transformDocumentsToEvents = async (documents: any[]): Promise<TimelineEvent[]> => {
    const events: TimelineEvent[] = [];

    for (const doc of documents) {
      // Main document event
      events.push({
        id: `doc-${doc._id}`,
        date: new Date(doc.metadata.uploadedAt),
        type: 'document',
        title: doc.title || 'Medical Document',
        description: doc.content.substring(0, 200) + '...',
        documentId: doc._id,
        metadata: {
          documentType: doc.metadata.documentType,
          provider: doc.metadata.provider,
          facility: doc.metadata.facility
        },
        entities: {
          conditions: doc.medicalEntities?.filter((e: any) => e.label === 'CONDITION').map((e: any) => e.text) || [],
          medications: doc.medicalEntities?.filter((e: any) => e.label === 'MEDICATION').map((e: any) => e.text) || [],
          procedures: doc.medicalEntities?.filter((e: any) => e.label === 'PROCEDURE').map((e: any) => e.text) || []
        }
      });

      // Create specific events for important entities
      if (doc.medicalEntities) {
        // Diagnosis events
        doc.medicalEntities
          .filter((e: any) => e.label === 'CONDITION' && e.confidence > 0.7)
          .forEach((entity: any, index: number) => {
            events.push({
              id: `diagnosis-${doc._id}-${index}`,
              date: new Date(doc.metadata.uploadedAt),
              type: 'diagnosis',
              title: `Diagnosis: ${entity.text}`,
              description: `Diagnosed with ${entity.text}`,
              severity: determineSeverity(entity.text),
              documentId: doc._id,
              entities: {
                conditions: [entity.text],
                medications: [],
                procedures: []
              }
            });
          });

        // Medication events
        doc.medicalEntities
          .filter((e: any) => e.label === 'MEDICATION' && e.confidence > 0.6)
          .forEach((entity: any, index: number) => {
            events.push({
              id: `medication-${doc._id}-${index}`,
              date: new Date(doc.metadata.uploadedAt),
              type: 'medication',
              title: `Medication: ${entity.text}`,
              description: `Prescribed ${entity.text}`,
              severity: 'normal',
              documentId: doc._id,
              entities: {
                conditions: [],
                medications: [entity.text],
                procedures: []
              }
            });
          });

        // Procedure events
        doc.medicalEntities
          .filter((e: any) => e.label === 'PROCEDURE' && e.confidence > 0.7)
          .forEach((entity: any, index: number) => {
            events.push({
              id: `procedure-${doc._id}-${index}`,
              date: new Date(doc.metadata.uploadedAt),
              type: 'procedure',
              title: `Procedure: ${entity.text}`,
              description: `Underwent ${entity.text}`,
              severity: determineProcedureSeverity(entity.text),
              documentId: doc._id,
              entities: {
                conditions: [],
                medications: [],
                procedures: [entity.text]
              }
            });
          });
      }
    }

    return events;
  };

  // Determine severity based on condition name
  const determineSeverity = (condition: string): 'low' | 'normal' | 'high' | 'critical' => {
    const conditionLower = condition.toLowerCase();
    
    if (conditionLower.includes('cancer') || conditionLower.includes('heart attack') || 
        conditionLower.includes('stroke') || conditionLower.includes('cardiac arrest')) {
      return 'critical';
    }
    
    if (conditionLower.includes('diabetes') || conditionLower.includes('hypertension') ||
        conditionLower.includes('pneumonia') || conditionLower.includes('infection')) {
      return 'high';
    }
    
    if (conditionLower.includes('pain') || conditionLower.includes('inflammation') ||
        conditionLower.includes('sprain') || conditionLower.includes('bruise')) {
      return 'low';
    }
    
    return 'normal';
  };

  const determineProcedureSeverity = (procedure: string): 'low' | 'normal' | 'high' | 'critical' => {
    const procedureLower = procedure.toLowerCase();
    
    if (procedureLower.includes('surgery') || procedureLower.includes('operation') ||
        procedureLower.includes('transplant') || procedureLower.includes('bypass')) {
      return 'high';
    }
    
    if (procedureLower.includes('biopsy') || procedureLower.includes('injection') ||
        procedureLower.includes('vaccination') || procedureLower.includes('x-ray')) {
      return 'low';
    }
    
    return 'normal';
  };

  // Filter events based on current filters
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const cutoffDate = new Date();
      
      switch (filters.dateRange) {
        case '30d':
          cutoffDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          cutoffDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      filtered = filtered.filter(event => event.date >= cutoffDate);
    }

    // Event type filter
    filtered = filtered.filter(event => filters.eventTypes.has(event.type));

    // Severity filter
    filtered = filtered.filter(event => 
      !event.severity || filters.severity.has(event.severity)
    );

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(event =>
        event.title.toLowerCase().includes(searchLower) ||
        event.description.toLowerCase().includes(searchLower) ||
        event.entities?.conditions.some(c => c.toLowerCase().includes(searchLower)) ||
        event.entities?.medications.some(m => m.toLowerCase().includes(searchLower)) ||
        event.entities?.procedures.some(p => p.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [events, filters]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    
    filteredEvents.forEach(event => {
      const dateKey = event.date.toDateString();
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(event);
    });

    // Sort each group by time
    groups.forEach(group => {
      group.sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    return Array.from(groups.entries()).sort((a, b) => 
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  }, [filteredEvents]);

  // Handle event expansion
  const toggleEventExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  // Handle filter changes
  const updateFilters = (key: keyof TimelineFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleEventType = (type: string) => {
    const newTypes = new Set(filters.eventTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    updateFilters('eventTypes', newTypes);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4 animate-spin" />
          <span>Loading patient timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20", className)}>
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Error loading timeline</span>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Timeline Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Patient Timeline</h3>
          <span className="text-sm text-muted-foreground">
            ({filteredEvents.length} events)
          </span>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-muted/50 p-4 rounded-lg space-y-4">
          {/* Date Range Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date Range</label>
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'All Time' },
                { key: '30d', label: 'Last 30 Days' },
                { key: '90d', label: 'Last 90 Days' },
                { key: '1y', label: 'Last Year' }
              ].map(option => (
                <Button
                  key={option.key}
                  variant={filters.dateRange === option.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateFilters('dateRange', option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Event Type Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Event Types</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(eventTypeIcons).map(([type, Icon]) => (
                <Button
                  key={type}
                  variant={filters.eventTypes.has(type) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleEventType(type)}
                  className="capitalize"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <input
              type="text"
              placeholder="Search events, conditions, medications..."
              value={filters.searchTerm}
              onChange={(e) => updateFilters('searchTerm', e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
          </div>
        </div>
      )}

      {/* Timeline Content */}
      {groupedEvents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No timeline events found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map(([dateKey, dayEvents]) => (
            <div key={dateKey} className="relative">
              {/* Date Header */}
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2 border-b">
                <h4 className="font-medium text-foreground">{formatDate(new Date(dateKey))}</h4>
              </div>

              {/* Events for this date */}
              <div className="relative ml-4 pt-4">
                {/* Timeline line */}
                <div className="absolute left-0 top-6 bottom-0 w-px bg-border"></div>

                <div className="space-y-4">
                  {dayEvents.map((event, eventIndex) => {
                    const Icon = eventTypeIcons[event.type];
                    const isExpanded = expandedEvents.has(event.id);
                    const isLast = eventIndex === dayEvents.length - 1;

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "relative pl-8 pb-4 border-l-2 ml-[-1px]",
                          severityColors[event.severity || 'normal'],
                          !isLast && "border-b border-border/50"
                        )}
                      >
                        {/* Timeline dot */}
                        <div className={cn(
                          "absolute left-[-8px] top-1 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center",
                          eventTypeColors[event.type]
                        )}>
                          <Icon className="h-2 w-2" />
                        </div>

                        {/* Event content */}
                        <div className="space-y-2">
                          {/* Event header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-sm truncate">{event.title}</h5>
                              <p className="text-xs text-muted-foreground">
                                {formatTime(event.date)}
                                {event.metadata?.provider && ` • ${event.metadata.provider}`}
                                {event.metadata?.facility && ` • ${event.metadata.facility}`}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              {event.severity && (
                                <span className={cn(
                                  "text-xs px-2 py-1 rounded-full font-medium",
                                  event.severity === 'critical' && "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
                                  event.severity === 'high' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300",
                                  event.severity === 'normal' && "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
                                  event.severity === 'low' && "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                                )}>
                                  {event.severity}
                                </span>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleEventExpansion(event.id)}
                                className="h-6 w-6 p-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Event description (always visible but truncated) */}
                          <div className="text-sm text-muted-foreground">
                            {isExpanded ? (
                              <Markdown>{event.description}</Markdown>
                            ) : (
                              <p className="line-clamp-2">{event.description}</p>
                            )}
                          </div>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="space-y-3 pt-2 border-t border-border/50">
                              {/* Medical entities */}
                              {event.entities && (
                                <div className="space-y-2">
                                  {event.entities.conditions.length > 0 && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Conditions
                                      </span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {event.entities.conditions.map((condition, i) => (
                                          <span
                                            key={i}
                                            className="text-xs px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 rounded-full"
                                          >
                                            {condition}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {event.entities.medications.length > 0 && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Medications
                                      </span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {event.entities.medications.map((medication, i) => (
                                          <span
                                            key={i}
                                            className="text-xs px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 rounded-full"
                                          >
                                            {medication}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {event.entities.procedures.length > 0 && (
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Procedures
                                      </span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {event.entities.procedures.map((procedure, i) => (
                                          <span
                                            key={i}
                                            className="text-xs px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 rounded-full"
                                          >
                                            {procedure}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex gap-2">
                                {event.documentId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onEventClick?.(event)}
                                    className="text-xs"
                                  >
                                    <FileText className="h-3 w-3 mr-1" />
                                    View Document
                                  </Button>
                                )}
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Copy event details to clipboard
                                    const details = `${event.title}\n${event.description}\nDate: ${event.date.toLocaleString()}`;
                                    navigator.clipboard.writeText(details);
                                  }}
                                  className="text-xs"
                                >
                                  Copy Details
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more events button */}
      {events.length >= maxEvents && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            onClick={() => {
              // In real implementation, load more events
              console.log('Load more events');
            }}
          >
            Load More Events
          </Button>
        </div>
      )}
    </div>
  );
};