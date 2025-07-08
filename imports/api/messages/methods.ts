import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { SessionsCollection } from '../sessions/sessions';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import { ContextManager } from '../context/contextManager';

// Enhanced query detection functions
function isEpicEHRQuery(query: string): boolean {
  const ehrIndicators = [
    'ehr', 'epic', 'fhir', 'electronic health record',
    'hospital system', 'patient records', 'medical records system',
    'epic tools', 'fhir tools', 'ehr tools', 'epic ehr'
  ];
  
  const lowerQuery = query.toLowerCase();
  return ehrIndicators.some(indicator => lowerQuery.includes(indicator));
}

function isPatientSearchQuery(query: string): boolean {
  const patientSearchPatterns = [
    /patients?\s+named\s+/i,
    /find\s+patient\s+/i,
    /search\s+for\s+patient\s+/i,
    /patient\s+\w+\s+\w+/i, // patient FirstName LastName
    /search\s+patients?\s+/i,
    /get\s+patient\s+/i,
    /look\s+for\s+patient\s+/i,
    /search\s+for\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i // search for FirstName LastName
  ];
  
  return patientSearchPatterns.some(pattern => pattern.test(query));
}

function isDirectPatientIdQuery(query: string): boolean {
  // Check if query contains Epic patient ID pattern or known IDs
  return /\b[a-zA-Z0-9\-_.]{20,}\b/.test(query) || 
         query.includes('erXuFYUfucBZaryVksYEcMg3') ||
         query.includes('Tbt3KuCY0B5PSrJvCu2j-PlK');
}

function isSearchQuery(query: string): boolean {
  const searchIndicators = [
    'search for', 'find', 'look for', 'show me', 'list', 
    'documents about', 'records for', 'documents for'
  ];
  
  const lowerQuery = query.toLowerCase();
  return searchIndicators.some(indicator => lowerQuery.includes(indicator));
}

function isDocumentQuery(query: string): boolean {
  const documentIndicators = [
    'documents', 'files', 'records', 'reports', 'charts',
    'diagnosis', 'medication', 'prescription', 'treatment',
    'lab results', 'test results', 'medical history', 'uploaded'
  ];
  
  const lowerQuery = query.toLowerCase();
  return documentIndicators.some(indicator => lowerQuery.includes(indicator));
}

function extractSearchTerms(query: string): string {
  // Remove common search phrases to get the actual search terms
  const cleanQuery = query
    .replace(/^(search for|find|look for|show me|list|documents about|records for|files for)\s*/i, '')
    .replace(/\b(patient|documents?|records?|files?|charts?)\b/gi, '')
    .replace(/\b(any|some|all)\b/gi, '')
    .trim();
  
  return cleanQuery || query;
}

function extractKeyTerms(query: string): string | null {
  const medicalTerms = [
    'diabetes', 'hypertension', 'cancer', 'heart', 'blood pressure',
    'medication', 'prescription', 'drug', 'treatment', 'diagnosis',
    'lab', 'test', 'result', 'report', 'x-ray', 'scan', 'mri'
  ];
  
  const lowerQuery = query.toLowerCase();
  const foundTerms = medicalTerms.filter(term => lowerQuery.includes(term));
  
  return foundTerms.length > 0 ? foundTerms.join(' ') : null;
}

// Epic EHR query handler with improved name extraction
async function handleEpicEHRQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`🏥 Processing Epic EHR query: "${query}"`);
    
    // Improved patient name extraction patterns
    const patientNamePatterns = [
      // Match "patients named Camila Lopez" but exclude extra words
      /(?:patients?\s+named\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+in\s+|\s+from\s+|$)/i,
      // Match "patient Camila Lopez" 
      /(?:patient\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+in\s+|\s+from\s+|$)/i,
      // Match "find patient Camila Lopez"
      /(?:find\s+patient\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+in\s+|\s+from\s+|$)/i,
      // Match "search for patient Camila Lopez"
      /(?:search\s+for\s+patient\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+in\s+|\s+from\s+|$)/i,
      // Match "search for Camila Lopez" (more general)
      /(?:search\s+for\s+)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+in\s+|\s+from\s+|$)/i,
      // Match just two capitalized words anywhere in the query
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/
    ];
    
    let patientName = null;
    
    for (const pattern of patientNamePatterns) {
      const match = query.match(pattern);
      if (match) {
        patientName = match[1].trim();
        // Clean up common suffixes
        patientName = patientName
          .replace(/\s+(in\s+ehr|in\s+epic|ehr|epic|from\s+epic|from\s+ehr)$/i, '')
          .trim();
        console.log(`👤 Extracted patient name: "${patientName}" using pattern: ${pattern}`);
        break;
      }
    }
    
    if (patientName) {
      console.log(`🔍 Searching Epic EHR for patient: "${patientName}"`);
      
      // Use Epic FHIR searchPatients tool with clean name
      const searchResult = await mcpManager.callMCPTool('searchPatients', {
        name: patientName
      });
      
      console.log(`🏥 Epic EHR search result:`, searchResult);
      
      // Format Epic EHR results
      return formatEpicSearchResults(searchResult, patientName, query);
    } else {
      return `I understand you want to search the Epic EHR system, but I couldn't extract a clear patient name from your query.\n\n**Please try:**\n• "Search for patient Camila Lopez"\n• "Find patient John Smith in Epic"\n• "Search Epic EHR for Mary Johnson"\n\n**Extracted from your query:** No clear patient name found in "${query}"`;
    }
  } catch (error) {
    console.error('Epic EHR query error:', error);
    
    if (error.message.includes('Tool \'searchPatients\' is not available')) {
      return `I tried to search the Epic EHR system, but the Epic FHIR tools are not currently available. The medical MCP server may not be running or properly configured.\n\n**To fix this:**\n1. Make sure the MCP server is running in HTTP mode\n2. Check that Epic FHIR integration is enabled\n3. Verify the server connection at http://localhost:3001`;
    }
    
    return `I tried to search the Epic EHR system but encountered an error: ${error.message}`;
  }
}

