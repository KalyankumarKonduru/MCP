Package["core-runtime"].queue("null",function () {/* Imports for global scope */

MongoInternals = Package.mongo.MongoInternals;
Mongo = Package.mongo.Mongo;
ReactiveVar = Package['reactive-var'].ReactiveVar;
ECMAScript = Package.ecmascript.ECMAScript;
Meteor = Package.meteor.Meteor;
global = Package.meteor.global;
meteorEnv = Package.meteor.meteorEnv;
EmitterPromise = Package.meteor.EmitterPromise;
WebApp = Package.webapp.WebApp;
WebAppInternals = Package.webapp.WebAppInternals;
main = Package.webapp.main;
DDP = Package['ddp-client'].DDP;
DDPServer = Package['ddp-server'].DDPServer;
LaunchScreen = Package['launch-screen'].LaunchScreen;
meteorInstall = Package.modules.meteorInstall;
Promise = Package.promise.Promise;
Autoupdate = Package.autoupdate.Autoupdate;

var require = meteorInstall({"imports":{"api":{"context":{"contextManager.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/context/contextManager.ts                                                                             //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      ContextManager: () => ContextManager
    });
    let MessagesCollection;
    module.link("../messages/messages", {
      MessagesCollection(v) {
        MessagesCollection = v;
      }
    }, 0);
    let SessionsCollection;
    module.link("../sessions/sessions", {
      SessionsCollection(v) {
        SessionsCollection = v;
      }
    }, 1);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class ContextManager {
      static async getContext(sessionId) {
        let context = this.contexts.get(sessionId);
        if (!context) {
          // Load context from database
          context = await this.loadContextFromDB(sessionId);
          this.contexts.set(sessionId, context);
        }
        return context;
      }
      static async loadContextFromDB(sessionId) {
        // Load recent messages
        const recentMessages = await MessagesCollection.find({
          sessionId
        }, {
          sort: {
            timestamp: -1
          },
          limit: this.MAX_MESSAGES
        }).fetchAsync();
        // Load session metadata
        const session = await SessionsCollection.findOneAsync(sessionId);
        const context = {
          sessionId,
          recentMessages: recentMessages.reverse(),
          maxContextLength: this.MAX_CONTEXT_LENGTH,
          totalTokens: 0
        };
        // Add metadata from session
        if (session !== null && session !== void 0 && session.metadata) {
          context.patientContext = session.metadata.patientId;
          context.documentContext = session.metadata.documentIds;
        }
        // Extract medical entities from recent messages
        context.medicalEntities = this.extractMedicalEntities(recentMessages);
        // Calculate token usage
        context.totalTokens = this.calculateTokens(context);
        // Trim if needed
        this.trimContext(context);
        return context;
      }
      static async updateContext(sessionId, newMessage) {
        const context = await this.getContext(sessionId);
        // Add new message
        context.recentMessages.push(newMessage);
        // Update medical entities if message contains them
        if (newMessage.role === 'assistant') {
          const entities = this.extractEntitiesFromMessage(newMessage.content);
          if (entities.length > 0) {
            context.medicalEntities = [...(context.medicalEntities || []), ...entities].slice(-50); // Keep last 50 entities
          }
        }
        // Recalculate tokens and trim
        context.totalTokens = this.calculateTokens(context);
        this.trimContext(context);
        this.contexts.set(sessionId, context);
        // Persist important context back to session
        await this.persistContext(sessionId, context);
      }
      static trimContext(context) {
        while (context.totalTokens > context.maxContextLength && context.recentMessages.length > 2) {
          // Remove oldest messages, but keep at least 2
          context.recentMessages.shift();
          context.totalTokens = this.calculateTokens(context);
        }
      }
      static calculateTokens(context) {
        // Rough estimation: 1 token ≈ 4 characters
        let totalChars = 0;
        // Count message content
        totalChars += context.recentMessages.map(msg => msg.content).join(' ').length;
        // Count metadata
        if (context.patientContext) {
          totalChars += context.patientContext.length + 20; // Include label
        }
        if (context.documentContext) {
          totalChars += context.documentContext.join(' ').length + 30;
        }
        if (context.medicalEntities) {
          totalChars += context.medicalEntities.map(e => "".concat(e.text, " (").concat(e.label, ")")).join(', ').length;
        }
        return Math.ceil(totalChars / 4);
      }
      static buildContextPrompt(context) {
        const parts = [];
        // Add patient context
        if (context.patientContext) {
          parts.push("Current Patient: ".concat(context.patientContext));
        }
        // Add document context
        if (context.documentContext && context.documentContext.length > 0) {
          parts.push("Related Documents: ".concat(context.documentContext.slice(0, 5).join(', ')));
        }
        // Add medical entities summary
        if (context.medicalEntities && context.medicalEntities.length > 0) {
          const entitySummary = this.summarizeMedicalEntities(context.medicalEntities);
          parts.push("Medical Context: ".concat(entitySummary));
        }
        // Add conversation history
        if (context.recentMessages.length > 0) {
          const conversation = context.recentMessages.map(msg => "".concat(msg.role === 'user' ? 'User' : 'Assistant', ": ").concat(msg.content)).join('\n');
          parts.push("Recent Conversation:\n".concat(conversation));
        }
        return parts.join('\n\n');
      }
      static summarizeMedicalEntities(entities) {
        const grouped = entities.reduce((acc, entity) => {
          if (!acc[entity.label]) {
            acc[entity.label] = [];
          }
          acc[entity.label].push(entity.text);
          return acc;
        }, {});
        const summary = Object.entries(grouped).map(_ref => {
          let [label, texts] = _ref;
          const unique = [...new Set(texts)].slice(0, 5);
          return "".concat(label, ": ").concat(unique.join(', '));
        }).join('; ');
        return summary;
      }
      static extractMedicalEntities(messages) {
        const entities = [];
        // Simple extraction - look for patterns
        const patterns = {
          MEDICATION: /\b(medication|medicine|drug|prescription):\s*([^,.]+)/gi,
          CONDITION: /\b(diagnosis|condition|disease):\s*([^,.]+)/gi,
          SYMPTOM: /\b(symptom|complain):\s*([^,.]+)/gi
        };
        messages.forEach(msg => {
          Object.entries(patterns).forEach(_ref2 => {
            let [label, pattern] = _ref2;
            let match;
            while ((match = pattern.exec(msg.content)) !== null) {
              entities.push({
                text: match[2].trim(),
                label
              });
            }
          });
        });
        return entities;
      }
      static extractEntitiesFromMessage(content) {
        const entities = [];
        // Look for medical terms in the response
        const medicalTerms = {
          MEDICATION: ['medication', 'prescribed', 'dosage', 'mg', 'tablets'],
          CONDITION: ['diagnosis', 'condition', 'syndrome', 'disease'],
          PROCEDURE: ['surgery', 'procedure', 'test', 'examination'],
          SYMPTOM: ['pain', 'fever', 'nausea', 'fatigue']
        };
        Object.entries(medicalTerms).forEach(_ref3 => {
          let [label, terms] = _ref3;
          terms.forEach(term => {
            if (content.toLowerCase().includes(term)) {
              // Extract the sentence containing the term
              const sentences = content.split(/[.!?]/);
              sentences.forEach(sentence => {
                if (sentence.toLowerCase().includes(term)) {
                  const extracted = sentence.trim().substring(0, 100);
                  if (extracted) {
                    entities.push({
                      text: extracted,
                      label
                    });
                  }
                }
              });
            }
          });
        });
        return entities;
      }
      static async persistContext(sessionId, context) {
        var _context$medicalEntit, _context$recentMessag;
        // Update session with latest context metadata
        await SessionsCollection.updateAsync(sessionId, {
          $set: {
            'metadata.patientId': context.patientContext,
            'metadata.documentIds': context.documentContext,
            'metadata.lastEntities': (_context$medicalEntit = context.medicalEntities) === null || _context$medicalEntit === void 0 ? void 0 : _context$medicalEntit.slice(-10),
            lastMessage: (_context$recentMessag = context.recentMessages[context.recentMessages.length - 1]) === null || _context$recentMessag === void 0 ? void 0 : _context$recentMessag.content.substring(0, 100),
            messageCount: await MessagesCollection.countDocuments({
              sessionId
            }),
            updatedAt: new Date()
          }
        });
      }
      static clearContext(sessionId) {
        this.contexts.delete(sessionId);
      }
      static clearAllContexts() {
        this.contexts.clear();
      }
      static getContextStats(sessionId) {
        const context = this.contexts.get(sessionId);
        if (!context) return null;
        return {
          size: this.contexts.size,
          messages: context.recentMessages.length,
          tokens: context.totalTokens
        };
      }
    }
    ContextManager.contexts = new Map();
    ContextManager.MAX_CONTEXT_LENGTH = 4000;
    // Adjust based on model
    ContextManager.MAX_MESSAGES = 20;
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"mcp":{"aidboxServerConnection.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/mcp/aidboxServerConnection.ts                                                                         //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    module.export({
      AidboxServerConnection: () => AidboxServerConnection,
      createAidboxOperations: () => createAidboxOperations
    });
    class AidboxServerConnection {
      constructor() {
        let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http://localhost:3002';
        this.baseUrl = void 0;
        this.sessionId = null;
        this.isInitialized = false;
        this.requestId = 1;
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
      }
      async connect() {
        try {
          var _toolsResult$tools;
          console.log(" Connecting to Aidbox MCP Server at: ".concat(this.baseUrl));
          // Test if server is running
          const healthCheck = await this.checkServerHealth();
          if (!healthCheck.ok) {
            throw new Error("Aidbox MCP Server not responding at ".concat(this.baseUrl));
          }
          // Initialize the connection
          const initResult = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
              roots: {
                listChanged: false
              }
            },
            clientInfo: {
              name: 'meteor-aidbox-client',
              version: '1.0.0'
            }
          });
          console.log(' Aidbox MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log("Aidbox MCP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log(' Available Aidbox tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error(' Failed to connect to Aidbox MCP Server:', error);
          throw error;
        }
      }
      async checkServerHealth() {
        try {
          const response = await fetch("".concat(this.baseUrl, "/health"), {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (response.ok) {
            const health = await response.json();
            console.log(' Aidbox MCP Server health check passed:', health);
            return {
              ok: true
            };
          } else {
            return {
              ok: false,
              error: "Server returned ".concat(response.status)
            };
          }
        } catch (error) {
          return {
            ok: false,
            error: error.message
          };
        }
      }
      async sendRequest(method, params) {
        if (!this.baseUrl) {
          throw new Error('Aidbox MCP Server not connected');
        }
        const id = this.requestId++;
        const request = {
          jsonrpc: '2.0',
          method,
          params,
          id
        };
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          // Add session ID if we have one
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          console.log(" Sending request to Aidbox: ".concat(method), {
            id,
            sessionId: this.sessionId
          });
          const response = await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(30000) // 30 second timeout
          });
          // Extract session ID from response headers if present
          const responseSessionId = response.headers.get('mcp-session-id');
          if (responseSessionId && !this.sessionId) {
            this.sessionId = responseSessionId;
            console.log(' Received Aidbox session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("Aidbox MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log(" Aidbox request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error(" Aidbox request failed for method ".concat(method, ":"), error);
          throw error;
        }
      }
      async sendNotification(method, params) {
        const notification = {
          jsonrpc: '2.0',
          method,
          params
        };
        try {
          const headers = {
            'Content-Type': 'application/json'
          };
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(notification),
            signal: AbortSignal.timeout(10000)
          });
        } catch (error) {
          console.warn("Notification ".concat(method, " failed:"), error);
        }
      }
      async listTools() {
        if (!this.isInitialized) {
          throw new Error('Aidbox MCP Server not initialized');
        }
        return this.sendRequest('tools/list', {});
      }
      async callTool(name, args) {
        if (!this.isInitialized) {
          throw new Error('Aidbox MCP Server not initialized');
        }
        return this.sendRequest('tools/call', {
          name,
          arguments: args
        });
      }
      disconnect() {
        this.sessionId = null;
        this.isInitialized = false;
        console.log(' Disconnected from Aidbox MCP Server');
      }
    }
    function createAidboxOperations(connection) {
      return {
        async searchPatients(query) {
          var _result$content, _result$content$;
          const result = await connection.callTool('aidboxSearchPatients', query);
          return (_result$content = result.content) !== null && _result$content !== void 0 && (_result$content$ = _result$content[0]) !== null && _result$content$ !== void 0 && _result$content$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientDetails(patientId) {
          var _result$content2, _result$content2$;
          const result = await connection.callTool('aidboxGetPatientDetails', {
            patientId
          });
          return (_result$content2 = result.content) !== null && _result$content2 !== void 0 && (_result$content2$ = _result$content2[0]) !== null && _result$content2$ !== void 0 && _result$content2$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createPatient(patientData) {
          var _result$content3, _result$content3$;
          const result = await connection.callTool('aidboxCreatePatient', patientData);
          return (_result$content3 = result.content) !== null && _result$content3 !== void 0 && (_result$content3$ = _result$content3[0]) !== null && _result$content3$ !== void 0 && _result$content3$.text ? JSON.parse(result.content[0].text) : result;
        },
        async updatePatient(patientId, updates) {
          var _result$content4, _result$content4$;
          const result = await connection.callTool('aidboxUpdatePatient', _objectSpread({
            patientId
          }, updates));
          return (_result$content4 = result.content) !== null && _result$content4 !== void 0 && (_result$content4$ = _result$content4[0]) !== null && _result$content4$ !== void 0 && _result$content4$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientObservations(patientId) {
          var _result$content5, _result$content5$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('aidboxGetPatientObservations', _objectSpread({
            patientId
          }, options));
          return (_result$content5 = result.content) !== null && _result$content5 !== void 0 && (_result$content5$ = _result$content5[0]) !== null && _result$content5$ !== void 0 && _result$content5$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createObservation(observationData) {
          var _result$content6, _result$content6$;
          const result = await connection.callTool('aidboxCreateObservation', observationData);
          return (_result$content6 = result.content) !== null && _result$content6 !== void 0 && (_result$content6$ = _result$content6[0]) !== null && _result$content6$ !== void 0 && _result$content6$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientMedications(patientId) {
          var _result$content7, _result$content7$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('aidboxGetPatientMedications', _objectSpread({
            patientId
          }, options));
          return (_result$content7 = result.content) !== null && _result$content7 !== void 0 && (_result$content7$ = _result$content7[0]) !== null && _result$content7$ !== void 0 && _result$content7$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createMedicationRequest(medicationData) {
          var _result$content8, _result$content8$;
          const result = await connection.callTool('aidboxCreateMedicationRequest', medicationData);
          return (_result$content8 = result.content) !== null && _result$content8 !== void 0 && (_result$content8$ = _result$content8[0]) !== null && _result$content8$ !== void 0 && _result$content8$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientConditions(patientId) {
          var _result$content9, _result$content9$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('aidboxGetPatientConditions', _objectSpread({
            patientId
          }, options));
          return (_result$content9 = result.content) !== null && _result$content9 !== void 0 && (_result$content9$ = _result$content9[0]) !== null && _result$content9$ !== void 0 && _result$content9$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createCondition(conditionData) {
          var _result$content0, _result$content0$;
          const result = await connection.callTool('aidboxCreateCondition', conditionData);
          return (_result$content0 = result.content) !== null && _result$content0 !== void 0 && (_result$content0$ = _result$content0[0]) !== null && _result$content0$ !== void 0 && _result$content0$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientEncounters(patientId) {
          var _result$content1, _result$content1$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('aidboxGetPatientEncounters', _objectSpread({
            patientId
          }, options));
          return (_result$content1 = result.content) !== null && _result$content1 !== void 0 && (_result$content1$ = _result$content1[0]) !== null && _result$content1$ !== void 0 && _result$content1$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createEncounter(encounterData) {
          var _result$content10, _result$content10$;
          const result = await connection.callTool('aidboxCreateEncounter', encounterData);
          return (_result$content10 = result.content) !== null && _result$content10 !== void 0 && (_result$content10$ = _result$content10[0]) !== null && _result$content10$ !== void 0 && _result$content10$.text ? JSON.parse(result.content[0].text) : result;
        }
      };
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"epicServerConnection.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/mcp/epicServerConnection.ts                                                                           //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    module.export({
      EpicServerConnection: () => EpicServerConnection,
      createEpicOperations: () => createEpicOperations
    });
    class EpicServerConnection {
      constructor() {
        let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http://localhost:3003';
        this.baseUrl = void 0;
        this.sessionId = null;
        this.isInitialized = false;
        this.requestId = 1;
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
      }
      async connect() {
        try {
          var _toolsResult$tools;
          console.log("\uD83C\uDFE5 Connecting to Epic MCP Server at: ".concat(this.baseUrl));
          // Test if server is running
          const healthCheck = await this.checkServerHealth();
          if (!healthCheck.ok) {
            throw new Error("Epic MCP Server not responding at ".concat(this.baseUrl, ": ").concat(healthCheck.error));
          }
          // Initialize the connection
          const initResult = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
              roots: {
                listChanged: false
              }
            },
            clientInfo: {
              name: 'meteor-epic-client',
              version: '1.0.0'
            }
          });
          console.log(' Epic MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log(" Epic MCP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log(' Available Epic tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error(' Failed to connect to Epic MCP Server:', error);
          throw error;
        }
      }
      async checkServerHealth() {
        try {
          const response = await fetch("".concat(this.baseUrl, "/health"), {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (response.ok) {
            const health = await response.json();
            console.log('Epic MCP Server health check passed:', health);
            return {
              ok: true
            };
          } else {
            return {
              ok: false,
              error: "Server returned ".concat(response.status)
            };
          }
        } catch (error) {
          return {
            ok: false,
            error: error.message
          };
        }
      }
      async sendRequest(method, params) {
        if (!this.baseUrl) {
          throw new Error('Epic MCP Server not connected');
        }
        const id = this.requestId++;
        const request = {
          jsonrpc: '2.0',
          method,
          params,
          id
        };
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          console.log(" Sending request to Epic MCP: ".concat(method), {
            id,
            sessionId: this.sessionId
          });
          const response = await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(30000) // 30 second timeout
          });
          const responseSessionId = response.headers.get('mcp-session-id');
          if (responseSessionId && !this.sessionId) {
            this.sessionId = responseSessionId;
            console.log(' Received Epic session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("Epic MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log(" Epic request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error(" Epic request failed for method ".concat(method, ":"), error);
          throw error;
        }
      }
      async sendNotification(method, params) {
        const notification = {
          jsonrpc: '2.0',
          method,
          params
        };
        try {
          const headers = {
            'Content-Type': 'application/json'
          };
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(notification),
            signal: AbortSignal.timeout(10000)
          });
        } catch (error) {
          console.warn("Epic notification ".concat(method, " failed:"), error);
        }
      }
      async listTools() {
        if (!this.isInitialized) {
          throw new Error('Epic MCP Server not initialized');
        }
        return this.sendRequest('tools/list', {});
      }
      async callTool(name, args) {
        if (!this.isInitialized) {
          throw new Error('Epic MCP Server not initialized');
        }
        return this.sendRequest('tools/call', {
          name,
          arguments: args
        });
      }
      disconnect() {
        this.sessionId = null;
        this.isInitialized = false;
        console.log(' Disconnected from Epic MCP Server');
      }
    }
    function createEpicOperations(connection) {
      return {
        async searchPatients(query) {
          var _result$content, _result$content$;
          const result = await connection.callTool('searchPatients', query);
          return (_result$content = result.content) !== null && _result$content !== void 0 && (_result$content$ = _result$content[0]) !== null && _result$content$ !== void 0 && _result$content$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientDetails(patientId) {
          var _result$content2, _result$content2$;
          const result = await connection.callTool('getPatientDetails', {
            patientId
          });
          return (_result$content2 = result.content) !== null && _result$content2 !== void 0 && (_result$content2$ = _result$content2[0]) !== null && _result$content2$ !== void 0 && _result$content2$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientObservations(patientId) {
          var _result$content3, _result$content3$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientObservations', _objectSpread({
            patientId
          }, options));
          return (_result$content3 = result.content) !== null && _result$content3 !== void 0 && (_result$content3$ = _result$content3[0]) !== null && _result$content3$ !== void 0 && _result$content3$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientMedications(patientId) {
          var _result$content4, _result$content4$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientMedications', _objectSpread({
            patientId
          }, options));
          return (_result$content4 = result.content) !== null && _result$content4 !== void 0 && (_result$content4$ = _result$content4[0]) !== null && _result$content4$ !== void 0 && _result$content4$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientConditions(patientId) {
          var _result$content5, _result$content5$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientConditions', _objectSpread({
            patientId
          }, options));
          return (_result$content5 = result.content) !== null && _result$content5 !== void 0 && (_result$content5$ = _result$content5[0]) !== null && _result$content5$ !== void 0 && _result$content5$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientEncounters(patientId) {
          var _result$content6, _result$content6$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientEncounters', _objectSpread({
            patientId
          }, options));
          return (_result$content6 = result.content) !== null && _result$content6 !== void 0 && (_result$content6$ = _result$content6[0]) !== null && _result$content6$ !== void 0 && _result$content6$.text ? JSON.parse(result.content[0].text) : result;
        }
      };
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mcpClientManager.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/mcp/mcpClientManager.ts                                                                               //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MCPClientManager: () => MCPClientManager
    });
    let Anthropic;
    module.link("@anthropic-ai/sdk", {
      default(v) {
        Anthropic = v;
      }
    }, 0);
    let MedicalServerConnection, createMedicalOperations;
    module.link("./medicalServerConnection", {
      MedicalServerConnection(v) {
        MedicalServerConnection = v;
      },
      createMedicalOperations(v) {
        createMedicalOperations = v;
      }
    }, 1);
    let AidboxServerConnection, createAidboxOperations;
    module.link("./aidboxServerConnection", {
      AidboxServerConnection(v) {
        AidboxServerConnection = v;
      },
      createAidboxOperations(v) {
        createAidboxOperations = v;
      }
    }, 2);
    let EpicServerConnection, createEpicOperations;
    module.link("./epicServerConnection", {
      EpicServerConnection(v) {
        EpicServerConnection = v;
      },
      createEpicOperations(v) {
        createEpicOperations = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    class MCPClientManager {
      constructor() {
        this.anthropic = void 0;
        this.isInitialized = false;
        this.config = void 0;
        // Medical MCP connection (Streamable HTTP)
        this.medicalConnection = void 0;
        this.medicalOperations = void 0;
        this.availableTools = [];
        // Aidbox MCP connection
        this.aidboxConnection = void 0;
        this.aidboxOperations = void 0;
        this.aidboxTools = [];
        // Epic MCP connection
        this.epicConnection = void 0;
        this.epicOperations = void 0;
        this.epicTools = [];
      }
      static getInstance() {
        if (!MCPClientManager.instance) {
          MCPClientManager.instance = new MCPClientManager();
        }
        return MCPClientManager.instance;
      }
      async initialize(config) {
        console.log('🚀 Initializing MCP Client with Intelligent Tool Selection');
        this.config = config;
        try {
          if (config.provider === 'anthropic') {
            console.log('Creating Anthropic client with native tool calling support...');
            this.anthropic = new Anthropic({
              apiKey: config.apiKey
            });
            console.log('✅ Anthropic client initialized with intelligent tool selection');
          }
          this.isInitialized = true;
          console.log("MCP Client ready with provider: ".concat(config.provider));
        } catch (error) {
          console.error('❌ Failed to initialize MCP client:', error);
          throw error;
        }
      }
      // Connect to medical MCP server and get all available tools
      async connectToMedicalServer() {
        try {
          var _global$Meteor, _global$Meteor$settin;
          const settings = (_global$Meteor = global.Meteor) === null || _global$Meteor === void 0 ? void 0 : (_global$Meteor$settin = _global$Meteor.settings) === null || _global$Meteor$settin === void 0 ? void 0 : _global$Meteor$settin.private;
          const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3005';
          console.log("\uD83D\uDD17 Connecting to Medical MCP Server at: ".concat(mcpServerUrl));
          this.medicalConnection = new MedicalServerConnection(mcpServerUrl);
          await this.medicalConnection.connect();
          this.medicalOperations = createMedicalOperations(this.medicalConnection);
          // Get all available tools
          const toolsResult = await this.medicalConnection.listTools();
          this.availableTools = toolsResult.tools || [];
          console.log("\u2705 Connected with ".concat(this.availableTools.length, " medical tools available"));
          console.log("\uD83D\uDCCB Medical tool names: ".concat(this.availableTools.map(t => t.name).join(', ')));
        } catch (error) {
          console.error('❌ Medical MCP Server HTTP connection failed:', error);
          throw error;
        }
      }
      async connectToAidboxServer() {
        try {
          var _global$Meteor2, _global$Meteor2$setti;
          const settings = (_global$Meteor2 = global.Meteor) === null || _global$Meteor2 === void 0 ? void 0 : (_global$Meteor2$setti = _global$Meteor2.settings) === null || _global$Meteor2$setti === void 0 ? void 0 : _global$Meteor2$setti.private;
          const aidboxServerUrl = (settings === null || settings === void 0 ? void 0 : settings.AIDBOX_MCP_SERVER_URL) || process.env.AIDBOX_MCP_SERVER_URL || 'http://localhost:3002';
          console.log("\uD83D\uDD17 Connecting to Aidbox MCP Server at: ".concat(aidboxServerUrl));
          this.aidboxConnection = new AidboxServerConnection(aidboxServerUrl);
          await this.aidboxConnection.connect();
          this.aidboxOperations = createAidboxOperations(this.aidboxConnection);
          // Get Aidbox tools
          const toolsResult = await this.aidboxConnection.listTools();
          this.aidboxTools = toolsResult.tools || [];
          console.log("\u2705 Connected to Aidbox with ".concat(this.aidboxTools.length, " tools available"));
          console.log("\uD83D\uDCCB Aidbox tool names: ".concat(this.aidboxTools.map(t => t.name).join(', ')));
          // Merge with existing tools, ensuring unique names
          this.availableTools = this.mergeToolsUnique(this.availableTools, this.aidboxTools);
          this.logAvailableTools();
        } catch (error) {
          console.error('❌ Aidbox MCP Server connection failed:', error);
          throw error;
        }
      }
      async connectToEpicServer() {
        try {
          var _global$Meteor3, _global$Meteor3$setti;
          const settings = (_global$Meteor3 = global.Meteor) === null || _global$Meteor3 === void 0 ? void 0 : (_global$Meteor3$setti = _global$Meteor3.settings) === null || _global$Meteor3$setti === void 0 ? void 0 : _global$Meteor3$setti.private;
          const epicServerUrl = (settings === null || settings === void 0 ? void 0 : settings.EPIC_MCP_SERVER_URL) || process.env.EPIC_MCP_SERVER_URL || 'http://localhost:3003';
          console.log("\uD83D\uDD17 Connecting to Epic MCP Server at: ".concat(epicServerUrl));
          this.epicConnection = new EpicServerConnection(epicServerUrl);
          await this.epicConnection.connect();
          this.epicOperations = createEpicOperations(this.epicConnection);
          // Get Epic tools
          const toolsResult = await this.epicConnection.listTools();
          this.epicTools = toolsResult.tools || [];
          console.log("\u2705 Connected to Epic with ".concat(this.epicTools.length, " tools available"));
          console.log("\uD83D\uDCCB Epic tool names: ".concat(this.epicTools.map(t => t.name).join(', ')));
          // Merge with existing tools, ensuring unique names
          this.availableTools = this.mergeToolsUnique(this.availableTools, this.epicTools);
          this.logAvailableTools();
        } catch (error) {
          console.error('❌ Epic MCP Server connection failed:', error);
          throw error;
        }
      }
      // Merge tools ensuring unique names
      mergeToolsUnique(existingTools, newTools) {
        console.log("\uD83D\uDD27 Merging tools: ".concat(existingTools.length, " existing + ").concat(newTools.length, " new"));
        const toolNameSet = new Set(existingTools.map(tool => tool.name));
        const uniqueNewTools = newTools.filter(tool => {
          if (toolNameSet.has(tool.name)) {
            console.warn("\u26A0\uFE0F Duplicate tool name found: ".concat(tool.name, " - skipping duplicate"));
            return false;
          }
          toolNameSet.add(tool.name);
          return true;
        });
        const mergedTools = [...existingTools, ...uniqueNewTools];
        console.log("\u2705 Merged tools: ".concat(existingTools.length, " existing + ").concat(uniqueNewTools.length, " new = ").concat(mergedTools.length, " total"));
        return mergedTools;
      }
      logAvailableTools() {
        console.log('\n📋 Available Tools for Intelligent Selection:');
        // Separate tools by actual source/type, not by pattern matching
        const epicTools = this.availableTools.filter(t => t.name.toLowerCase().startsWith('epic'));
        const aidboxTools = this.availableTools.filter(t => this.isAidboxFHIRTool(t) && !t.name.toLowerCase().startsWith('epic'));
        const documentTools = this.availableTools.filter(t => this.isDocumentTool(t));
        const analysisTools = this.availableTools.filter(t => this.isAnalysisTool(t));
        const otherTools = this.availableTools.filter(t => !epicTools.includes(t) && !aidboxTools.includes(t) && !documentTools.includes(t) && !analysisTools.includes(t));
        if (aidboxTools.length > 0) {
          console.log('🏥 Aidbox FHIR Tools:');
          aidboxTools.forEach(tool => {
            var _tool$description;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description = tool.description) === null || _tool$description === void 0 ? void 0 : _tool$description.substring(0, 60), "..."));
          });
        }
        if (epicTools.length > 0) {
          console.log('🏥 Epic EHR Tools:');
          epicTools.forEach(tool => {
            var _tool$description2;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description2 = tool.description) === null || _tool$description2 === void 0 ? void 0 : _tool$description2.substring(0, 60), "..."));
          });
        }
        if (documentTools.length > 0) {
          console.log('📄 Document Tools:');
          documentTools.forEach(tool => {
            var _tool$description3;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description3 = tool.description) === null || _tool$description3 === void 0 ? void 0 : _tool$description3.substring(0, 60), "..."));
          });
        }
        if (analysisTools.length > 0) {
          console.log('🔍 Search & Analysis Tools:');
          analysisTools.forEach(tool => {
            var _tool$description4;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description4 = tool.description) === null || _tool$description4 === void 0 ? void 0 : _tool$description4.substring(0, 60), "..."));
          });
        }
        if (otherTools.length > 0) {
          console.log('🔧 Other Tools:');
          otherTools.forEach(tool => {
            var _tool$description5;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description5 = tool.description) === null || _tool$description5 === void 0 ? void 0 : _tool$description5.substring(0, 60), "..."));
          });
        }
        console.log("\n\uD83E\uDD16 Claude will intelligently select from ".concat(this.availableTools.length, " total tools based on user queries"));
        // Debug: Check for duplicates
        this.debugToolDuplicates();
      }
      // Add these helper methods to MCPClientManager class
      isAidboxFHIRTool(tool) {
        const aidboxFHIRToolNames = ['searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient', 'getPatientObservations', 'createObservation', 'getPatientMedications', 'createMedicationRequest', 'getPatientConditions', 'createCondition', 'getPatientEncounters', 'createEncounter'];
        return aidboxFHIRToolNames.includes(tool.name);
      }
      isDocumentTool(tool) {
        const documentToolNames = ['uploadDocument', 'searchDocuments', 'listDocuments', 'chunkAndEmbedDocument', 'generateEmbeddingLocal'];
        return documentToolNames.includes(tool.name);
      }
      isAnalysisTool(tool) {
        const analysisToolNames = ['analyzePatientHistory', 'findSimilarCases', 'getMedicalInsights', 'extractMedicalEntities', 'semanticSearchLocal'];
        return analysisToolNames.includes(tool.name);
      }
      // Debug method to identify duplicate tools
      debugToolDuplicates() {
        const toolNames = this.availableTools.map(t => t.name);
        const nameCount = new Map();
        toolNames.forEach(name => {
          nameCount.set(name, (nameCount.get(name) || 0) + 1);
        });
        const duplicates = Array.from(nameCount.entries()).filter(_ref => {
          let [name, count] = _ref;
          return count > 1;
        });
        if (duplicates.length > 0) {
          console.error('❌ DUPLICATE TOOL NAMES FOUND:');
          duplicates.forEach(_ref2 => {
            let [name, count] = _ref2;
            console.error("  \u2022 ".concat(name, ": appears ").concat(count, " times"));
          });
        } else {
          console.log('✅ All tool names are unique');
        }
      }
      // Filter tools based on user's specified data source
      filterToolsByDataSource(tools, dataSource) {
        if (dataSource.toLowerCase().includes('mongodb') || dataSource.toLowerCase().includes('atlas')) {
          // User wants MongoDB/Atlas - return only document tools
          return tools.filter(tool => tool.name.includes('Document') || tool.name.includes('search') || tool.name.includes('upload') || tool.name.includes('extract') || tool.name.includes('Medical') || tool.name.includes('Similar') || tool.name.includes('Insight') || tool.name.includes('search') && !tool.name.includes('Patient'));
        }
        if (dataSource.toLowerCase().includes('aidbox') || dataSource.toLowerCase().includes('fhir')) {
          // User wants Aidbox - return only FHIR tools
          return tools.filter(tool => {
            var _tool$description6;
            return (tool.name.includes('Patient') || tool.name.includes('Observation') || tool.name.includes('Medication') || tool.name.includes('Condition') || tool.name.includes('Encounter') || tool.name === 'searchPatients') && !((_tool$description6 = tool.description) !== null && _tool$description6 !== void 0 && _tool$description6.toLowerCase().includes('epic'));
          });
        }
        if (dataSource.toLowerCase().includes('epic') || dataSource.toLowerCase().includes('ehr')) {
          // User wants Epic - return only Epic tools
          return tools.filter(tool => {
            var _tool$description7, _tool$description8;
            return ((_tool$description7 = tool.description) === null || _tool$description7 === void 0 ? void 0 : _tool$description7.toLowerCase().includes('epic')) || tool.name.includes('getPatientDetails') || tool.name.includes('getPatientObservations') || tool.name.includes('getPatientMedications') || tool.name.includes('getPatientConditions') || tool.name.includes('getPatientEncounters') || tool.name === 'searchPatients' && ((_tool$description8 = tool.description) === null || _tool$description8 === void 0 ? void 0 : _tool$description8.toLowerCase().includes('epic'));
          });
        }
        // No specific preference, return all tools
        return tools;
      }
      // Analyze query to understand user's intent about data sources
      analyzeQueryIntent(query) {
        const lowerQuery = query.toLowerCase();
        // Check for explicit data source mentions
        if (lowerQuery.includes('epic') || lowerQuery.includes('ehr')) {
          return {
            dataSource: 'Epic EHR',
            intent: 'Search Epic EHR patient data'
          };
        }
        if (lowerQuery.includes('mongodb') || lowerQuery.includes('atlas')) {
          return {
            dataSource: 'MongoDB Atlas',
            intent: 'Search uploaded documents and medical records'
          };
        }
        if (lowerQuery.includes('aidbox') || lowerQuery.includes('fhir')) {
          return {
            dataSource: 'Aidbox FHIR',
            intent: 'Search structured patient data'
          };
        }
        // Check for document-related terms
        if (lowerQuery.includes('document') || lowerQuery.includes('upload') || lowerQuery.includes('file')) {
          return {
            dataSource: 'MongoDB Atlas (documents)',
            intent: 'Work with uploaded medical documents'
          };
        }
        // Check for patient search patterns
        if (lowerQuery.includes('search for patient') || lowerQuery.includes('find patient')) {
          // Default to Epic for patient searches unless specified
          return {
            dataSource: 'Epic EHR',
            intent: 'Search for patient information'
          };
        }
        return {};
      }
      // Convert tools to Anthropic format with strict deduplication
      getAnthropicTools() {
        // Use Map to ensure uniqueness by tool name
        const uniqueTools = new Map();
        this.availableTools.forEach(tool => {
          if (!uniqueTools.has(tool.name)) {
            var _tool$inputSchema, _tool$inputSchema2;
            uniqueTools.set(tool.name, {
              name: tool.name,
              description: tool.description,
              input_schema: {
                type: "object",
                properties: ((_tool$inputSchema = tool.inputSchema) === null || _tool$inputSchema === void 0 ? void 0 : _tool$inputSchema.properties) || {},
                required: ((_tool$inputSchema2 = tool.inputSchema) === null || _tool$inputSchema2 === void 0 ? void 0 : _tool$inputSchema2.required) || []
              }
            });
          } else {
            console.warn("\u26A0\uFE0F Skipping duplicate tool in Anthropic format: ".concat(tool.name));
          }
        });
        const toolsArray = Array.from(uniqueTools.values());
        console.log("\uD83D\uDD27 Prepared ".concat(toolsArray.length, " unique tools for Anthropic (from ").concat(this.availableTools.length, " total)"));
        return toolsArray;
      }
      // Validate tools before sending to Anthropic (additional safety check)
      validateToolsForAnthropic() {
        const tools = this.getAnthropicTools();
        // Final check for duplicates
        const nameSet = new Set();
        const validTools = [];
        tools.forEach(tool => {
          if (!nameSet.has(tool.name)) {
            nameSet.add(tool.name);
            validTools.push(tool);
          } else {
            console.error("\uD83D\uDEA8 CRITICAL: Duplicate tool found in final validation: ".concat(tool.name));
          }
        });
        if (validTools.length !== tools.length) {
          console.warn("\uD83E\uDDF9 Removed ".concat(tools.length - validTools.length, " duplicate tools in final validation"));
        }
        console.log("\u2705 Final validation: ".concat(validTools.length, " unique tools ready for Anthropic"));
        return validTools;
      }
      async callMCPTool(toolName, args) {
        console.log("\uD83D\uDD27 Routing tool: ".concat(toolName, " with args:"), JSON.stringify(args, null, 2));
        // Epic tools - MUST go to Epic MCP Server (port 3003)
        const epicToolNames = ['epicSearchPatients', 'epicGetPatientDetails', 'epicGetPatientObservations', 'epicGetPatientMedications', 'epicGetPatientConditions', 'epicGetPatientEncounters', 'epicCreatePatient', 'epicCreateMedicationStatement'];
        if (epicToolNames.includes(toolName)) {
          if (!this.epicConnection) {
            throw new Error('Epic MCP Server not connected - cannot call Epic tools');
          }
          console.log("\uD83C\uDFE5 Routing ".concat(toolName, " to Epic MCP Server (port 3003)"));
          try {
            const result = await this.epicConnection.callTool(toolName, args);
            console.log("\u2705 Epic tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error("\u274C Epic tool ".concat(toolName, " failed:"), error);
            throw new Error("Epic tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        // Aidbox tools - MUST go to Aidbox MCP Server (port 3002)
        const aidboxToolNames = ['aidboxSearchPatients', 'aidboxGetPatientDetails', 'aidboxCreatePatient', 'aidboxUpdatePatient', 'aidboxGetPatientObservations', 'aidboxCreateObservation', 'aidboxGetPatientMedications', 'aidboxCreateMedicationRequest', 'aidboxGetPatientConditions', 'aidboxCreateCondition', 'aidboxGetPatientEncounters', 'aidboxCreateEncounter'];
        if (aidboxToolNames.includes(toolName)) {
          if (!this.aidboxConnection) {
            throw new Error('Aidbox MCP Server not connected - cannot call Aidbox tools');
          }
          console.log("\uD83C\uDFE5 Routing ".concat(toolName, " to Aidbox MCP Server (port 3002)"));
          try {
            const result = await this.aidboxConnection.callTool(toolName, args);
            console.log("\u2705 Aidbox tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error("\u274C Aidbox tool ".concat(toolName, " failed:"), error);
            throw new Error("Aidbox tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        const medicalToolNames = [
        // Document tools
        'uploadDocument', 'searchDocuments', 'listDocuments', 'generateEmbeddingLocal', 'chunkAndEmbedDocument',
        // Analysis tools
        'extractMedicalEntities', 'findSimilarCases', 'analyzePatientHistory', 'getMedicalInsights', 'semanticSearchLocal',
        // Legacy tools
        'upload_document', 'extract_text', 'extract_medical_entities', 'search_by_diagnosis', 'semantic_search', 'get_patient_summary'];
        if (medicalToolNames.includes(toolName)) {
          if (!this.medicalConnection) {
            throw new Error('Medical MCP Server not connected - cannot call medical/document tools');
          }
          console.log("\uD83D\uDCC4 Routing ".concat(toolName, " to Medical MCP Server (port 3001)"));
          try {
            const result = await this.medicalConnection.callTool(toolName, args);
            console.log("\u2705 Medical tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error("\u274C Medical tool ".concat(toolName, " failed:"), error);
            throw new Error("Medical tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        // Unknown tool - check if it exists in available tools
        const availableTool = this.availableTools.find(t => t.name === toolName);
        if (!availableTool) {
          const availableToolNames = this.availableTools.map(t => t.name).join(', ');
          throw new Error("Tool '".concat(toolName, "' is not available. Available tools: ").concat(availableToolNames));
        }
        console.warn("\u26A0\uFE0F Unknown tool routing for: ".concat(toolName, ". Defaulting to Medical server."));
        if (!this.medicalConnection) {
          throw new Error('Medical MCP Server not connected');
        }
        try {
          const result = await this.medicalConnection.callTool(toolName, args);
          console.log("\u2705 Tool ".concat(toolName, " completed successfully (default routing)"));
          return result;
        } catch (error) {
          console.error("\u274C Tool ".concat(toolName, " failed on default routing:"), error);
          throw new Error("Tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // Convenience method for Epic tool calls
      async callEpicTool(toolName, args) {
        if (!this.epicConnection) {
          throw new Error('Epic MCP Server not connected');
        }
        try {
          console.log("\uD83C\uDFE5 Calling Epic tool: ".concat(toolName), args);
          const result = await this.epicConnection.callTool(toolName, args);
          console.log("\u2705 Epic tool ".concat(toolName, " completed successfully"));
          return result;
        } catch (error) {
          console.error("\u274C Epic tool ".concat(toolName, " failed:"), error);
          throw error;
        }
      }
      // Health check for all servers
      async healthCheck() {
        const health = {
          epic: false,
          aidbox: false,
          medical: false
        };
        // Check Epic server
        if (this.epicConnection) {
          try {
            const epicHealth = await fetch('http://localhost:3003/health');
            health.epic = epicHealth.ok;
          } catch (error) {
            console.warn('Epic health check failed:', error);
          }
        }
        // Check Aidbox server
        if (this.aidboxConnection) {
          try {
            const aidboxHealth = await fetch('http://localhost:3002/health');
            health.aidbox = aidboxHealth.ok;
          } catch (error) {
            console.warn('Aidbox health check failed:', error);
          }
        }
        // Check Medical server
        if (this.medicalConnection) {
          try {
            const medicalHealth = await fetch('http://localhost:3005/health');
            health.medical = medicalHealth.ok;
          } catch (error) {
            console.warn('Medical health check failed:', error);
          }
        }
        return health;
      }
      // Main intelligent query processing method with conversation context support
      async processQueryWithIntelligentToolSelection(query, context) {
        if (!this.isInitialized || !this.config) {
          throw new Error('MCP Client not initialized');
        }
        console.log("\uD83D\uDD0D Processing query with intelligent tool selection: \"".concat(query, "\""));
        try {
          if (this.config.provider === 'anthropic' && this.anthropic) {
            return await this.processWithAnthropicIntelligent(query, context);
          } else if (this.config.provider === 'ozwell') {
            return await this.processWithOzwellIntelligent(query, context);
          }
          throw new Error('No LLM provider configured');
        } catch (error) {
          var _error$message, _error$message2, _error$message3;
          console.error('Error processing query with intelligent tool selection:', error);
          // Handle specific error types
          if (error.status === 529 || (_error$message = error.message) !== null && _error$message !== void 0 && _error$message.includes('Overloaded')) {
            return 'I\'m experiencing high demand right now. Please try your query again in a moment. The system should respond normally after a brief wait.';
          }
          if ((_error$message2 = error.message) !== null && _error$message2 !== void 0 && _error$message2.includes('not connected')) {
            return 'I\'m having trouble connecting to the medical data systems. Please ensure the MCP servers are running and try again.';
          }
          if ((_error$message3 = error.message) !== null && _error$message3 !== void 0 && _error$message3.includes('API')) {
            return 'I encountered an API error while processing your request. Please try again in a moment.';
          }
          // For development/debugging
          if (process.env.NODE_ENV === 'development') {
            return "Error: ".concat(error.message);
          }
          return 'I encountered an error while processing your request. Please try rephrasing your question or try again in a moment.';
        }
      }
      // *** FIXED: Anthropic native tool calling with conversation context support ***
      async processWithAnthropicIntelligent(query, context) {
        // Use validated tools to prevent duplicate errors
        let tools = this.validateToolsForAnthropic();
        // Analyze query to understand data source intent
        const queryIntent = this.analyzeQueryIntent(query);
        // Filter tools based on user's explicit data source preference
        if (queryIntent.dataSource) {
          tools = this.filterToolsByDataSource(tools, queryIntent.dataSource);
          console.log("\uD83C\uDFAF Filtered to ".concat(tools.length, " tools based on data source: ").concat(queryIntent.dataSource));
          console.log("\uD83D\uDD27 Available tools after filtering: ".concat(tools.map(t => t.name).join(', ')));
        }
        // Build context information including conversation history
        let contextInfo = '';
        if (context !== null && context !== void 0 && context.patientId) {
          contextInfo += "\nCurrent patient context: ".concat(context.patientId);
        }
        if (context !== null && context !== void 0 && context.sessionId) {
          contextInfo += "\nSession context available";
        }
        // Add query intent to context
        if (queryIntent.dataSource) {
          contextInfo += "\nUser specified data source: ".concat(queryIntent.dataSource);
        }
        if (queryIntent.intent) {
          contextInfo += "\nQuery intent: ".concat(queryIntent.intent);
        }
        // *** FIX: Add conversation context to system prompt ***
        let conversationContextPrompt = '';
        if (context !== null && context !== void 0 && context.conversationContext) {
          const {
            ContextManager
          } = await module.dynamicImport('../context/contextManager');
          conversationContextPrompt = "\n\n**CONVERSATION CONTEXT:**\n".concat(ContextManager.buildContextPrompt(context.conversationContext), "\n\n**IMPORTANT:** Use this conversation history to understand the context of the current query. If the user is referring to something from a previous message (like a patient they just created, or asking for follow-up actions), reference the conversation history to provide contextually appropriate responses.\n\nFor example:\n- If they previously created a patient named \"Kalyan\" and now say \"medications: dolo\", add the medication to Kalyan's record\n- If they asked about a specific patient and now ask for \"lab results\", get lab results for that patient\n- Use patient IDs and context from previous messages when available");
        }
        const systemPrompt = "You are a medical AI assistant with access to multiple healthcare data systems:\n\n\uD83C\uDFE5 **Epic EHR Tools** - For Epic EHR patient data, observations, medications, conditions, encounters\n\uD83C\uDFE5 **Aidbox FHIR Tools** - For FHIR-compliant patient data, observations, medications, conditions, encounters  \n\uD83D\uDCC4 **Medical Document Tools** - For document upload, search, and medical entity extraction (MongoDB Atlas)\n\uD83D\uDD0D **Semantic Search** - For finding similar cases and medical insights (MongoDB Atlas)\n\n**CRITICAL: Pay attention to which data source the user mentions:**\n\n- If user mentions \"Epic\" or \"EHR\" \u2192 Use Epic EHR tools\n- If user mentions \"Aidbox\" or \"FHIR\" \u2192 Use Aidbox FHIR tools\n- If user mentions \"MongoDB\", \"Atlas\", \"documents\", \"uploaded files\" \u2192 Use document search tools\n- If user mentions \"diagnosis in MongoDB\" \u2192 Search documents, NOT Epic/Aidbox\n- If no specific source mentioned \u2192 Choose based on context (Epic for patient searches, Aidbox for FHIR, documents for uploads)\n\n**Available Context:**".concat(contextInfo).concat(conversationContextPrompt, "\n\n**Instructions:**\n1. **LISTEN TO USER'S DATA SOURCE PREFERENCE** - If they say Epic, use Epic tools; if MongoDB/Atlas, use document tools\n2. **USE CONVERSATION HISTORY** - If user refers to something from previous messages, use that context\n3. For Epic/Aidbox queries, use patient search first to get IDs, then specific data tools\n4. For document queries, use search and upload tools\n5. Provide clear, helpful medical information\n6. Always explain what data sources you're using\n\nBe intelligent about tool selection AND respect the user's specified data source. Pay special attention to follow-up questions that reference previous conversation.");
        let conversationHistory = [{
          role: 'user',
          content: query
        }];
        let finalResponse = '';
        let iterations = 0;
        const maxIterations = 7; // Reduced to avoid API overload
        const maxRetries = 3;
        while (iterations < maxIterations) {
          console.log("\uD83D\uDD04 Iteration ".concat(iterations + 1, " - Asking Claude to decide on tools"));
          console.log("\uD83D\uDD27 Using ".concat(tools.length, " validated tools"));
          let retryCount = 0;
          let response;
          // Add retry logic for API overload
          while (retryCount < maxRetries) {
            try {
              response = await this.anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                // Reduced to avoid overload
                system: systemPrompt,
                messages: conversationHistory,
                tools: tools,
                tool_choice: {
                  type: 'auto'
                }
              });
              break; // Success, exit retry loop
            } catch (error) {
              if (error.status === 529 && retryCount < maxRetries - 1) {
                retryCount++;
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                console.warn("\u26A0\uFE0F Anthropic API overloaded, retrying in ".concat(delay, "ms (attempt ").concat(retryCount, "/").concat(maxRetries, ")"));
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw error; // Re-throw if not retryable or max retries reached
              }
            }
          }
          if (!response) {
            throw new Error('Failed to get response from Anthropic after retries');
          }
          let hasToolUse = false;
          let assistantResponse = [];
          for (const content of response.content) {
            assistantResponse.push(content);
            if (content.type === 'text') {
              finalResponse += content.text;
              console.log("\uD83E\uDD16 Claude says: ".concat(content.text.substring(0, 100), "..."));
            } else if (content.type === 'tool_use') {
              hasToolUse = true;
              console.log("\uD83D\uDD27 Claude chose tool: ".concat(content.name, " with args:"), content.input);
              try {
                const toolResult = await this.callMCPTool(content.name, content.input);
                console.log("\u2705 Tool ".concat(content.name, " executed successfully"));
                // Add tool result to conversation
                conversationHistory.push({
                  role: 'assistant',
                  content: assistantResponse
                });
                conversationHistory.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: content.id,
                    content: this.formatToolResult(toolResult)
                  }]
                });
              } catch (error) {
                console.error("\u274C Tool ".concat(content.name, " failed:"), error);
                conversationHistory.push({
                  role: 'assistant',
                  content: assistantResponse
                });
                conversationHistory.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: content.id,
                    content: "Error executing tool: ".concat(error.message),
                    is_error: true
                  }]
                });
              }
              finalResponse = '';
              break; // Process one tool at a time
            }
          }
          if (!hasToolUse) {
            // Claude didn't use any tools, so it's providing a final answer
            console.log('✅ Claude provided final answer without additional tools');
            break;
          }
          iterations++;
        }
        if (iterations >= maxIterations) {
          finalResponse += '\n\n*Note: Reached maximum tool iterations. Response may be incomplete.*';
        }
        return finalResponse || 'I was unable to process your request completely.';
      }
      // Format tool results for Claude
      formatToolResult(result) {
        try {
          var _result$content, _result$content$;
          // Handle different result formats
          if (result !== null && result !== void 0 && (_result$content = result.content) !== null && _result$content !== void 0 && (_result$content$ = _result$content[0]) !== null && _result$content$ !== void 0 && _result$content$.text) {
            return result.content[0].text;
          }
          if (typeof result === 'string') {
            return result;
          }
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return "Tool result formatting error: ".concat(error.message);
        }
      }
      // Ozwell implementation with intelligent prompting
      async processWithOzwellIntelligent(query, context) {
        var _this$config;
        const endpoint = ((_this$config = this.config) === null || _this$config === void 0 ? void 0 : _this$config.ozwellEndpoint) || 'https://ai.bluehive.com/api/v1/completion';
        const availableToolsDescription = this.availableTools.map(tool => "".concat(tool.name, ": ").concat(tool.description)).join('\n');
        // *** FIX: Add conversation context for Ozwell too ***
        let conversationContextPrompt = '';
        if (context !== null && context !== void 0 && context.conversationContext) {
          const {
            ContextManager
          } = await module.dynamicImport('../context/contextManager');
          conversationContextPrompt = "\n\nConversation Context:\n".concat(ContextManager.buildContextPrompt(context.conversationContext));
        }
        const systemPrompt = "You are a medical AI assistant with access to these tools:\n\n".concat(availableToolsDescription, "\n\nThe user's query is: \"").concat(query, "\"").concat(conversationContextPrompt, "\n\nBased on this query and any conversation context, determine what tools (if any) you need to use and provide a helpful response. If you need to use tools, explain what you would do, but note that in this mode you cannot actually execute tools.");
        try {
          var _this$config2, _data$choices, _data$choices$;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': "Bearer ".concat((_this$config2 = this.config) === null || _this$config2 === void 0 ? void 0 : _this$config2.apiKey)
            },
            body: JSON.stringify({
              prompt: systemPrompt,
              max_tokens: 1000,
              temperature: 0.7,
              stream: false
            })
          });
          if (!response.ok) {
            throw new Error("Ozwell API error: ".concat(response.status, " ").concat(response.statusText));
          }
          const data = await response.json();
          return ((_data$choices = data.choices) === null || _data$choices === void 0 ? void 0 : (_data$choices$ = _data$choices[0]) === null || _data$choices$ === void 0 ? void 0 : _data$choices$.text) || data.completion || data.response || 'No response generated';
        } catch (error) {
          console.error('Ozwell API error:', error);
          throw new Error("Failed to get response from Ozwell: ".concat(error));
        }
      }
      // Backward compatibility methods
      async processQueryWithMedicalContext(query, context) {
        // Route to intelligent tool selection
        return this.processQueryWithIntelligentToolSelection(query, context);
      }
      // Utility methods
      getAvailableTools() {
        return this.availableTools;
      }
      isToolAvailable(toolName) {
        return this.availableTools.some(tool => tool.name === toolName);
      }
      getMedicalOperations() {
        if (!this.medicalOperations) {
          throw new Error('Medical MCP server not connected');
        }
        return this.medicalOperations;
      }
      getEpicOperations() {
        return this.epicOperations;
      }
      getAidboxOperations() {
        return this.aidboxOperations;
      }
      // Provider switching methods
      async switchProvider(provider) {
        if (!this.config) {
          throw new Error('MCP Client not initialized');
        }
        this.config.provider = provider;
        console.log("\uD83D\uDD04 Switched to ".concat(provider.toUpperCase(), " provider with intelligent tool selection"));
      }
      getCurrentProvider() {
        var _this$config3;
        return (_this$config3 = this.config) === null || _this$config3 === void 0 ? void 0 : _this$config3.provider;
      }
      getAvailableProviders() {
        var _global$Meteor4, _global$Meteor4$setti;
        const settings = (_global$Meteor4 = global.Meteor) === null || _global$Meteor4 === void 0 ? void 0 : (_global$Meteor4$setti = _global$Meteor4.settings) === null || _global$Meteor4$setti === void 0 ? void 0 : _global$Meteor4$setti.private;
        const anthropicKey = (settings === null || settings === void 0 ? void 0 : settings.ANTHROPIC_API_KEY) || process.env.ANTHROPIC_API_KEY;
        const ozwellKey = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_API_KEY) || process.env.OZWELL_API_KEY;
        const providers = [];
        if (anthropicKey) providers.push('anthropic');
        if (ozwellKey) providers.push('ozwell');
        return providers;
      }
      isReady() {
        return this.isInitialized;
      }
      getConfig() {
        return this.config;
      }
      async shutdown() {
        console.log('🛑 Shutting down MCP Clients...');
        if (this.medicalConnection) {
          this.medicalConnection.disconnect();
        }
        if (this.aidboxConnection) {
          this.aidboxConnection.disconnect();
        }
        if (this.epicConnection) {
          this.epicConnection.disconnect();
        }
        this.isInitialized = false;
      }
    }
    MCPClientManager.instance = void 0;
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"medicalServerConnection.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/mcp/medicalServerConnection.ts                                                                        //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    module.export({
      MedicalServerConnection: () => MedicalServerConnection,
      createMedicalOperations: () => createMedicalOperations
    });
    class MedicalServerConnection {
      constructor() {
        let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http://localhost:3005';
        this.baseUrl = void 0;
        this.sessionId = null;
        this.isInitialized = false;
        this.requestId = 1;
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
      }
      async connect() {
        try {
          var _toolsResult$tools;
          console.log(" Connecting to Medical MCP Server at: ".concat(this.baseUrl));
          // Test if server is running
          const healthCheck = await this.checkServerHealth();
          if (!healthCheck.ok) {
            throw new Error("MCP Server not responding at ".concat(this.baseUrl, ". Please ensure it's running in HTTP mode."));
          }
          // Initialize the connection with proper MCP protocol using Streamable HTTP
          const initResult = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
              roots: {
                listChanged: false
              }
            },
            clientInfo: {
              name: 'meteor-medical-client',
              version: '1.0.0'
            }
          });
          console.log(' MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('notifications/initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log("MCP Streamable HTTP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log(' Available tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error(' Failed to connect to MCP Server via Streamable HTTP:', error);
          throw error;
        }
      }
      async checkServerHealth() {
        try {
          const response = await fetch("".concat(this.baseUrl, "/health"), {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (response.ok) {
            const health = await response.json();
            console.log(' MCP Server health check passed:', health);
            return {
              ok: true
            };
          } else {
            return {
              ok: false,
              error: "Server returned ".concat(response.status)
            };
          }
        } catch (error) {
          return {
            ok: false,
            error: error.message
          };
        }
      }
      async sendRequest(method, params) {
        if (!this.baseUrl) {
          throw new Error('MCP Server not connected');
        }
        const id = this.requestId++;
        const request = {
          jsonrpc: '2.0',
          method,
          params,
          id
        };
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream' // Streamable HTTP: Must accept both JSON and SSE
          };
          // Add session ID if we have one (Streamable HTTP session management)
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          console.log(" Sending Streamable HTTP request: ".concat(method), {
            id,
            sessionId: this.sessionId
          });
          const response = await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(30000) // 30 second timeout
          });
          // Extract session ID from response headers if present (Streamable HTTP session management)
          const responseSessionId = response.headers.get('mcp-session-id');
          if (responseSessionId && !this.sessionId) {
            this.sessionId = responseSessionId;
            console.log(' Received session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          // Check content type - Streamable HTTP should return JSON for most responses
          const contentType = response.headers.get('content-type');
          // Handle SSE upgrade (optional in Streamable HTTP for streaming responses)
          if (contentType && contentType.includes('text/event-stream')) {
            console.log(' Server upgraded to SSE for streaming response');
            return await this.handleStreamingResponse(response);
          }
          // Standard JSON response
          if (!contentType || !contentType.includes('application/json')) {
            const responseText = await response.text();
            console.error(' Unexpected content type:', contentType);
            console.error(' Response text:', responseText.substring(0, 200));
            throw new Error("Expected JSON response but got ".concat(contentType));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log(" Streamable HTTP request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error(" Streamable HTTP request failed for method ".concat(method, ":"), error);
          throw error;
        }
      }
      async handleStreamingResponse(response) {
        // Handle SSE streaming response (optional part of Streamable HTTP)
        return new Promise((resolve, reject) => {
          var _response$body;
          const reader = (_response$body = response.body) === null || _response$body === void 0 ? void 0 : _response$body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let result = null;
          const processChunk = async () => {
            try {
              const {
                done,
                value
              } = await reader.read();
              if (done) {
                if (result) {
                  resolve(result);
                } else {
                  reject(new Error('No result received from streaming response'));
                }
                return;
              }
              buffer += decoder.decode(value, {
                stream: true
              });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = line.slice(6); // Remove 'data: ' prefix
                    if (data === '[DONE]') {
                      resolve(result);
                      return;
                    }
                    const parsed = JSON.parse(data);
                    if (parsed.result) {
                      result = parsed.result;
                    } else if (parsed.error) {
                      reject(new Error(parsed.error.message));
                      return;
                    }
                  } catch (e) {
                    // Skip invalid JSON lines
                    console.warn('Failed to parse SSE data:', data);
                  }
                }
              }
              // Continue reading
              processChunk();
            } catch (error) {
              reject(error);
            }
          };
          processChunk();
          // Timeout for streaming responses
          setTimeout(() => {
            reader === null || reader === void 0 ? void 0 : reader.cancel();
            reject(new Error('Streaming response timeout'));
          }, 60000); // 60 second timeout for streaming
        });
      }
      async sendNotification(method, params) {
        const notification = {
          jsonrpc: '2.0',
          method,
          params
        };
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
          };
          if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
          }
          console.log(" Sending notification: ".concat(method), {
            sessionId: this.sessionId
          });
          const response = await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(notification),
            signal: AbortSignal.timeout(10000)
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error("Notification ".concat(method, " failed: ").concat(response.status, " - ").concat(errorText));
            throw new Error("Notification ".concat(method, " failed: ").concat(response.status, " - ").concat(errorText));
          } else {
            console.log(" Notification ".concat(method, " sent successfully"));
          }
        } catch (error) {
          console.error("Notification ".concat(method, " failed:"), error);
          throw error; // Re-throw to stop initialization if notification fails
        }
      }
      async listTools() {
        if (!this.isInitialized) {
          throw new Error('MCP Server not initialized');
        }
        return this.sendRequest('tools/list', {});
      }
      async callTool(name, args) {
        if (!this.isInitialized) {
          throw new Error('MCP Server not initialized');
        }
        return this.sendRequest('tools/call', {
          name,
          arguments: args
        });
      }
      disconnect() {
        // For Streamable HTTP, we can optionally send a DELETE request to clean up the session
        if (this.sessionId) {
          try {
            fetch("".concat(this.baseUrl, "/mcp"), {
              method: 'DELETE',
              headers: {
                'mcp-session-id': this.sessionId,
                'Content-Type': 'application/json'
              }
            }).catch(() => {
              // Ignore errors on disconnect
            });
          } catch (error) {
            // Ignore errors on disconnect
          }
        }
        this.sessionId = null;
        this.isInitialized = false;
        console.log('📋 Disconnected from MCP Server');
      }
    }
    function createMedicalOperations(connection) {
      return {
        // New tool methods using the exact tool names from your server
        async uploadDocument(file, filename, mimeType, metadata) {
          const result = await connection.callTool('uploadDocument', {
            title: filename,
            fileBuffer: file.toString('base64'),
            metadata: _objectSpread(_objectSpread({}, metadata), {}, {
              fileType: mimeType.split('/')[1] || 'unknown',
              size: file.length
            })
          });
          // Parse the result if it's in the content array format
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async searchDocuments(query) {
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('searchDocuments', {
            query,
            limit: options.limit || 10,
            threshold: options.threshold || 0.7,
            filter: options.filter || {}
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async listDocuments() {
          let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
          const result = await connection.callTool('listDocuments', {
            limit: options.limit || 20,
            offset: options.offset || 0,
            filter: options.filter || {}
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async extractMedicalEntities(text, documentId) {
          const result = await connection.callTool('extractMedicalEntities', {
            text,
            documentId
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async findSimilarCases(criteria) {
          const result = await connection.callTool('findSimilarCases', criteria);
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async analyzePatientHistory(patientId) {
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('analyzePatientHistory', {
            patientId,
            analysisType: options.analysisType || 'summary',
            dateRange: options.dateRange
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        async getMedicalInsights(query) {
          let context = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getMedicalInsights', {
            query,
            context,
            limit: context.limit || 5
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              return JSON.parse(result.content[0].text);
            } catch (e) {
              return result;
            }
          }
          return result;
        },
        // Legacy compatibility methods
        async extractText(documentId) {
          // This might not exist as a separate tool, try to get document content
          const result = await connection.callTool('listDocuments', {
            filter: {
              _id: documentId
            },
            limit: 1
          });
          if (result.content && result.content[0] && result.content[0].text) {
            try {
              const parsed = JSON.parse(result.content[0].text);
              if (parsed.documents && parsed.documents[0]) {
                return {
                  success: true,
                  extractedText: parsed.documents[0].content,
                  confidence: 100
                };
              }
            } catch (e) {
              // fallback
            }
          }
          throw new Error('Text extraction not supported - use document content from upload result');
        },
        async searchByDiagnosis(patientIdentifier, diagnosisQuery, sessionId) {
          return await this.searchDocuments(diagnosisQuery || patientIdentifier, {
            filter: {
              patientId: patientIdentifier
            },
            limit: 10
          });
        },
        async semanticSearch(query, patientId) {
          return await this.searchDocuments(query, {
            filter: patientId ? {
              patientId
            } : {},
            limit: 5
          });
        },
        async getPatientSummary(patientIdentifier) {
          return await this.analyzePatientHistory(patientIdentifier, {
            analysisType: 'summary'
          });
        }
      };
    }
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"messages":{"messages.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/messages/messages.ts                                                                                  //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      MessagesCollection: () => MessagesCollection
    });
    let Mongo;
    module.link("meteor/mongo", {
      Mongo(v) {
        Mongo = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const MessagesCollection = new Mongo.Collection('messages');
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"methods.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/messages/methods.ts                                                                                   //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    module.export({
      extractAndUpdateContext: () => extractAndUpdateContext,
      extractMedicalTermsFromResponse: () => extractMedicalTermsFromResponse,
      extractDataSources: () => extractDataSources,
      extractMedications: () => extractMedications,
      sanitizePatientName: () => sanitizePatientName
    });
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let check, Match;
    module.link("meteor/check", {
      check(v) {
        check = v;
      },
      Match(v) {
        Match = v;
      }
    }, 1);
    let MessagesCollection;
    module.link("./messages", {
      MessagesCollection(v) {
        MessagesCollection = v;
      }
    }, 2);
    let SessionsCollection;
    module.link("../sessions/sessions", {
      SessionsCollection(v) {
        SessionsCollection = v;
      }
    }, 3);
    let MCPClientManager;
    module.link("/imports/api/mcp/mcpClientManager", {
      MCPClientManager(v) {
        MCPClientManager = v;
      }
    }, 4);
    let ContextManager;
    module.link("../context/contextManager", {
      ContextManager(v) {
        ContextManager = v;
      }
    }, 5);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // Meteor Methods
    Meteor.methods({
      async 'messages.insert'(messageData) {
        check(messageData, {
          content: String,
          role: String,
          timestamp: Date,
          sessionId: String
        });
        const messageId = await MessagesCollection.insertAsync(messageData);
        // Update context if session exists
        if (messageData.sessionId) {
          await ContextManager.updateContext(messageData.sessionId, _objectSpread(_objectSpread({}, messageData), {}, {
            _id: messageId
          }));
          // Update session
          await SessionsCollection.updateAsync(messageData.sessionId, {
            $set: {
              lastMessage: messageData.content.substring(0, 100),
              updatedAt: new Date()
            },
            $inc: {
              messageCount: 1
            }
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
      // *** FIXED: Main query processing method with proper context handling ***
      async 'medical.processQueryWithIntelligentToolSelection'(query, sessionId) {
        check(query, String);
        check(sessionId, Match.Maybe(String));
        if (!this.isSimulation) {
          const mcpManager = MCPClientManager.getInstance();
          if (!mcpManager.isReady()) {
            return 'MCP Client is not ready. Please check your API configuration.';
          }
          try {
            console.log("\uD83D\uDD0D Processing query with intelligent tool selection: \"".concat(query, "\""));
            // Build context for the query
            const context = {
              sessionId
            };
            if (sessionId) {
              var _session$metadata;
              // Get session context
              const session = await SessionsCollection.findOneAsync(sessionId);
              if (session !== null && session !== void 0 && (_session$metadata = session.metadata) !== null && _session$metadata !== void 0 && _session$metadata.patientId) {
                context.patientId = session.metadata.patientId;
              }
              // *** FIX: Get conversation context and pass it properly ***
              const contextData = await ContextManager.getContext(sessionId);
              context.conversationContext = contextData;
              console.log("\uD83D\uDCDD Loaded conversation context: ".concat(contextData.recentMessages.length, " messages, patient: ").concat(contextData.patientContext || 'none'));
            }
            // Let Claude intelligently decide what tools to use (includes Epic tools)
            const response = await mcpManager.processQueryWithIntelligentToolSelection(query, context);
            // *** FIX: Update context after processing to include new messages ***
            if (sessionId) {
              // Create message objects for context tracking (these aren't saved to DB yet)
              const userMessage = {
                _id: '',
                // Temporary ID
                content: query,
                role: 'user',
                timestamp: new Date(),
                sessionId
              };
              const assistantMessage = {
                _id: '',
                // Temporary ID
                content: response,
                role: 'assistant',
                timestamp: new Date(),
                sessionId
              };
              // Update context with both messages
              await ContextManager.updateContext(sessionId, userMessage);
              await ContextManager.updateContext(sessionId, assistantMessage);
              // Extract and update context metadata
              await extractAndUpdateContext(query, response, sessionId);
              console.log("\u2705 Updated conversation context for session ".concat(sessionId));
            }
            return response;
          } catch (error) {
            console.error('❌ Intelligent MCP processing error:', error);
            // Provide helpful error messages based on the error type
            if (error.message.includes('not connected')) {
              return 'I\'m having trouble connecting to the medical data systems. Please ensure the MCP servers are running and try again.';
            } else if (error.message.includes('Epic MCP Server')) {
              return 'I\'m having trouble connecting to the Epic EHR system. Please ensure the Epic MCP server is running and properly configured.';
            } else if (error.message.includes('Aidbox')) {
              return 'I\'m having trouble connecting to the Aidbox FHIR system. Please ensure the Aidbox MCP server is running and properly configured.';
            } else if (error.message.includes('API')) {
              return 'I encountered an API error while processing your request. Please try again in a moment.';
            } else {
              return 'I encountered an error while processing your request. Please try rephrasing your question or contact support if the issue persists.';
            }
          }
        }
        return 'Simulation mode - no actual processing';
      },
      // *** ADDED: Backward compatibility method ***
      async 'mcp.processQuery'(query, sessionId) {
        // Route to the main method
        return await Meteor.call('medical.processQueryWithIntelligentToolSelection', query, sessionId);
      },
      async 'mcp.switchProvider'(provider) {
        check(provider, String);
        if (!this.isSimulation) {
          const mcpManager = MCPClientManager.getInstance();
          if (!mcpManager.isReady()) {
            throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
          }
          try {
            await mcpManager.switchProvider(provider);
            return "Switched to ".concat(provider.toUpperCase(), " provider with intelligent tool selection");
          } catch (error) {
            console.error('Provider switch error:', error);
            throw new Meteor.Error('switch-failed', "Failed to switch provider: ".concat(error.message));
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
        var _Meteor$settings;
        if (!this.isSimulation) {
          const mcpManager = MCPClientManager.getInstance();
          if (!mcpManager.isReady()) {
            return [];
          }
          return mcpManager.getAvailableProviders();
        }
        // Fallback for simulation
        const settings = (_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : _Meteor$settings.private;
        const anthropicKey = (settings === null || settings === void 0 ? void 0 : settings.ANTHROPIC_API_KEY) || process.env.ANTHROPIC_API_KEY;
        const ozwellKey = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_API_KEY) || process.env.OZWELL_API_KEY;
        const providers = [];
        if (anthropicKey) providers.push('anthropic');
        if (ozwellKey) providers.push('ozwell');
        return providers;
      },
      'mcp.getAvailableTools'() {
        if (!this.isSimulation) {
          const mcpManager = MCPClientManager.getInstance();
          if (!mcpManager.isReady()) {
            return [];
          }
          return mcpManager.getAvailableTools();
        }
        return [];
      },
      // Server health check method - includes Epic
      async 'mcp.healthCheck'() {
        if (this.isSimulation) {
          return {
            status: 'healthy',
            message: 'All systems operational (simulation mode)',
            servers: {
              epic: 'simulated',
              aidbox: 'simulated',
              medical: 'simulated'
            }
          };
        }
        const mcpManager = MCPClientManager.getInstance();
        if (!mcpManager.isReady()) {
          return {
            status: 'error',
            message: 'MCP Client not ready',
            servers: {}
          };
        }
        try {
          const health = await mcpManager.healthCheck();
          return {
            status: 'healthy',
            message: 'Health check completed',
            servers: {
              epic: health.epic ? 'healthy' : 'unavailable',
              aidbox: health.aidbox ? 'healthy' : 'unavailable',
              medical: health.medical ? 'healthy' : 'unavailable'
            },
            timestamp: new Date()
          };
        } catch (error) {
          return {
            status: 'error',
            message: "Health check failed: ".concat(error.message),
            servers: {},
            timestamp: new Date()
          };
        }
      },
      // Medical document methods (existing)
      async 'medical.uploadDocument'(fileData) {
        check(fileData, {
          filename: String,
          content: String,
          mimeType: String,
          patientName: Match.Maybe(String),
          sessionId: Match.Maybe(String)
        });
        console.log("\uD83D\uDCC4 Upload request for: ".concat(fileData.filename, " (").concat(fileData.mimeType, ")"));
        console.log("\uD83D\uDCCA Content size: ".concat(fileData.content.length, " chars"));
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
          console.error('❌ MCP Client not ready');
          throw new Meteor.Error('mcp-not-ready', 'Medical document system is not available. Please contact administrator.');
        }
        try {
          var _this$connection;
          // Validate base64 content
          if (!fileData.content || fileData.content.length === 0) {
            throw new Error('File content is empty');
          }
          // Validate file size (base64 encoded, so actual file is ~75% of this)
          const estimatedFileSize = fileData.content.length * 3 / 4;
          if (estimatedFileSize > 10 * 1024 * 1024) {
            throw new Error('File too large (max 10MB)');
          }
          console.log("\uD83D\uDCCF Estimated file size: ".concat(Math.round(estimatedFileSize / 1024), "KB"));
          const medical = mcpManager.getMedicalOperations();
          // Convert base64 back to buffer for MCP server
          const fileBuffer = Buffer.from(fileData.content, 'base64');
          const result = await medical.uploadDocument(fileBuffer, fileData.filename, fileData.mimeType, {
            patientName: fileData.patientName || 'Unknown Patient',
            sessionId: fileData.sessionId || ((_this$connection = this.connection) === null || _this$connection === void 0 ? void 0 : _this$connection.id) || 'default',
            uploadedBy: this.userId || 'anonymous',
            uploadDate: new Date().toISOString()
          });
          console.log('✅ MCP upload successful:', result);
          // Update session metadata if we have session ID
          if (fileData.sessionId && result.documentId) {
            try {
              await SessionsCollection.updateAsync(fileData.sessionId, {
                $addToSet: {
                  'metadata.documentIds': result.documentId
                },
                $set: {
                  'metadata.patientId': fileData.patientName || 'Unknown Patient',
                  'metadata.lastUpload': new Date()
                }
              });
              console.log('✅ Session metadata updated');
            } catch (updateError) {
              console.warn('⚠️ Failed to update session metadata:', updateError);
              // Don't fail the whole operation for this
            }
          }
          return result;
        } catch (error) {
          var _error$message, _error$message2, _error$message3, _error$message4, _error$message5;
          console.error('❌ Document upload error:', error);
          // Provide specific error messages
          if ((_error$message = error.message) !== null && _error$message !== void 0 && _error$message.includes('not connected') || (_error$message2 = error.message) !== null && _error$message2 !== void 0 && _error$message2.includes('ECONNREFUSED')) {
            throw new Meteor.Error('medical-server-offline', 'Medical document server is not available. Please contact administrator.');
          } else if ((_error$message3 = error.message) !== null && _error$message3 !== void 0 && _error$message3.includes('File too large')) {
            throw new Meteor.Error('file-too-large', 'File is too large. Maximum size is 10MB.');
          } else if ((_error$message4 = error.message) !== null && _error$message4 !== void 0 && _error$message4.includes('Invalid file type')) {
            throw new Meteor.Error('invalid-file-type', 'Invalid file type. Please use PDF or image files only.');
          } else if ((_error$message5 = error.message) !== null && _error$message5 !== void 0 && _error$message5.includes('timeout')) {
            throw new Meteor.Error('upload-timeout', 'Upload timed out. Please try again with a smaller file.');
          } else {
            throw new Meteor.Error('upload-failed', "Upload failed: ".concat(error.message || 'Unknown error'));
          }
        }
      },
      async 'medical.processDocument'(documentId, sessionId) {
        check(documentId, String);
        check(sessionId, Match.Maybe(String));
        if (this.isSimulation) {
          return {
            success: true,
            message: 'Document processed (simulation mode)',
            textExtraction: {
              extractedText: 'Sample text',
              confidence: 95
            },
            medicalEntities: {
              entities: [],
              summary: {
                diagnosisCount: 0,
                medicationCount: 0,
                labResultCount: 0
              }
            }
          };
        }
        const mcpManager = MCPClientManager.getInstance();
        if (!mcpManager.isReady()) {
          throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
        }
        try {
          const medical = mcpManager.getMedicalOperations();
          // Process document using intelligent tool selection
          const result = await medical.extractMedicalEntities('', documentId);
          return result;
        } catch (error) {
          console.error('❌ Document processing error:', error);
          throw new Meteor.Error('processing-failed', "Failed to process document: ".concat(error.message || 'Unknown error'));
        }
      }
    });
    // *** ENHANCED: Helper function to extract and update context ***
    async function extractAndUpdateContext(query, response, sessionId) {
      try {
        // Extract patient name/ID from query or response
        const patientPatterns = [/(?:patient|for|create.*patient.*named?)\s+"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"?/i, /(?:patient|create)\s+named?\s+"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"?/i, /(?:Patient ID|Patient|patientId):\s*"?([A-Za-z0-9\-_]+)"?/i, /"patientId":\s*"([^"]+)"/i, /(?:created.*patient|patient.*created).*"([^"]+)"/i, /Patient:\s*([A-Za-z0-9\-_\s]+)/i];
        let patientId = null;
        for (const pattern of patientPatterns) {
          const match = query.match(pattern) || response.match(pattern);
          if (match) {
            patientId = match[1].trim();
            break;
          }
        }
        if (patientId) {
          console.log("\uD83D\uDCCB Extracted patient context: ".concat(patientId));
          await SessionsCollection.updateAsync(sessionId, {
            $set: {
              'metadata.patientId': patientId
            }
          });
        }
        // Extract medical terms from response
        const medicalTerms = extractMedicalTermsFromResponse(response);
        if (medicalTerms.length > 0) {
          console.log("\uD83C\uDFF7\uFE0F Extracted medical terms: ".concat(medicalTerms.join(', ')));
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.tags': {
                $each: medicalTerms
              }
            }
          });
        }
        // Extract data sources mentioned in response
        const dataSources = extractDataSources(response);
        if (dataSources.length > 0) {
          console.log("\uD83D\uDCCA Data sources used: ".concat(dataSources.join(', ')));
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.dataSources': {
                $each: dataSources
              }
            }
          });
        }
        // Extract medications if mentioned
        const medications = extractMedications(query, response);
        if (medications.length > 0) {
          console.log("\uD83D\uDC8A Extracted medications: ".concat(medications.join(', ')));
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.medications': {
                $each: medications
              }
            }
          });
        }
      } catch (error) {
        console.error('Error updating context:', error);
      }
    }
    function extractMedicalTermsFromResponse(response) {
      const medicalPatterns = [/\b(?:diagnosed with|diagnosis of)\s+([^,.]+)/gi, /\b(?:prescribed|medication)\s+([^,.]+)/gi, /\b(?:treatment for|treating)\s+([^,.]+)/gi, /\b(?:condition|disease):\s*([^,.]+)/gi, /\b(?:symptoms?|presenting with)\s+([^,.]+)/gi];
      const terms = new Set();
      medicalPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(response)) !== null) {
          if (match[1]) {
            const term = match[1].trim().toLowerCase();
            if (term.length > 2) {
              // Filter out very short matches
              terms.add(term);
            }
          }
        }
      });
      return Array.from(terms).slice(0, 10);
    }
    function extractDataSources(response) {
      const sources = new Set();
      // Detect data sources mentioned in response
      if (response.toLowerCase().includes('aidbox') || response.toLowerCase().includes('fhir')) {
        sources.add('Aidbox FHIR');
      }
      if (response.toLowerCase().includes('epic') || response.toLowerCase().includes('ehr')) {
        sources.add('Epic EHR');
      }
      if (response.toLowerCase().includes('document') || response.toLowerCase().includes('uploaded')) {
        sources.add('Medical Documents');
      }
      return Array.from(sources);
    }
    function extractMedications(query, response) {
      const medicationPatterns = [/(?:medication|drug|medicine):\s*([^,.]+)/gi, /(?:prescribed|prescribe)\s+([A-Za-z]+)/gi, /\b(dolo|paracetamol|ibuprofen|aspirin|amoxicillin|metformin|atorvastatin|lisinopril|omeprazole|amlodipine)\b/gi];
      const medications = new Set();
      const fullText = "".concat(query, " ").concat(response);
      medicationPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
          if (match[1]) {
            medications.add(match[1].trim());
          } else if (match[0]) {
            medications.add(match[0].trim());
          }
        }
      });
      return Array.from(medications).slice(0, 5);
    }
    // Utility function to sanitize patient names (used by intelligent tool selection)
    function sanitizePatientName(name) {
      return name.trim().replace(/[^a-zA-Z\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    }
    // Export utility functions for testing and reuse
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"publications.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/messages/publications.ts                                                                              //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let check;
    module.link("meteor/check", {
      check(v) {
        check = v;
      }
    }, 1);
    let MessagesCollection;
    module.link("./messages", {
      MessagesCollection(v) {
        MessagesCollection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Meteor.publish('messages', function (sessionId) {
      check(sessionId, String);
      return MessagesCollection.find({
        sessionId
      });
    });
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"sessions":{"methods.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/sessions/methods.ts                                                                                   //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let _objectSpread;
    module.link("@babel/runtime/helpers/objectSpread2", {
      default(v) {
        _objectSpread = v;
      }
    }, 0);
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let check, Match;
    module.link("meteor/check", {
      check(v) {
        check = v;
      },
      Match(v) {
        Match = v;
      }
    }, 1);
    let SessionsCollection;
    module.link("./sessions", {
      SessionsCollection(v) {
        SessionsCollection = v;
      }
    }, 2);
    let MessagesCollection;
    module.link("../messages/messages", {
      MessagesCollection(v) {
        MessagesCollection = v;
      }
    }, 3);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Meteor.methods({
      async 'sessions.create'(title, metadata) {
        check(title, Match.Maybe(String));
        check(metadata, Match.Maybe(Object));
        const session = {
          title: title || 'New Chat',
          userId: this.userId || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
          isActive: true,
          metadata: metadata || {}
        };
        // Deactivate other sessions for this user
        if (this.userId) {
          await SessionsCollection.updateAsync({
            userId: this.userId,
            isActive: true
          }, {
            $set: {
              isActive: false
            }
          }, {
            multi: true
          });
        }
        const sessionId = await SessionsCollection.insertAsync(session);
        console.log("\u2705 Created new session: ".concat(sessionId));
        return sessionId;
      },
      async 'sessions.list'() {
        let limit = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 20;
        let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        check(limit, Match.Integer);
        check(offset, Match.Integer);
        const userId = this.userId || null;
        const sessions = await SessionsCollection.find({
          userId
        }, {
          sort: {
            updatedAt: -1
          },
          limit,
          skip: offset
        }).fetchAsync();
        const total = await SessionsCollection.countDocuments({
          userId
        });
        return {
          sessions,
          total,
          hasMore: offset + limit < total
        };
      },
      async 'sessions.get'(sessionId) {
        check(sessionId, String);
        const session = await SessionsCollection.findOneAsync({
          _id: sessionId,
          userId: this.userId || null
        });
        if (!session) {
          throw new Meteor.Error('session-not-found', 'Session not found');
        }
        return session;
      },
      async 'sessions.update'(sessionId, updates) {
        check(sessionId, String);
        check(updates, Object);
        // Remove fields that shouldn't be updated directly
        delete updates._id;
        delete updates.userId;
        delete updates.createdAt;
        const result = await SessionsCollection.updateAsync({
          _id: sessionId,
          userId: this.userId || null
        }, {
          $set: _objectSpread(_objectSpread({}, updates), {}, {
            updatedAt: new Date()
          })
        });
        return result;
      },
      async 'sessions.delete'(sessionId) {
        check(sessionId, String);
        // Verify ownership
        const session = await SessionsCollection.findOneAsync({
          _id: sessionId,
          userId: this.userId || null
        });
        if (!session) {
          throw new Meteor.Error('session-not-found', 'Session not found');
        }
        // Delete all associated messages
        const deletedMessages = await MessagesCollection.removeAsync({
          sessionId
        });
        console.log("\uD83D\uDDD1\uFE0F Deleted ".concat(deletedMessages, " messages from session ").concat(sessionId));
        // Delete the session
        const result = await SessionsCollection.removeAsync(sessionId);
        console.log("\uD83D\uDDD1\uFE0F Deleted session ".concat(sessionId));
        return {
          session: result,
          messages: deletedMessages
        };
      },
      async 'sessions.setActive'(sessionId) {
        check(sessionId, String);
        const userId = this.userId || null;
        // Deactivate all other sessions
        await SessionsCollection.updateAsync({
          userId,
          isActive: true
        }, {
          $set: {
            isActive: false
          }
        }, {
          multi: true
        });
        // Activate this session
        const result = await SessionsCollection.updateAsync({
          _id: sessionId,
          userId
        }, {
          $set: {
            isActive: true,
            updatedAt: new Date()
          }
        });
        return result;
      },
      async 'sessions.generateTitle'(sessionId) {
        check(sessionId, String);
        // Get first few messages
        const messages = await MessagesCollection.find({
          sessionId,
          role: 'user'
        }, {
          limit: 3,
          sort: {
            timestamp: 1
          }
        }).fetchAsync();
        if (messages.length > 0) {
          // Use first user message as basis for title
          const firstUserMessage = messages[0];
          if (firstUserMessage) {
            // Clean up the message for a better title
            let title = firstUserMessage.content.replace(/^(search for|find|look for|show me)\s+/i, '') // Remove common prefixes
            .replace(/[?!.]$/, '') // Remove ending punctuation
            .trim();
            // Limit length
            if (title.length > 50) {
              title = title.substring(0, 50).trim() + '...';
            }
            // Capitalize first letter
            title = title.charAt(0).toUpperCase() + title.slice(1);
            await SessionsCollection.updateAsync(sessionId, {
              $set: {
                title,
                updatedAt: new Date()
              }
            });
            return title;
          }
        }
        return null;
      },
      async 'sessions.updateMetadata'(sessionId, metadata) {
        check(sessionId, String);
        check(metadata, Object);
        const result = await SessionsCollection.updateAsync({
          _id: sessionId,
          userId: this.userId || null
        }, {
          $set: {
            metadata,
            updatedAt: new Date()
          }
        });
        return result;
      },
      async 'sessions.export'(sessionId) {
        check(sessionId, String);
        const session = await SessionsCollection.findOneAsync({
          _id: sessionId,
          userId: this.userId || null
        });
        if (!session) {
          throw new Meteor.Error('session-not-found', 'Session not found');
        }
        const messages = await MessagesCollection.find({
          sessionId
        }, {
          sort: {
            timestamp: 1
          }
        }).fetchAsync();
        return {
          session,
          messages,
          exportedAt: new Date(),
          version: '1.0'
        };
      },
      async 'sessions.import'(data) {
        check(data, {
          session: Object,
          messages: Array,
          version: String
        });
        // Create new session based on imported data
        const newSession = _objectSpread(_objectSpread({}, data.session), {}, {
          title: "[Imported] ".concat(data.session.title),
          userId: this.userId || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true
        });
        delete newSession._id;
        const sessionId = await SessionsCollection.insertAsync(newSession);
        // Import messages with new sessionId
        for (const message of data.messages) {
          const newMessage = _objectSpread(_objectSpread({}, message), {}, {
            sessionId,
            timestamp: new Date(message.timestamp)
          });
          delete newMessage._id;
          await MessagesCollection.insertAsync(newMessage);
        }
        return sessionId;
      }
    });
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"publications.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/sessions/publications.ts                                                                              //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let check;
    module.link("meteor/check", {
      check(v) {
        check = v;
      }
    }, 1);
    let SessionsCollection;
    module.link("./sessions", {
      SessionsCollection(v) {
        SessionsCollection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    // Publish user's sessions list
    Meteor.publish('sessions.list', function () {
      let limit = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 20;
      check(limit, Number);
      const userId = this.userId || null;
      return SessionsCollection.find({
        userId
      }, {
        sort: {
          updatedAt: -1
        },
        limit,
        fields: {
          title: 1,
          updatedAt: 1,
          messageCount: 1,
          lastMessage: 1,
          isActive: 1,
          createdAt: 1,
          'metadata.patientId': 1,
          'metadata.documentIds': 1
        }
      });
    });
    // Publish single session details
    Meteor.publish('session.details', function (sessionId) {
      check(sessionId, String);
      return SessionsCollection.find({
        _id: sessionId,
        userId: this.userId || null
      });
    });
    // Publish active session
    Meteor.publish('session.active', function () {
      const userId = this.userId || null;
      return SessionsCollection.find({
        userId,
        isActive: true
      }, {
        limit: 1
      });
    });
    // Publish recent sessions with message preview
    Meteor.publish('sessions.recent', function () {
      let limit = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 5;
      check(limit, Number);
      const userId = this.userId || null;
      return SessionsCollection.find({
        userId
      }, {
        sort: {
          updatedAt: -1
        },
        limit,
        fields: {
          title: 1,
          lastMessage: 1,
          messageCount: 1,
          updatedAt: 1,
          isActive: 1
        }
      });
    });
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"sessions.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// imports/api/sessions/sessions.ts                                                                                  //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    module.export({
      SessionsCollection: () => SessionsCollection
    });
    let Mongo;
    module.link("meteor/mongo", {
      Mongo(v) {
        Mongo = v;
      }
    }, 0);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    const SessionsCollection = new Mongo.Collection('sessions');
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}},"server":{"startup-sessions.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// server/startup-sessions.ts                                                                                        //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let SessionsCollection;
    module.link("/imports/api/sessions/sessions", {
      SessionsCollection(v) {
        SessionsCollection = v;
      }
    }, 1);
    let MessagesCollection;
    module.link("/imports/api/messages/messages", {
      MessagesCollection(v) {
        MessagesCollection = v;
      }
    }, 2);
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Meteor.startup(async () => {
      console.log(' Setting up session management...');
      // Create indexes for better performance
      try {
        // Sessions indexes
        await SessionsCollection.createIndexAsync({
          userId: 1,
          updatedAt: -1
        });
        await SessionsCollection.createIndexAsync({
          isActive: 1
        });
        await SessionsCollection.createIndexAsync({
          createdAt: -1
        });
        await SessionsCollection.createIndexAsync({
          'metadata.patientId': 1
        });
        // Messages indexes
        await MessagesCollection.createIndexAsync({
          sessionId: 1,
          timestamp: 1
        });
        await MessagesCollection.createIndexAsync({
          sessionId: 1,
          role: 1
        });
        console.log(' Database indexes created successfully');
      } catch (error) {
        console.error(' Error creating indexes:', error);
      }
      // Cleanup old sessions (optional - remove sessions older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      try {
        const oldSessions = await SessionsCollection.find({
          updatedAt: {
            $lt: thirtyDaysAgo
          }
        }).fetchAsync();
        if (oldSessions.length > 0) {
          console.log("\uD83E\uDDF9 Found ".concat(oldSessions.length, " old sessions to clean up"));
          for (const session of oldSessions) {
            await MessagesCollection.removeAsync({
              sessionId: session._id
            });
            await SessionsCollection.removeAsync(session._id);
          }
          console.log(' Old sessions cleaned up');
        }
      } catch (error) {
        console.error(' Error cleaning up old sessions:', error);
      }
      // Log session statistics
      try {
        const totalSessions = await SessionsCollection.countDocuments();
        const totalMessages = await MessagesCollection.countDocuments();
        const activeSessions = await SessionsCollection.countDocuments({
          isActive: true
        });
        console.log(' Session Statistics:');
        console.log("   Total sessions: ".concat(totalSessions));
        console.log("   Active sessions: ".concat(activeSessions));
        console.log("   Total messages: ".concat(totalMessages));
      } catch (error) {
        console.error(' Error getting session statistics:', error);
      }
    });
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"main.ts":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                   //
// server/main.ts                                                                                                    //
//                                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                     //
!module.wrapAsync(async function (module, __reifyWaitForDeps__, __reify_async_result__) {
  "use strict";
  try {
    let Meteor;
    module.link("meteor/meteor", {
      Meteor(v) {
        Meteor = v;
      }
    }, 0);
    let MCPClientManager;
    module.link("/imports/api/mcp/mcpClientManager", {
      MCPClientManager(v) {
        MCPClientManager = v;
      }
    }, 1);
    module.link("/imports/api/messages/methods");
    module.link("/imports/api/messages/publications");
    module.link("/imports/api/sessions/methods");
    module.link("/imports/api/sessions/publications");
    module.link("./startup-sessions");
    if (__reifyWaitForDeps__()) (await __reifyWaitForDeps__())();
    Meteor.startup(async () => {
      console.log(' Starting MCP Pilot server with Intelligent Tool Selection...');
      const mcpManager = MCPClientManager.getInstance();
      try {
        var _Meteor$settings;
        // Get API keys
        const settings = (_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : _Meteor$settings.private;
        const anthropicKey = (settings === null || settings === void 0 ? void 0 : settings.ANTHROPIC_API_KEY) || process.env.ANTHROPIC_API_KEY;
        const ozwellKey = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_API_KEY) || process.env.OZWELL_API_KEY;
        const ozwellEndpoint = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_ENDPOINT) || process.env.OZWELL_ENDPOINT;
        console.log(' API Key Status:');
        console.log('  Anthropic key found:', !!anthropicKey, (anthropicKey === null || anthropicKey === void 0 ? void 0 : anthropicKey.substring(0, 15)) + '...');
        console.log('  Ozwell key found:', !!ozwellKey, (ozwellKey === null || ozwellKey === void 0 ? void 0 : ozwellKey.substring(0, 15)) + '...');
        console.log('  Ozwell endpoint:', ozwellEndpoint);
        if (!anthropicKey && !ozwellKey) {
          console.warn('  No API key found for intelligent tool selection.');
          return;
        }
        // Determine default provider (prefer Anthropic for better tool calling, fallback to Ozwell)
        let provider;
        let apiKey;
        if (anthropicKey) {
          provider = 'anthropic';
          apiKey = anthropicKey;
        } else if (ozwellKey) {
          provider = 'ozwell';
          apiKey = ozwellKey;
        } else {
          console.warn('  No valid API keys found');
          return;
        }
        // Initialize main MCP client with intelligent tool selection
        await mcpManager.initialize({
          provider,
          apiKey,
          ozwellEndpoint
        });
        console.log(' MCP Client initialized with intelligent tool selection');
        console.log(" MCP Using ".concat(provider.toUpperCase(), " as the AI provider for intelligent tool selection"));
        console.log(' MCP Session management enabled with Atlas MongoDB');
        // Show provider capabilities
        if (anthropicKey && ozwellKey) {
          console.log(' MCP Both providers available - you can switch between them in the chat');
          console.log('   MCP Anthropic: Advanced tool calling with Claude models (recommended)');
          console.log('   MCP Ozwell: Bluehive AI models with intelligent prompting');
        } else if (anthropicKey) {
          console.log(' MCP Anthropic provider with native tool calling support');
        } else {
          console.log(" MCP Only ".concat(provider.toUpperCase(), " provider available"));
        }
        // Connect to medical MCP server for document tools
        const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3005';
        if (mcpServerUrl && mcpServerUrl !== 'DISABLED') {
          try {
            console.log(" Connecting to Medical MCP Server for intelligent tool discovery...");
            await mcpManager.connectToMedicalServer();
            console.log(' Medical document tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('  Medical MCP Server connection failed:', error);
            console.warn('   Document processing tools will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('  Medical MCP Server URL not configured.');
        }
        // Connect to Aidbox MCP server for FHIR tools
        const aidboxServerUrl = (settings === null || settings === void 0 ? void 0 : settings.AIDBOX_MCP_SERVER_URL) || process.env.AIDBOX_MCP_SERVER_URL || 'http://localhost:3002';
        if (aidboxServerUrl && aidboxServerUrl !== 'DISABLED') {
          try {
            console.log(" Connecting to Aidbox MCP Server for intelligent FHIR tool discovery...");
            await mcpManager.connectToAidboxServer();
            console.log(' Aidbox FHIR tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('  Aidbox MCP Server connection failed:', error);
            console.warn('   Aidbox FHIR features will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('  Aidbox MCP Server URL not configured.');
        }
        // Connect to Epic MCP server for Epic EHR tools
        const epicServerUrl = (settings === null || settings === void 0 ? void 0 : settings.EPIC_MCP_SERVER_URL) || process.env.EPIC_MCP_SERVER_URL || 'http://localhost:3003';
        if (epicServerUrl && epicServerUrl !== 'DISABLED') {
          try {
            console.log(" Connecting to Epic MCP Server for intelligent EHR tool discovery...");
            await mcpManager.connectToEpicServer();
            console.log(' Epic EHR tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('  Epic MCP Server connection failed:', error);
            console.warn('   Epic EHR features will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('  Epic MCP Server URL not configured.');
        }
        // Log final status
        const availableTools = mcpManager.getAvailableTools();
        console.log("\n Intelligent Tool Selection Status:");
        console.log("   Total tools available: ".concat(availableTools.length));
        console.log("    AI Provider: ".concat(provider.toUpperCase()));
        console.log("   Tool selection method: ".concat(provider === 'anthropic' ? 'Native Claude tool calling' : 'Intelligent prompting'));
        // Log available tool categories
        if (availableTools.length > 0) {
          const toolCategories = categorizeTools(availableTools);
          console.log('\n🔧 Available Tool Categories:');
          // Object.entries(toolCategories).forEach(([category, count]) => {
          // console.log(`   ${getCategoryEmoji(category)} ${category}: ${count} tools`);
          // });
        }
        if (availableTools.length > 0) {
          console.log('\n SUCCESS: Claude will now intelligently select tools based on user queries!');
          console.log('   • No more hardcoded patterns or keyword matching');
          console.log('   • Claude analyzes each query and chooses appropriate tools');
          console.log('   • Supports complex multi-step tool usage');
          console.log('   • Automatic tool chaining and result interpretation');
        } else {
          console.log('\n  No tools available - running in basic LLM mode');
        }
        console.log('\n Example queries that will work with intelligent tool selection:');
        console.log('    Aidbox FHIR: "Get me details about all Hank Preston available from Aidbox"');
        console.log('    Epic EHR: "Search for patient Camila Lopez in Epic"');
        console.log('    Epic EHR: "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"');
        console.log('    Documents: "Upload this lab report and find similar cases"');
        console.log('   Multi-tool: "Search Epic for diabetes patients and get their medications"');
      } catch (error) {
        console.error('Failed to initialize intelligent tool selection:', error);
        console.warn('Server will run with limited capabilities');
        console.warn('Basic LLM responses will work, but no tool calling');
      }
    });
    // Helper function to categorize tools for better logging
    // Fix for server/main.ts - Replace the categorizeTools function
    function categorizeTools(tools) {
      const categories = {};
      tools.forEach(tool => {
        let category = 'Other';
        // Epic EHR tools - tools with 'epic' prefix
        if (tool.name.toLowerCase().startsWith('epic')) {
          category = 'Epic EHR';
        }
        // Aidbox FHIR tools - standard FHIR operations without 'epic' prefix from Aidbox
        else if (isAidboxFHIRTool(tool)) {
          category = 'Aidbox FHIR';
        }
        // Medical Document tools - document processing operations
        else if (isDocumentTool(tool)) {
          category = 'Medical Documents';
        }
        // Search & Analysis tools - AI/ML operations
        else if (isSearchAnalysisTool(tool)) {
          category = 'Search & Analysis';
        }
        categories[category] = (categories[category] || 0) + 1;
      });
      return categories;
    }
    function isAidboxFHIRTool(tool) {
      const aidboxFHIRToolNames = ['searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient', 'getPatientObservations', 'createObservation', 'getPatientMedications', 'createMedicationRequest', 'getPatientConditions', 'createCondition', 'getPatientEncounters', 'createEncounter'];
      // Must be in the Aidbox tool list AND not start with 'epic'
      return aidboxFHIRToolNames.includes(tool.name) && !tool.name.toLowerCase().startsWith('epic');
    }
    function isDocumentTool(tool) {
      const documentToolNames = ['uploadDocument', 'searchDocuments', 'listDocuments', 'chunkAndEmbedDocument', 'generateEmbeddingLocal'];
      return documentToolNames.includes(tool.name);
    }
    function isSearchAnalysisTool(tool) {
      const analysisToolNames = ['analyzePatientHistory', 'findSimilarCases', 'getMedicalInsights', 'extractMedicalEntities', 'semanticSearchLocal'];
      return analysisToolNames.includes(tool.name);
    }
    // Helper function to get emoji for tool categories
    // function getCategoryEmoji(category: string): string {
    //   const emojiMap: Record<string, string> = {
    //     'Epic EHR': '🏥',
    //     'Aidbox FHIR': '📋',
    //     'Medical Documents': '📄',
    //     'Search & Analysis': '🔍',
    //     'Other': '🔧'
    //   };
    //   return emojiMap[category] || '🔧';
    // }
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n Shutting down server...');
      const mcpManager = MCPClientManager.getInstance();
      // Clear all context before shutdown
      const {
        ContextManager
      } = require('/imports/api/context/contextManager');
      ContextManager.clearAllContexts();
      mcpManager.shutdown().then(() => {
        console.log(' Server shutdown complete');
        process.exit(0);
      }).catch(error => {
        console.error('Error during shutdown:', error);
        process.exit(1);
      });
    });
    // Handle uncaught errors
    process.on('uncaughtException', error => {
      console.error('Uncaught Exception:', error);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    __reify_async_result__();
  } catch (_reifyError) {
    return __reify_async_result__(_reifyError);
  }
  __reify_async_result__()
}, {
  self: this,
  async: false
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}},{
  "extensions": [
    ".js",
    ".json",
    ".ts",
    ".d.ts",
    ".d.ts.map",
    ".mjs",
    ".tsx"
  ]
});


/* Exports */
return {
  require: require,
  eagerModulePaths: [
    "/server/main.ts"
  ]
}});

//# sourceURL=meteor://💻app/app/app.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsIm1lZGljYWxUb29sTmFtZXMiLCJhdmFpbGFibGVUb29sIiwiYXZhaWxhYmxlVG9vbE5hbWVzIiwiY2FsbEVwaWNUb29sIiwiZXBpYyIsImFpZGJveCIsIm1lZGljYWwiLCJlcGljSGVhbHRoIiwiYWlkYm94SGVhbHRoIiwibWVkaWNhbEhlYWx0aCIsInByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50IiwicHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudCIsIl9lcnJvciRtZXNzYWdlIiwiX2Vycm9yJG1lc3NhZ2UyIiwiX2Vycm9yJG1lc3NhZ2UzIiwiTk9ERV9FTlYiLCJxdWVyeUludGVudCIsImNvbnRleHRJbmZvIiwiY29udmVyc2F0aW9uQ29udGV4dFByb21wdCIsImNvbnZlcnNhdGlvbkNvbnRleHQiLCJkeW5hbWljSW1wb3J0Iiwic3lzdGVtUHJvbXB0IiwiY29udmVyc2F0aW9uSGlzdG9yeSIsImZpbmFsUmVzcG9uc2UiLCJpdGVyYXRpb25zIiwibWF4SXRlcmF0aW9ucyIsIm1heFJldHJpZXMiLCJyZXRyeUNvdW50IiwiY3JlYXRlIiwibW9kZWwiLCJtYXhfdG9rZW5zIiwic3lzdGVtIiwidG9vbF9jaG9pY2UiLCJkZWxheSIsInBvdyIsIlByb21pc2UiLCJyZXNvbHZlIiwic2V0VGltZW91dCIsImhhc1Rvb2xVc2UiLCJhc3Npc3RhbnRSZXNwb25zZSIsImlucHV0IiwidG9vbFJlc3VsdCIsInRvb2xfdXNlX2lkIiwiZm9ybWF0VG9vbFJlc3VsdCIsImlzX2Vycm9yIiwiX3RoaXMkY29uZmlnIiwiZW5kcG9pbnQiLCJvendlbGxFbmRwb2ludCIsImF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24iLCJfdGhpcyRjb25maWcyIiwiX2RhdGEkY2hvaWNlcyIsIl9kYXRhJGNob2ljZXMkIiwicHJvbXB0IiwidGVtcGVyYXR1cmUiLCJzdHJlYW0iLCJkYXRhIiwiY2hvaWNlcyIsImNvbXBsZXRpb24iLCJwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQiLCJnZXRBdmFpbGFibGVUb29scyIsImlzVG9vbEF2YWlsYWJsZSIsInNvbWUiLCJnZXRNZWRpY2FsT3BlcmF0aW9ucyIsImdldEVwaWNPcGVyYXRpb25zIiwiZ2V0QWlkYm94T3BlcmF0aW9ucyIsInN3aXRjaFByb3ZpZGVyIiwidG9VcHBlckNhc2UiLCJnZXRDdXJyZW50UHJvdmlkZXIiLCJfdGhpcyRjb25maWczIiwiZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX2dsb2JhbCRNZXRlb3I0IiwiX2dsb2JhbCRNZXRlb3I0JHNldHRpIiwiYW50aHJvcGljS2V5IiwiQU5USFJPUElDX0FQSV9LRVkiLCJvendlbGxLZXkiLCJPWldFTExfQVBJX0tFWSIsInByb3ZpZGVycyIsImlzUmVhZHkiLCJnZXRDb25maWciLCJzaHV0ZG93biIsImNvbnRlbnRUeXBlIiwiaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UiLCJyZXNwb25zZVRleHQiLCJyZWplY3QiLCJfcmVzcG9uc2UkYm9keSIsInJlYWRlciIsImdldFJlYWRlciIsImRlY29kZXIiLCJUZXh0RGVjb2RlciIsImJ1ZmZlciIsInByb2Nlc3NDaHVuayIsImRvbmUiLCJ2YWx1ZSIsInJlYWQiLCJkZWNvZGUiLCJsaW5lcyIsInBvcCIsImxpbmUiLCJwYXJzZWQiLCJjYW5jZWwiLCJjYXRjaCIsInVwbG9hZERvY3VtZW50IiwiZmlsZSIsImZpbGVuYW1lIiwibWltZVR5cGUiLCJ0aXRsZSIsImZpbGVCdWZmZXIiLCJ0b1N0cmluZyIsImZpbGVUeXBlIiwic2VhcmNoRG9jdW1lbnRzIiwidGhyZXNob2xkIiwibGlzdERvY3VtZW50cyIsIm9mZnNldCIsImRvY3VtZW50SWQiLCJmaW5kU2ltaWxhckNhc2VzIiwiY3JpdGVyaWEiLCJhbmFseXplUGF0aWVudEhpc3RvcnkiLCJhbmFseXNpc1R5cGUiLCJkYXRlUmFuZ2UiLCJnZXRNZWRpY2FsSW5zaWdodHMiLCJleHRyYWN0VGV4dCIsIl9pZCIsImRvY3VtZW50cyIsInN1Y2Nlc3MiLCJleHRyYWN0ZWRUZXh0IiwiY29uZmlkZW5jZSIsInNlYXJjaEJ5RGlhZ25vc2lzIiwicGF0aWVudElkZW50aWZpZXIiLCJkaWFnbm9zaXNRdWVyeSIsInNlbWFudGljU2VhcmNoIiwiZ2V0UGF0aWVudFN1bW1hcnkiLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJleHRyYWN0QW5kVXBkYXRlQ29udGV4dCIsImV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UiLCJleHRyYWN0RGF0YVNvdXJjZXMiLCJleHRyYWN0TWVkaWNhdGlvbnMiLCJzYW5pdGl6ZVBhdGllbnROYW1lIiwiY2hlY2siLCJNYXRjaCIsIm1ldGhvZHMiLCJtZXNzYWdlcy5pbnNlcnQiLCJtZXNzYWdlRGF0YSIsIlN0cmluZyIsIm1lc3NhZ2VJZCIsImluc2VydEFzeW5jIiwiJGluYyIsImNhbGwiLCJtZWRpY2FsLnByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJNYXliZSIsImlzU2ltdWxhdGlvbiIsIm1jcE1hbmFnZXIiLCJfc2Vzc2lvbiRtZXRhZGF0YSIsImNvbnRleHREYXRhIiwidXNlck1lc3NhZ2UiLCJhc3Npc3RhbnRNZXNzYWdlIiwibWNwLnByb2Nlc3NRdWVyeSIsIm1jcC5zd2l0Y2hQcm92aWRlciIsIm1jcC5nZXRDdXJyZW50UHJvdmlkZXIiLCJtY3AuZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX01ldGVvciRzZXR0aW5ncyIsIm1jcC5nZXRBdmFpbGFibGVUb29scyIsIm1jcC5oZWFsdGhDaGVjayIsInNlcnZlcnMiLCJtZWRpY2FsLnVwbG9hZERvY3VtZW50IiwiZmlsZURhdGEiLCJwYXRpZW50TmFtZSIsIm5vdyIsIl90aGlzJGNvbm5lY3Rpb24iLCJlc3RpbWF0ZWRGaWxlU2l6ZSIsInJvdW5kIiwiQnVmZmVyIiwidXBsb2FkZWRCeSIsInVzZXJJZCIsInVwbG9hZERhdGUiLCJ0b0lTT1N0cmluZyIsIiRhZGRUb1NldCIsInVwZGF0ZUVycm9yIiwiX2Vycm9yJG1lc3NhZ2U0IiwiX2Vycm9yJG1lc3NhZ2U1IiwibWVkaWNhbC5wcm9jZXNzRG9jdW1lbnQiLCJ0ZXh0RXh0cmFjdGlvbiIsImRpYWdub3Npc0NvdW50IiwibWVkaWNhdGlvbkNvdW50IiwibGFiUmVzdWx0Q291bnQiLCJwYXRpZW50UGF0dGVybnMiLCIkZWFjaCIsImRhdGFTb3VyY2VzIiwibWVkaWNhdGlvbnMiLCJtZWRpY2FsUGF0dGVybnMiLCJzb3VyY2VzIiwibWVkaWNhdGlvblBhdHRlcm5zIiwiZnVsbFRleHQiLCJ3b3JkIiwiY2hhckF0IiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3JpZXMiLCJjYXRlZ29yeSIsImlzU2VhcmNoQW5hbHlzaXNUb29sIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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QUM3QyxDQUFDLENBQUM7SUFFRjJHLE9BQU8sQ0FBQ3FULEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDSSxNQUFNLEVBQUVDLE9BQU8sS0FBSTtNQUNuRDFiLE9BQU8sQ0FBQ3FCLEtBQUssQ0FBQyx5QkFBeUIsRUFBRXFhLE9BQU8sRUFBRSxTQUFTLEVBQUVELE1BQU0sQ0FBQztJQUN0RSxDQUFDLENBQUM7SUFBQzFjLHNCQUFBO0VBQUEsU0FBQUMsV0FBQTtJQUFBLE9BQUFELHNCQUFBLENBQUFDLFdBQUE7RUFBQTtFQUFBRCxzQkFBQTtBQUFBO0VBQUFFLElBQUE7RUFBQUMsS0FBQTtBQUFBLEciLCJmaWxlIjoiL2FwcC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiwgTWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2VzL21lc3NhZ2VzJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uL3Nlc3Npb25zL3Nlc3Npb25zJztcblxuZXhwb3J0IGludGVyZmFjZSBDb252ZXJzYXRpb25Db250ZXh0IHtcbiAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gIHJlY2VudE1lc3NhZ2VzOiBNZXNzYWdlW107XG4gIHBhdGllbnRDb250ZXh0Pzogc3RyaW5nO1xuICBkb2N1bWVudENvbnRleHQ/OiBzdHJpbmdbXTtcbiAgbWVkaWNhbEVudGl0aWVzPzogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+O1xuICBtYXhDb250ZXh0TGVuZ3RoOiBudW1iZXI7XG4gIHRvdGFsVG9rZW5zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0TWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGNvbnRleHRzID0gbmV3IE1hcDxzdHJpbmcsIENvbnZlcnNhdGlvbkNvbnRleHQ+KCk7XG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9DT05URVhUX0xFTkdUSCA9IDQwMDA7IC8vIEFkanVzdCBiYXNlZCBvbiBtb2RlbFxuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfTUVTU0FHRVMgPSAyMDtcbiAgXG4gIHN0YXRpYyBhc3luYyBnZXRDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb252ZXJzYXRpb25Db250ZXh0PiB7XG4gICAgbGV0IGNvbnRleHQgPSB0aGlzLmNvbnRleHRzLmdldChzZXNzaW9uSWQpO1xuICAgIFxuICAgIGlmICghY29udGV4dCkge1xuICAgICAgLy8gTG9hZCBjb250ZXh0IGZyb20gZGF0YWJhc2VcbiAgICAgIGNvbnRleHQgPSBhd2FpdCB0aGlzLmxvYWRDb250ZXh0RnJvbURCKHNlc3Npb25JZCk7XG4gICAgICB0aGlzLmNvbnRleHRzLnNldChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY29udGV4dDtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgYXN5bmMgbG9hZENvbnRleHRGcm9tREIoc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPENvbnZlcnNhdGlvbkNvbnRleHQ+IHtcbiAgICAvLyBMb2FkIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnN0IHJlY2VudE1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCB9LFxuICAgICAgeyBcbiAgICAgICAgc29ydDogeyB0aW1lc3RhbXA6IC0xIH0sIFxuICAgICAgICBsaW1pdDogdGhpcy5NQVhfTUVTU0FHRVMgXG4gICAgICB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgLy8gTG9hZCBzZXNzaW9uIG1ldGFkYXRhXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoc2Vzc2lvbklkKTtcbiAgICBcbiAgICBjb25zdCBjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0ID0ge1xuICAgICAgc2Vzc2lvbklkLFxuICAgICAgcmVjZW50TWVzc2FnZXM6IHJlY2VudE1lc3NhZ2VzLnJldmVyc2UoKSxcbiAgICAgIG1heENvbnRleHRMZW5ndGg6IHRoaXMuTUFYX0NPTlRFWFRfTEVOR1RILFxuICAgICAgdG90YWxUb2tlbnM6IDBcbiAgICB9O1xuICAgIFxuICAgIC8vIEFkZCBtZXRhZGF0YSBmcm9tIHNlc3Npb25cbiAgICBpZiAoc2Vzc2lvbj8ubWV0YWRhdGEpIHtcbiAgICAgIGNvbnRleHQucGF0aWVudENvbnRleHQgPSBzZXNzaW9uLm1ldGFkYXRhLnBhdGllbnRJZDtcbiAgICAgIGNvbnRleHQuZG9jdW1lbnRDb250ZXh0ID0gc2Vzc2lvbi5tZXRhZGF0YS5kb2N1bWVudElkcztcbiAgICB9XG4gICAgXG4gICAgLy8gRXh0cmFjdCBtZWRpY2FsIGVudGl0aWVzIGZyb20gcmVjZW50IG1lc3NhZ2VzXG4gICAgY29udGV4dC5tZWRpY2FsRW50aXRpZXMgPSB0aGlzLmV4dHJhY3RNZWRpY2FsRW50aXRpZXMocmVjZW50TWVzc2FnZXMpO1xuICAgIFxuICAgIC8vIENhbGN1bGF0ZSB0b2tlbiB1c2FnZVxuICAgIGNvbnRleHQudG90YWxUb2tlbnMgPSB0aGlzLmNhbGN1bGF0ZVRva2Vucyhjb250ZXh0KTtcbiAgICBcbiAgICAvLyBUcmltIGlmIG5lZWRlZFxuICAgIHRoaXMudHJpbUNvbnRleHQoY29udGV4dCk7XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgXG4gIHN0YXRpYyBhc3luYyB1cGRhdGVDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nLCBuZXdNZXNzYWdlOiBNZXNzYWdlKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0Q29udGV4dChzZXNzaW9uSWQpO1xuICAgIFxuICAgIC8vIEFkZCBuZXcgbWVzc2FnZVxuICAgIGNvbnRleHQucmVjZW50TWVzc2FnZXMucHVzaChuZXdNZXNzYWdlKTtcbiAgICBcbiAgICAvLyBVcGRhdGUgbWVkaWNhbCBlbnRpdGllcyBpZiBtZXNzYWdlIGNvbnRhaW5zIHRoZW1cbiAgICBpZiAobmV3TWVzc2FnZS5yb2xlID09PSAnYXNzaXN0YW50Jykge1xuICAgICAgY29uc3QgZW50aXRpZXMgPSB0aGlzLmV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlKG5ld01lc3NhZ2UuY29udGVudCk7XG4gICAgICBpZiAoZW50aXRpZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb250ZXh0Lm1lZGljYWxFbnRpdGllcyA9IFtcbiAgICAgICAgICAuLi4oY29udGV4dC5tZWRpY2FsRW50aXRpZXMgfHwgW10pLFxuICAgICAgICAgIC4uLmVudGl0aWVzXG4gICAgICAgIF0uc2xpY2UoLTUwKTsgLy8gS2VlcCBsYXN0IDUwIGVudGl0aWVzXG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFJlY2FsY3VsYXRlIHRva2VucyBhbmQgdHJpbVxuICAgIGNvbnRleHQudG90YWxUb2tlbnMgPSB0aGlzLmNhbGN1bGF0ZVRva2Vucyhjb250ZXh0KTtcbiAgICB0aGlzLnRyaW1Db250ZXh0KGNvbnRleHQpO1xuICAgIFxuICAgIHRoaXMuY29udGV4dHMuc2V0KHNlc3Npb25JZCwgY29udGV4dCk7XG4gICAgXG4gICAgLy8gUGVyc2lzdCBpbXBvcnRhbnQgY29udGV4dCBiYWNrIHRvIHNlc3Npb25cbiAgICBhd2FpdCB0aGlzLnBlcnNpc3RDb250ZXh0KHNlc3Npb25JZCwgY29udGV4dCk7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIHRyaW1Db250ZXh0KGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICB3aGlsZSAoY29udGV4dC50b3RhbFRva2VucyA+IGNvbnRleHQubWF4Q29udGV4dExlbmd0aCAmJiBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDIpIHtcbiAgICAgIC8vIFJlbW92ZSBvbGRlc3QgbWVzc2FnZXMsIGJ1dCBrZWVwIGF0IGxlYXN0IDJcbiAgICAgIGNvbnRleHQucmVjZW50TWVzc2FnZXMuc2hpZnQoKTtcbiAgICAgIGNvbnRleHQudG90YWxUb2tlbnMgPSB0aGlzLmNhbGN1bGF0ZVRva2Vucyhjb250ZXh0KTtcbiAgICB9XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGNhbGN1bGF0ZVRva2Vucyhjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KTogbnVtYmVyIHtcbiAgICAvLyBSb3VnaCBlc3RpbWF0aW9uOiAxIHRva2VuIOKJiCA0IGNoYXJhY3RlcnNcbiAgICBsZXQgdG90YWxDaGFycyA9IDA7XG4gICAgXG4gICAgLy8gQ291bnQgbWVzc2FnZSBjb250ZW50XG4gICAgdG90YWxDaGFycyArPSBjb250ZXh0LnJlY2VudE1lc3NhZ2VzXG4gICAgICAubWFwKG1zZyA9PiBtc2cuY29udGVudClcbiAgICAgIC5qb2luKCcgJykubGVuZ3RoO1xuICAgIFxuICAgIC8vIENvdW50IG1ldGFkYXRhXG4gICAgaWYgKGNvbnRleHQucGF0aWVudENvbnRleHQpIHtcbiAgICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5wYXRpZW50Q29udGV4dC5sZW5ndGggKyAyMDsgLy8gSW5jbHVkZSBsYWJlbFxuICAgIH1cbiAgICBcbiAgICBpZiAoY29udGV4dC5kb2N1bWVudENvbnRleHQpIHtcbiAgICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5kb2N1bWVudENvbnRleHQuam9pbignICcpLmxlbmd0aCArIDMwO1xuICAgIH1cbiAgICBcbiAgICBpZiAoY29udGV4dC5tZWRpY2FsRW50aXRpZXMpIHtcbiAgICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5tZWRpY2FsRW50aXRpZXNcbiAgICAgICAgLm1hcChlID0+IGAke2UudGV4dH0gKCR7ZS5sYWJlbH0pYClcbiAgICAgICAgLmpvaW4oJywgJykubGVuZ3RoO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gTWF0aC5jZWlsKHRvdGFsQ2hhcnMgLyA0KTtcbiAgfVxuICBcbiAgc3RhdGljIGJ1aWxkQ29udGV4dFByb21wdChjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KTogc3RyaW5nIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBcbiAgICAvLyBBZGQgcGF0aWVudCBjb250ZXh0XG4gICAgaWYgKGNvbnRleHQucGF0aWVudENvbnRleHQpIHtcbiAgICAgIHBhcnRzLnB1c2goYEN1cnJlbnQgUGF0aWVudDogJHtjb250ZXh0LnBhdGllbnRDb250ZXh0fWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgZG9jdW1lbnQgY29udGV4dFxuICAgIGlmIChjb250ZXh0LmRvY3VtZW50Q29udGV4dCAmJiBjb250ZXh0LmRvY3VtZW50Q29udGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICBwYXJ0cy5wdXNoKGBSZWxhdGVkIERvY3VtZW50czogJHtjb250ZXh0LmRvY3VtZW50Q29udGV4dC5zbGljZSgwLCA1KS5qb2luKCcsICcpfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgbWVkaWNhbCBlbnRpdGllcyBzdW1tYXJ5XG4gICAgaWYgKGNvbnRleHQubWVkaWNhbEVudGl0aWVzICYmIGNvbnRleHQubWVkaWNhbEVudGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGVudGl0eVN1bW1hcnkgPSB0aGlzLnN1bW1hcml6ZU1lZGljYWxFbnRpdGllcyhjb250ZXh0Lm1lZGljYWxFbnRpdGllcyk7XG4gICAgICBwYXJ0cy5wdXNoKGBNZWRpY2FsIENvbnRleHQ6ICR7ZW50aXR5U3VtbWFyeX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAgaWYgKGNvbnRleHQucmVjZW50TWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY29udmVyc2F0aW9uID0gY29udGV4dC5yZWNlbnRNZXNzYWdlc1xuICAgICAgICAubWFwKG1zZyA9PiBgJHttc2cucm9sZSA9PT0gJ3VzZXInID8gJ1VzZXInIDogJ0Fzc2lzdGFudCd9OiAke21zZy5jb250ZW50fWApXG4gICAgICAgIC5qb2luKCdcXG4nKTtcbiAgICAgIFxuICAgICAgcGFydHMucHVzaChgUmVjZW50IENvbnZlcnNhdGlvbjpcXG4ke2NvbnZlcnNhdGlvbn1gKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJ1xcblxcbicpO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBzdW1tYXJpemVNZWRpY2FsRW50aXRpZXMoZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9Pik6IHN0cmluZyB7XG4gICAgY29uc3QgZ3JvdXBlZCA9IGVudGl0aWVzLnJlZHVjZSgoYWNjLCBlbnRpdHkpID0+IHtcbiAgICAgIGlmICghYWNjW2VudGl0eS5sYWJlbF0pIHtcbiAgICAgICAgYWNjW2VudGl0eS5sYWJlbF0gPSBbXTtcbiAgICAgIH1cbiAgICAgIGFjY1tlbnRpdHkubGFiZWxdLnB1c2goZW50aXR5LnRleHQpO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4pO1xuICAgIFxuICAgIGNvbnN0IHN1bW1hcnkgPSBPYmplY3QuZW50cmllcyhncm91cGVkKVxuICAgICAgLm1hcCgoW2xhYmVsLCB0ZXh0c10pID0+IHtcbiAgICAgICAgY29uc3QgdW5pcXVlID0gWy4uLm5ldyBTZXQodGV4dHMpXS5zbGljZSgwLCA1KTtcbiAgICAgICAgcmV0dXJuIGAke2xhYmVsfTogJHt1bmlxdWUuam9pbignLCAnKX1gO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCc7ICcpO1xuICAgIFxuICAgIHJldHVybiBzdW1tYXJ5O1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBleHRyYWN0TWVkaWNhbEVudGl0aWVzKG1lc3NhZ2VzOiBNZXNzYWdlW10pOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4ge1xuICAgIGNvbnN0IGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4gPSBbXTtcbiAgICBcbiAgICAvLyBTaW1wbGUgZXh0cmFjdGlvbiAtIGxvb2sgZm9yIHBhdHRlcm5zXG4gICAgY29uc3QgcGF0dGVybnMgPSB7XG4gICAgICBNRURJQ0FUSU9OOiAvXFxiKG1lZGljYXRpb258bWVkaWNpbmV8ZHJ1Z3xwcmVzY3JpcHRpb24pOlxccyooW14sLl0rKS9naSxcbiAgICAgIENPTkRJVElPTjogL1xcYihkaWFnbm9zaXN8Y29uZGl0aW9ufGRpc2Vhc2UpOlxccyooW14sLl0rKS9naSxcbiAgICAgIFNZTVBUT006IC9cXGIoc3ltcHRvbXxjb21wbGFpbik6XFxzKihbXiwuXSspL2dpLFxuICAgIH07XG4gICAgXG4gICAgbWVzc2FnZXMuZm9yRWFjaChtc2cgPT4ge1xuICAgICAgT2JqZWN0LmVudHJpZXMocGF0dGVybnMpLmZvckVhY2goKFtsYWJlbCwgcGF0dGVybl0pID0+IHtcbiAgICAgICAgbGV0IG1hdGNoO1xuICAgICAgICB3aGlsZSAoKG1hdGNoID0gcGF0dGVybi5leGVjKG1zZy5jb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgICAgICBlbnRpdGllcy5wdXNoKHtcbiAgICAgICAgICAgIHRleHQ6IG1hdGNoWzJdLnRyaW0oKSxcbiAgICAgICAgICAgIGxhYmVsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiBlbnRpdGllcztcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgZXh0cmFjdEVudGl0aWVzRnJvbU1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+IHtcbiAgICBjb25zdCBlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+ID0gW107XG4gICAgXG4gICAgLy8gTG9vayBmb3IgbWVkaWNhbCB0ZXJtcyBpbiB0aGUgcmVzcG9uc2VcbiAgICBjb25zdCBtZWRpY2FsVGVybXMgPSB7XG4gICAgICBNRURJQ0FUSU9OOiBbJ21lZGljYXRpb24nLCAncHJlc2NyaWJlZCcsICdkb3NhZ2UnLCAnbWcnLCAndGFibGV0cyddLFxuICAgICAgQ09ORElUSU9OOiBbJ2RpYWdub3NpcycsICdjb25kaXRpb24nLCAnc3luZHJvbWUnLCAnZGlzZWFzZSddLFxuICAgICAgUFJPQ0VEVVJFOiBbJ3N1cmdlcnknLCAncHJvY2VkdXJlJywgJ3Rlc3QnLCAnZXhhbWluYXRpb24nXSxcbiAgICAgIFNZTVBUT006IFsncGFpbicsICdmZXZlcicsICduYXVzZWEnLCAnZmF0aWd1ZSddXG4gICAgfTtcbiAgICBcbiAgICBPYmplY3QuZW50cmllcyhtZWRpY2FsVGVybXMpLmZvckVhY2goKFtsYWJlbCwgdGVybXNdKSA9PiB7XG4gICAgICB0ZXJtcy5mb3JFYWNoKHRlcm0gPT4ge1xuICAgICAgICBpZiAoY29udGVudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRlcm0pKSB7XG4gICAgICAgICAgLy8gRXh0cmFjdCB0aGUgc2VudGVuY2UgY29udGFpbmluZyB0aGUgdGVybVxuICAgICAgICAgIGNvbnN0IHNlbnRlbmNlcyA9IGNvbnRlbnQuc3BsaXQoL1suIT9dLyk7XG4gICAgICAgICAgc2VudGVuY2VzLmZvckVhY2goc2VudGVuY2UgPT4ge1xuICAgICAgICAgICAgaWYgKHNlbnRlbmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGVybSkpIHtcbiAgICAgICAgICAgICAgY29uc3QgZXh0cmFjdGVkID0gc2VudGVuY2UudHJpbSgpLnN1YnN0cmluZygwLCAxMDApO1xuICAgICAgICAgICAgICBpZiAoZXh0cmFjdGVkKSB7XG4gICAgICAgICAgICAgICAgZW50aXRpZXMucHVzaCh7IHRleHQ6IGV4dHJhY3RlZCwgbGFiZWwgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIGVudGl0aWVzO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBhc3luYyBwZXJzaXN0Q29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCkge1xuICAgIC8vIFVwZGF0ZSBzZXNzaW9uIHdpdGggbGF0ZXN0IGNvbnRleHQgbWV0YWRhdGFcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoc2Vzc2lvbklkLCB7XG4gICAgICAkc2V0OiB7XG4gICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiBjb250ZXh0LnBhdGllbnRDb250ZXh0LFxuICAgICAgICAnbWV0YWRhdGEuZG9jdW1lbnRJZHMnOiBjb250ZXh0LmRvY3VtZW50Q29udGV4dCxcbiAgICAgICAgJ21ldGFkYXRhLmxhc3RFbnRpdGllcyc6IGNvbnRleHQubWVkaWNhbEVudGl0aWVzPy5zbGljZSgtMTApLFxuICAgICAgICBsYXN0TWVzc2FnZTogY29udGV4dC5yZWNlbnRNZXNzYWdlc1tjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCAtIDFdPy5jb250ZW50LnN1YnN0cmluZygwLCAxMDApLFxuICAgICAgICBtZXNzYWdlQ291bnQ6IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyh7IHNlc3Npb25JZCB9KSxcbiAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgXG4gIHN0YXRpYyBjbGVhckNvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICB0aGlzLmNvbnRleHRzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICB9XG4gIFxuICBzdGF0aWMgY2xlYXJBbGxDb250ZXh0cygpIHtcbiAgICB0aGlzLmNvbnRleHRzLmNsZWFyKCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBnZXRDb250ZXh0U3RhdHMoc2Vzc2lvbklkOiBzdHJpbmcpOiB7IHNpemU6IG51bWJlcjsgbWVzc2FnZXM6IG51bWJlcjsgdG9rZW5zOiBudW1iZXIgfSB8IG51bGwge1xuICAgIGNvbnN0IGNvbnRleHQgPSB0aGlzLmNvbnRleHRzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghY29udGV4dCkgcmV0dXJuIG51bGw7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNpemU6IHRoaXMuY29udGV4dHMuc2l6ZSxcbiAgICAgIG1lc3NhZ2VzOiBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCxcbiAgICAgIHRva2VuczogY29udGV4dC50b3RhbFRva2Vuc1xuICAgIH07XG4gIH1cbn0iLCJpbnRlcmZhY2UgTUNQUmVxdWVzdCB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGFyYW1zOiBhbnk7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmludGVyZmFjZSBNQ1BSZXNwb25zZSB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICByZXN1bHQ/OiBhbnk7XG4gIGVycm9yPzoge1xuICAgIGNvZGU6IG51bWJlcjtcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gIH07XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIHtcbiAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gIHByaXZhdGUgc2Vzc2lvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgcmVxdWVzdElkID0gMTtcblxuICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcgPSAnaHR0cDovL2xvY2FsaG9zdDozMDAyJykge1xuICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gIH1cblxuICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgbmFtZTogJ21ldGVvci1haWRib3gtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygnIEFpZGJveCBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG5cbiAgICAgIC8vIFNlbmQgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uXG4gICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ2luaXRpYWxpemVkJywge30pO1xuXG4gICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgIGNvbnNvbGUubG9nKGBBaWRib3ggTUNQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICBjb25zb2xlLmxvZygnIEF2YWlsYWJsZSBBaWRib3ggdG9vbHM6Jyk7XG4gICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIEZhaWxlZCB0byBjb25uZWN0IHRvIEFpZGJveCBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmVcbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgU2VuZGluZyByZXF1ZXN0IHRvIEFpZGJveDogJHttZXRob2R9YCwgeyBpZCwgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3QpLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwMDApIC8vIDMwIHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgLy8gRXh0cmFjdCBzZXNzaW9uIElEIGZyb20gcmVzcG9uc2UgaGVhZGVycyBpZiBwcmVzZW50XG4gICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICBjb25zb2xlLmxvZygnIFJlY2VpdmVkIEFpZGJveCBzZXNzaW9uIElEOicsIHRoaXMuc2Vzc2lvbklkKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0uIFJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFpZGJveCBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgQWlkYm94IHJlcXVlc3QgJHttZXRob2R9IHN1Y2Nlc3NmdWxgKTtcbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcihgIEFpZGJveCByZXF1ZXN0IGZhaWxlZCBmb3IgbWV0aG9kICR7bWV0aG9kfTpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXNcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG5vdGlmaWNhdGlvbiksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsaXN0VG9vbHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvY2FsbCcsIHtcbiAgICAgIG5hbWUsXG4gICAgICBhcmd1bWVudHM6IGFyZ3NcbiAgICB9KTtcbiAgfVxuXG4gIGRpc2Nvbm5lY3QoKSB7XG4gICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIGNvbnNvbGUubG9nKCcgRGlzY29ubmVjdGVkIGZyb20gQWlkYm94IE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBBaWRib3ggRkhJUiBvcGVyYXRpb25zXG5leHBvcnQgaW50ZXJmYWNlIEFpZGJveEZISVJPcGVyYXRpb25zIHtcbiAgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZVBhdGllbnQocGF0aWVudERhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgdXBkYXRlUGF0aWVudChwYXRpZW50SWQ6IHN0cmluZywgdXBkYXRlczogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdChtZWRpY2F0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZUVuY291bnRlcihlbmNvdW50ZXJEYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBaWRib3hPcGVyYXRpb25zKGNvbm5lY3Rpb246IEFpZGJveFNlcnZlckNvbm5lY3Rpb24pOiBBaWRib3hGSElST3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94U2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50RGV0YWlscycsIHsgcGF0aWVudElkIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVQYXRpZW50KHBhdGllbnREYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZVBhdGllbnQnLCBwYXRpZW50RGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVBhdGllbnQocGF0aWVudElkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94VXBkYXRlUGF0aWVudCcsIHsgcGF0aWVudElkLCAuLi51cGRhdGVzIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudE9ic2VydmF0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlT2JzZXJ2YXRpb24nLCBvYnNlcnZhdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QobWVkaWNhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLCBtZWRpY2F0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlQ29uZGl0aW9uJywgY29uZGl0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlRW5jb3VudGVyKGVuY291bnRlckRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlRW5jb3VudGVyJywgZW5jb3VudGVyRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfVxuICB9O1xufSIsImludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAgICBqc29ucnBjOiAnMi4wJztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBwYXJhbXM6IGFueTtcbiAgICBpZDogc3RyaW5nIHwgbnVtYmVyO1xuICB9XG4gIFxuICBpbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICAgIGpzb25ycGM6ICcyLjAnO1xuICAgIHJlc3VsdD86IGFueTtcbiAgICBlcnJvcj86IHtcbiAgICAgIGNvZGU6IG51bWJlcjtcbiAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICB9O1xuICAgIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIH1cbiAgXG4gIGV4cG9ydCBjbGFzcyBFcGljU2VydmVyQ29ubmVjdGlvbiB7XG4gICAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgcmVxdWVzdElkID0gMTtcbiAgXG4gICAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMycpIHtcbiAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gICAgfVxuICBcbiAgICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgICBcbiAgICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfTogJHtoZWFsdGhDaGVjay5lcnJvcn1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgICAgbmFtZTogJ21ldGVvci1lcGljLWNsaWVudCcsXG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKCcgRXBpYyBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG4gIFxuICAgICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ2luaXRpYWxpemVkJywge30pO1xuICBcbiAgICAgICAgLy8gVGVzdCBieSBsaXN0aW5nIHRvb2xzXG4gICAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgICAgY29uc29sZS5sb2coYCBFcGljIE1DUCBDb25uZWN0aW9uIHN1Y2Nlc3NmdWwhIEZvdW5kICR7dG9vbHNSZXN1bHQudG9vbHM/Lmxlbmd0aCB8fCAwfSB0b29sc2ApO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJyBBdmFpbGFibGUgRXBpYyB0b29sczonKTtcbiAgICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGNvbm5lY3QgdG8gRXBpYyBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrU2VydmVySGVhbHRoKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRXBpYyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXJhbXMsXG4gICAgICAgIGlkXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9O1xuICBcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgcmVxdWVzdCB0byBFcGljIE1DUDogJHttZXRob2R9YCwgeyBpZCwgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9KTtcbiAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwMDApIC8vIDMwIHNlY29uZCB0aW1lb3V0XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgY29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbWNwLXNlc3Npb24taWQnKTtcbiAgICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgICAgY29uc29sZS5sb2coJyBSZWNlaXZlZCBFcGljIHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgICB9XG4gIFxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0uIFJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgXG4gICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEVwaWMgTUNQIGVycm9yICR7cmVzdWx0LmVycm9yLmNvZGV9OiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhgIEVwaWMgcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYCBFcGljIHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBwcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICBjb25zdCBub3RpZmljYXRpb24gPSB7XG4gICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIHBhcmFtc1xuICAgICAgfTtcbiAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH07XG4gIFxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBFcGljIG5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIGFzeW5jIGxpc3RUb29scygpOiBQcm9taXNlPGFueT4ge1xuICAgICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgICB9XG4gIFxuICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgfVxuICBcbiAgICBhc3luYyBjYWxsVG9vbChuYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvY2FsbCcsIHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgYXJndW1lbnRzOiBhcmdzXG4gICAgICB9KTtcbiAgICB9XG4gIFxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICB0aGlzLnNlc3Npb25JZCA9IG51bGw7XG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAgIGNvbnNvbGUubG9nKCcgRGlzY29ubmVjdGVkIGZyb20gRXBpYyBNQ1AgU2VydmVyJyk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFcGljIEZISVIgb3BlcmF0aW9ucyBpbnRlcmZhY2VcbiAgZXhwb3J0IGludGVyZmFjZSBFcGljRkhJUk9wZXJhdGlvbnMge1xuICAgIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFcGljT3BlcmF0aW9ucyhjb25uZWN0aW9uOiBFcGljU2VydmVyQ29ubmVjdGlvbik6IEVwaWNGSElST3BlcmF0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudERldGFpbHMnLCB7IHBhdGllbnRJZCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfVxuICAgIH07XG4gIH0iLCJpbXBvcnQgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB7IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uLCBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zLCBjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyB9IGZyb20gJy4vbWVkaWNhbFNlcnZlckNvbm5lY3Rpb24nO1xuaW1wb3J0IHsgQWlkYm94U2VydmVyQ29ubmVjdGlvbiwgQWlkYm94RkhJUk9wZXJhdGlvbnMsIGNyZWF0ZUFpZGJveE9wZXJhdGlvbnMgfSBmcm9tICcuL2FpZGJveFNlcnZlckNvbm5lY3Rpb24nO1xuaW1wb3J0IHsgRXBpY1NlcnZlckNvbm5lY3Rpb24sIEVwaWNGSElST3BlcmF0aW9ucywgY3JlYXRlRXBpY09wZXJhdGlvbnMgfSBmcm9tICcuL2VwaWNTZXJ2ZXJDb25uZWN0aW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBNQ1BDbGllbnRDb25maWcge1xuICBwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJztcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG96d2VsbEVuZHBvaW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTUNQQ2xpZW50TWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBNQ1BDbGllbnRNYW5hZ2VyO1xuICBwcml2YXRlIGFudGhyb3BpYz86IEFudGhyb3BpYztcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgY29uZmlnPzogTUNQQ2xpZW50Q29uZmlnO1xuICBcbiAgLy8gTWVkaWNhbCBNQ1AgY29ubmVjdGlvbiAoU3RyZWFtYWJsZSBIVFRQKVxuICBwcml2YXRlIG1lZGljYWxDb25uZWN0aW9uPzogTWVkaWNhbFNlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgbWVkaWNhbE9wZXJhdGlvbnM/OiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zO1xuICBwcml2YXRlIGF2YWlsYWJsZVRvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIC8vIEFpZGJveCBNQ1AgY29ubmVjdGlvblxuICBwcml2YXRlIGFpZGJveENvbm5lY3Rpb24/OiBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIGFpZGJveE9wZXJhdGlvbnM/OiBBaWRib3hGSElST3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBhaWRib3hUb29sczogYW55W10gPSBbXTtcblxuICAvLyBFcGljIE1DUCBjb25uZWN0aW9uXG4gIHByaXZhdGUgZXBpY0Nvbm5lY3Rpb24/OiBFcGljU2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBlcGljT3BlcmF0aW9ucz86IEVwaWNGSElST3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBlcGljVG9vbHM6IGFueVtdID0gW107XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHt9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRJbnN0YW5jZSgpOiBNQ1BDbGllbnRNYW5hZ2VyIHtcbiAgICBpZiAoIU1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIE1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2UgPSBuZXcgTUNQQ2xpZW50TWFuYWdlcigpO1xuICAgIH1cbiAgICByZXR1cm4gTUNQQ2xpZW50TWFuYWdlci5pbnN0YW5jZTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbml0aWFsaXplKGNvbmZpZzogTUNQQ2xpZW50Q29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coJ/CfmoAgSW5pdGlhbGl6aW5nIE1DUCBDbGllbnQgd2l0aCBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbicpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmIChjb25maWcucHJvdmlkZXIgPT09ICdhbnRocm9waWMnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdDcmVhdGluZyBBbnRocm9waWMgY2xpZW50IHdpdGggbmF0aXZlIHRvb2wgY2FsbGluZyBzdXBwb3J0Li4uJyk7XG4gICAgICAgIHRoaXMuYW50aHJvcGljID0gbmV3IEFudGhyb3BpYyh7XG4gICAgICAgICAgYXBpS2V5OiBjb25maWcuYXBpS2V5LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbnRocm9waWMgY2xpZW50IGluaXRpYWxpemVkIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24nKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUubG9nKGBNQ1AgQ2xpZW50IHJlYWR5IHdpdGggcHJvdmlkZXI6ICR7Y29uZmlnLnByb3ZpZGVyfWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGluaXRpYWxpemUgTUNQIGNsaWVudDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBDb25uZWN0IHRvIG1lZGljYWwgTUNQIHNlcnZlciBhbmQgZ2V0IGFsbCBhdmFpbGFibGUgdG9vbHNcbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb01lZGljYWxTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBtY3BTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDA1JztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYPCflJcgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgYXQ6ICR7bWNwU2VydmVyVXJsfWApO1xuICAgICAgXG4gICAgICB0aGlzLm1lZGljYWxDb25uZWN0aW9uID0gbmV3IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKG1jcFNlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMubWVkaWNhbE9wZXJhdGlvbnMgPSBjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyh0aGlzLm1lZGljYWxDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IGFsbCBhdmFpbGFibGUgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0b29sc1Jlc3VsdC50b29scyB8fCBbXTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKchSBDb25uZWN0ZWQgd2l0aCAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSBtZWRpY2FsIHRvb2xzIGF2YWlsYWJsZWApO1xuICAgICAgY29uc29sZS5sb2coYPCfk4sgTWVkaWNhbCB0b29sIG5hbWVzOiAke3RoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNZWRpY2FsIE1DUCBTZXJ2ZXIgSFRUUCBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvQWlkYm94U2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgICAgY29uc3QgYWlkYm94U2VydmVyVXJsID0gc2V0dGluZ3M/LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAyJztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYPCflJcgQ29ubmVjdGluZyB0byBBaWRib3ggTUNQIFNlcnZlciBhdDogJHthaWRib3hTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMuYWlkYm94Q29ubmVjdGlvbiA9IG5ldyBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uKGFpZGJveFNlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLmFpZGJveENvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5haWRib3hPcGVyYXRpb25zID0gY3JlYXRlQWlkYm94T3BlcmF0aW9ucyh0aGlzLmFpZGJveENvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgQWlkYm94IHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuYWlkYm94VG9vbHMgPSB0b29sc1Jlc3VsdC50b29scyB8fCBbXTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKchSBDb25uZWN0ZWQgdG8gQWlkYm94IHdpdGggJHt0aGlzLmFpZGJveFRvb2xzLmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBBaWRib3ggdG9vbCBuYW1lczogJHt0aGlzLmFpZGJveFRvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICAgIFxuICAgICAgLy8gTWVyZ2Ugd2l0aCBleGlzdGluZyB0b29scywgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gdGhpcy5tZXJnZVRvb2xzVW5pcXVlKHRoaXMuYXZhaWxhYmxlVG9vbHMsIHRoaXMuYWlkYm94VG9vbHMpO1xuICAgICAgXG4gICAgICB0aGlzLmxvZ0F2YWlsYWJsZVRvb2xzKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEFpZGJveCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9FcGljU2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgICAgY29uc3QgZXBpY1NlcnZlclVybCA9IHNldHRpbmdzPy5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDMnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+UlyBDb25uZWN0aW5nIHRvIEVwaWMgTUNQIFNlcnZlciBhdDogJHtlcGljU2VydmVyVXJsfWApO1xuICAgICAgXG4gICAgICB0aGlzLmVwaWNDb25uZWN0aW9uID0gbmV3IEVwaWNTZXJ2ZXJDb25uZWN0aW9uKGVwaWNTZXJ2ZXJVcmwpO1xuICAgICAgYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLmVwaWNPcGVyYXRpb25zID0gY3JlYXRlRXBpY09wZXJhdGlvbnModGhpcy5lcGljQ29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBFcGljIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24ubGlzdFRvb2xzKCk7XG4gICAgICB0aGlzLmVwaWNUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbm5lY3RlZCB0byBFcGljIHdpdGggJHt0aGlzLmVwaWNUb29scy5sZW5ndGh9IHRvb2xzIGF2YWlsYWJsZWApO1xuICAgICAgY29uc29sZS5sb2coYPCfk4sgRXBpYyB0b29sIG5hbWVzOiAke3RoaXMuZXBpY1Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICAgIFxuICAgICAgLy8gTWVyZ2Ugd2l0aCBleGlzdGluZyB0b29scywgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gdGhpcy5tZXJnZVRvb2xzVW5pcXVlKHRoaXMuYXZhaWxhYmxlVG9vbHMsIHRoaXMuZXBpY1Rvb2xzKTtcbiAgICAgIFxuICAgICAgdGhpcy5sb2dBdmFpbGFibGVUb29scygpO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcGljIE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVyZ2UgdG9vbHMgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gIHByaXZhdGUgbWVyZ2VUb29sc1VuaXF1ZShleGlzdGluZ1Rvb2xzOiBhbnlbXSwgbmV3VG9vbHM6IGFueVtdKTogYW55W10ge1xuICAgIGNvbnNvbGUubG9nKGDwn5SnIE1lcmdpbmcgdG9vbHM6ICR7ZXhpc3RpbmdUb29scy5sZW5ndGh9IGV4aXN0aW5nICsgJHtuZXdUb29scy5sZW5ndGh9IG5ld2ApO1xuICAgIFxuICAgIGNvbnN0IHRvb2xOYW1lU2V0ID0gbmV3IFNldChleGlzdGluZ1Rvb2xzLm1hcCh0b29sID0+IHRvb2wubmFtZSkpO1xuICAgIGNvbnN0IHVuaXF1ZU5ld1Rvb2xzID0gbmV3VG9vbHMuZmlsdGVyKHRvb2wgPT4ge1xuICAgICAgaWYgKHRvb2xOYW1lU2V0Lmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIER1cGxpY2F0ZSB0b29sIG5hbWUgZm91bmQ6ICR7dG9vbC5uYW1lfSAtIHNraXBwaW5nIGR1cGxpY2F0ZWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICB0b29sTmFtZVNldC5hZGQodG9vbC5uYW1lKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IG1lcmdlZFRvb2xzID0gWy4uLmV4aXN0aW5nVG9vbHMsIC4uLnVuaXF1ZU5ld1Rvb2xzXTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIE1lcmdlZCB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke3VuaXF1ZU5ld1Rvb2xzLmxlbmd0aH0gbmV3ID0gJHttZXJnZWRUb29scy5sZW5ndGh9IHRvdGFsYCk7XG4gICAgXG4gICAgcmV0dXJuIG1lcmdlZFRvb2xzO1xuICB9XG5cbnByaXZhdGUgbG9nQXZhaWxhYmxlVG9vbHMoKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKCdcXG7wn5OLIEF2YWlsYWJsZSBUb29scyBmb3IgSW50ZWxsaWdlbnQgU2VsZWN0aW9uOicpO1xuICBcbiAgLy8gU2VwYXJhdGUgdG9vbHMgYnkgYWN0dWFsIHNvdXJjZS90eXBlLCBub3QgYnkgcGF0dGVybiBtYXRjaGluZ1xuICBjb25zdCBlcGljVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHQubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKVxuICApO1xuICBcbiAgY29uc3QgYWlkYm94VG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNBaWRib3hGSElSVG9vbCh0KSAmJiAhdC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpXG4gICk7XG4gIFxuICBjb25zdCBkb2N1bWVudFRvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0aGlzLmlzRG9jdW1lbnRUb29sKHQpXG4gICk7XG4gIFxuICBjb25zdCBhbmFseXNpc1Rvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0aGlzLmlzQW5hbHlzaXNUb29sKHQpXG4gICk7XG4gIFxuICBjb25zdCBvdGhlclRvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICAhZXBpY1Rvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFhaWRib3hUb29scy5pbmNsdWRlcyh0KSAmJiBcbiAgICAhZG9jdW1lbnRUb29scy5pbmNsdWRlcyh0KSAmJiBcbiAgICAhYW5hbHlzaXNUb29scy5pbmNsdWRlcyh0KVxuICApO1xuICBcbiAgaWYgKGFpZGJveFRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygn8J+PpSBBaWRib3ggRkhJUiBUb29sczonKTtcbiAgICBhaWRib3hUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoZXBpY1Rvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygn8J+PpSBFcGljIEVIUiBUb29sczonKTtcbiAgICBlcGljVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKGRvY3VtZW50VG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIERvY3VtZW50IFRvb2xzOicpO1xuICAgIGRvY3VtZW50VG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKGFuYWx5c2lzVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIFNlYXJjaCAmIEFuYWx5c2lzIFRvb2xzOicpO1xuICAgIGFuYWx5c2lzVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKG90aGVyVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn5SnIE90aGVyIFRvb2xzOicpO1xuICAgIG90aGVyVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYFxcbvCfpJYgQ2xhdWRlIHdpbGwgaW50ZWxsaWdlbnRseSBzZWxlY3QgZnJvbSAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSB0b3RhbCB0b29scyBiYXNlZCBvbiB1c2VyIHF1ZXJpZXNgKTtcbiAgXG4gIC8vIERlYnVnOiBDaGVjayBmb3IgZHVwbGljYXRlc1xuICB0aGlzLmRlYnVnVG9vbER1cGxpY2F0ZXMoKTtcbn1cblxuLy8gQWRkIHRoZXNlIGhlbHBlciBtZXRob2RzIHRvIE1DUENsaWVudE1hbmFnZXIgY2xhc3NcbnByaXZhdGUgaXNBaWRib3hGSElSVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYWlkYm94RkhJUlRvb2xOYW1lcyA9IFtcbiAgICAnc2VhcmNoUGF0aWVudHMnLCAnZ2V0UGF0aWVudERldGFpbHMnLCAnY3JlYXRlUGF0aWVudCcsICd1cGRhdGVQYXRpZW50JyxcbiAgICAnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdjcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsICdjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2dldFBhdGllbnRDb25kaXRpb25zJywgJ2NyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgJ2NyZWF0ZUVuY291bnRlcidcbiAgXTtcbiAgXG4gIHJldHVybiBhaWRib3hGSElSVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbnByaXZhdGUgaXNEb2N1bWVudFRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGRvY3VtZW50VG9vbE5hbWVzID0gW1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGRvY3VtZW50VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbnByaXZhdGUgaXNBbmFseXNpc1Rvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFuYWx5c2lzVG9vbE5hbWVzID0gW1xuICAgICdhbmFseXplUGF0aWVudEhpc3RvcnknLCAnZmluZFNpbWlsYXJDYXNlcycsICdnZXRNZWRpY2FsSW5zaWdodHMnLFxuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gYW5hbHlzaXNUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuICAvLyBEZWJ1ZyBtZXRob2QgdG8gaWRlbnRpZnkgZHVwbGljYXRlIHRvb2xzXG4gIHByaXZhdGUgZGVidWdUb29sRHVwbGljYXRlcygpOiB2b2lkIHtcbiAgICBjb25zdCB0b29sTmFtZXMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0ID0+IHQubmFtZSk7XG4gICAgY29uc3QgbmFtZUNvdW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBcbiAgICB0b29sTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIG5hbWVDb3VudC5zZXQobmFtZSwgKG5hbWVDb3VudC5nZXQobmFtZSkgfHwgMCkgKyAxKTtcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCBkdXBsaWNhdGVzID0gQXJyYXkuZnJvbShuYW1lQ291bnQuZW50cmllcygpKVxuICAgICAgLmZpbHRlcigoW25hbWUsIGNvdW50XSkgPT4gY291bnQgPiAxKTtcbiAgICBcbiAgICBpZiAoZHVwbGljYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRFVQTElDQVRFIFRPT0wgTkFNRVMgRk9VTkQ6Jyk7XG4gICAgICBkdXBsaWNhdGVzLmZvckVhY2goKFtuYW1lLCBjb3VudF0pID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgICDigKIgJHtuYW1lfTogYXBwZWFycyAke2NvdW50fSB0aW1lc2ApO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIHRvb2wgbmFtZXMgYXJlIHVuaXF1ZScpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbHRlciB0b29scyBiYXNlZCBvbiB1c2VyJ3Mgc3BlY2lmaWVkIGRhdGEgc291cmNlXG4gIHByaXZhdGUgZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UodG9vbHM6IGFueVtdLCBkYXRhU291cmNlOiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbW9uZ29kYicpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYXRsYXMnKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBNb25nb0RCL0F0bGFzIC0gcmV0dXJuIG9ubHkgZG9jdW1lbnQgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdEb2N1bWVudCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ3NlYXJjaCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ3VwbG9hZCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2V4dHJhY3QnKSB8fCBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdNZWRpY2FsJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdTaW1pbGFyJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdJbnNpZ2h0JykgfHxcbiAgICAgICAgKHRvb2wubmFtZS5pbmNsdWRlcygnc2VhcmNoJykgJiYgIXRvb2wubmFtZS5pbmNsdWRlcygnUGF0aWVudCcpKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWlkYm94JykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgQWlkYm94IC0gcmV0dXJuIG9ubHkgRkhJUiB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICAodG9vbC5uYW1lLmluY2x1ZGVzKCdQYXRpZW50JykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ09ic2VydmF0aW9uJykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ01lZGljYXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnQ29uZGl0aW9uJykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0VuY291bnRlcicpIHx8XG4gICAgICAgICB0b29sLm5hbWUgPT09ICdzZWFyY2hQYXRpZW50cycpICYmXG4gICAgICAgICF0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJylcbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGlmIChkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VocicpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIEVwaWMgLSByZXR1cm4gb25seSBFcGljIHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgIHRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnREZXRhaWxzJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRDb25kaXRpb25zJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50RW5jb3VudGVycycpIHx8XG4gICAgICAgICh0b29sLm5hbWUgPT09ICdzZWFyY2hQYXRpZW50cycgJiYgdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgLy8gTm8gc3BlY2lmaWMgcHJlZmVyZW5jZSwgcmV0dXJuIGFsbCB0b29sc1xuICAgIHJldHVybiB0b29scztcbiAgfVxuXG4gIC8vIEFuYWx5emUgcXVlcnkgdG8gdW5kZXJzdGFuZCB1c2VyJ3MgaW50ZW50IGFib3V0IGRhdGEgc291cmNlc1xuICBwcml2YXRlIGFuYWx5emVRdWVyeUludGVudChxdWVyeTogc3RyaW5nKTogeyBkYXRhU291cmNlPzogc3RyaW5nOyBpbnRlbnQ/OiBzdHJpbmcgfSB7XG4gICAgY29uc3QgbG93ZXJRdWVyeSA9IHF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIGV4cGxpY2l0IGRhdGEgc291cmNlIG1lbnRpb25zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2VwaWMnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdlaHInKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ0VwaWMgRUhSJyxcbiAgICAgICAgaW50ZW50OiAnU2VhcmNoIEVwaWMgRUhSIHBhdGllbnQgZGF0YSdcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdtb25nb2RiJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnYXRsYXMnKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ01vbmdvREIgQXRsYXMnLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggdXBsb2FkZWQgZG9jdW1lbnRzIGFuZCBtZWRpY2FsIHJlY29yZHMnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnYWlkYm94JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnQWlkYm94IEZISVInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggc3RydWN0dXJlZCBwYXRpZW50IGRhdGEnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZG9jdW1lbnQtcmVsYXRlZCB0ZXJtc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdkb2N1bWVudCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ3VwbG9hZCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2ZpbGUnKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ01vbmdvREIgQXRsYXMgKGRvY3VtZW50cyknLFxuICAgICAgICBpbnRlbnQ6ICdXb3JrIHdpdGggdXBsb2FkZWQgbWVkaWNhbCBkb2N1bWVudHMnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBmb3IgcGF0aWVudCBzZWFyY2ggcGF0dGVybnNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnc2VhcmNoIGZvciBwYXRpZW50JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmluZCBwYXRpZW50JykpIHtcbiAgICAgIC8vIERlZmF1bHQgdG8gRXBpYyBmb3IgcGF0aWVudCBzZWFyY2hlcyB1bmxlc3Mgc3BlY2lmaWVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnRXBpYyBFSFInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggZm9yIHBhdGllbnQgaW5mb3JtYXRpb24nXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4ge307XG4gIH1cblxuICAvLyBDb252ZXJ0IHRvb2xzIHRvIEFudGhyb3BpYyBmb3JtYXQgd2l0aCBzdHJpY3QgZGVkdXBsaWNhdGlvblxuICBwcml2YXRlIGdldEFudGhyb3BpY1Rvb2xzKCk6IGFueVtdIHtcbiAgICAvLyBVc2UgTWFwIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGJ5IHRvb2wgbmFtZVxuICAgIGNvbnN0IHVuaXF1ZVRvb2xzID0gbmV3IE1hcDxzdHJpbmcsIGFueT4oKTtcbiAgICBcbiAgICB0aGlzLmF2YWlsYWJsZVRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgICBpZiAoIXVuaXF1ZVRvb2xzLmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIHVuaXF1ZVRvb2xzLnNldCh0b29sLm5hbWUsIHtcbiAgICAgICAgICBuYW1lOiB0b29sLm5hbWUsXG4gICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG4gICAgICAgICAgaW5wdXRfc2NoZW1hOiB7XG4gICAgICAgICAgICB0eXBlOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgcHJvcGVydGllczogdG9vbC5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyB8fCB7fSxcbiAgICAgICAgICAgIHJlcXVpcmVkOiB0b29sLmlucHV0U2NoZW1hPy5yZXF1aXJlZCB8fCBbXVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBTa2lwcGluZyBkdXBsaWNhdGUgdG9vbCBpbiBBbnRocm9waWMgZm9ybWF0OiAke3Rvb2wubmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCB0b29sc0FycmF5ID0gQXJyYXkuZnJvbSh1bmlxdWVUb29scy52YWx1ZXMoKSk7XG4gICAgY29uc29sZS5sb2coYPCflKcgUHJlcGFyZWQgJHt0b29sc0FycmF5Lmxlbmd0aH0gdW5pcXVlIHRvb2xzIGZvciBBbnRocm9waWMgKGZyb20gJHt0aGlzLmF2YWlsYWJsZVRvb2xzLmxlbmd0aH0gdG90YWwpYCk7XG4gICAgXG4gICAgcmV0dXJuIHRvb2xzQXJyYXk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSB0b29scyBiZWZvcmUgc2VuZGluZyB0byBBbnRocm9waWMgKGFkZGl0aW9uYWwgc2FmZXR5IGNoZWNrKVxuICBwcml2YXRlIHZhbGlkYXRlVG9vbHNGb3JBbnRocm9waWMoKTogYW55W10ge1xuICAgIGNvbnN0IHRvb2xzID0gdGhpcy5nZXRBbnRocm9waWNUb29scygpO1xuICAgIFxuICAgIC8vIEZpbmFsIGNoZWNrIGZvciBkdXBsaWNhdGVzXG4gICAgY29uc3QgbmFtZVNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHZhbGlkVG9vbHM6IGFueVtdID0gW107XG4gICAgXG4gICAgdG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgIGlmICghbmFtZVNldC5oYXModG9vbC5uYW1lKSkge1xuICAgICAgICBuYW1lU2V0LmFkZCh0b29sLm5hbWUpO1xuICAgICAgICB2YWxpZFRvb2xzLnB1c2godG9vbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDwn5qoIENSSVRJQ0FMOiBEdXBsaWNhdGUgdG9vbCBmb3VuZCBpbiBmaW5hbCB2YWxpZGF0aW9uOiAke3Rvb2wubmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICBpZiAodmFsaWRUb29scy5sZW5ndGggIT09IHRvb2xzLmxlbmd0aCkge1xuICAgICAgY29uc29sZS53YXJuKGDwn6e5IFJlbW92ZWQgJHt0b29scy5sZW5ndGggLSB2YWxpZFRvb2xzLmxlbmd0aH0gZHVwbGljYXRlIHRvb2xzIGluIGZpbmFsIHZhbGlkYXRpb25gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYOKchSBGaW5hbCB2YWxpZGF0aW9uOiAke3ZhbGlkVG9vbHMubGVuZ3RofSB1bmlxdWUgdG9vbHMgcmVhZHkgZm9yIEFudGhyb3BpY2ApO1xuICAgIHJldHVybiB2YWxpZFRvb2xzO1xuICB9XG5cblxucHVibGljIGFzeW5jIGNhbGxNQ1BUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gIGNvbnNvbGUubG9nKGDwn5SnIFJvdXRpbmcgdG9vbDogJHt0b29sTmFtZX0gd2l0aCBhcmdzOmAsIEpTT04uc3RyaW5naWZ5KGFyZ3MsIG51bGwsIDIpKTtcbiAgXG4gIC8vIEVwaWMgdG9vbHMgLSBNVVNUIGdvIHRvIEVwaWMgTUNQIFNlcnZlciAocG9ydCAzMDAzKVxuICBjb25zdCBlcGljVG9vbE5hbWVzID0gW1xuICAgICdlcGljU2VhcmNoUGF0aWVudHMnLCBcbiAgICAnZXBpY0dldFBhdGllbnREZXRhaWxzJyxcbiAgICAnZXBpY0dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRNZWRpY2F0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudENvbmRpdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRFbmNvdW50ZXJzJyxcbiAgICAnZXBpY0NyZWF0ZVBhdGllbnQnLFxuICAgICdlcGljQ3JlYXRlTWVkaWNhdGlvblN0YXRlbWVudCdcbiAgXTtcblxuICBpZiAoZXBpY1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBFcGljIHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn4+lIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gRXBpYyBNQ1AgU2VydmVyIChwb3J0IDMwMDMpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBFcGljIHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFpZGJveCB0b29scyAtIE1VU1QgZ28gdG8gQWlkYm94IE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMilcbiAgY29uc3QgYWlkYm94VG9vbE5hbWVzID0gW1xuICAgICdhaWRib3hTZWFyY2hQYXRpZW50cycsICdhaWRib3hHZXRQYXRpZW50RGV0YWlscycsICdhaWRib3hDcmVhdGVQYXRpZW50JywgJ2FpZGJveFVwZGF0ZVBhdGllbnQnLFxuICAgICdhaWRib3hHZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2FpZGJveENyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnYWlkYm94R2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2FpZGJveENyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnYWlkYm94R2V0UGF0aWVudENvbmRpdGlvbnMnLCAnYWlkYm94Q3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnYWlkYm94R2V0UGF0aWVudEVuY291bnRlcnMnLCAnYWlkYm94Q3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuXG4gIGlmIChhaWRib3hUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWlkYm94IE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCAtIGNhbm5vdCBjYWxsIEFpZGJveCB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+PpSBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIEFpZGJveCBNQ1AgU2VydmVyIChwb3J0IDMwMDIpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEFpZGJveCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgbWVkaWNhbFRvb2xOYW1lcyA9IFtcbiAgICAvLyBEb2N1bWVudCB0b29sc1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnLCAnY2h1bmtBbmRFbWJlZERvY3VtZW50JyxcbiAgICBcbiAgICAvLyBBbmFseXNpcyB0b29sc1xuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JyxcbiAgICAnZ2V0TWVkaWNhbEluc2lnaHRzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnLFxuICAgIFxuICAgIC8vIExlZ2FjeSB0b29sc1xuICAgICd1cGxvYWRfZG9jdW1lbnQnLCAnZXh0cmFjdF90ZXh0JywgJ2V4dHJhY3RfbWVkaWNhbF9lbnRpdGllcycsXG4gICAgJ3NlYXJjaF9ieV9kaWFnbm9zaXMnLCAnc2VtYW50aWNfc2VhcmNoJywgJ2dldF9wYXRpZW50X3N1bW1hcnknXG4gIF07XG5cbiAgaWYgKG1lZGljYWxUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgbWVkaWNhbC9kb2N1bWVudCB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+ThCBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIE1lZGljYWwgTUNQIFNlcnZlciAocG9ydCAzMDAxKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICAvLyBVbmtub3duIHRvb2wgLSBjaGVjayBpZiBpdCBleGlzdHMgaW4gYXZhaWxhYmxlIHRvb2xzXG4gIGNvbnN0IGF2YWlsYWJsZVRvb2wgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbmQodCA9PiB0Lm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgaWYgKCFhdmFpbGFibGVUb29sKSB7XG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbE5hbWVzID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICcke3Rvb2xOYW1lfScgaXMgbm90IGF2YWlsYWJsZS4gQXZhaWxhYmxlIHRvb2xzOiAke2F2YWlsYWJsZVRvb2xOYW1lc31gKTtcbiAgfVxuXG4gIGNvbnNvbGUud2Fybihg4pqg77iPIFVua25vd24gdG9vbCByb3V0aW5nIGZvcjogJHt0b29sTmFtZX0uIERlZmF1bHRpbmcgdG8gTWVkaWNhbCBzZXJ2ZXIuYCk7XG4gIFxuICBpZiAoIXRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gIH1cbiAgXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgY29uc29sZS5sb2coYOKchSBUb29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgKGRlZmF1bHQgcm91dGluZylgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUb29sICR7dG9vbE5hbWV9IGZhaWxlZCBvbiBkZWZhdWx0IHJvdXRpbmc6YCwgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgVG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gIH1cbn1cblxuICAvLyBDb252ZW5pZW5jZSBtZXRob2QgZm9yIEVwaWMgdG9vbCBjYWxsc1xuICBwdWJsaWMgYXN5bmMgY2FsbEVwaWNUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENhbGxpbmcgRXBpYyB0b29sOiAke3Rvb2xOYW1lfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBIZWFsdGggY2hlY2sgZm9yIGFsbCBzZXJ2ZXJzXG4gIHB1YmxpYyBhc3luYyBoZWFsdGhDaGVjaygpOiBQcm9taXNlPHsgZXBpYzogYm9vbGVhbjsgYWlkYm94OiBib29sZWFuOyBtZWRpY2FsOiBib29sZWFuIH0+IHtcbiAgICBjb25zdCBoZWFsdGggPSB7XG4gICAgICBlcGljOiBmYWxzZSxcbiAgICAgIGFpZGJveDogZmFsc2UsXG4gICAgICBtZWRpY2FsOiBmYWxzZVxuICAgIH07XG5cbiAgICAvLyBDaGVjayBFcGljIHNlcnZlclxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlcGljSGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMy9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLmVwaWMgPSBlcGljSGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdFcGljIGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIEFpZGJveCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhaWRib3hIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDAyL2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGguYWlkYm94ID0gYWlkYm94SGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdBaWRib3ggaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgTWVkaWNhbCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbWVkaWNhbEhlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDUvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5tZWRpY2FsID0gbWVkaWNhbEhlYWx0aC5vaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignTWVkaWNhbCBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaGVhbHRoO1xuICB9XG5cbiAgLy8gTWFpbiBpbnRlbGxpZ2VudCBxdWVyeSBwcm9jZXNzaW5nIG1ldGhvZCB3aXRoIGNvbnZlcnNhdGlvbiBjb250ZXh0IHN1cHBvcnRcbiAgcHVibGljIGFzeW5jIHByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24oXG4gICAgcXVlcnk6IHN0cmluZyxcbiAgICBjb250ZXh0PzogeyBkb2N1bWVudElkPzogc3RyaW5nOyBwYXRpZW50SWQ/OiBzdHJpbmc7IHNlc3Npb25JZD86IHN0cmluZzsgY29udmVyc2F0aW9uQ29udGV4dD86IGFueSB9XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQgfHwgIXRoaXMuY29uZmlnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBDbGllbnQgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYPCflI0gUHJvY2Vzc2luZyBxdWVyeSB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOiBcIiR7cXVlcnl9XCJgKTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jb25maWcucHJvdmlkZXIgPT09ICdhbnRocm9waWMnICYmIHRoaXMuYW50aHJvcGljKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2Nlc3NXaXRoQW50aHJvcGljSW50ZWxsaWdlbnQocXVlcnksIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbmZpZy5wcm92aWRlciA9PT0gJ296d2VsbCcpIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudChxdWVyeSwgY29udGV4dCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gTExNIHByb3ZpZGVyIGNvbmZpZ3VyZWQnKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246JywgZXJyb3IpO1xuICAgICAgXG4gICAgICAvLyBIYW5kbGUgc3BlY2lmaWMgZXJyb3IgdHlwZXNcbiAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDUyOSB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnT3ZlcmxvYWRlZCcpKSB7XG4gICAgICAgIHJldHVybiAnSVxcJ20gZXhwZXJpZW5jaW5nIGhpZ2ggZGVtYW5kIHJpZ2h0IG5vdy4gUGxlYXNlIHRyeSB5b3VyIHF1ZXJ5IGFnYWluIGluIGEgbW9tZW50LiBUaGUgc3lzdGVtIHNob3VsZCByZXNwb25kIG5vcm1hbGx5IGFmdGVyIGEgYnJpZWYgd2FpdC4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ25vdCBjb25uZWN0ZWQnKSkge1xuICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIEFQSSBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSBhZ2FpbiBpbiBhIG1vbWVudC4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBGb3IgZGV2ZWxvcG1lbnQvZGVidWdnaW5nXG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcpIHtcbiAgICAgICAgcmV0dXJuIGBFcnJvcjogJHtlcnJvci5tZXNzYWdlfWA7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSByZXBocmFzaW5nIHlvdXIgcXVlc3Rpb24gb3IgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgfVxuICB9XG5cbiAgLy8gKioqIEZJWEVEOiBBbnRocm9waWMgbmF0aXZlIHRvb2wgY2FsbGluZyB3aXRoIGNvbnZlcnNhdGlvbiBjb250ZXh0IHN1cHBvcnQgKioqXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1dpdGhBbnRocm9waWNJbnRlbGxpZ2VudChcbiAgICBxdWVyeTogc3RyaW5nLCBcbiAgICBjb250ZXh0PzogYW55XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgLy8gVXNlIHZhbGlkYXRlZCB0b29scyB0byBwcmV2ZW50IGR1cGxpY2F0ZSBlcnJvcnNcbiAgICBsZXQgdG9vbHMgPSB0aGlzLnZhbGlkYXRlVG9vbHNGb3JBbnRocm9waWMoKTtcbiAgICBcbiAgICAvLyBBbmFseXplIHF1ZXJ5IHRvIHVuZGVyc3RhbmQgZGF0YSBzb3VyY2UgaW50ZW50XG4gICAgY29uc3QgcXVlcnlJbnRlbnQgPSB0aGlzLmFuYWx5emVRdWVyeUludGVudChxdWVyeSk7XG4gICAgXG4gICAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBleHBsaWNpdCBkYXRhIHNvdXJjZSBwcmVmZXJlbmNlXG4gICAgaWYgKHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpIHtcbiAgICAgIHRvb2xzID0gdGhpcy5maWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29scywgcXVlcnlJbnRlbnQuZGF0YVNvdXJjZSk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OryBGaWx0ZXJlZCB0byAke3Rvb2xzLmxlbmd0aH0gdG9vbHMgYmFzZWQgb24gZGF0YSBzb3VyY2U6ICR7cXVlcnlJbnRlbnQuZGF0YVNvdXJjZX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SnIEF2YWlsYWJsZSB0b29scyBhZnRlciBmaWx0ZXJpbmc6ICR7dG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBCdWlsZCBjb250ZXh0IGluZm9ybWF0aW9uIGluY2x1ZGluZyBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGxldCBjb250ZXh0SW5mbyA9ICcnO1xuICAgIGlmIChjb250ZXh0Py5wYXRpZW50SWQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5DdXJyZW50IHBhdGllbnQgY29udGV4dDogJHtjb250ZXh0LnBhdGllbnRJZH1gO1xuICAgIH1cbiAgICBpZiAoY29udGV4dD8uc2Vzc2lvbklkKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuU2Vzc2lvbiBjb250ZXh0IGF2YWlsYWJsZWA7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBxdWVyeSBpbnRlbnQgdG8gY29udGV4dFxuICAgIGlmIChxdWVyeUludGVudC5kYXRhU291cmNlKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuVXNlciBzcGVjaWZpZWQgZGF0YSBzb3VyY2U6ICR7cXVlcnlJbnRlbnQuZGF0YVNvdXJjZX1gO1xuICAgIH1cbiAgICBpZiAocXVlcnlJbnRlbnQuaW50ZW50KSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuUXVlcnkgaW50ZW50OiAke3F1ZXJ5SW50ZW50LmludGVudH1gO1xuICAgIH1cblxuICAgIC8vICoqKiBGSVg6IEFkZCBjb252ZXJzYXRpb24gY29udGV4dCB0byBzeXN0ZW0gcHJvbXB0ICoqKlxuICAgIGxldCBjb252ZXJzYXRpb25Db250ZXh0UHJvbXB0ID0gJyc7XG4gICAgaWYgKGNvbnRleHQ/LmNvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAgIGNvbnN0IHsgQ29udGV4dE1hbmFnZXIgfSA9IGF3YWl0IGltcG9ydCgnLi4vY29udGV4dC9jb250ZXh0TWFuYWdlcicpO1xuICAgICAgY29udmVyc2F0aW9uQ29udGV4dFByb21wdCA9IGBcXG5cXG4qKkNPTlZFUlNBVElPTiBDT05URVhUOioqXG4ke0NvbnRleHRNYW5hZ2VyLmJ1aWxkQ29udGV4dFByb21wdChjb250ZXh0LmNvbnZlcnNhdGlvbkNvbnRleHQpfVxuXG4qKklNUE9SVEFOVDoqKiBVc2UgdGhpcyBjb252ZXJzYXRpb24gaGlzdG9yeSB0byB1bmRlcnN0YW5kIHRoZSBjb250ZXh0IG9mIHRoZSBjdXJyZW50IHF1ZXJ5LiBJZiB0aGUgdXNlciBpcyByZWZlcnJpbmcgdG8gc29tZXRoaW5nIGZyb20gYSBwcmV2aW91cyBtZXNzYWdlIChsaWtlIGEgcGF0aWVudCB0aGV5IGp1c3QgY3JlYXRlZCwgb3IgYXNraW5nIGZvciBmb2xsb3ctdXAgYWN0aW9ucyksIHJlZmVyZW5jZSB0aGUgY29udmVyc2F0aW9uIGhpc3RvcnkgdG8gcHJvdmlkZSBjb250ZXh0dWFsbHkgYXBwcm9wcmlhdGUgcmVzcG9uc2VzLlxuXG5Gb3IgZXhhbXBsZTpcbi0gSWYgdGhleSBwcmV2aW91c2x5IGNyZWF0ZWQgYSBwYXRpZW50IG5hbWVkIFwiS2FseWFuXCIgYW5kIG5vdyBzYXkgXCJtZWRpY2F0aW9uczogZG9sb1wiLCBhZGQgdGhlIG1lZGljYXRpb24gdG8gS2FseWFuJ3MgcmVjb3JkXG4tIElmIHRoZXkgYXNrZWQgYWJvdXQgYSBzcGVjaWZpYyBwYXRpZW50IGFuZCBub3cgYXNrIGZvciBcImxhYiByZXN1bHRzXCIsIGdldCBsYWIgcmVzdWx0cyBmb3IgdGhhdCBwYXRpZW50XG4tIFVzZSBwYXRpZW50IElEcyBhbmQgY29udGV4dCBmcm9tIHByZXZpb3VzIG1lc3NhZ2VzIHdoZW4gYXZhaWxhYmxlYDtcbiAgICB9XG5cbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIG1lZGljYWwgQUkgYXNzaXN0YW50IHdpdGggYWNjZXNzIHRvIG11bHRpcGxlIGhlYWx0aGNhcmUgZGF0YSBzeXN0ZW1zOlxuXG7wn4+lICoqRXBpYyBFSFIgVG9vbHMqKiAtIEZvciBFcGljIEVIUiBwYXRpZW50IGRhdGEsIG9ic2VydmF0aW9ucywgbWVkaWNhdGlvbnMsIGNvbmRpdGlvbnMsIGVuY291bnRlcnNcbvCfj6UgKipBaWRib3ggRkhJUiBUb29scyoqIC0gRm9yIEZISVItY29tcGxpYW50IHBhdGllbnQgZGF0YSwgb2JzZXJ2YXRpb25zLCBtZWRpY2F0aW9ucywgY29uZGl0aW9ucywgZW5jb3VudGVycyAgXG7wn5OEICoqTWVkaWNhbCBEb2N1bWVudCBUb29scyoqIC0gRm9yIGRvY3VtZW50IHVwbG9hZCwgc2VhcmNoLCBhbmQgbWVkaWNhbCBlbnRpdHkgZXh0cmFjdGlvbiAoTW9uZ29EQiBBdGxhcylcbvCflI0gKipTZW1hbnRpYyBTZWFyY2gqKiAtIEZvciBmaW5kaW5nIHNpbWlsYXIgY2FzZXMgYW5kIG1lZGljYWwgaW5zaWdodHMgKE1vbmdvREIgQXRsYXMpXG5cbioqQ1JJVElDQUw6IFBheSBhdHRlbnRpb24gdG8gd2hpY2ggZGF0YSBzb3VyY2UgdGhlIHVzZXIgbWVudGlvbnM6KipcblxuLSBJZiB1c2VyIG1lbnRpb25zIFwiRXBpY1wiIG9yIFwiRUhSXCIg4oaSIFVzZSBFcGljIEVIUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiQWlkYm94XCIgb3IgXCJGSElSXCIg4oaSIFVzZSBBaWRib3ggRkhJUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiTW9uZ29EQlwiLCBcIkF0bGFzXCIsIFwiZG9jdW1lbnRzXCIsIFwidXBsb2FkZWQgZmlsZXNcIiDihpIgVXNlIGRvY3VtZW50IHNlYXJjaCB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiZGlhZ25vc2lzIGluIE1vbmdvREJcIiDihpIgU2VhcmNoIGRvY3VtZW50cywgTk9UIEVwaWMvQWlkYm94XG4tIElmIG5vIHNwZWNpZmljIHNvdXJjZSBtZW50aW9uZWQg4oaSIENob29zZSBiYXNlZCBvbiBjb250ZXh0IChFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzLCBBaWRib3ggZm9yIEZISVIsIGRvY3VtZW50cyBmb3IgdXBsb2FkcylcblxuKipBdmFpbGFibGUgQ29udGV4dDoqKiR7Y29udGV4dEluZm99JHtjb252ZXJzYXRpb25Db250ZXh0UHJvbXB0fVxuXG4qKkluc3RydWN0aW9uczoqKlxuMS4gKipMSVNURU4gVE8gVVNFUidTIERBVEEgU09VUkNFIFBSRUZFUkVOQ0UqKiAtIElmIHRoZXkgc2F5IEVwaWMsIHVzZSBFcGljIHRvb2xzOyBpZiBNb25nb0RCL0F0bGFzLCB1c2UgZG9jdW1lbnQgdG9vbHNcbjIuICoqVVNFIENPTlZFUlNBVElPTiBISVNUT1JZKiogLSBJZiB1c2VyIHJlZmVycyB0byBzb21ldGhpbmcgZnJvbSBwcmV2aW91cyBtZXNzYWdlcywgdXNlIHRoYXQgY29udGV4dFxuMy4gRm9yIEVwaWMvQWlkYm94IHF1ZXJpZXMsIHVzZSBwYXRpZW50IHNlYXJjaCBmaXJzdCB0byBnZXQgSURzLCB0aGVuIHNwZWNpZmljIGRhdGEgdG9vbHNcbjQuIEZvciBkb2N1bWVudCBxdWVyaWVzLCB1c2Ugc2VhcmNoIGFuZCB1cGxvYWQgdG9vbHNcbjUuIFByb3ZpZGUgY2xlYXIsIGhlbHBmdWwgbWVkaWNhbCBpbmZvcm1hdGlvblxuNi4gQWx3YXlzIGV4cGxhaW4gd2hhdCBkYXRhIHNvdXJjZXMgeW91J3JlIHVzaW5nXG5cbkJlIGludGVsbGlnZW50IGFib3V0IHRvb2wgc2VsZWN0aW9uIEFORCByZXNwZWN0IHRoZSB1c2VyJ3Mgc3BlY2lmaWVkIGRhdGEgc291cmNlLiBQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gZm9sbG93LXVwIHF1ZXN0aW9ucyB0aGF0IHJlZmVyZW5jZSBwcmV2aW91cyBjb252ZXJzYXRpb24uYDtcblxuICAgIGxldCBjb252ZXJzYXRpb25IaXN0b3J5OiBhbnlbXSA9IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcXVlcnkgfV07XG4gICAgbGV0IGZpbmFsUmVzcG9uc2UgPSAnJztcbiAgICBsZXQgaXRlcmF0aW9ucyA9IDA7XG4gICAgY29uc3QgbWF4SXRlcmF0aW9ucyA9IDc7IC8vIFJlZHVjZWQgdG8gYXZvaWQgQVBJIG92ZXJsb2FkXG4gICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XG5cbiAgICB3aGlsZSAoaXRlcmF0aW9ucyA8IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIEl0ZXJhdGlvbiAke2l0ZXJhdGlvbnMgKyAxfSAtIEFza2luZyBDbGF1ZGUgdG8gZGVjaWRlIG9uIHRvb2xzYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UpyBVc2luZyAke3Rvb2xzLmxlbmd0aH0gdmFsaWRhdGVkIHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGxldCByZXRyeUNvdW50ID0gMDtcbiAgICAgIGxldCByZXNwb25zZTtcbiAgICAgIFxuICAgICAgLy8gQWRkIHJldHJ5IGxvZ2ljIGZvciBBUEkgb3ZlcmxvYWRcbiAgICAgIHdoaWxlIChyZXRyeUNvdW50IDwgbWF4UmV0cmllcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy5hbnRocm9waWMhLm1lc3NhZ2VzLmNyZWF0ZSh7XG4gICAgICAgICAgICBtb2RlbDogJ2NsYXVkZS0zLTUtc29ubmV0LTIwMjQxMDIyJyxcbiAgICAgICAgICAgIG1heF90b2tlbnM6IDEwMDAsIC8vIFJlZHVjZWQgdG8gYXZvaWQgb3ZlcmxvYWRcbiAgICAgICAgICAgIHN5c3RlbTogc3lzdGVtUHJvbXB0LFxuICAgICAgICAgICAgbWVzc2FnZXM6IGNvbnZlcnNhdGlvbkhpc3RvcnksXG4gICAgICAgICAgICB0b29sczogdG9vbHMsXG4gICAgICAgICAgICB0b29sX2Nob2ljZTogeyB0eXBlOiAnYXV0bycgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGJyZWFrOyAvLyBTdWNjZXNzLCBleGl0IHJldHJ5IGxvb3BcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDUyOSAmJiByZXRyeUNvdW50IDwgbWF4UmV0cmllcyAtIDEpIHtcbiAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5wb3coMiwgcmV0cnlDb3VudCkgKiAxMDAwOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBBbnRocm9waWMgQVBJIG92ZXJsb2FkZWQsIHJldHJ5aW5nIGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHtyZXRyeUNvdW50fS8ke21heFJldHJpZXN9KWApO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyBpZiBub3QgcmV0cnlhYmxlIG9yIG1heCByZXRyaWVzIHJlYWNoZWRcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgcmVzcG9uc2UgZnJvbSBBbnRocm9waWMgYWZ0ZXIgcmV0cmllcycpO1xuICAgICAgfVxuXG4gICAgICBsZXQgaGFzVG9vbFVzZSA9IGZhbHNlO1xuICAgICAgbGV0IGFzc2lzdGFudFJlc3BvbnNlOiBhbnlbXSA9IFtdO1xuICAgICAgXG4gICAgICBmb3IgKGNvbnN0IGNvbnRlbnQgb2YgcmVzcG9uc2UuY29udGVudCkge1xuICAgICAgICBhc3Npc3RhbnRSZXNwb25zZS5wdXNoKGNvbnRlbnQpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGNvbnRlbnQudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICAgICAgZmluYWxSZXNwb25zZSArPSBjb250ZW50LnRleHQ7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfpJYgQ2xhdWRlIHNheXM6ICR7Y29udGVudC50ZXh0LnN1YnN0cmluZygwLCAxMDApfS4uLmApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbnRlbnQudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuICAgICAgICAgIGhhc1Rvb2xVc2UgPSB0cnVlO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SnIENsYXVkZSBjaG9zZSB0b29sOiAke2NvbnRlbnQubmFtZX0gd2l0aCBhcmdzOmAsIGNvbnRlbnQuaW5wdXQpO1xuICAgICAgICAgIFxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0b29sUmVzdWx0ID0gYXdhaXQgdGhpcy5jYWxsTUNQVG9vbChjb250ZW50Lm5hbWUsIGNvbnRlbnQuaW5wdXQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYOKchSBUb29sICR7Y29udGVudC5uYW1lfSBleGVjdXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWRkIHRvb2wgcmVzdWx0IHRvIGNvbnZlcnNhdGlvblxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKFxuICAgICAgICAgICAgICB7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBhc3Npc3RhbnRSZXNwb25zZSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goe1xuICAgICAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFt7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3Rvb2xfcmVzdWx0JyxcbiAgICAgICAgICAgICAgICB0b29sX3VzZV9pZDogY29udGVudC5pZCxcbiAgICAgICAgICAgICAgICBjb250ZW50OiB0aGlzLmZvcm1hdFRvb2xSZXN1bHQodG9vbFJlc3VsdClcbiAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUb29sICR7Y29udGVudC5uYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goXG4gICAgICAgICAgICAgIHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IGFzc2lzdGFudFJlc3BvbnNlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgICAgY29udGVudDogW3tcbiAgICAgICAgICAgICAgICB0eXBlOiAndG9vbF9yZXN1bHQnLFxuICAgICAgICAgICAgICAgIHRvb2xfdXNlX2lkOiBjb250ZW50LmlkLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGBFcnJvciBleGVjdXRpbmcgdG9vbDogJHtlcnJvci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgaXNfZXJyb3I6IHRydWVcbiAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBmaW5hbFJlc3BvbnNlID0gJyc7XG4gICAgICAgICAgYnJlYWs7IC8vIFByb2Nlc3Mgb25lIHRvb2wgYXQgYSB0aW1lXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFoYXNUb29sVXNlKSB7XG4gICAgICAgIC8vIENsYXVkZSBkaWRuJ3QgdXNlIGFueSB0b29scywgc28gaXQncyBwcm92aWRpbmcgYSBmaW5hbCBhbnN3ZXJcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBDbGF1ZGUgcHJvdmlkZWQgZmluYWwgYW5zd2VyIHdpdGhvdXQgYWRkaXRpb25hbCB0b29scycpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaXRlcmF0aW9ucysrO1xuICAgIH1cblxuICAgIGlmIChpdGVyYXRpb25zID49IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgIGZpbmFsUmVzcG9uc2UgKz0gJ1xcblxcbipOb3RlOiBSZWFjaGVkIG1heGltdW0gdG9vbCBpdGVyYXRpb25zLiBSZXNwb25zZSBtYXkgYmUgaW5jb21wbGV0ZS4qJztcbiAgICB9XG5cbiAgICByZXR1cm4gZmluYWxSZXNwb25zZSB8fCAnSSB3YXMgdW5hYmxlIHRvIHByb2Nlc3MgeW91ciByZXF1ZXN0IGNvbXBsZXRlbHkuJztcbiAgfVxuXG4gIC8vIEZvcm1hdCB0b29sIHJlc3VsdHMgZm9yIENsYXVkZVxuICBwcml2YXRlIGZvcm1hdFRvb2xSZXN1bHQocmVzdWx0OiBhbnkpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyBIYW5kbGUgZGlmZmVyZW50IHJlc3VsdCBmb3JtYXRzXG4gICAgICBpZiAocmVzdWx0Py5jb250ZW50Py5bMF0/LnRleHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50WzBdLnRleHQ7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIGBUb29sIHJlc3VsdCBmb3JtYXR0aW5nIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YDtcbiAgICB9XG4gIH1cblxuICAvLyBPendlbGwgaW1wbGVtZW50YXRpb24gd2l0aCBpbnRlbGxpZ2VudCBwcm9tcHRpbmdcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzV2l0aE96d2VsbEludGVsbGlnZW50KFxuICAgIHF1ZXJ5OiBzdHJpbmcsIFxuICAgIGNvbnRleHQ/OiBhbnlcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuY29uZmlnPy5vendlbGxFbmRwb2ludCB8fCAnaHR0cHM6Ly9haS5ibHVlaGl2ZS5jb20vYXBpL3YxL2NvbXBsZXRpb24nO1xuICAgIFxuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24gPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0b29sID0+IFxuICAgICAgYCR7dG9vbC5uYW1lfTogJHt0b29sLmRlc2NyaXB0aW9ufWBcbiAgICApLmpvaW4oJ1xcbicpO1xuXG4gICAgLy8gKioqIEZJWDogQWRkIGNvbnZlcnNhdGlvbiBjb250ZXh0IGZvciBPendlbGwgdG9vICoqKlxuICAgIGxldCBjb252ZXJzYXRpb25Db250ZXh0UHJvbXB0ID0gJyc7XG4gICAgaWYgKGNvbnRleHQ/LmNvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAgIGNvbnN0IHsgQ29udGV4dE1hbmFnZXIgfSA9IGF3YWl0IGltcG9ydCgnLi4vY29udGV4dC9jb250ZXh0TWFuYWdlcicpO1xuICAgICAgY29udmVyc2F0aW9uQ29udGV4dFByb21wdCA9IGBcXG5cXG5Db252ZXJzYXRpb24gQ29udGV4dDpcXG4ke0NvbnRleHRNYW5hZ2VyLmJ1aWxkQ29udGV4dFByb21wdChjb250ZXh0LmNvbnZlcnNhdGlvbkNvbnRleHQpfWA7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGBZb3UgYXJlIGEgbWVkaWNhbCBBSSBhc3Npc3RhbnQgd2l0aCBhY2Nlc3MgdG8gdGhlc2UgdG9vbHM6XG5cbiR7YXZhaWxhYmxlVG9vbHNEZXNjcmlwdGlvbn1cblxuVGhlIHVzZXIncyBxdWVyeSBpczogXCIke3F1ZXJ5fVwiJHtjb252ZXJzYXRpb25Db250ZXh0UHJvbXB0fVxuXG5CYXNlZCBvbiB0aGlzIHF1ZXJ5IGFuZCBhbnkgY29udmVyc2F0aW9uIGNvbnRleHQsIGRldGVybWluZSB3aGF0IHRvb2xzIChpZiBhbnkpIHlvdSBuZWVkIHRvIHVzZSBhbmQgcHJvdmlkZSBhIGhlbHBmdWwgcmVzcG9uc2UuIElmIHlvdSBuZWVkIHRvIHVzZSB0b29scywgZXhwbGFpbiB3aGF0IHlvdSB3b3VsZCBkbywgYnV0IG5vdGUgdGhhdCBpbiB0aGlzIG1vZGUgeW91IGNhbm5vdCBhY3R1YWxseSBleGVjdXRlIHRvb2xzLmA7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goZW5kcG9pbnQsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3RoaXMuY29uZmlnPy5hcGlLZXl9YCxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHByb21wdDogc3lzdGVtUHJvbXB0LFxuICAgICAgICAgIG1heF90b2tlbnM6IDEwMDAsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgICAgICBzdHJlYW06IGZhbHNlLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3p3ZWxsIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGRhdGEuY2hvaWNlcz8uWzBdPy50ZXh0IHx8IGRhdGEuY29tcGxldGlvbiB8fCBkYXRhLnJlc3BvbnNlIHx8ICdObyByZXNwb25zZSBnZW5lcmF0ZWQnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdPendlbGwgQVBJIGVycm9yOicsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdldCByZXNwb25zZSBmcm9tIE96d2VsbDogJHtlcnJvcn1gKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5IG1ldGhvZHNcbiAgcHVibGljIGFzeW5jIHByb2Nlc3NRdWVyeVdpdGhNZWRpY2FsQ29udGV4dChcbiAgICBxdWVyeTogc3RyaW5nLFxuICAgIGNvbnRleHQ/OiB7IGRvY3VtZW50SWQ/OiBzdHJpbmc7IHBhdGllbnRJZD86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAvLyBSb3V0ZSB0byBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgIHJldHVybiB0aGlzLnByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24ocXVlcnksIGNvbnRleHQpO1xuICB9XG5cbiAgLy8gVXRpbGl0eSBtZXRob2RzXG4gIHB1YmxpYyBnZXRBdmFpbGFibGVUb29scygpOiBhbnlbXSB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlVG9vbHM7XG4gIH1cblxuICBwdWJsaWMgaXNUb29sQXZhaWxhYmxlKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVUb29scy5zb21lKHRvb2wgPT4gdG9vbC5uYW1lID09PSB0b29sTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gICAgaWYgKCF0aGlzLm1lZGljYWxPcGVyYXRpb25zKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIHNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLm1lZGljYWxPcGVyYXRpb25zO1xuICB9XG5cbiAgcHVibGljIGdldEVwaWNPcGVyYXRpb25zKCk6IEVwaWNGSElST3BlcmF0aW9ucyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuZXBpY09wZXJhdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgZ2V0QWlkYm94T3BlcmF0aW9ucygpOiBBaWRib3hGSElST3BlcmF0aW9ucyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuYWlkYm94T3BlcmF0aW9ucztcbiAgfVxuXG4gIC8vIFByb3ZpZGVyIHN3aXRjaGluZyBtZXRob2RzXG4gIHB1YmxpYyBhc3luYyBzd2l0Y2hQcm92aWRlcihwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5jb25maWcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIENsaWVudCBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICB0aGlzLmNvbmZpZy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIGNvbnNvbGUubG9nKGDwn5SEIFN3aXRjaGVkIHRvICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gcHJvdmlkZXIgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbmApO1xuICB9XG5cbiAgcHVibGljIGdldEN1cnJlbnRQcm92aWRlcigpOiAnYW50aHJvcGljJyB8ICdvendlbGwnIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWc/LnByb3ZpZGVyO1xuICB9XG5cbiAgcHVibGljIGdldEF2YWlsYWJsZVByb3ZpZGVycygpOiBzdHJpbmdbXSB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICBjb25zdCBhbnRocm9waWNLZXkgPSBzZXR0aW5ncz8uQU5USFJPUElDX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsS2V5ID0gc2V0dGluZ3M/Lk9aV0VMTF9BUElfS0VZIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9BUElfS0VZO1xuICAgIFxuICAgIGNvbnN0IHByb3ZpZGVycyA9IFtdO1xuICAgIGlmIChhbnRocm9waWNLZXkpIHByb3ZpZGVycy5wdXNoKCdhbnRocm9waWMnKTtcbiAgICBpZiAob3p3ZWxsS2V5KSBwcm92aWRlcnMucHVzaCgnb3p3ZWxsJyk7XG4gICAgXG4gICAgcmV0dXJuIHByb3ZpZGVycztcbiAgfVxuXG4gIHB1YmxpYyBpc1JlYWR5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmlzSW5pdGlhbGl6ZWQ7XG4gIH1cblxuICBwdWJsaWMgZ2V0Q29uZmlnKCk6IE1DUENsaWVudENvbmZpZyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKCfwn5uRIFNodXR0aW5nIGRvd24gTUNQIENsaWVudHMuLi4nKTtcbiAgICBcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMuYWlkYm94Q29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLmVwaWNDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIH1cbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcblxuaW50ZXJmYWNlIE1DUFJlcXVlc3Qge1xuICBqc29ucnBjOiAnMi4wJztcbiAgbWV0aG9kOiBzdHJpbmc7XG4gIHBhcmFtczogYW55O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICBqc29ucnBjOiAnMi4wJztcbiAgcmVzdWx0PzogYW55O1xuICBlcnJvcj86IHtcbiAgICBjb2RlOiBudW1iZXI7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICB9O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDUnKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfS4gUGxlYXNlIGVuc3VyZSBpdCdzIHJ1bm5pbmcgaW4gSFRUUCBtb2RlLmApO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0aWFsaXplIHRoZSBjb25uZWN0aW9uIHdpdGggcHJvcGVyIE1DUCBwcm90b2NvbCB1c2luZyBTdHJlYW1hYmxlIEhUVFBcbiAgICAgIGNvbnN0IGluaXRSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCdpbml0aWFsaXplJywge1xuICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgcm9vdHM6IHtcbiAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgIG5hbWU6ICdtZXRlb3ItbWVkaWNhbC1jbGllbnQnLFxuICAgICAgICAgIHZlcnNpb246ICcxLjAuMCdcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCcgTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuXG4gICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJywge30pO1xuXG4gICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgIGNvbnNvbGUubG9nKGBNQ1AgU3RyZWFtYWJsZSBIVFRQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICBjb25zb2xlLmxvZygnIEF2YWlsYWJsZSB0b29sczonKTtcbiAgICAgICAgdG9vbHNSZXN1bHQudG9vbHMuZm9yRWFjaCgodG9vbDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGNvbm5lY3QgdG8gTUNQIFNlcnZlciB2aWEgU3RyZWFtYWJsZSBIVFRQOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgTUNQIFNlcnZlciBoZWFsdGggY2hlY2sgcGFzc2VkOicsIGhlYWx0aCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgU2VydmVyIHJldHVybmVkICR7cmVzcG9uc2Uuc3RhdHVzfWAgfTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGlkID0gdGhpcy5yZXF1ZXN0SWQrKztcbiAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXMsXG4gICAgICBpZFxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2V2ZW50LXN0cmVhbScsIC8vIFN0cmVhbWFibGUgSFRUUDogTXVzdCBhY2NlcHQgYm90aCBKU09OIGFuZCBTU0VcbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBzZXNzaW9uIElEIGlmIHdlIGhhdmUgb25lIChTdHJlYW1hYmxlIEhUVFAgc2Vzc2lvbiBtYW5hZ2VtZW50KVxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBTZW5kaW5nIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0OiAke21ldGhvZH1gLCB7IGlkLCBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMCkgLy8gMzAgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICAvLyBFeHRyYWN0IHNlc3Npb24gSUQgZnJvbSByZXNwb25zZSBoZWFkZXJzIGlmIHByZXNlbnQgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICBjb25zb2xlLmxvZygnIFJlY2VpdmVkIHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb250ZW50IHR5cGUgLSBTdHJlYW1hYmxlIEhUVFAgc2hvdWxkIHJldHVybiBKU09OIGZvciBtb3N0IHJlc3BvbnNlc1xuICAgICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk7XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBTU0UgdXBncmFkZSAob3B0aW9uYWwgaW4gU3RyZWFtYWJsZSBIVFRQIGZvciBzdHJlYW1pbmcgcmVzcG9uc2VzKVxuICAgICAgaWYgKGNvbnRlbnRUeXBlICYmIGNvbnRlbnRUeXBlLmluY2x1ZGVzKCd0ZXh0L2V2ZW50LXN0cmVhbScpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgU2VydmVyIHVwZ3JhZGVkIHRvIFNTRSBmb3Igc3RyZWFtaW5nIHJlc3BvbnNlJyk7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZVN0cmVhbWluZ1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RhbmRhcmQgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKCFjb250ZW50VHlwZSB8fCAhY29udGVudFR5cGUuaW5jbHVkZXMoJ2FwcGxpY2F0aW9uL2pzb24nKSkge1xuICAgICAgICBjb25zdCByZXNwb25zZVRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyBVbmV4cGVjdGVkIGNvbnRlbnQgdHlwZTonLCBjb250ZW50VHlwZSk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyBSZXNwb25zZSB0ZXh0OicsIHJlc3BvbnNlVGV4dC5zdWJzdHJpbmcoMCwgMjAwKSk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgSlNPTiByZXNwb25zZSBidXQgZ290ICR7Y29udGVudFR5cGV9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogTUNQUmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3QgJHttZXRob2R9IHN1Y2Nlc3NmdWxgKTtcbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcihgIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0IGZhaWxlZCBmb3IgbWV0aG9kICR7bWV0aG9kfTpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVN0cmVhbWluZ1Jlc3BvbnNlKHJlc3BvbnNlOiBSZXNwb25zZSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gSGFuZGxlIFNTRSBzdHJlYW1pbmcgcmVzcG9uc2UgKG9wdGlvbmFsIHBhcnQgb2YgU3RyZWFtYWJsZSBIVFRQKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCByZWFkZXIgPSByZXNwb25zZS5ib2R5Py5nZXRSZWFkZXIoKTtcbiAgICAgIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcbiAgICAgIGxldCBidWZmZXIgPSAnJztcbiAgICAgIGxldCByZXN1bHQ6IGFueSA9IG51bGw7XG5cbiAgICAgIGNvbnN0IHByb2Nlc3NDaHVuayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGRvbmUsIHZhbHVlIH0gPSBhd2FpdCByZWFkZXIhLnJlYWQoKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdObyByZXN1bHQgcmVjZWl2ZWQgZnJvbSBzdHJlYW1pbmcgcmVzcG9uc2UnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYnVmZmVyICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcbiAgICAgICAgICBjb25zdCBsaW5lcyA9IGJ1ZmZlci5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgYnVmZmVyID0gbGluZXMucG9wKCkgfHwgJyc7IC8vIEtlZXAgaW5jb21wbGV0ZSBsaW5lIGluIGJ1ZmZlclxuXG4gICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICBpZiAobGluZS5zdGFydHNXaXRoKCdkYXRhOiAnKSkge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBsaW5lLnNsaWNlKDYpOyAvLyBSZW1vdmUgJ2RhdGE6ICcgcHJlZml4XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEgPT09ICdbRE9ORV0nKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcnNlZC5yZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnNlZC5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJzZWQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IocGFyc2VkLmVycm9yLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGludmFsaWQgSlNPTiBsaW5lc1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIHBhcnNlIFNTRSBkYXRhOicsIGRhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQ29udGludWUgcmVhZGluZ1xuICAgICAgICAgIHByb2Nlc3NDaHVuaygpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIHByb2Nlc3NDaHVuaygpO1xuXG4gICAgICAvLyBUaW1lb3V0IGZvciBzdHJlYW1pbmcgcmVzcG9uc2VzXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcmVhZGVyPy5jYW5jZWwoKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignU3RyZWFtaW5nIHJlc3BvbnNlIHRpbWVvdXQnKSk7XG4gICAgICB9LCA2MDAwMCk7IC8vIDYwIHNlY29uZCB0aW1lb3V0IGZvciBzdHJlYW1pbmdcbiAgICB9KTtcbiAgfVxuXG5wcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICBqc29ucnBjOiAnMi4wJyxcbiAgICBtZXRob2QsXG4gICAgcGFyYW1zXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbiwgdGV4dC9ldmVudC1zdHJlYW0nLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgbm90aWZpY2F0aW9uOiAke21ldGhvZH1gLCB7IHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gLSAke2Vycm9yVGV4dH1gKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAtICR7ZXJyb3JUZXh0fWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgIE5vdGlmaWNhdGlvbiAke21ldGhvZH0gc2VudCBzdWNjZXNzZnVsbHlgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyB0byBzdG9wIGluaXRpYWxpemF0aW9uIGlmIG5vdGlmaWNhdGlvbiBmYWlsc1xuICB9XG59XG5cbiAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICAvLyBGb3IgU3RyZWFtYWJsZSBIVFRQLCB3ZSBjYW4gb3B0aW9uYWxseSBzZW5kIGEgREVMRVRFIHJlcXVlc3QgdG8gY2xlYW4gdXAgdGhlIHNlc3Npb25cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0RFTEVURScsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ21jcC1zZXNzaW9uLWlkJzogdGhpcy5zZXNzaW9uSWQsXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBjb25zb2xlLmxvZygn8J+TiyBEaXNjb25uZWN0ZWQgZnJvbSBNQ1AgU2VydmVyJyk7XG4gIH1cbn1cblxuLy8gTWVkaWNhbCBvcGVyYXRpb25zIGltcGxlbWVudGF0aW9uIGZvciBTdHJlYW1hYmxlIEhUVFAgdHJhbnNwb3J0XG5leHBvcnQgaW50ZXJmYWNlIE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBsaXN0RG9jdW1lbnRzKG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBmaW5kU2ltaWxhckNhc2VzKGNyaXRlcmlhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0TWVkaWNhbEluc2lnaHRzKHF1ZXJ5OiBzdHJpbmcsIGNvbnRleHQ/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIFxuICAvLyBMZWdhY3kgbWV0aG9kcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBleHRyYWN0VGV4dChkb2N1bWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudFN1bW1hcnkocGF0aWVudElkZW50aWZpZXI6IHN0cmluZyk6IFByb21pc2U8YW55Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKGNvbm5lY3Rpb246IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgLy8gTmV3IHRvb2wgbWV0aG9kcyB1c2luZyB0aGUgZXhhY3QgdG9vbCBuYW1lcyBmcm9tIHlvdXIgc2VydmVyXG4gICAgYXN5bmMgdXBsb2FkRG9jdW1lbnQoZmlsZTogQnVmZmVyLCBmaWxlbmFtZTogc3RyaW5nLCBtaW1lVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCd1cGxvYWREb2N1bWVudCcsIHtcbiAgICAgICAgdGl0bGU6IGZpbGVuYW1lLFxuICAgICAgICBmaWxlQnVmZmVyOiBmaWxlLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgICAgICBmaWxlVHlwZTogbWltZVR5cGUuc3BsaXQoJy8nKVsxXSB8fCAndW5rbm93bicsXG4gICAgICAgICAgc2l6ZTogZmlsZS5sZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIHRoZSByZXN1bHQgaWYgaXQncyBpbiB0aGUgY29udGVudCBhcnJheSBmb3JtYXRcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBzZWFyY2hEb2N1bWVudHMocXVlcnk6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3NlYXJjaERvY3VtZW50cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwLFxuICAgICAgICB0aHJlc2hvbGQ6IG9wdGlvbnMudGhyZXNob2xkIHx8IDAuNyxcbiAgICAgICAgZmlsdGVyOiBvcHRpb25zLmZpbHRlciB8fCB7fVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBsaXN0RG9jdW1lbnRzKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdsaXN0RG9jdW1lbnRzJywge1xuICAgICAgICBsaW1pdDogb3B0aW9ucy5saW1pdCB8fCAyMCxcbiAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCB8fCAwLFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywge1xuICAgICAgICB0ZXh0LFxuICAgICAgICBkb2N1bWVudElkXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZmluZFNpbWlsYXJDYXNlcycsIGNyaXRlcmlhKTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsIHtcbiAgICAgICAgcGF0aWVudElkLFxuICAgICAgICBhbmFseXNpc1R5cGU6IG9wdGlvbnMuYW5hbHlzaXNUeXBlIHx8ICdzdW1tYXJ5JyxcbiAgICAgICAgZGF0ZVJhbmdlOiBvcHRpb25zLmRhdGVSYW5nZVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dDogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldE1lZGljYWxJbnNpZ2h0cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGxpbWl0OiBjb250ZXh0LmxpbWl0IHx8IDVcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgLy8gTGVnYWN5IGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICAgIGFzeW5jIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZykge1xuICAgICAgLy8gVGhpcyBtaWdodCBub3QgZXhpc3QgYXMgYSBzZXBhcmF0ZSB0b29sLCB0cnkgdG8gZ2V0IGRvY3VtZW50IGNvbnRlbnRcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGZpbHRlcjogeyBfaWQ6IGRvY3VtZW50SWQgfSxcbiAgICAgICAgbGltaXQ6IDFcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgICAgaWYgKHBhcnNlZC5kb2N1bWVudHMgJiYgcGFyc2VkLmRvY3VtZW50c1swXSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkVGV4dDogcGFyc2VkLmRvY3VtZW50c1swXS5jb250ZW50LFxuICAgICAgICAgICAgICBjb25maWRlbmNlOiAxMDBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gZmFsbGJhY2tcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RleHQgZXh0cmFjdGlvbiBub3Qgc3VwcG9ydGVkIC0gdXNlIGRvY3VtZW50IGNvbnRlbnQgZnJvbSB1cGxvYWQgcmVzdWx0Jyk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhkaWFnbm9zaXNRdWVyeSB8fCBwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBmaWx0ZXI6IHsgcGF0aWVudElkOiBwYXRpZW50SWRlbnRpZmllciB9LFxuICAgICAgICBsaW1pdDogMTBcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBzZW1hbnRpY1NlYXJjaChxdWVyeTogc3RyaW5nLCBwYXRpZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgICBmaWx0ZXI6IHBhdGllbnRJZCA/IHsgcGF0aWVudElkIH0gOiB7fSxcbiAgICAgICAgbGltaXQ6IDVcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5hbmFseXplUGF0aWVudEhpc3RvcnkocGF0aWVudElkZW50aWZpZXIsIHtcbiAgICAgICAgYW5hbHlzaXNUeXBlOiAnc3VtbWFyeSdcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn0iLCJpbXBvcnQgeyBNb25nbyB9IGZyb20gJ21ldGVvci9tb25nbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzc2FnZSB7XG4gIF9pZD86IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JztcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IE1lc3NhZ2VzQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uPE1lc3NhZ2U+KCdtZXNzYWdlcycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiwgTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgeyBDb250ZXh0TWFuYWdlciB9IGZyb20gJy4uL2NvbnRleHQvY29udGV4dE1hbmFnZXInO1xuXG4vLyBNZXRlb3IgTWV0aG9kc1xuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnbWVzc2FnZXMuaW5zZXJ0JyhtZXNzYWdlRGF0YTogT21pdDxNZXNzYWdlLCAnX2lkJz4pIHtcbiAgICBjaGVjayhtZXNzYWdlRGF0YSwge1xuICAgICAgY29udGVudDogU3RyaW5nLFxuICAgICAgcm9sZTogU3RyaW5nLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLFxuICAgICAgc2Vzc2lvbklkOiBTdHJpbmdcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lc3NhZ2VJZCA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhtZXNzYWdlRGF0YSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgaWYgc2Vzc2lvbiBleGlzdHNcbiAgICBpZiAobWVzc2FnZURhdGEuc2Vzc2lvbklkKSB7XG4gICAgICBhd2FpdCBDb250ZXh0TWFuYWdlci51cGRhdGVDb250ZXh0KG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAuLi5tZXNzYWdlRGF0YSxcbiAgICAgICAgX2lkOiBtZXNzYWdlSWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgc2Vzc2lvblxuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgbGFzdE1lc3NhZ2U6IG1lc3NhZ2VEYXRhLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0sXG4gICAgICAgICRpbmM6IHsgbWVzc2FnZUNvdW50OiAxIH1cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBBdXRvLWdlbmVyYXRlIHRpdGxlIGFmdGVyIGZpcnN0IHVzZXIgbWVzc2FnZVxuICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24ubWVzc2FnZUNvdW50IDw9IDIgJiYgbWVzc2FnZURhdGEucm9sZSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIE1ldGVvci5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBNZXRlb3IuY2FsbCgnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScsIG1lc3NhZ2VEYXRhLnNlc3Npb25JZCk7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBtZXNzYWdlSWQ7XG4gIH0sXG5cbiAgLy8gKioqIEZJWEVEOiBNYWluIHF1ZXJ5IHByb2Nlc3NpbmcgbWV0aG9kIHdpdGggcHJvcGVyIGNvbnRleHQgaGFuZGxpbmcgKioqXG4gIGFzeW5jICdtZWRpY2FsLnByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24nKHF1ZXJ5OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIGNoZWNrKHF1ZXJ5LCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5LiBQbGVhc2UgY2hlY2sgeW91ciBBUEkgY29uZmlndXJhdGlvbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBQcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246IFwiJHtxdWVyeX1cImApO1xuICAgICAgICBcbiAgICAgICAgLy8gQnVpbGQgY29udGV4dCBmb3IgdGhlIHF1ZXJ5XG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IGFueSA9IHsgc2Vzc2lvbklkIH07XG4gICAgICAgIFxuICAgICAgICBpZiAoc2Vzc2lvbklkKSB7XG4gICAgICAgICAgLy8gR2V0IHNlc3Npb24gY29udGV4dFxuICAgICAgICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgICAgICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhPy5wYXRpZW50SWQpIHtcbiAgICAgICAgICAgIGNvbnRleHQucGF0aWVudElkID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vICoqKiBGSVg6IEdldCBjb252ZXJzYXRpb24gY29udGV4dCBhbmQgcGFzcyBpdCBwcm9wZXJseSAqKipcbiAgICAgICAgICBjb25zdCBjb250ZXh0RGF0YSA9IGF3YWl0IENvbnRleHRNYW5hZ2VyLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbkNvbnRleHQgPSBjb250ZXh0RGF0YTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TnSBMb2FkZWQgY29udmVyc2F0aW9uIGNvbnRleHQ6ICR7Y29udGV4dERhdGEucmVjZW50TWVzc2FnZXMubGVuZ3RofSBtZXNzYWdlcywgcGF0aWVudDogJHtjb250ZXh0RGF0YS5wYXRpZW50Q29udGV4dCB8fCAnbm9uZSd9YCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExldCBDbGF1ZGUgaW50ZWxsaWdlbnRseSBkZWNpZGUgd2hhdCB0b29scyB0byB1c2UgKGluY2x1ZGVzIEVwaWMgdG9vbHMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbWNwTWFuYWdlci5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgICAgXG4gICAgICAgIC8vICoqKiBGSVg6IFVwZGF0ZSBjb250ZXh0IGFmdGVyIHByb2Nlc3NpbmcgdG8gaW5jbHVkZSBuZXcgbWVzc2FnZXMgKioqXG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICAvLyBDcmVhdGUgbWVzc2FnZSBvYmplY3RzIGZvciBjb250ZXh0IHRyYWNraW5nICh0aGVzZSBhcmVuJ3Qgc2F2ZWQgdG8gREIgeWV0KVxuICAgICAgICAgIGNvbnN0IHVzZXJNZXNzYWdlID0ge1xuICAgICAgICAgICAgX2lkOiAnJywgLy8gVGVtcG9yYXJ5IElEXG4gICAgICAgICAgICBjb250ZW50OiBxdWVyeSxcbiAgICAgICAgICAgIHJvbGU6ICd1c2VyJyBhcyBjb25zdCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICAgICAgICAgIHNlc3Npb25JZFxuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgYXNzaXN0YW50TWVzc2FnZSA9IHtcbiAgICAgICAgICAgIF9pZDogJycsIC8vIFRlbXBvcmFyeSBJRFxuICAgICAgICAgICAgY29udGVudDogcmVzcG9uc2UsXG4gICAgICAgICAgICByb2xlOiAnYXNzaXN0YW50JyBhcyBjb25zdCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICAgICAgICAgIHNlc3Npb25JZFxuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gVXBkYXRlIGNvbnRleHQgd2l0aCBib3RoIG1lc3NhZ2VzXG4gICAgICAgICAgYXdhaXQgQ29udGV4dE1hbmFnZXIudXBkYXRlQ29udGV4dChzZXNzaW9uSWQsIHVzZXJNZXNzYWdlKTtcbiAgICAgICAgICBhd2FpdCBDb250ZXh0TWFuYWdlci51cGRhdGVDb250ZXh0KHNlc3Npb25JZCwgYXNzaXN0YW50TWVzc2FnZSk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gRXh0cmFjdCBhbmQgdXBkYXRlIGNvbnRleHQgbWV0YWRhdGFcbiAgICAgICAgICBhd2FpdCBleHRyYWN0QW5kVXBkYXRlQ29udGV4dChxdWVyeSwgcmVzcG9uc2UsIHNlc3Npb25JZCk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBVcGRhdGVkIGNvbnZlcnNhdGlvbiBjb250ZXh0IGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgSW50ZWxsaWdlbnQgTUNQIHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBcbiAgICAgICAgLy8gUHJvdmlkZSBoZWxwZnVsIGVycm9yIG1lc3NhZ2VzIGJhc2VkIG9uIHRoZSBlcnJvciB0eXBlXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXBpYyBNQ1AgU2VydmVyJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIEVwaWMgRUhSIHN5c3RlbS4gUGxlYXNlIGVuc3VyZSB0aGUgRXBpYyBNQ1Agc2VydmVyIGlzIHJ1bm5pbmcgYW5kIHByb3Blcmx5IGNvbmZpZ3VyZWQuJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdBaWRib3gnKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgQWlkYm94IEZISVIgc3lzdGVtLiBQbGVhc2UgZW5zdXJlIHRoZSBBaWRib3ggTUNQIHNlcnZlciBpcyBydW5uaW5nIGFuZCBwcm9wZXJseSBjb25maWd1cmVkLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciBjb250YWN0IHN1cHBvcnQgaWYgdGhlIGlzc3VlIHBlcnNpc3RzLic7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdTaW11bGF0aW9uIG1vZGUgLSBubyBhY3R1YWwgcHJvY2Vzc2luZyc7XG4gIH0sXG5cbiAgLy8gKioqIEFEREVEOiBCYWNrd2FyZCBjb21wYXRpYmlsaXR5IG1ldGhvZCAqKipcbiAgYXN5bmMgJ21jcC5wcm9jZXNzUXVlcnknKHF1ZXJ5OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIC8vIFJvdXRlIHRvIHRoZSBtYWluIG1ldGhvZFxuICAgIHJldHVybiBhd2FpdCBNZXRlb3IuY2FsbCgnbWVkaWNhbC5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uJywgcXVlcnksIHNlc3Npb25JZCk7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5zd2l0Y2hQcm92aWRlcicocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpIHtcbiAgICBjaGVjayhwcm92aWRlciwgU3RyaW5nKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5zd2l0Y2hQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIHJldHVybiBgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Byb3ZpZGVyIHN3aXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3N3aXRjaC1mYWlsZWQnLCBgRmFpbGVkIHRvIHN3aXRjaCBwcm92aWRlcjogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ1Byb3ZpZGVyIHN3aXRjaGVkIChzaW11bGF0aW9uIG1vZGUpJztcbiAgfSxcblxuICAnbWNwLmdldEN1cnJlbnRQcm92aWRlcicoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0Q3VycmVudFByb3ZpZGVyKCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnYW50aHJvcGljJztcbiAgfSxcblxuICAnbWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycycoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVByb3ZpZGVycygpO1xuICAgIH1cbiAgICBcbiAgICAvLyBGYWxsYmFjayBmb3Igc2ltdWxhdGlvblxuICAgIGNvbnN0IHNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9LFxuXG4gICdtY3AuZ2V0QXZhaWxhYmxlVG9vbHMnKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gW107XG4gIH0sXG5cbiAgLy8gU2VydmVyIGhlYWx0aCBjaGVjayBtZXRob2QgLSBpbmNsdWRlcyBFcGljXG4gIGFzeW5jICdtY3AuaGVhbHRoQ2hlY2snKCkge1xuICAgIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICAgIG1lc3NhZ2U6ICdBbGwgc3lzdGVtcyBvcGVyYXRpb25hbCAoc2ltdWxhdGlvbiBtb2RlKScsXG4gICAgICAgIHNlcnZlcnM6IHtcbiAgICAgICAgICBlcGljOiAnc2ltdWxhdGVkJyxcbiAgICAgICAgICBhaWRib3g6ICdzaW11bGF0ZWQnLFxuICAgICAgICAgIG1lZGljYWw6ICdzaW11bGF0ZWQnXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdNQ1AgQ2xpZW50IG5vdCByZWFkeScsXG4gICAgICAgIHNlcnZlcnM6IHt9XG4gICAgICB9O1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCBtY3BNYW5hZ2VyLmhlYWx0aENoZWNrKCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgICAgbWVzc2FnZTogJ0hlYWx0aCBjaGVjayBjb21wbGV0ZWQnLFxuICAgICAgICBzZXJ2ZXJzOiB7XG4gICAgICAgICAgZXBpYzogaGVhbHRoLmVwaWMgPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnLFxuICAgICAgICAgIGFpZGJveDogaGVhbHRoLmFpZGJveCA/ICdoZWFsdGh5JyA6ICd1bmF2YWlsYWJsZScsXG4gICAgICAgICAgbWVkaWNhbDogaGVhbHRoLm1lZGljYWwgPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiBgSGVhbHRoIGNoZWNrIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWAsXG4gICAgICAgIHNlcnZlcnM6IHt9LFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKClcbiAgICAgIH07XG4gICAgfVxuICB9LFxuXG4gIC8vIE1lZGljYWwgZG9jdW1lbnQgbWV0aG9kcyAoZXhpc3RpbmcpXG5hc3luYyAnbWVkaWNhbC51cGxvYWREb2N1bWVudCcoZmlsZURhdGE6IHtcbiAgZmlsZW5hbWU6IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICBtaW1lVHlwZTogc3RyaW5nO1xuICBwYXRpZW50TmFtZT86IHN0cmluZztcbiAgc2Vzc2lvbklkPzogc3RyaW5nO1xufSkge1xuICBjaGVjayhmaWxlRGF0YSwge1xuICAgIGZpbGVuYW1lOiBTdHJpbmcsXG4gICAgY29udGVudDogU3RyaW5nLFxuICAgIG1pbWVUeXBlOiBTdHJpbmcsXG4gICAgcGF0aWVudE5hbWU6IE1hdGNoLk1heWJlKFN0cmluZyksXG4gICAgc2Vzc2lvbklkOiBNYXRjaC5NYXliZShTdHJpbmcpXG4gIH0pO1xuXG4gIGNvbnNvbGUubG9nKGDwn5OEIFVwbG9hZCByZXF1ZXN0IGZvcjogJHtmaWxlRGF0YS5maWxlbmFtZX0gKCR7ZmlsZURhdGEubWltZVR5cGV9KWApO1xuICBjb25zb2xlLmxvZyhg8J+TiiBDb250ZW50IHNpemU6ICR7ZmlsZURhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cbiAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgY29uc29sZS5sb2coJ/CflIQgU2ltdWxhdGlvbiBtb2RlIC0gcmV0dXJuaW5nIG1vY2sgZG9jdW1lbnQgSUQnKTtcbiAgICByZXR1cm4geyBcbiAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgZG9jdW1lbnRJZDogJ3NpbS0nICsgRGF0ZS5ub3coKSxcbiAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCB1cGxvYWRlZCAoc2ltdWxhdGlvbiBtb2RlKSdcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgTUNQIENsaWVudCBub3QgcmVhZHknKTtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01lZGljYWwgZG9jdW1lbnQgc3lzdGVtIGlzIG5vdCBhdmFpbGFibGUuIFBsZWFzZSBjb250YWN0IGFkbWluaXN0cmF0b3IuJyk7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFZhbGlkYXRlIGJhc2U2NCBjb250ZW50XG4gICAgaWYgKCFmaWxlRGF0YS5jb250ZW50IHx8IGZpbGVEYXRhLmNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgY29udGVudCBpcyBlbXB0eScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGZpbGUgc2l6ZSAoYmFzZTY0IGVuY29kZWQsIHNvIGFjdHVhbCBmaWxlIGlzIH43NSUgb2YgdGhpcylcbiAgICBjb25zdCBlc3RpbWF0ZWRGaWxlU2l6ZSA9IChmaWxlRGF0YS5jb250ZW50Lmxlbmd0aCAqIDMpIC8gNDtcbiAgICBpZiAoZXN0aW1hdGVkRmlsZVNpemUgPiAxMCAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgdG9vIGxhcmdlIChtYXggMTBNQiknKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg8J+TjyBFc3RpbWF0ZWQgZmlsZSBzaXplOiAke01hdGgucm91bmQoZXN0aW1hdGVkRmlsZVNpemUgLyAxMDI0KX1LQmApO1xuXG4gICAgY29uc3QgbWVkaWNhbCA9IG1jcE1hbmFnZXIuZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTtcbiAgICBcbiAgICAvLyBDb252ZXJ0IGJhc2U2NCBiYWNrIHRvIGJ1ZmZlciBmb3IgTUNQIHNlcnZlclxuICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBCdWZmZXIuZnJvbShmaWxlRGF0YS5jb250ZW50LCAnYmFzZTY0Jyk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWVkaWNhbC51cGxvYWREb2N1bWVudChcbiAgICAgIGZpbGVCdWZmZXIsXG4gICAgICBmaWxlRGF0YS5maWxlbmFtZSxcbiAgICAgIGZpbGVEYXRhLm1pbWVUeXBlLFxuICAgICAge1xuICAgICAgICBwYXRpZW50TmFtZTogZmlsZURhdGEucGF0aWVudE5hbWUgfHwgJ1Vua25vd24gUGF0aWVudCcsXG4gICAgICAgIHNlc3Npb25JZDogZmlsZURhdGEuc2Vzc2lvbklkIHx8IHRoaXMuY29ubmVjdGlvbj8uaWQgfHwgJ2RlZmF1bHQnLFxuICAgICAgICB1cGxvYWRlZEJ5OiB0aGlzLnVzZXJJZCB8fCAnYW5vbnltb3VzJyxcbiAgICAgICAgdXBsb2FkRGF0ZTogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn4pyFIE1DUCB1cGxvYWQgc3VjY2Vzc2Z1bDonLCByZXN1bHQpO1xuICAgIFxuICAgIC8vIFVwZGF0ZSBzZXNzaW9uIG1ldGFkYXRhIGlmIHdlIGhhdmUgc2Vzc2lvbiBJRFxuICAgIGlmIChmaWxlRGF0YS5zZXNzaW9uSWQgJiYgcmVzdWx0LmRvY3VtZW50SWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhmaWxlRGF0YS5zZXNzaW9uSWQsIHtcbiAgICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAgICdtZXRhZGF0YS5kb2N1bWVudElkcyc6IHJlc3VsdC5kb2N1bWVudElkXG4gICAgICAgICAgfSxcbiAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogZmlsZURhdGEucGF0aWVudE5hbWUgfHwgJ1Vua25vd24gUGF0aWVudCcsXG4gICAgICAgICAgICAnbWV0YWRhdGEubGFzdFVwbG9hZCc6IG5ldyBEYXRlKClcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIFNlc3Npb24gbWV0YWRhdGEgdXBkYXRlZCcpO1xuICAgICAgfSBjYXRjaCAodXBkYXRlRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gRmFpbGVkIHRvIHVwZGF0ZSBzZXNzaW9uIG1ldGFkYXRhOicsIHVwZGF0ZUVycm9yKTtcbiAgICAgICAgLy8gRG9uJ3QgZmFpbCB0aGUgd2hvbGUgb3BlcmF0aW9uIGZvciB0aGlzXG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRG9jdW1lbnQgdXBsb2FkIGVycm9yOicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBQcm92aWRlIHNwZWNpZmljIGVycm9yIG1lc3NhZ2VzXG4gICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykgfHwgZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0VDT05OUkVGVVNFRCcpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtZWRpY2FsLXNlcnZlci1vZmZsaW5lJywgJ01lZGljYWwgZG9jdW1lbnQgc2VydmVyIGlzIG5vdCBhdmFpbGFibGUuIFBsZWFzZSBjb250YWN0IGFkbWluaXN0cmF0b3IuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnRmlsZSB0b28gbGFyZ2UnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignZmlsZS10b28tbGFyZ2UnLCAnRmlsZSBpcyB0b28gbGFyZ2UuIE1heGltdW0gc2l6ZSBpcyAxME1CLicpO1xuICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0ludmFsaWQgZmlsZSB0eXBlJykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ2ludmFsaWQtZmlsZS10eXBlJywgJ0ludmFsaWQgZmlsZSB0eXBlLiBQbGVhc2UgdXNlIFBERiBvciBpbWFnZSBmaWxlcyBvbmx5LicpO1xuICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ3RpbWVvdXQnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcigndXBsb2FkLXRpbWVvdXQnLCAnVXBsb2FkIHRpbWVkIG91dC4gUGxlYXNlIHRyeSBhZ2FpbiB3aXRoIGEgc21hbGxlciBmaWxlLicpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCd1cGxvYWQtZmFpbGVkJywgYFVwbG9hZCBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG59LFxuXG4gIGFzeW5jICdtZWRpY2FsLnByb2Nlc3NEb2N1bWVudCcoZG9jdW1lbnRJZDogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICBjaGVjayhkb2N1bWVudElkLCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG5cbiAgICBpZiAodGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCBwcm9jZXNzZWQgKHNpbXVsYXRpb24gbW9kZSknLFxuICAgICAgICB0ZXh0RXh0cmFjdGlvbjogeyBleHRyYWN0ZWRUZXh0OiAnU2FtcGxlIHRleHQnLCBjb25maWRlbmNlOiA5NSB9LFxuICAgICAgICBtZWRpY2FsRW50aXRpZXM6IHsgZW50aXRpZXM6IFtdLCBzdW1tYXJ5OiB7IGRpYWdub3Npc0NvdW50OiAwLCBtZWRpY2F0aW9uQ291bnQ6IDAsIGxhYlJlc3VsdENvdW50OiAwIH0gfVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgIFxuICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgbWVkaWNhbCA9IG1jcE1hbmFnZXIuZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTtcbiAgICAgIFxuICAgICAgLy8gUHJvY2VzcyBkb2N1bWVudCB1c2luZyBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWVkaWNhbC5leHRyYWN0TWVkaWNhbEVudGl0aWVzKCcnLCBkb2N1bWVudElkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRG9jdW1lbnQgcHJvY2Vzc2luZyBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdwcm9jZXNzaW5nLWZhaWxlZCcsIGBGYWlsZWQgdG8gcHJvY2VzcyBkb2N1bWVudDogJHtlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cbn0pO1xuXG4vLyAqKiogRU5IQU5DRUQ6IEhlbHBlciBmdW5jdGlvbiB0byBleHRyYWN0IGFuZCB1cGRhdGUgY29udGV4dCAqKipcbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KFxuICBxdWVyeTogc3RyaW5nLCBcbiAgcmVzcG9uc2U6IHN0cmluZywgXG4gIHNlc3Npb25JZDogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHBhdGllbnQgbmFtZS9JRCBmcm9tIHF1ZXJ5IG9yIHJlc3BvbnNlXG4gICAgY29uc3QgcGF0aWVudFBhdHRlcm5zID0gW1xuICAgICAgLyg/OnBhdGllbnR8Zm9yfGNyZWF0ZS4qcGF0aWVudC4qbmFtZWQ/KVxccytcIj8oW0EtWl1bYS16XSsoPzpcXHMrW0EtWl1bYS16XSspPylcIj8vaSxcbiAgICAgIC8oPzpwYXRpZW50fGNyZWF0ZSlcXHMrbmFtZWQ/XFxzK1wiPyhbQS1aXVthLXpdKyg/OlxccytbQS1aXVthLXpdKyk/KVwiPy9pLFxuICAgICAgLyg/OlBhdGllbnQgSUR8UGF0aWVudHxwYXRpZW50SWQpOlxccypcIj8oW0EtWmEtejAtOVxcLV9dKylcIj8vaSxcbiAgICAgIC9cInBhdGllbnRJZFwiOlxccypcIihbXlwiXSspXCIvaSxcbiAgICAgIC8oPzpjcmVhdGVkLipwYXRpZW50fHBhdGllbnQuKmNyZWF0ZWQpLipcIihbXlwiXSspXCIvaSxcbiAgICAgIC9QYXRpZW50OlxccyooW0EtWmEtejAtOVxcLV9cXHNdKykvaVxuICAgIF07XG4gICAgXG4gICAgbGV0IHBhdGllbnRJZCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdGllbnRQYXR0ZXJucykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBxdWVyeS5tYXRjaChwYXR0ZXJuKSB8fCByZXNwb25zZS5tYXRjaChwYXR0ZXJuKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBwYXRpZW50SWQgPSBtYXRjaFsxXS50cmltKCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZiAocGF0aWVudElkKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBFeHRyYWN0ZWQgcGF0aWVudCBjb250ZXh0OiAke3BhdGllbnRJZH1gKTtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJHNldDogeyAnbWV0YWRhdGEucGF0aWVudElkJzogcGF0aWVudElkIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IG1lZGljYWwgdGVybXMgZnJvbSByZXNwb25zZVxuICAgIGNvbnN0IG1lZGljYWxUZXJtcyA9IGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgIGlmIChtZWRpY2FsVGVybXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYPCfj7fvuI8gRXh0cmFjdGVkIG1lZGljYWwgdGVybXM6ICR7bWVkaWNhbFRlcm1zLmpvaW4oJywgJyl9YCk7XG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoc2Vzc2lvbklkLCB7XG4gICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICdtZXRhZGF0YS50YWdzJzogeyAkZWFjaDogbWVkaWNhbFRlcm1zIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICAgIGNvbnN0IGRhdGFTb3VyY2VzID0gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlKTtcbiAgICBpZiAoZGF0YVNvdXJjZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYPCfk4ogRGF0YSBzb3VyY2VzIHVzZWQ6ICR7ZGF0YVNvdXJjZXMuam9pbignLCAnKX1gKTtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgJ21ldGFkYXRhLmRhdGFTb3VyY2VzJzogeyAkZWFjaDogZGF0YVNvdXJjZXMgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gRXh0cmFjdCBtZWRpY2F0aW9ucyBpZiBtZW50aW9uZWRcbiAgICBjb25zdCBtZWRpY2F0aW9ucyA9IGV4dHJhY3RNZWRpY2F0aW9ucyhxdWVyeSwgcmVzcG9uc2UpO1xuICAgIGlmIChtZWRpY2F0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+SiiBFeHRyYWN0ZWQgbWVkaWNhdGlvbnM6ICR7bWVkaWNhdGlvbnMuam9pbignLCAnKX1gKTtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgJ21ldGFkYXRhLm1lZGljYXRpb25zJzogeyAkZWFjaDogbWVkaWNhdGlvbnMgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgY29udGV4dDonLCBlcnJvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBtZWRpY2FsUGF0dGVybnMgPSBbXG4gICAgL1xcYig/OmRpYWdub3NlZCB3aXRofGRpYWdub3NpcyBvZilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnByZXNjcmliZWR8bWVkaWNhdGlvbilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnRyZWF0bWVudCBmb3J8dHJlYXRpbmcpXFxzKyhbXiwuXSspL2dpLFxuICAgIC9cXGIoPzpjb25kaXRpb258ZGlzZWFzZSk6XFxzKihbXiwuXSspL2dpLFxuICAgIC9cXGIoPzpzeW1wdG9tcz98cHJlc2VudGluZyB3aXRoKVxccysoW14sLl0rKS9naVxuICBdO1xuICBcbiAgY29uc3QgdGVybXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgXG4gIG1lZGljYWxQYXR0ZXJucy5mb3JFYWNoKHBhdHRlcm4gPT4ge1xuICAgIGxldCBtYXRjaDtcbiAgICB3aGlsZSAoKG1hdGNoID0gcGF0dGVybi5leGVjKHJlc3BvbnNlKSkgIT09IG51bGwpIHtcbiAgICAgIGlmIChtYXRjaFsxXSkge1xuICAgICAgICBjb25zdCB0ZXJtID0gbWF0Y2hbMV0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmICh0ZXJtLmxlbmd0aCA+IDIpIHsgLy8gRmlsdGVyIG91dCB2ZXJ5IHNob3J0IG1hdGNoZXNcbiAgICAgICAgICB0ZXJtcy5hZGQodGVybSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBcbiAgcmV0dXJuIEFycmF5LmZyb20odGVybXMpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgXG4gIC8vIERldGVjdCBkYXRhIHNvdXJjZXMgbWVudGlvbmVkIGluIHJlc3BvbnNlXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnQWlkYm94IEZISVInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlaHInKSkge1xuICAgIHNvdXJjZXMuYWRkKCdFcGljIEVIUicpO1xuICB9XG4gIFxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZG9jdW1lbnQnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd1cGxvYWRlZCcpKSB7XG4gICAgc291cmNlcy5hZGQoJ01lZGljYWwgRG9jdW1lbnRzJyk7XG4gIH1cbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHNvdXJjZXMpO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0TWVkaWNhdGlvbnMocXVlcnk6IHN0cmluZywgcmVzcG9uc2U6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgbWVkaWNhdGlvblBhdHRlcm5zID0gW1xuICAgIC8oPzptZWRpY2F0aW9ufGRydWd8bWVkaWNpbmUpOlxccyooW14sLl0rKS9naSxcbiAgICAvKD86cHJlc2NyaWJlZHxwcmVzY3JpYmUpXFxzKyhbQS1aYS16XSspL2dpLFxuICAgIC9cXGIoZG9sb3xwYXJhY2V0YW1vbHxpYnVwcm9mZW58YXNwaXJpbnxhbW94aWNpbGxpbnxtZXRmb3JtaW58YXRvcnZhc3RhdGlufGxpc2lub3ByaWx8b21lcHJhem9sZXxhbWxvZGlwaW5lKVxcYi9naVxuICBdO1xuICBcbiAgY29uc3QgbWVkaWNhdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3QgZnVsbFRleHQgPSBgJHtxdWVyeX0gJHtyZXNwb25zZX1gO1xuICBcbiAgbWVkaWNhdGlvblBhdHRlcm5zLmZvckVhY2gocGF0dGVybiA9PiB7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlICgobWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoZnVsbFRleHQpKSAhPT0gbnVsbCkge1xuICAgICAgaWYgKG1hdGNoWzFdKSB7XG4gICAgICAgIG1lZGljYXRpb25zLmFkZChtYXRjaFsxXS50cmltKCkpO1xuICAgICAgfSBlbHNlIGlmIChtYXRjaFswXSkge1xuICAgICAgICBtZWRpY2F0aW9ucy5hZGQobWF0Y2hbMF0udHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBcbiAgcmV0dXJuIEFycmF5LmZyb20obWVkaWNhdGlvbnMpLnNsaWNlKDAsIDUpO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIHNhbml0aXplIHBhdGllbnQgbmFtZXMgKHVzZWQgYnkgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24pXG5mdW5jdGlvbiBzYW5pdGl6ZVBhdGllbnROYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBuYW1lXG4gICAgLnRyaW0oKVxuICAgIC5yZXBsYWNlKC9bXmEtekEtWlxcc10vZywgJycpIC8vIFJlbW92ZSBzcGVjaWFsIGNoYXJhY3RlcnNcbiAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpIC8vIE5vcm1hbGl6ZSB3aGl0ZXNwYWNlXG4gICAgLnNwbGl0KCcgJylcbiAgICAubWFwKHdvcmQgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAuam9pbignICcpO1xufVxuXG4vLyBFeHBvcnQgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHRlc3RpbmcgYW5kIHJldXNlXG5leHBvcnQge1xuICBleHRyYWN0QW5kVXBkYXRlQ29udGV4dCxcbiAgZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZSxcbiAgZXh0cmFjdERhdGFTb3VyY2VzLFxuICBleHRyYWN0TWVkaWNhdGlvbnMsXG4gIHNhbml0aXplUGF0aWVudE5hbWVcbn07IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjayB9IGZyb20gJ21ldGVvci9jaGVjayc7XG5pbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24gfSBmcm9tICcuL21lc3NhZ2VzJztcblxuTWV0ZW9yLnB1Ymxpc2goJ21lc3NhZ2VzJywgZnVuY3Rpb24oc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICByZXR1cm4gTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoeyBzZXNzaW9uSWQgfSk7XG59KTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrLCBNYXRjaCB9IGZyb20gJ21ldGVvci9jaGVjayc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24sIENoYXRTZXNzaW9uIH0gZnJvbSAnLi9zZXNzaW9ucyc7XG5pbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9tZXNzYWdlcy9tZXNzYWdlcyc7XG5cbk1ldGVvci5tZXRob2RzKHtcbiAgYXN5bmMgJ3Nlc3Npb25zLmNyZWF0ZScodGl0bGU/OiBzdHJpbmcsIG1ldGFkYXRhPzogYW55KSB7XG4gICAgY2hlY2sodGl0bGUsIE1hdGNoLk1heWJlKFN0cmluZykpO1xuICAgIGNoZWNrKG1ldGFkYXRhLCBNYXRjaC5NYXliZShPYmplY3QpKTtcblxuICAgIGNvbnN0IHNlc3Npb246IE9taXQ8Q2hhdFNlc3Npb24sICdfaWQnPiA9IHtcbiAgICAgIHRpdGxlOiB0aXRsZSB8fCAnTmV3IENoYXQnLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCB1bmRlZmluZWQsXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICBtZXNzYWdlQ291bnQ6IDAsXG4gICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgIG1ldGFkYXRhOiBtZXRhZGF0YSB8fCB7fVxuICAgIH07XG4gICAgXG4gICAgLy8gRGVhY3RpdmF0ZSBvdGhlciBzZXNzaW9ucyBmb3IgdGhpcyB1c2VyXG4gICAgaWYgKHRoaXMudXNlcklkKSB7XG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICAgIHsgdXNlcklkOiB0aGlzLnVzZXJJZCwgaXNBY3RpdmU6IHRydWUgfSxcbiAgICAgICAgeyAkc2V0OiB7IGlzQWN0aXZlOiBmYWxzZSB9IH0sXG4gICAgICAgIHsgbXVsdGk6IHRydWUgfVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbklkID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmluc2VydEFzeW5jKHNlc3Npb24pO1xuICAgIGNvbnNvbGUubG9nKGDinIUgQ3JlYXRlZCBuZXcgc2Vzc2lvbjogJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgcmV0dXJuIHNlc3Npb25JZDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5saXN0JyhsaW1pdCA9IDIwLCBvZmZzZXQgPSAwKSB7XG4gICAgY2hlY2sobGltaXQsIE1hdGNoLkludGVnZXIpO1xuICAgIGNoZWNrKG9mZnNldCwgTWF0Y2guSW50ZWdlcik7XG4gICAgXG4gICAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyB1c2VySWQgfSxcbiAgICAgIHsgXG4gICAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgICAgbGltaXQsXG4gICAgICAgIHNraXA6IG9mZnNldFxuICAgICAgfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIGNvbnN0IHRvdGFsID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHsgdXNlcklkIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzZXNzaW9ucyxcbiAgICAgIHRvdGFsLFxuICAgICAgaGFzTW9yZTogb2Zmc2V0ICsgbGltaXQgPCB0b3RhbFxuICAgIH07XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZ2V0JyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyh7XG4gICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgIH0pO1xuICAgIFxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc2Vzc2lvbi1ub3QtZm91bmQnLCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMudXBkYXRlJyhzZXNzaW9uSWQ6IHN0cmluZywgdXBkYXRlczogUGFydGlhbDxDaGF0U2Vzc2lvbj4pIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgY2hlY2sodXBkYXRlcywgT2JqZWN0KTtcbiAgICBcbiAgICAvLyBSZW1vdmUgZmllbGRzIHRoYXQgc2hvdWxkbid0IGJlIHVwZGF0ZWQgZGlyZWN0bHlcbiAgICBkZWxldGUgdXBkYXRlcy5faWQ7XG4gICAgZGVsZXRlIHVwZGF0ZXMudXNlcklkO1xuICAgIGRlbGV0ZSB1cGRhdGVzLmNyZWF0ZWRBdDtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICB7IFxuICAgICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgICB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICAuLi51cGRhdGVzLCBcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkgXG4gICAgICAgIH0gXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmRlbGV0ZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgLy8gVmVyaWZ5IG93bmVyc2hpcFxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHtcbiAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzZXNzaW9uLW5vdC1mb3VuZCcsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgICBcbiAgICAvLyBEZWxldGUgYWxsIGFzc29jaWF0ZWQgbWVzc2FnZXNcbiAgICBjb25zdCBkZWxldGVkTWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoeyBzZXNzaW9uSWQgfSk7XG4gICAgY29uc29sZS5sb2coYPCfl5HvuI8gRGVsZXRlZCAke2RlbGV0ZWRNZXNzYWdlc30gbWVzc2FnZXMgZnJvbSBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIC8vIERlbGV0ZSB0aGUgc2Vzc2lvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5yZW1vdmVBc3luYyhzZXNzaW9uSWQpO1xuICAgIGNvbnNvbGUubG9nKGDwn5eR77iPIERlbGV0ZWQgc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICByZXR1cm4geyBzZXNzaW9uOiByZXN1bHQsIG1lc3NhZ2VzOiBkZWxldGVkTWVzc2FnZXMgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5zZXRBY3RpdmUnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gICAgXG4gICAgLy8gRGVhY3RpdmF0ZSBhbGwgb3RoZXIgc2Vzc2lvbnNcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICB7IHVzZXJJZCwgaXNBY3RpdmU6IHRydWUgfSxcbiAgICAgIHsgJHNldDogeyBpc0FjdGl2ZTogZmFsc2UgfSB9LFxuICAgICAgeyBtdWx0aTogdHJ1ZSB9XG4gICAgKTtcbiAgICBcbiAgICAvLyBBY3RpdmF0ZSB0aGlzIHNlc3Npb25cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICB7IF9pZDogc2Vzc2lvbklkLCB1c2VySWQgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgaXNBY3RpdmU6IHRydWUsXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0gXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmdlbmVyYXRlVGl0bGUnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIC8vIEdldCBmaXJzdCBmZXcgbWVzc2FnZXNcbiAgICBjb25zdCBtZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQsIHJvbGU6ICd1c2VyJyB9LFxuICAgICAgeyBsaW1pdDogMywgc29ydDogeyB0aW1lc3RhbXA6IDEgfSB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgaWYgKG1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIFVzZSBmaXJzdCB1c2VyIG1lc3NhZ2UgYXMgYmFzaXMgZm9yIHRpdGxlXG4gICAgICBjb25zdCBmaXJzdFVzZXJNZXNzYWdlID0gbWVzc2FnZXNbMF07XG4gICAgICBpZiAoZmlyc3RVc2VyTWVzc2FnZSkge1xuICAgICAgICAvLyBDbGVhbiB1cCB0aGUgbWVzc2FnZSBmb3IgYSBiZXR0ZXIgdGl0bGVcbiAgICAgICAgbGV0IHRpdGxlID0gZmlyc3RVc2VyTWVzc2FnZS5jb250ZW50XG4gICAgICAgICAgLnJlcGxhY2UoL14oc2VhcmNoIGZvcnxmaW5kfGxvb2sgZm9yfHNob3cgbWUpXFxzKy9pLCAnJykgLy8gUmVtb3ZlIGNvbW1vbiBwcmVmaXhlc1xuICAgICAgICAgIC5yZXBsYWNlKC9bPyEuXSQvLCAnJykgLy8gUmVtb3ZlIGVuZGluZyBwdW5jdHVhdGlvblxuICAgICAgICAgIC50cmltKCk7XG4gICAgICAgIFxuICAgICAgICAvLyBMaW1pdCBsZW5ndGhcbiAgICAgICAgaWYgKHRpdGxlLmxlbmd0aCA+IDUwKSB7XG4gICAgICAgICAgdGl0bGUgPSB0aXRsZS5zdWJzdHJpbmcoMCwgNTApLnRyaW0oKSArICcuLi4nO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBDYXBpdGFsaXplIGZpcnN0IGxldHRlclxuICAgICAgICB0aXRsZSA9IHRpdGxlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgdGl0bGUuc2xpY2UoMSk7XG4gICAgICAgIFxuICAgICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoc2Vzc2lvbklkLCB7XG4gICAgICAgICAgJHNldDogeyBcbiAgICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB0aXRsZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG51bGw7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMudXBkYXRlTWV0YWRhdGEnKHNlc3Npb25JZDogc3RyaW5nLCBtZXRhZGF0YTogYW55KSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIGNoZWNrKG1ldGFkYXRhLCBPYmplY3QpO1xuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgXG4gICAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICAgIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIG1ldGFkYXRhLFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgICB9IFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5leHBvcnQnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHtcbiAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzZXNzaW9uLW5vdC1mb3VuZCcsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBtZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQgfSxcbiAgICAgIHsgc29ydDogeyB0aW1lc3RhbXA6IDEgfSB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlc3Npb24sXG4gICAgICBtZXNzYWdlcyxcbiAgICAgIGV4cG9ydGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICB2ZXJzaW9uOiAnMS4wJ1xuICAgIH07XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuaW1wb3J0JyhkYXRhOiBhbnkpIHtcbiAgICBjaGVjayhkYXRhLCB7XG4gICAgICBzZXNzaW9uOiBPYmplY3QsXG4gICAgICBtZXNzYWdlczogQXJyYXksXG4gICAgICB2ZXJzaW9uOiBTdHJpbmdcbiAgICB9KTtcbiAgICBcbiAgICAvLyBDcmVhdGUgbmV3IHNlc3Npb24gYmFzZWQgb24gaW1wb3J0ZWQgZGF0YVxuICAgIGNvbnN0IG5ld1Nlc3Npb246IE9taXQ8Q2hhdFNlc3Npb24sICdfaWQnPiA9IHtcbiAgICAgIC4uLmRhdGEuc2Vzc2lvbixcbiAgICAgIHRpdGxlOiBgW0ltcG9ydGVkXSAke2RhdGEuc2Vzc2lvbi50aXRsZX1gLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCB1bmRlZmluZWQsXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICBpc0FjdGl2ZTogdHJ1ZVxuICAgIH07XG4gICAgXG4gICAgZGVsZXRlIChuZXdTZXNzaW9uIGFzIGFueSkuX2lkO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb25JZCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhuZXdTZXNzaW9uKTtcbiAgICBcbiAgICAvLyBJbXBvcnQgbWVzc2FnZXMgd2l0aCBuZXcgc2Vzc2lvbklkXG4gICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGRhdGEubWVzc2FnZXMpIHtcbiAgICAgIGNvbnN0IG5ld01lc3NhZ2UgPSB7XG4gICAgICAgIC4uLm1lc3NhZ2UsXG4gICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShtZXNzYWdlLnRpbWVzdGFtcClcbiAgICAgIH07XG4gICAgICBkZWxldGUgbmV3TWVzc2FnZS5faWQ7XG4gICAgICBcbiAgICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhuZXdNZXNzYWdlKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHNlc3Npb25JZDtcbiAgfVxufSk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjayB9IGZyb20gJ21ldGVvci9jaGVjayc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuL3Nlc3Npb25zJztcblxuLy8gUHVibGlzaCB1c2VyJ3Mgc2Vzc2lvbnMgbGlzdFxuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb25zLmxpc3QnLCBmdW5jdGlvbihsaW1pdCA9IDIwKSB7XG4gIGNoZWNrKGxpbWl0LCBOdW1iZXIpO1xuICBcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICB7IHVzZXJJZCB9LFxuICAgIHsgXG4gICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICBsaW1pdCxcbiAgICAgIGZpZWxkczogeyBcbiAgICAgICAgdGl0bGU6IDEsIFxuICAgICAgICB1cGRhdGVkQXQ6IDEsIFxuICAgICAgICBtZXNzYWdlQ291bnQ6IDEsIFxuICAgICAgICBsYXN0TWVzc2FnZTogMSxcbiAgICAgICAgaXNBY3RpdmU6IDEsXG4gICAgICAgIGNyZWF0ZWRBdDogMSxcbiAgICAgICAgJ21ldGFkYXRhLnBhdGllbnRJZCc6IDEsXG4gICAgICAgICdtZXRhZGF0YS5kb2N1bWVudElkcyc6IDFcbiAgICAgIH1cbiAgICB9XG4gICk7XG59KTtcblxuLy8gUHVibGlzaCBzaW5nbGUgc2Vzc2lvbiBkZXRhaWxzXG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbi5kZXRhaWxzJywgZnVuY3Rpb24oc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKHsgXG4gICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gIH0pO1xufSk7XG5cbi8vIFB1Ymxpc2ggYWN0aXZlIHNlc3Npb25cbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9uLmFjdGl2ZScsIGZ1bmN0aW9uKCkge1xuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKHsgXG4gICAgdXNlcklkLFxuICAgIGlzQWN0aXZlOiB0cnVlXG4gIH0sIHtcbiAgICBsaW1pdDogMVxuICB9KTtcbn0pO1xuXG4vLyBQdWJsaXNoIHJlY2VudCBzZXNzaW9ucyB3aXRoIG1lc3NhZ2UgcHJldmlld1xuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb25zLnJlY2VudCcsIGZ1bmN0aW9uKGxpbWl0ID0gNSkge1xuICBjaGVjayhsaW1pdCwgTnVtYmVyKTtcbiAgXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgeyB1c2VySWQgfSxcbiAgICB7IFxuICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgbGltaXQsXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgdGl0bGU6IDEsXG4gICAgICAgIGxhc3RNZXNzYWdlOiAxLFxuICAgICAgICBtZXNzYWdlQ291bnQ6IDEsXG4gICAgICAgIHVwZGF0ZWRBdDogMSxcbiAgICAgICAgaXNBY3RpdmU6IDFcbiAgICAgIH1cbiAgICB9XG4gICk7XG59KTsiLCJpbXBvcnQgeyBNb25nbyB9IGZyb20gJ21ldGVvci9tb25nbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdFNlc3Npb24ge1xuICBfaWQ/OiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHVzZXJJZD86IHN0cmluZztcbiAgY3JlYXRlZEF0OiBEYXRlO1xuICB1cGRhdGVkQXQ6IERhdGU7XG4gIGxhc3RNZXNzYWdlPzogc3RyaW5nO1xuICBtZXNzYWdlQ291bnQ6IG51bWJlcjtcbiAgaXNBY3RpdmU6IGJvb2xlYW47XG4gIG1ldGFkYXRhPzoge1xuICAgIHBhdGllbnRJZD86IHN0cmluZztcbiAgICBkb2N1bWVudElkcz86IHN0cmluZ1tdO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBtb2RlbD86IHN0cmluZztcbiAgICB0ZW1wZXJhdHVyZT86IG51bWJlcjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IFNlc3Npb25zQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uPENoYXRTZXNzaW9uPignc2Vzc2lvbnMnKTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiB9IGZyb20gJy9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucyc7XG5pbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24gfSBmcm9tICcvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMnO1xuXG5NZXRlb3Iuc3RhcnR1cChhc3luYyAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCcgU2V0dGluZyB1cCBzZXNzaW9uIG1hbmFnZW1lbnQuLi4nKTtcbiAgXG4gIC8vIENyZWF0ZSBpbmRleGVzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2VcbiAgdHJ5IHtcbiAgICAvLyBTZXNzaW9ucyBpbmRleGVzXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyB1c2VySWQ6IDEsIHVwZGF0ZWRBdDogLTEgfSk7XG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBpc0FjdGl2ZTogMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IGNyZWF0ZWRBdDogLTEgfSk7XG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyAnbWV0YWRhdGEucGF0aWVudElkJzogMSB9KTtcbiAgICBcbiAgICAvLyBNZXNzYWdlcyBpbmRleGVzXG4gICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBzZXNzaW9uSWQ6IDEsIHRpbWVzdGFtcDogMSB9KTtcbiAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHNlc3Npb25JZDogMSwgcm9sZTogMSB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnIERhdGFiYXNlIGluZGV4ZXMgY3JlYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgRXJyb3IgY3JlYXRpbmcgaW5kZXhlczonLCBlcnJvcik7XG4gIH1cbiAgXG4gIC8vIENsZWFudXAgb2xkIHNlc3Npb25zIChvcHRpb25hbCAtIHJlbW92ZSBzZXNzaW9ucyBvbGRlciB0aGFuIDMwIGRheXMpXG4gIGNvbnN0IHRoaXJ0eURheXNBZ28gPSBuZXcgRGF0ZSgpO1xuICB0aGlydHlEYXlzQWdvLnNldERhdGUodGhpcnR5RGF5c0Fnby5nZXREYXRlKCkgLSAzMCk7XG4gIFxuICB0cnkge1xuICAgIGNvbnN0IG9sZFNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoe1xuICAgICAgdXBkYXRlZEF0OiB7ICRsdDogdGhpcnR5RGF5c0FnbyB9XG4gICAgfSkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIGlmIChvbGRTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+nuSBGb3VuZCAke29sZFNlc3Npb25zLmxlbmd0aH0gb2xkIHNlc3Npb25zIHRvIGNsZWFuIHVwYCk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBvbGRTZXNzaW9ucykge1xuICAgICAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoeyBzZXNzaW9uSWQ6IHNlc3Npb24uX2lkIH0pO1xuICAgICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoc2Vzc2lvbi5faWQpO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnIE9sZCBzZXNzaW9ucyBjbGVhbmVkIHVwJyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBFcnJvciBjbGVhbmluZyB1cCBvbGQgc2Vzc2lvbnM6JywgZXJyb3IpO1xuICB9XG4gIFxuICAvLyBMb2cgc2Vzc2lvbiBzdGF0aXN0aWNzXG4gIHRyeSB7XG4gICAgY29uc3QgdG90YWxTZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cygpO1xuICAgIGNvbnN0IHRvdGFsTWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoKTtcbiAgICBjb25zdCBhY3RpdmVTZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyh7IGlzQWN0aXZlOiB0cnVlIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgU2Vzc2lvbiBTdGF0aXN0aWNzOicpO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCBzZXNzaW9uczogJHt0b3RhbFNlc3Npb25zfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBBY3RpdmUgc2Vzc2lvbnM6ICR7YWN0aXZlU2Vzc2lvbnN9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIG1lc3NhZ2VzOiAke3RvdGFsTWVzc2FnZXN9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignIEVycm9yIGdldHRpbmcgc2Vzc2lvbiBzdGF0aXN0aWNzOicsIGVycm9yKTtcbiAgfVxufSk7IiwiLy8gc2VydmVyL21haW4udHNcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9tZXRob2RzJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9zZXNzaW9ucy9tZXRob2RzJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL3B1YmxpY2F0aW9ucyc7XG5pbXBvcnQgJy4vc3RhcnR1cC1zZXNzaW9ucyc7XG5cbk1ldGVvci5zdGFydHVwKGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJyBTdGFydGluZyBNQ1AgUGlsb3Qgc2VydmVyIHdpdGggSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24uLi4nKTtcbiAgXG4gIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gIFxuICB0cnkge1xuICAgIC8vIEdldCBBUEkga2V5c1xuICAgIGNvbnN0IHNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsRW5kcG9pbnQgPSBzZXR0aW5ncz8uT1pXRUxMX0VORFBPSU5UIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9FTkRQT0lOVDtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnIEFQSSBLZXkgU3RhdHVzOicpO1xuICAgIGNvbnNvbGUubG9nKCcgIEFudGhyb3BpYyBrZXkgZm91bmQ6JywgISFhbnRocm9waWNLZXksIGFudGhyb3BpY0tleT8uc3Vic3RyaW5nKDAsIDE1KSArICcuLi4nKTtcbiAgICBjb25zb2xlLmxvZygnICBPendlbGwga2V5IGZvdW5kOicsICEhb3p3ZWxsS2V5LCBvendlbGxLZXk/LnN1YnN0cmluZygwLCAxNSkgKyAnLi4uJyk7XG4gICAgY29uc29sZS5sb2coJyAgT3p3ZWxsIGVuZHBvaW50OicsIG96d2VsbEVuZHBvaW50KTtcbiAgICBcbiAgICBpZiAoIWFudGhyb3BpY0tleSAmJiAhb3p3ZWxsS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgTm8gQVBJIGtleSBmb3VuZCBmb3IgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGRlZmF1bHQgcHJvdmlkZXIgKHByZWZlciBBbnRocm9waWMgZm9yIGJldHRlciB0b29sIGNhbGxpbmcsIGZhbGxiYWNrIHRvIE96d2VsbClcbiAgICBsZXQgcHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCc7XG4gICAgbGV0IGFwaUtleTogc3RyaW5nO1xuXG4gICAgaWYgKGFudGhyb3BpY0tleSkge1xuICAgICAgcHJvdmlkZXIgPSAnYW50aHJvcGljJztcbiAgICAgIGFwaUtleSA9IGFudGhyb3BpY0tleTtcbiAgICB9IGVsc2UgaWYgKG96d2VsbEtleSkge1xuICAgICAgcHJvdmlkZXIgPSAnb3p3ZWxsJztcbiAgICAgIGFwaUtleSA9IG96d2VsbEtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIE5vIHZhbGlkIEFQSSBrZXlzIGZvdW5kJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBtYWluIE1DUCBjbGllbnQgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgIGF3YWl0IG1jcE1hbmFnZXIuaW5pdGlhbGl6ZSh7XG4gICAgICBwcm92aWRlcixcbiAgICAgIGFwaUtleSxcbiAgICAgIG96d2VsbEVuZHBvaW50LFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgTUNQIENsaWVudCBpbml0aWFsaXplZCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uJyk7XG4gICAgY29uc29sZS5sb2coYCBNQ1AgVXNpbmcgJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBhcyB0aGUgQUkgcHJvdmlkZXIgZm9yIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYCk7XG4gICAgY29uc29sZS5sb2coJyBNQ1AgU2Vzc2lvbiBtYW5hZ2VtZW50IGVuYWJsZWQgd2l0aCBBdGxhcyBNb25nb0RCJyk7XG4gICAgXG4gICAgLy8gU2hvdyBwcm92aWRlciBjYXBhYmlsaXRpZXNcbiAgICBpZiAoYW50aHJvcGljS2V5ICYmIG96d2VsbEtleSkge1xuICAgICAgY29uc29sZS5sb2coJyBNQ1AgQm90aCBwcm92aWRlcnMgYXZhaWxhYmxlIC0geW91IGNhbiBzd2l0Y2ggYmV0d2VlbiB0aGVtIGluIHRoZSBjaGF0Jyk7XG4gICAgICBjb25zb2xlLmxvZygnICAgTUNQIEFudGhyb3BpYzogQWR2YW5jZWQgdG9vbCBjYWxsaW5nIHdpdGggQ2xhdWRlIG1vZGVscyAocmVjb21tZW5kZWQpJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAgTUNQIE96d2VsbDogQmx1ZWhpdmUgQUkgbW9kZWxzIHdpdGggaW50ZWxsaWdlbnQgcHJvbXB0aW5nJyk7XG4gICAgfSBlbHNlIGlmIChhbnRocm9waWNLZXkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCcgTUNQIEFudGhyb3BpYyBwcm92aWRlciB3aXRoIG5hdGl2ZSB0b29sIGNhbGxpbmcgc3VwcG9ydCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgIE1DUCBPbmx5ICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gcHJvdmlkZXIgYXZhaWxhYmxlYCk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBtZWRpY2FsIE1DUCBzZXJ2ZXIgZm9yIGRvY3VtZW50IHRvb2xzXG4gICAgY29uc3QgbWNwU2VydmVyVXJsID0gc2V0dGluZ3M/Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwNSc7XG4gICAgXG4gICAgaWYgKG1jcFNlcnZlclVybCAmJiBtY3BTZXJ2ZXJVcmwgIT09ICdESVNBQkxFRCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgZm9yIGludGVsbGlnZW50IHRvb2wgZGlzY292ZXJ5Li4uYCk7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuY29ubmVjdFRvTWVkaWNhbFNlcnZlcigpO1xuICAgICAgICBjb25zb2xlLmxvZygnIE1lZGljYWwgZG9jdW1lbnQgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCcgIE1lZGljYWwgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybignICAgRG9jdW1lbnQgcHJvY2Vzc2luZyB0b29scyB3aWxsIGJlIHVuYXZhaWxhYmxlIGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybignICBNZWRpY2FsIE1DUCBTZXJ2ZXIgVVJMIG5vdCBjb25maWd1cmVkLicpO1xuICAgIH1cblxuICAgIC8vIENvbm5lY3QgdG8gQWlkYm94IE1DUCBzZXJ2ZXIgZm9yIEZISVIgdG9vbHNcbiAgICBjb25zdCBhaWRib3hTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMic7XG4gICAgXG4gICAgaWYgKGFpZGJveFNlcnZlclVybCAmJiBhaWRib3hTZXJ2ZXJVcmwgIT09ICdESVNBQkxFRCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBBaWRib3ggTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgRkhJUiB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb0FpZGJveFNlcnZlcigpO1xuICAgICAgICBjb25zb2xlLmxvZygnIEFpZGJveCBGSElSIHRvb2xzIGRpc2NvdmVyZWQgYW5kIHJlYWR5IGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24nKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignICBBaWRib3ggTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7ICBcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBBaWRib3ggRkhJUiBmZWF0dXJlcyB3aWxsIGJlIHVuYXZhaWxhYmxlIGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybignICBBaWRib3ggTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBFcGljIE1DUCBzZXJ2ZXIgZm9yIEVwaWMgRUhSIHRvb2xzXG4gICAgY29uc3QgZXBpY1NlcnZlclVybCA9IHNldHRpbmdzPy5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMyc7XG4gICAgXG4gICAgaWYgKGVwaWNTZXJ2ZXJVcmwgJiYgZXBpY1NlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEVwaWMgTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgRUhSIHRvb2wgZGlzY292ZXJ5Li4uYCk7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuY29ubmVjdFRvRXBpY1NlcnZlcigpO1xuICAgICAgICBjb25zb2xlLmxvZygnIEVwaWMgRUhSIHRvb2xzIGRpc2NvdmVyZWQgYW5kIHJlYWR5IGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24nKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignICBFcGljIE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgIEVwaWMgRUhSIGZlYXR1cmVzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIEVwaWMgTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIExvZyBmaW5hbCBzdGF0dXNcbiAgICBjb25zdCBhdmFpbGFibGVUb29scyA9IG1jcE1hbmFnZXIuZ2V0QXZhaWxhYmxlVG9vbHMoKTtcbiAgICBjb25zb2xlLmxvZyhgXFxuIEludGVsbGlnZW50IFRvb2wgU2VsZWN0aW9uIFN0YXR1czpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgdG9vbHMgYXZhaWxhYmxlOiAke2F2YWlsYWJsZVRvb2xzLmxlbmd0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgIEFJIFByb3ZpZGVyOiAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvb2wgc2VsZWN0aW9uIG1ldGhvZDogJHtwcm92aWRlciA9PT0gJ2FudGhyb3BpYycgPyAnTmF0aXZlIENsYXVkZSB0b29sIGNhbGxpbmcnIDogJ0ludGVsbGlnZW50IHByb21wdGluZyd9YCk7XG4gICAgXG4gICAgLy8gTG9nIGF2YWlsYWJsZSB0b29sIGNhdGVnb3JpZXNcbiAgICBpZiAoYXZhaWxhYmxlVG9vbHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdG9vbENhdGVnb3JpZXMgPSBjYXRlZ29yaXplVG9vbHMoYXZhaWxhYmxlVG9vbHMpO1xuICAgICAgY29uc29sZS5sb2coJ1xcbvCflKcgQXZhaWxhYmxlIFRvb2wgQ2F0ZWdvcmllczonKTtcbiAgICAgIC8vIE9iamVjdC5lbnRyaWVzKHRvb2xDYXRlZ29yaWVzKS5mb3JFYWNoKChbY2F0ZWdvcnksIGNvdW50XSkgPT4ge1xuICAgICAgLy8gY29uc29sZS5sb2coYCAgICR7Z2V0Q2F0ZWdvcnlFbW9qaShjYXRlZ29yeSl9ICR7Y2F0ZWdvcnl9OiAke2NvdW50fSB0b29sc2ApO1xuICAgICAgLy8gfSk7XG4gICAgfVxuICBcbiAgICBpZiAoYXZhaWxhYmxlVG9vbHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ1xcbiBTVUNDRVNTOiBDbGF1ZGUgd2lsbCBub3cgaW50ZWxsaWdlbnRseSBzZWxlY3QgdG9vbHMgYmFzZWQgb24gdXNlciBxdWVyaWVzIScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBObyBtb3JlIGhhcmRjb2RlZCBwYXR0ZXJucyBvciBrZXl3b3JkIG1hdGNoaW5nJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIENsYXVkZSBhbmFseXplcyBlYWNoIHF1ZXJ5IGFuZCBjaG9vc2VzIGFwcHJvcHJpYXRlIHRvb2xzJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIFN1cHBvcnRzIGNvbXBsZXggbXVsdGktc3RlcCB0b29sIHVzYWdlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIEF1dG9tYXRpYyB0b29sIGNoYWluaW5nIGFuZCByZXN1bHQgaW50ZXJwcmV0YXRpb24nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ1xcbiAgTm8gdG9vbHMgYXZhaWxhYmxlIC0gcnVubmluZyBpbiBiYXNpYyBMTE0gbW9kZScpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZygnXFxuIEV4YW1wbGUgcXVlcmllcyB0aGF0IHdpbGwgd29yayB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOicpO1xuICAgIGNvbnNvbGUubG9nKCcgICAgQWlkYm94IEZISVI6IFwiR2V0IG1lIGRldGFpbHMgYWJvdXQgYWxsIEhhbmsgUHJlc3RvbiBhdmFpbGFibGUgZnJvbSBBaWRib3hcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICAgRXBpYyBFSFI6IFwiU2VhcmNoIGZvciBwYXRpZW50IENhbWlsYSBMb3BleiBpbiBFcGljXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAgIEVwaWMgRUhSOiBcIkdldCBsYWIgcmVzdWx0cyBmb3IgcGF0aWVudCBlclh1RllVZnVjQlphcnlWa3NZRWNNZzNcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICAgRG9jdW1lbnRzOiBcIlVwbG9hZCB0aGlzIGxhYiByZXBvcnQgYW5kIGZpbmQgc2ltaWxhciBjYXNlc1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgIE11bHRpLXRvb2w6IFwiU2VhcmNoIEVwaWMgZm9yIGRpYWJldGVzIHBhdGllbnRzIGFuZCBnZXQgdGhlaXIgbWVkaWNhdGlvbnNcIicpO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBpbml0aWFsaXplIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOicsIGVycm9yKTtcbiAgICBjb25zb2xlLndhcm4oJ1NlcnZlciB3aWxsIHJ1biB3aXRoIGxpbWl0ZWQgY2FwYWJpbGl0aWVzJyk7XG4gICAgY29uc29sZS53YXJuKCdCYXNpYyBMTE0gcmVzcG9uc2VzIHdpbGwgd29yaywgYnV0IG5vIHRvb2wgY2FsbGluZycpO1xuICB9XG59KTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNhdGVnb3JpemUgdG9vbHMgZm9yIGJldHRlciBsb2dnaW5nXG4vLyBGaXggZm9yIHNlcnZlci9tYWluLnRzIC0gUmVwbGFjZSB0aGUgY2F0ZWdvcml6ZVRvb2xzIGZ1bmN0aW9uXG5cbmZ1bmN0aW9uIGNhdGVnb3JpemVUb29scyh0b29sczogYW55W10pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgY29uc3QgY2F0ZWdvcmllczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBcbiAgdG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICBsZXQgY2F0ZWdvcnkgPSAnT3RoZXInO1xuICAgIFxuICAgIC8vIEVwaWMgRUhSIHRvb2xzIC0gdG9vbHMgd2l0aCAnZXBpYycgcHJlZml4XG4gICAgaWYgKHRvb2wubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKSkge1xuICAgICAgY2F0ZWdvcnkgPSAnRXBpYyBFSFInO1xuICAgIH1cbiAgICAvLyBBaWRib3ggRkhJUiB0b29scyAtIHN0YW5kYXJkIEZISVIgb3BlcmF0aW9ucyB3aXRob3V0ICdlcGljJyBwcmVmaXggZnJvbSBBaWRib3hcbiAgICBlbHNlIGlmIChpc0FpZGJveEZISVJUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdBaWRib3ggRkhJUic7XG4gICAgfVxuICAgIC8vIE1lZGljYWwgRG9jdW1lbnQgdG9vbHMgLSBkb2N1bWVudCBwcm9jZXNzaW5nIG9wZXJhdGlvbnNcbiAgICBlbHNlIGlmIChpc0RvY3VtZW50VG9vbCh0b29sKSkge1xuICAgICAgY2F0ZWdvcnkgPSAnTWVkaWNhbCBEb2N1bWVudHMnO1xuICAgIH1cbiAgICAvLyBTZWFyY2ggJiBBbmFseXNpcyB0b29scyAtIEFJL01MIG9wZXJhdGlvbnNcbiAgICBlbHNlIGlmIChpc1NlYXJjaEFuYWx5c2lzVG9vbCh0b29sKSkge1xuICAgICAgY2F0ZWdvcnkgPSAnU2VhcmNoICYgQW5hbHlzaXMnO1xuICAgIH1cbiAgICBcbiAgICBjYXRlZ29yaWVzW2NhdGVnb3J5XSA9IChjYXRlZ29yaWVzW2NhdGVnb3J5XSB8fCAwKSArIDE7XG4gIH0pO1xuICBcbiAgcmV0dXJuIGNhdGVnb3JpZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWlkYm94RkhJUlRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFpZGJveEZISVJUb29sTmFtZXMgPSBbXG4gICAgJ3NlYXJjaFBhdGllbnRzJywgJ2dldFBhdGllbnREZXRhaWxzJywgJ2NyZWF0ZVBhdGllbnQnLCAndXBkYXRlUGF0aWVudCcsXG4gICAgJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCAnY3JlYXRlT2JzZXJ2YXRpb24nLFxuICAgICdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCAnY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLFxuICAgICdnZXRQYXRpZW50Q29uZGl0aW9ucycsICdjcmVhdGVDb25kaXRpb24nLFxuICAgICdnZXRQYXRpZW50RW5jb3VudGVycycsICdjcmVhdGVFbmNvdW50ZXInXG4gIF07XG4gIFxuICAvLyBNdXN0IGJlIGluIHRoZSBBaWRib3ggdG9vbCBsaXN0IEFORCBub3Qgc3RhcnQgd2l0aCAnZXBpYydcbiAgcmV0dXJuIGFpZGJveEZISVJUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKSAmJiBcbiAgICAgICAgICF0b29sLm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJyk7XG59XG5cbmZ1bmN0aW9uIGlzRG9jdW1lbnRUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBkb2N1bWVudFRvb2xOYW1lcyA9IFtcbiAgICAndXBsb2FkRG9jdW1lbnQnLCAnc2VhcmNoRG9jdW1lbnRzJywgJ2xpc3REb2N1bWVudHMnLFxuICAgICdjaHVua0FuZEVtYmVkRG9jdW1lbnQnLCAnZ2VuZXJhdGVFbWJlZGRpbmdMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBkb2N1bWVudFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG5mdW5jdGlvbiBpc1NlYXJjaEFuYWx5c2lzVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYW5hbHlzaXNUb29sTmFtZXMgPSBbXG4gICAgJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsICdmaW5kU2ltaWxhckNhc2VzJywgJ2dldE1lZGljYWxJbnNpZ2h0cycsXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBhbmFseXNpc1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZ2V0IGVtb2ppIGZvciB0b29sIGNhdGVnb3JpZXNcbi8vIGZ1bmN0aW9uIGdldENhdGVnb3J5RW1vamkoY2F0ZWdvcnk6IHN0cmluZyk6IHN0cmluZyB7XG4vLyAgIGNvbnN0IGVtb2ppTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuLy8gICAgICdFcGljIEVIUic6ICfwn4+lJyxcbi8vICAgICAnQWlkYm94IEZISVInOiAn8J+TiycsXG4vLyAgICAgJ01lZGljYWwgRG9jdW1lbnRzJzogJ/Cfk4QnLFxuLy8gICAgICdTZWFyY2ggJiBBbmFseXNpcyc6ICfwn5SNJyxcbi8vICAgICAnT3RoZXInOiAn8J+Upydcbi8vICAgfTtcbiAgXG4vLyAgIHJldHVybiBlbW9qaU1hcFtjYXRlZ29yeV0gfHwgJ/CflKcnO1xuLy8gfVxuXG4vLyBHcmFjZWZ1bCBzaHV0ZG93blxucHJvY2Vzcy5vbignU0lHSU5UJywgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnXFxuIFNodXR0aW5nIGRvd24gc2VydmVyLi4uJyk7XG4gIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gIFxuICAvLyBDbGVhciBhbGwgY29udGV4dCBiZWZvcmUgc2h1dGRvd25cbiAgY29uc3QgeyBDb250ZXh0TWFuYWdlciB9ID0gcmVxdWlyZSgnL2ltcG9ydHMvYXBpL2NvbnRleHQvY29udGV4dE1hbmFnZXInKTtcbiAgQ29udGV4dE1hbmFnZXIuY2xlYXJBbGxDb250ZXh0cygpO1xuICBcbiAgbWNwTWFuYWdlci5zaHV0ZG93bigpLnRoZW4oKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCcgU2VydmVyIHNodXRkb3duIGNvbXBsZXRlJyk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgc2h1dGRvd246JywgZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfSk7XG59KTtcblxuLy8gSGFuZGxlIHVuY2F1Z2h0IGVycm9yc1xucHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCAoZXJyb3IpID0+IHtcbiAgY29uc29sZS5lcnJvcignVW5jYXVnaHQgRXhjZXB0aW9uOicsIGVycm9yKTtcbn0pO1xuXG5wcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCAocmVhc29uLCBwcm9taXNlKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ1VuaGFuZGxlZCBSZWplY3Rpb24gYXQ6JywgcHJvbWlzZSwgJ3JlYXNvbjonLCByZWFzb24pO1xufSk7Il19