// Handle direct patient ID queries
async function handleDirectPatientQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`🆔 Processing direct patient ID query: "${query}"`);
    
    // Extract patient ID from query
    const patientIdPatterns = [
      /\b([a-zA-Z0-9\-_.]{20,})\b/, // Generic long ID pattern
      /(?:patient\s+id\s+|id\s+)([a-zA-Z0-9\-_.]+)/i, // "patient id XXX" or "id XXX"
      /(?:details\s+for\s+patient\s+)([a-zA-Z0-9\-_.]+)/i // "details for patient XXX"
    ];
    
    let patientId = null;
    
    // Check for known patient IDs first
    if (query.includes('erXuFYUfucBZaryVksYEcMg3')) {
      patientId = 'erXuFYUfucBZaryVksYEcMg3';
    } else if (query.includes('Tbt3KuCY0B5PSrJvCu2j-PlK')) {
      patientId = 'Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB';
    } else {
      // Extract using patterns
      for (const pattern of patientIdPatterns) {
        const match = query.match(pattern);
        if (match) {
          patientId = match[1].trim();
          break;
        }
      }
    }
    
    if (patientId) {
      console.log(`🔍 Getting patient details for ID: "${patientId}"`);
      
      // Determine what type of information is requested
      if (query.toLowerCase().includes('lab') || query.toLowerCase().includes('observation')) {
        const result = await mcpManager.callMCPTool('getPatientObservations', {
          patientId: patientId
        });
        return formatPatientObservations(result, patientId);
      } else if (query.toLowerCase().includes('medication')) {
        const result = await mcpManager.callMCPTool('getPatientMedications', {
          patientId: patientId
        });
        return formatPatientMedications(result, patientId);
      } else if (query.toLowerCase().includes('condition') || query.toLowerCase().includes('diagnosis')) {
        const result = await mcpManager.callMCPTool('getPatientConditions', {
          patientId: patientId
        });
        return formatPatientConditions(result, patientId);
      } else if (query.toLowerCase().includes('encounter') || query.toLowerCase().includes('visit')) {
        const result = await mcpManager.callMCPTool('getPatientEncounters', {
          patientId: patientId
        });
        return formatPatientEncounters(result, patientId);
      } else {
        // Default to patient details
        const result = await mcpManager.callMCPTool('getPatientDetails', {
          patientId: patientId
        });
        return formatPatientDetails(result, patientId);
      }
    } else {
      return `I couldn't extract a patient ID from your query. Please try:\n• "Get patient details for erXuFYUfucBZaryVksYEcMg3"\n• "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"`;
    }
  } catch (error) {
    console.error('Direct patient query error:', error);
    return `Failed to get patient information: ${error.message}`;
  }
}

// Format Epic search results with improved error handling
function formatEpicSearchResults(searchResult: any, patientName: string, originalQuery: string): string {
  try {
    let resultData;
    if (searchResult?.content?.[0]?.text) {
      try {
        resultData = JSON.parse(searchResult.content[0].text);
      } catch (parseError) {
        return `I found some results in Epic EHR but couldn't process them properly. Please try again.`;
      }
    } else {
      resultData = searchResult;
    }
    
    if (!resultData?.success) {
      const errorMsg = resultData?.error || 'Unknown error occurred';
      
      // Handle specific Epic FHIR authentication errors
      if (errorMsg.includes('401 Unauthorized') || errorMsg.includes('authentication')) {
        return `🏥 **Epic EHR Authentication Issue**\n\nThe Epic FHIR sandbox returned an authentication error. This is common with Epic's sandbox.\n\n**✅ Good News:** I have information about known Epic sandbox patients!\n\n**🏥 Epic Sandbox Patients Available:**\n• **Camila Lopez** - ID: erXuFYUfucBZaryVksYEcMg3\n• **Jason Argonaut** - ID: Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB\n\n**🔧 Try these commands instead:**\n• "Get patient details for erXuFYUfucBZaryVksYEcMg3"\n• "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"\n• "Get medications for patient erXuFYUfucBZaryVksYEcMg3"\n• "Get conditions for patient erXuFYUfucBZaryVksYEcMg3"\n\n💡 **Why this happens:** Epic's sandbox requires OAuth2 authentication for patient search, but direct patient access works with known IDs.`;
      }
      
      return `I couldn't search the Epic EHR system: ${errorMsg}.\n\n**Try these known Epic sandbox patients:**\n• Get details for patient erXuFYUfucBZaryVksYEcMg3 (Camila Lopez)\n• Get details for patient Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB (Jason Argonaut)`;
    }
    
    const patients = resultData.patients || [];
    
    if (patients.length === 0) {
      return `🏥 **Epic EHR Search Results**\n\nNo patients named "${patientName}" found in the Epic EHR system.\n\n**🏥 Try these known Epic sandbox patients:**\n• **Camila Lopez** (ID: erXuFYUfucBZaryVksYEcMg3)\n• **Jason Argonaut** (ID: Tbt3KuCY0B5PSrJvCu2j-PlK.aiHsu2xUjUM8bWpetXoB)\n\n**Alternative commands:**\n• "Get patient details for erXuFYUfucBZaryVksYEcMg3"\n• "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"`;
    }
    
    // Format successful results
    let response = `🏥 **Found ${patients.length} patient${patients.length > 1 ? 's' : ''} named "${patientName}" in Epic EHR:**\n\n`;
    
    patients.forEach((patient: any, index: number) => {
      response += `**${index + 1}. ${patient.name}**\n`;
      
      if (patient.id) {
        response += `🆔 **Epic Patient ID:** ${patient.id}\n`;
      }
      
      if (patient.birthDate) {
        response += `🎂 **Birth Date:** ${patient.birthDate}\n`;
      }
      
      if (patient.gender) {
        response += `👤 **Gender:** ${patient.gender}\n`;
      }
      
      if (patient.mrn) {
        response += `🏥 **MRN:** ${patient.mrn}\n`;
      }
      
      if (patient.phone) {
        response += `📞 **Phone:** ${patient.phone}\n`;
      }
      
      if (patient.address && (patient.address.city || patient.address.state)) {
        let addressStr = '';
        if (patient.address.line) addressStr += patient.address.line + ', ';
        if (patient.address.city) addressStr += patient.address.city + ', ';
        if (patient.address.state) addressStr += patient.address.state + ' ';
        if (patient.address.postalCode) addressStr += patient.address.postalCode;
        response += `🏠 **Address:** ${addressStr.trim()}\n`;
      }
      
      if (patient.active !== undefined) {
        response += `✅ **Status:** ${patient.active ? 'Active' : 'Inactive'}\n`;
      }
      
      if (resultData.source) {
        response += `📊 **Source:** ${resultData.source}\n`;
      }
      
      response += `\n`;
    });
    
    if (patients.length > 0) {
      const firstPatient = patients[0];
      response += `💡 **Next Steps - Use these commands:**\n`;
      response += `• "Get details for patient ${firstPatient.id}" - Full patient information\n`;
      response += `• "Get lab results for patient ${firstPatient.id}" - Observations and vitals\n`;
      response += `• "Get medications for patient ${firstPatient.id}" - Current prescriptions\n`;
      response += `• "Get conditions for patient ${firstPatient.id}" - Diagnoses and conditions\n`;
      response += `• "Get encounters for patient ${firstPatient.id}" - Visit history`;
    }
    
    return response;
    
  } catch (error) {
    console.error('Error formatting Epic search results:', error);
    return `I found some patients in Epic EHR but had trouble formatting the results. Please try your search again.`;
  }
}

// Helper formatting functions for different data types
function formatPatientDetails(result: any, patientId: string): string {
  try {
    const resultData = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    
    if (!resultData?.success) {
      return `Failed to get patient details: ${resultData?.error || 'Unknown error'}`;
    }
    
    const patient = resultData.patient;
    let response = `👤 **Patient Details for ${patient.name}**\n\n`;
    
    response += `🆔 **Patient ID:** ${patient.id}\n`;
    if (patient.birthDate) response += `🎂 **Birth Date:** ${patient.birthDate}\n`;
    if (patient.gender) response += `👤 **Gender:** ${patient.gender}\n`;
    if (patient.mrn) response += `🏥 **MRN:** ${patient.mrn}\n`;
    if (patient.phone) response += `📞 **Phone:** ${patient.phone}\n`;
    if (patient.email) response += `📧 **Email:** ${patient.email}\n`;
    if (patient.maritalStatus) response += `💍 **Marital Status:** ${patient.maritalStatus}\n`;
    
    if (patient.address) {
      const addr = patient.address;
      response += `🏠 **Address:** ${addr.line ? addr.line + ', ' : ''}${addr.city ? addr.city + ', ' : ''}${addr.state ? addr.state + ' ' : ''}${addr.postalCode || ''}\n`;
    }
    
    if (patient.generalPractitioner && patient.generalPractitioner.length > 0) {
      response += `👨‍⚕️ **Primary Care:** ${patient.generalPractitioner.join(', ')}\n`;
    }
    
    if (patient.communication && patient.communication.length > 0) {
      response += `🗣️ **Languages:** ${patient.communication.join(', ')}\n`;
    }
    
    response += `✅ **Status:** ${patient.active ? 'Active' : 'Inactive'}\n`;
    
    if (resultData.source) {
      response += `\n📊 **Data Source:** ${resultData.source}\n`;
    }
    
    response += `\n💡 **Available Actions:**\n`;
    response += `• "Get lab results for patient ${patient.id}"\n`;
    response += `• "Get medications for patient ${patient.id}"\n`;
    response += `• "Get conditions for patient ${patient.id}"\n`;
    response += `• "Get encounters for patient ${patient.id}"`;
    
    return response;
  } catch (error) {
    return `Error formatting patient details: ${error.message}`;
  }
}

function formatPatientObservations(result: any, patientId: string): string {
  try {
    const resultData = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    
    if (!resultData?.success) {
      return `Failed to get lab results: ${resultData?.error || 'Unknown error'}`;
    }
    
    const observations = resultData.observations || [];
    let response = `🧪 **Lab Results & Observations for Patient ${patientId}**\n\n`;
    
    if (observations.length === 0) {
      response += `No lab results or observations found.\n\n`;
      if (resultData.source) {
        response += `📊 **Source:** ${resultData.source}`;
      }
      return response;
    }
    
    response += `📊 **Found ${observations.length} observation${observations.length > 1 ? 's' : ''}:**\n\n`;
    
    observations.forEach((obs: any, index: number) => {
      response += `**${index + 1}. ${obs.code?.text || 'Unknown Test'}**\n`;
      
      if (obs.value) {
        if (typeof obs.value === 'object' && obs.value.value !== undefined) {
          response += `📈 **Value:** ${obs.value.value}${obs.unit ? ' ' + obs.unit : ''}\n`;
        } else if (obs.value.systolic && obs.value.diastolic) {
          response += `📈 **Value:** ${obs.value.systolic}/${obs.value.diastolic} ${obs.unit || ''}\n`;
        } else {
          response += `📈 **Value:** ${obs.value}\n`;
        }
      }
      
      if (obs.referenceRange) {
        response += `📏 **Reference Range:** ${obs.referenceRange}\n`;
      }
      
      if (obs.interpretation) {
        response += `🎯 **Interpretation:** ${obs.interpretation}\n`;
      }
      
      if (obs.date) {
        response += `📅 **Date:** ${new Date(obs.date).toLocaleDateString()}\n`;
      }
      
      if (obs.performer) {
        response += `👨‍⚕️ **Performed by:** ${obs.performer}\n`;
      }
      
      if (obs.category) {
        response += `🏷️ **Category:** ${obs.category}\n`;
      }
      
      response += `\n`;
    });
    
    if (resultData.source) {
      response += `📊 **Data Source:** ${resultData.source}`;
    }
    
    return response;
  } catch (error) {
    return `Error formatting lab results: ${error.message}`;
  }
}

function formatPatientMedications(result: any, patientId: string): string {
  try {
    const resultData = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    
    if (!resultData?.success) {
      return `Failed to get medications: ${resultData?.error || 'Unknown error'}`;
    }
    
    const medications = resultData.medications || [];
    let response = `💊 **Medications for Patient ${patientId}**\n\n`;
    
    if (medications.length === 0) {
      response += `No medications found.\n\n`;
      if (resultData.source) {
        response += `📊 **Source:** ${resultData.source}`;
      }
      return response;
    }
    
    response += `📊 **Found ${medications.length} medication${medications.length > 1 ? 's' : ''}:**\n\n`;
    
    medications.forEach((med: any, index: number) => {
      response += `**${index + 1}. ${med.medication?.text || 'Unknown Medication'}**\n`;
      
      if (med.status) {
        response += `📋 **Status:** ${med.status}\n`;
      }
      
      if (med.dosage && med.dosage.length > 0) {
        response += `💊 **Dosage:** ${med.dosage[0].text || 'See dosage instructions'}\n`;
        if (med.dosage[0].route) {
          response += `🚪 **Route:** ${med.dosage[0].route}\n`;
        }
      }
      
      if (med.prescriber) {
        response += `👨‍⚕️ **Prescribed by:** ${med.prescriber}\n`;
      }
      
      if (med.authoredOn) {
        response += `📅 **Prescribed on:** ${new Date(med.authoredOn).toLocaleDateString()}\n`;
      }
      
      response += `\n`;
    });
    
    if (resultData.source) {
      response += `📊 **Data Source:** ${resultData.source}`;
    }
    
    return response;
  } catch (error) {
    return `Error formatting medications: ${error.message}`;
  }
}

function formatPatientConditions(result: any, patientId: string): string {
  try {
    const resultData = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    
    if (!resultData?.success) {
      return `Failed to get conditions: ${resultData?.error || 'Unknown error'}`;
    }
    
    const conditions = resultData.conditions || [];
    let response = `🩺 **Medical Conditions for Patient ${patientId}**\n\n`;
    
    if (conditions.length === 0) {
      response += `No medical conditions found.\n\n`;
      if (resultData.source) {
        response += `📊 **Source:** ${resultData.source}`;
      }
      return response;
    }
    
    response += `📊 **Found ${conditions.length} condition${conditions.length > 1 ? 's' : ''}:**\n\n`;
    
    conditions.forEach((condition: any, index: number) => {
      response += `**${index + 1}. ${condition.code?.text || 'Unknown Condition'}**\n`;
      
      if (condition.clinicalStatus) {
        response += `📋 **Status:** ${condition.clinicalStatus}\n`;
      }
      
      if (condition.verificationStatus) {
        response += `✅ **Verification:** ${condition.verificationStatus}\n`;
      }
      
      if (condition.category) {
        response += `🏷️ **Category:** ${condition.category}\n`;
      }
      
      if (condition.severity) {
        response += `⚠️ **Severity:** ${condition.severity}\n`;
      }
      
      if (condition.onsetDate) {
        response += `📅 **Onset Date:** ${new Date(condition.onsetDate).toLocaleDateString()}\n`;
      }
      
      if (condition.recordedDate) {
        response += `📝 **Recorded:** ${new Date(condition.recordedDate).toLocaleDateString()}\n`;
      }
      
      if (condition.recorder) {
        response += `👨‍⚕️ **Recorded by:** ${condition.recorder}\n`;
      }
      
      response += `\n`;
    });
    
    if (resultData.source) {
      response += `📊 **Data Source:** ${resultData.source}`;
    }
    
    return response;
  } catch (error) {
    return `Error formatting conditions: ${error.message}`;
  }
}

function formatPatientEncounters(result: any, patientId: string): string {
  try {
    const resultData = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    
    if (!resultData?.success) {
      return `Failed to get encounters: ${resultData?.error || 'Unknown error'}`;
    }
    
    const encounters = resultData.encounters || [];
    let response = `🏥 **Healthcare Encounters for Patient ${patientId}**\n\n`;
    
    if (encounters.length === 0) {
      response += `No encounters found.\n\n`;
      if (resultData.source) {
        response += `📊 **Source:** ${resultData.source}`;
      }
      return response;
    }
    
    response += `📊 **Found ${encounters.length} encounter${encounters.length > 1 ? 's' : ''}:**\n\n`;
    
    encounters.forEach((encounter: any, index: number) => {
      response += `**${index + 1}. ${encounter.type || 'Healthcare Visit'}**\n`;
      
      if (encounter.status) {
        response += `📋 **Status:** ${encounter.status}\n`;
      }
      
      if (encounter.class) {
        response += `🏷️ **Type:** ${encounter.class}\n`;
      }
      
      if (encounter.period) {
        if (encounter.period.start) {
          response += `📅 **Start:** ${new Date(encounter.period.start).toLocaleDateString()}\n`;
        }
        if (encounter.period.end) {
          response += `📅 **End:** ${new Date(encounter.period.end).toLocaleDateString()}\n`;
        }
      }
      
      if (encounter.reasonCode) {
        response += `🎯 **Reason:** ${encounter.reasonCode}\n`;
      }
      
      if (encounter.participant && encounter.participant.length > 0) {
        const providers = encounter.participant
          .map((p: any) => p.individual)
          .filter(Boolean)
          .join(', ');
        if (providers) {
          response += `👨‍⚕️ **Providers:** ${providers}\n`;
        }
      }
      
      response += `\n`;
    });
    
    if (resultData.source) {
      response += `📊 **Data Source:** ${resultData.source}`;
    }
    
    return response;
  } catch (error) {
    return `Error formatting encounters: ${error.message}`;
  }
}

// Document search query handler (existing)
async function handleSearchQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`🔍 Processing document search query: "${query}"`);
    
    // Extract search terms
    const searchTerms = extractSearchTerms(query);
    console.log(`📝 Extracted search terms: "${searchTerms}"`);
    
    // Get context if sessionId provided
    let filter = {};
    if (sessionId) {
      const context = await ContextManager.getContext(sessionId);
      if (context.patientContext) {
        filter = { patientId: context.patientContext };
      }
    }
    
    // Call the search tool directly
    const searchResult = await mcpManager.callMCPTool('searchDocuments', {
      query: searchTerms,
      limit: 5,
      threshold: 0.3,
      searchType: 'hybrid',
      filter
    });
    
    console.log(`📊 Document search result:`, searchResult);
    
    // Update session with found documents
    if (sessionId && searchResult?.content?.[0]?.text) {
      try {
        const resultData = JSON.parse(searchResult.content[0].text);
        if (resultData.results && resultData.results.length > 0) {
          const documentIds = resultData.results.map((r: any) => r.id).filter(Boolean);
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.documentIds': { $each: documentIds }
            }
          });
        }
      } catch (e) {
        console.error('Error updating session with document IDs:', e);
      }
    }
    
    // Process and format the results for the user
    return formatSearchResults(searchResult, query, searchTerms);
  } catch (error) {
    console.error('Document search query error:', error);
    return `I tried to search for "${query}" but encountered an error: ${error.message}. Please try rephrasing your search or check if documents have been uploaded.`;
  }
}

function formatSearchResults(searchResult: any, originalQuery: string, searchTerms: string): string {
  try {
    console.log(`🔧 Formatting search results for query: "${originalQuery}"`);
    
    // Parse the MCP tool result
    let resultData;
    if (searchResult?.content?.[0]?.text) {
      try {
        resultData = JSON.parse(searchResult.content[0].text);
      } catch (parseError) {
        console.error('Failed to parse search result JSON:', parseError);
        return `I found some results but couldn't process them properly. Please try a different search.`;
      }
    } else {
      resultData = searchResult;
    }
    
    console.log(`📊 Parsed result data:`, resultData);
    
    if (!resultData?.success) {
      const errorMsg = resultData?.error || 'Unknown error occurred';
      return `I couldn't search the medical documents: ${errorMsg}. Please try uploading some documents first.`;
    }
    
    const results = resultData.results || [];
    console.log(`📈 Found ${results.length} results`);
    
    if (results.length === 0) {
      return `I searched for "${searchTerms}" but didn't find any matching medical documents. Try:\n\n• Different search terms (e.g., specific conditions, medications, or patient names)\n• Uploading more medical documents\n• Using broader search terms`;
    }
    
    // Format the results in a user-friendly way
    let response = `**Found ${results.length} medical document${results.length > 1 ? 's' : ''} for "${searchTerms}":**\n\n`;
    
    results.forEach((result: any, index: number) => {
      response += `**${index + 1}. ${result.title}**\n`;
      
      // Add relevance score
      if (result.score !== undefined) {
        const percentage = Math.round(result.score * 100);
        response += `📊 **Relevance:** ${percentage}%\n`;
      }
      
      // Add patient information
      if (result.metadata?.patientId && result.metadata.patientId !== 'Unknown Patient') {
        response += `👤 **Patient:** ${result.metadata.patientId}\n`;
      }
      
      // Add document type
      if (result.metadata?.documentType) {
        const type = result.metadata.documentType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        response += `📋 **Type:** ${type}\n`;
      }
      
      // Add date
      if (result.metadata?.uploadedAt) {
        const date = new Date(result.metadata.uploadedAt).toLocaleDateString();
        response += `📅 **Date:** ${date}\n`;
      }
      
      // Add content preview
      if (result.content) {
        const preview = result.content.substring(0, 250).replace(/\n+/g, ' ').trim();
        response += `📄 **Content:** ${preview}${result.content.length > 250 ? '...' : ''}\n`;
      }
      
      // Add relevant medical entities if available
      if (result.relevantEntities && result.relevantEntities.length > 0) {
        const entities = result.relevantEntities
          .slice(0, 5)
          .map((e: any) => `${e.text} (${e.label.toLowerCase()})`)
          .join(', ');
        response += `🏷️ **Key Medical Terms:** ${entities}\n`;
      }
      
      response += '\n---\n\n';
    });
    
    // Add helpful suggestions
    response += `💡 **What you can do next:**\n`;
    response += `• Ask specific questions about these documents\n`;
    response += `• Search for specific conditions, medications, or symptoms\n`;
    response += `• Upload additional medical documents\n`;
    response += `• Request summaries or analysis of the found documents`;
    
    return response;
    
  } catch (error) {
    console.error('Error formatting search results:', error);
    return `I found some medical documents but had trouble formatting the results. The search worked, but there was a display error. Please try your search again.`;
  }
}

async function handleDocumentQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`📋 Processing document query: "${query}"`);
    
    // First try to search for relevant documents
    const searchTerms = extractKeyTerms(query);
    
    if (searchTerms) {
      const searchResult = await mcpManager.callMCPTool('searchDocuments', {
        query: searchTerms,
        limit: 3,
        threshold: 0.4,
        searchType: 'hybrid'
      });
      
      // If we found relevant documents, format them nicely
      const formattedResults = formatSearchResults(searchResult, query, searchTerms);
      
      // Build context if sessionId provided
      let contextPrompt = '';
      if (sessionId) {
        const context = await ContextManager.getContext(sessionId);
        contextPrompt = ContextManager.buildContextPrompt(context);
      }
      
      // Then get the LLM to provide additional context
      const llmPrompt = `${contextPrompt}\n\nBased on this search query "${query}" and these document results:\n\n${formattedResults}\n\nPlease provide a helpful summary and answer any specific questions about the medical information found.`;
      
      const llmResponse = await mcpManager.processQueryWithMedicalContext(llmPrompt, { sessionId });
      
      return llmResponse;
    } else {
      // Fallback to regular processing
      return await mcpManager.processQueryWithMedicalContext(query, { sessionId });
    }
  } catch (error) {
    console.error('Document query error:', error);
    return `I tried to process your query about medical documents but encountered an error: ${error.message}`;
  }
}

// Main query routing function
async function routeQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  console.log(`🧠 Routing query: "${query}"`);
  
  // 1. Check for direct patient ID queries first (highest priority)
  if (isDirectPatientIdQuery(query)) {
    console.log(`🆔 Routing to direct patient ID handler`);
    return await handleDirectPatientQuery(query, mcpManager, sessionId);
  }
  
  // 2. Check for Epic EHR queries (patient searches)
  if (isEpicEHRQuery(query) || isPatientSearchQuery(query)) {
    console.log(`🏥 Routing to Epic EHR handler`);
    return await handleEpicEHRQuery(query, mcpManager, sessionId);
  }
  
  // 3. Check for document search queries
  if (isSearchQuery(query) && !isPatientSearchQuery(query)) {
    console.log(`📄 Routing to document search handler`);
    return await handleSearchQuery(query, mcpManager, sessionId);
  }
  
  // 4. Check for general document queries
  if (isDocumentQuery(query)) {
    console.log(`📋 Routing to document query handler`);
    return await handleDocumentQuery(query, mcpManager, sessionId);
  }
  
  // 5. Default to enhanced context processing
  console.log(`🤖 Routing to general LLM processing`);
  return await mcpManager.processQueryWithMedicalContext(query, { sessionId });
}

// Meteor Methods
Meteor.methods({
  async 'messages.insert'(messageData: Omit<Message, '_id'>) {
    check(messageData, {
      content: String,
      role: String,
      timestamp: Date,
      sessionId: String
    });

    const messageId = await MessagesCollection.insertAsync(messageData);
    
    // Update context if session exists
    if (messageData.sessionId) {
      await ContextManager.updateContext(messageData.sessionId, {
        ...messageData,
        _id: messageId
      });
      
      // Update session
      await SessionsCollection.updateAsync(messageData.sessionId, {
        $set: {
          lastMessage: messageData.content.substring(0, 100),
          updatedAt: new Date()
        },
        $inc: { messageCount: 1 }
      });
      
      // Auto-generate title after first user message
      const session = await SessionsCollection.findOneAsync(messageData.sessionId);
      if (session && session.messageCount <= 2 && messageData.role === 'user') {
        Meteor.setTimeout(() => {
          Meteor.call('sessions.generateTitle', messageData.sessionId);
        }, 100);
      }
    }
    
    return messageId;
  },

  async 'mcp.processQuery'(query: string, sessionId?: string) {
    check(query, String);
    check(sessionId, Match.Maybe(String));
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return 'MCP Client is not ready. Please check your API configuration.';
      }
      
      try {
        console.log(`🧠 Processing query with enhanced routing: "${query}"`);
        
        // Use the new routing system
        const response = await routeQuery(query, mcpManager, sessionId);
        
        // Update context after processing
        if (sessionId) {
          await extractAndUpdateContext(query, response, sessionId);
        }
        
        return response;
      } catch (error) {
        console.error('MCP processing error:', error);
        return 'I encountered an error while processing your request. Please try again.';
      }
    }
    
    return 'Simulation mode - no actual processing';
  },

  // ... rest of the existing methods remain the same ...
  async 'mcp.switchProvider'(provider: 'anthropic' | 'ozwell') {
    check(provider, String);
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
      }
      
      try {
        mcpManager.switchProvider(provider);
        return `Switched to ${provider.toUpperCase()} provider`;
      } catch (error) {
        console.error('Provider switch error:', error);
        throw new Meteor.Error('switch-failed', `Failed to switch provider: ${error.message}`);
      }
    }
    
    return 'Provider switched (simulation mode)';
  },

  'mcp.getCurrentProvider'() {
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return null;
      }
      
      return mcpManager.getCurrentProvider();
    }
    
    return 'anthropic';
  },

  'mcp.getAvailableProviders'() {
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return [];
      }
      
      return mcpManager.getAvailableProviders();
    }
    
    // Fallback for simulation
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    
    const providers = [];
    if (anthropicKey) providers.push('anthropic');
    if (ozwellKey) providers.push('ozwell');
    
    return providers;
  },

  // Medical document methods (existing - no changes needed)
  async 'medical.uploadDocument'(fileData: {
    filename: string;
    content: string;
    mimeType: string;
    patientName?: string;
    sessionId?: string;
  }) {
    // Existing implementation...
    check(fileData, {
      filename: String,
      content: String,
      mimeType: String,
      patientName: Match.Maybe(String),
      sessionId: Match.Maybe(String)
    });

    console.log(`📤 Uploading document: ${fileData.filename} (${fileData.mimeType})`);

    if (this.isSimulation) {
      console.log('🔄 Simulation mode - returning mock document ID');
      return { 
        success: true, 
        documentId: 'sim-' + Date.now(),
        message: 'Document uploaded (simulation mode)'
      };
    }

    const mcpManager = MCPClientManager.getInstance();
    
    if (!mcpManager.isReady()) {
      throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready. Please check server configuration.');
    }

    try {
      const medical = mcpManager.getMedicalOperations();
      
      const result = await medical.uploadDocument(
        Buffer.from(fileData.content, 'base64'),
        fileData.filename,
        fileData.mimeType,
        {
          patientName: fileData.patientName,
          sessionId: fileData.sessionId || this.connection?.id || 'default',
          uploadedBy: this.userId || 'anonymous',
          uploadDate: new Date()
        }
      );
      
      if (fileData.sessionId && result.documentId) {
        await SessionsCollection.updateAsync(fileData.sessionId, {
          $addToSet: {
            'metadata.documentIds': result.documentId
          },
          $set: {
            'metadata.patientId': fileData.patientName || 'Unknown Patient'
          }
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Document upload error:', error);
      
      if (error.message && error.message.includes('Medical MCP server not connected')) {
        throw new Meteor.Error('medical-server-offline', 'Medical document server is not available. Please contact administrator.');
      }
      
      throw new Meteor.Error('upload-failed', `Failed to upload document: ${error.message || 'Unknown error'}`);
    }
  },

  // ... other existing methods remain unchanged
});

// Helper function to extract and update context
async function extractAndUpdateContext(
  query: string, 
  response: string, 
  sessionId: string
): Promise<void> {
  // Extract patient name
  const patientMatch = query.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (patientMatch) {
    await SessionsCollection.updateAsync(sessionId, {
      $set: { 'metadata.patientId': patientMatch[1] }
    });
  }
  
  // Extract medical terms from response
  const medicalTerms = extractMedicalTermsFromResponse(response);
  if (medicalTerms.length > 0) {
    await SessionsCollection.updateAsync(sessionId, {
      $addToSet: {
        'metadata.tags': { $each: medicalTerms }
      }
    });
  }
}

function extractMedicalTermsFromResponse(response: string): string[] {
  const medicalPatterns = [
    /\b(?:diagnosed with|diagnosis of)\s+([^,.]+)/gi,
    /\b(?:prescribed|medication)\s+([^,.]+)/gi,
    /\b(?:treatment for|treating)\s+([^,.]+)/gi
  ];
  
  const terms = new Set<string>();
  
  medicalPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      if (match[1]) {
        terms.add(match[1].trim().toLowerCase());
      }
    }
  });
  
  return Array.from(terms).slice(0, 10);
}