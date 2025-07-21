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
        console.log(' Initializing MCP Client with Intelligent Tool Selection');
        this.config = config;
        try {
          if (config.provider === 'anthropic') {
            console.log('Creating Anthropic client with native tool calling support...');
            this.anthropic = new Anthropic({
              apiKey: config.apiKey
            });
            console.log(' Anthropic client initialized with intelligent tool selection');
          }
          this.isInitialized = true;
          console.log("MCP Client ready with provider: ".concat(config.provider));
        } catch (error) {
          console.error(' Failed to initialize MCP client:', error);
          throw error;
        }
      }
      // Connect to medical MCP server and get all available tools
      async connectToMedicalServer() {
        try {
          var _global$Meteor, _global$Meteor$settin;
          const settings = (_global$Meteor = global.Meteor) === null || _global$Meteor === void 0 ? void 0 : (_global$Meteor$settin = _global$Meteor.settings) === null || _global$Meteor$settin === void 0 ? void 0 : _global$Meteor$settin.private;
          const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3001';
          console.log(" Connecting to Medical MCP Server at: ".concat(mcpServerUrl));
          this.medicalConnection = new MedicalServerConnection(mcpServerUrl);
          await this.medicalConnection.connect();
          this.medicalOperations = createMedicalOperations(this.medicalConnection);
          // Get all available tools
          const toolsResult = await this.medicalConnection.listTools();
          this.availableTools = toolsResult.tools || [];
          console.log(" Connected with ".concat(this.availableTools.length, " medical tools available"));
          console.log(" Medical tool names: ".concat(this.availableTools.map(t => t.name).join(', ')));
        } catch (error) {
          console.error(' Medical MCP Server HTTP connection failed:', error);
          throw error;
        }
      }
      async connectToAidboxServer() {
        try {
          var _global$Meteor2, _global$Meteor2$setti;
          const settings = (_global$Meteor2 = global.Meteor) === null || _global$Meteor2 === void 0 ? void 0 : (_global$Meteor2$setti = _global$Meteor2.settings) === null || _global$Meteor2$setti === void 0 ? void 0 : _global$Meteor2$setti.private;
          const aidboxServerUrl = (settings === null || settings === void 0 ? void 0 : settings.AIDBOX_MCP_SERVER_URL) || process.env.AIDBOX_MCP_SERVER_URL || 'http://localhost:3002';
          console.log(" Connecting to Aidbox MCP Server at: ".concat(aidboxServerUrl));
          this.aidboxConnection = new AidboxServerConnection(aidboxServerUrl);
          await this.aidboxConnection.connect();
          this.aidboxOperations = createAidboxOperations(this.aidboxConnection);
          // Get Aidbox tools
          const toolsResult = await this.aidboxConnection.listTools();
          this.aidboxTools = toolsResult.tools || [];
          console.log(" Connected to Aidbox with ".concat(this.aidboxTools.length, " tools available"));
          console.log(" Aidbox tool names: ".concat(this.aidboxTools.map(t => t.name).join(', ')));
          // Merge with existing tools, ensuring unique names
          this.availableTools = this.mergeToolsUnique(this.availableTools, this.aidboxTools);
          this.logAvailableTools();
        } catch (error) {
          console.error(' Aidbox MCP Server connection failed:', error);
          throw error;
        }
      }
      async connectToEpicServer() {
        try {
          var _global$Meteor3, _global$Meteor3$setti;
          const settings = (_global$Meteor3 = global.Meteor) === null || _global$Meteor3 === void 0 ? void 0 : (_global$Meteor3$setti = _global$Meteor3.settings) === null || _global$Meteor3$setti === void 0 ? void 0 : _global$Meteor3$setti.private;
          const epicServerUrl = (settings === null || settings === void 0 ? void 0 : settings.EPIC_MCP_SERVER_URL) || process.env.EPIC_MCP_SERVER_URL || 'http://localhost:3003';
          console.log(" Connecting to Epic MCP Server at: ".concat(epicServerUrl));
          this.epicConnection = new EpicServerConnection(epicServerUrl);
          await this.epicConnection.connect();
          this.epicOperations = createEpicOperations(this.epicConnection);
          // Get Epic tools
          const toolsResult = await this.epicConnection.listTools();
          this.epicTools = toolsResult.tools || [];
          console.log(" Connected to Epic with ".concat(this.epicTools.length, " tools available"));
          console.log(" Epic tool names: ".concat(this.epicTools.map(t => t.name).join(', ')));
          // Merge with existing tools, ensuring unique names
          this.availableTools = this.mergeToolsUnique(this.availableTools, this.epicTools);
          this.logAvailableTools();
        } catch (error) {
          console.error(' Epic MCP Server connection failed:', error);
          throw error;
        }
      }
      // Merge tools ensuring unique names
      mergeToolsUnique(existingTools, newTools) {
        console.log("\uD83D\uDD27 Merging tools: ".concat(existingTools.length, " existing + ").concat(newTools.length, " new"));
        const toolNameSet = new Set(existingTools.map(tool => tool.name));
        const uniqueNewTools = newTools.filter(tool => {
          if (toolNameSet.has(tool.name)) {
            console.warn(" Duplicate tool name found: ".concat(tool.name, " - skipping duplicate"));
            return false;
          }
          toolNameSet.add(tool.name);
          return true;
        });
        const mergedTools = [...existingTools, ...uniqueNewTools];
        console.log(" Merged tools: ".concat(existingTools.length, " existing + ").concat(uniqueNewTools.length, " new = ").concat(mergedTools.length, " total"));
        return mergedTools;
      }
      logAvailableTools() {
        console.log('\n Available Tools for Intelligent Selection:');
        // Separate tools by actual source/type, not by pattern matching
        const epicTools = this.availableTools.filter(t => t.name.toLowerCase().startsWith('epic'));
        const aidboxTools = this.availableTools.filter(t => this.isAidboxFHIRTool(t) && !t.name.toLowerCase().startsWith('epic'));
        const documentTools = this.availableTools.filter(t => this.isDocumentTool(t));
        const analysisTools = this.availableTools.filter(t => this.isAnalysisTool(t));
        const otherTools = this.availableTools.filter(t => !epicTools.includes(t) && !aidboxTools.includes(t) && !documentTools.includes(t) && !analysisTools.includes(t));
        if (aidboxTools.length > 0) {
          console.log(' Aidbox FHIR Tools:');
          aidboxTools.forEach(tool => {
            var _tool$description;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description = tool.description) === null || _tool$description === void 0 ? void 0 : _tool$description.substring(0, 60), "..."));
          });
        }
        if (epicTools.length > 0) {
          console.log(' Epic EHR Tools:');
          epicTools.forEach(tool => {
            var _tool$description2;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description2 = tool.description) === null || _tool$description2 === void 0 ? void 0 : _tool$description2.substring(0, 60), "..."));
          });
        }
        if (documentTools.length > 0) {
          console.log(' Document Tools:');
          documentTools.forEach(tool => {
            var _tool$description3;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description3 = tool.description) === null || _tool$description3 === void 0 ? void 0 : _tool$description3.substring(0, 60), "..."));
          });
        }
        if (analysisTools.length > 0) {
          console.log(' Search & Analysis Tools:');
          analysisTools.forEach(tool => {
            var _tool$description4;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description4 = tool.description) === null || _tool$description4 === void 0 ? void 0 : _tool$description4.substring(0, 60), "..."));
          });
        }
        if (otherTools.length > 0) {
          console.log(' Other Tools:');
          otherTools.forEach(tool => {
            var _tool$description5;
            return console.log("   \u2022 ".concat(tool.name, " - ").concat((_tool$description5 = tool.description) === null || _tool$description5 === void 0 ? void 0 : _tool$description5.substring(0, 60), "..."));
          });
        }
        console.log("\n Claude will intelligently select from ".concat(this.availableTools.length, " total tools based on user queries"));
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
          console.error(' DUPLICATE TOOL NAMES FOUND:');
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
            console.warn(" Skipping duplicate tool in Anthropic format: ".concat(tool.name));
          }
        });
        const toolsArray = Array.from(uniqueTools.values());
        console.log(" Prepared ".concat(toolsArray.length, " unique tools for Anthropic (from ").concat(this.availableTools.length, " total)"));
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
            console.error(" CRITICAL: Duplicate tool found in final validation: ".concat(tool.name));
          }
        });
        if (validTools.length !== tools.length) {
          console.warn("\uD83E\uDDF9 Removed ".concat(tools.length - validTools.length, " duplicate tools in final validation"));
        }
        console.log(" Final validation: ".concat(validTools.length, " unique tools ready for Anthropic"));
        return validTools;
      }
      async callMCPTool(toolName, args) {
        console.log("\uD83D\uDD27 Routing tool: ".concat(toolName, " with args:"), JSON.stringify(args, null, 2));
        // Epic tools - MUST go to Epic MCP Server (port 3003)
        const epicToolNames = ['epicSearchPatients', 'epicGetPatientDetails', 'epicGetPatientObservations', 'epicGetPatientMedications', 'epicGetPatientConditions', 'epicGetPatientEncounters'];
        if (epicToolNames.includes(toolName)) {
          if (!this.epicConnection) {
            throw new Error('Epic MCP Server not connected - cannot call Epic tools');
          }
          console.log(" Routing ".concat(toolName, " to Epic MCP Server (port 3003)"));
          try {
            const result = await this.epicConnection.callTool(toolName, args);
            console.log(" Epic tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error(" Epic tool ".concat(toolName, " failed:"), error);
            throw new Error("Epic tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        // Aidbox tools - MUST go to Aidbox MCP Server (port 3002)
        const aidboxToolNames = ['aidboxSearchPatients', 'aidboxGetPatientDetails', 'aidboxCreatePatient', 'aidboxUpdatePatient', 'aidboxGetPatientObservations', 'aidboxCreateObservation', 'aidboxGetPatientMedications', 'aidboxCreateMedicationRequest', 'aidboxGetPatientConditions', 'aidboxCreateCondition', 'aidboxGetPatientEncounters', 'aidboxCreateEncounter'];
        if (aidboxToolNames.includes(toolName)) {
          if (!this.aidboxConnection) {
            throw new Error('Aidbox MCP Server not connected - cannot call Aidbox tools');
          }
          console.log(" Routing ".concat(toolName, " to Aidbox MCP Server (port 3002)"));
          try {
            const result = await this.aidboxConnection.callTool(toolName, args);
            console.log(" Aidbox tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error(" Aidbox tool ".concat(toolName, " failed:"), error);
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
          console.log(" Routing ".concat(toolName, " to Medical MCP Server (port 3001)"));
          try {
            const result = await this.medicalConnection.callTool(toolName, args);
            console.log(" Medical tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error(" Medical tool ".concat(toolName, " failed:"), error);
            throw new Error("Medical tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        // Unknown tool - check if it exists in available tools
        const availableTool = this.availableTools.find(t => t.name === toolName);
        if (!availableTool) {
          const availableToolNames = this.availableTools.map(t => t.name).join(', ');
          throw new Error("Tool '".concat(toolName, "' is not available. Available tools: ").concat(availableToolNames));
        }
        console.warn(" Unknown tool routing for: ".concat(toolName, ". Defaulting to Medical server."));
        if (!this.medicalConnection) {
          throw new Error('Medical MCP Server not connected');
        }
        try {
          const result = await this.medicalConnection.callTool(toolName, args);
          console.log(" Tool ".concat(toolName, " completed successfully (default routing)"));
          return result;
        } catch (error) {
          console.error(" Tool ".concat(toolName, " failed on default routing:"), error);
          throw new Error("Tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      // Convenience method for Epic tool calls
      async callEpicTool(toolName, args) {
        if (!this.epicConnection) {
          throw new Error('Epic MCP Server not connected');
        }
        try {
          console.log(" Calling Epic tool: ".concat(toolName), args);
          const result = await this.epicConnection.callTool(toolName, args);
          console.log(" Epic tool ".concat(toolName, " completed successfully"));
          return result;
        } catch (error) {
          console.error(" Epic tool ".concat(toolName, " failed:"), error);
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
            const medicalHealth = await fetch('http://localhost:3001/health');
            health.medical = medicalHealth.ok;
          } catch (error) {
            console.warn('Medical health check failed:', error);
          }
        }
        return health;
      }
      // Main intelligent query processing method
      async processQueryWithIntelligentToolSelection(query, context) {
        if (!this.isInitialized || !this.config) {
          throw new Error('MCP Client not initialized');
        }
        console.log(" Processing query with intelligent tool selection: \"".concat(query, "\""));
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
      // Anthropic native tool calling with iterative support
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
        // Build context information
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
        const systemPrompt = "You are a medical AI assistant with access to multiple healthcare data systems:\n\n\uD83C\uDFE5 **Epic EHR Tools** - For Epic EHR patient data, observations, medications, conditions, encounters\n\uD83C\uDFE5 **Aidbox FHIR Tools** - For FHIR-compliant patient data, observations, medications, conditions, encounters  \n\uD83D\uDCC4 **Medical Document Tools** - For document upload, search, and medical entity extraction (MongoDB Atlas)\n\uD83D\uDD0D **Semantic Search** - For finding similar cases and medical insights (MongoDB Atlas)\n\n**CRITICAL: Pay attention to which data source the user mentions:**\n\n- If user mentions \"Epic\" or \"EHR\" \u2192 Use Epic EHR tools\n- If user mentions \"Aidbox\" or \"FHIR\" \u2192 Use Aidbox FHIR tools\n- If user mentions \"MongoDB\", \"Atlas\", \"documents\", \"uploaded files\" \u2192 Use document search tools\n- If user mentions \"diagnosis in MongoDB\" \u2192 Search documents, NOT Epic/Aidbox\n- If no specific source mentioned \u2192 Choose based on context (Epic for patient searches, Aidbox for FHIR, documents for uploads)\n\n**Available Context:**".concat(contextInfo, "\n\n**Instructions:**\n1. **LISTEN TO USER'S DATA SOURCE PREFERENCE** - If they say Epic, use Epic tools; if MongoDB/Atlas, use document tools\n2. For Epic/Aidbox queries, use patient search first to get IDs, then specific data tools\n3. For document queries, use search and upload tools\n4. Provide clear, helpful medical information\n5. Always explain what data sources you're using\n\nBe intelligent about tool selection AND respect the user's specified data source.");
        let conversationHistory = [{
          role: 'user',
          content: query
        }];
        let finalResponse = '';
        let iterations = 0;
        const maxIterations = 7; // Reduced to avoid API overload
        const maxRetries = 3;
        while (iterations < maxIterations) {
          console.log(" Iteration ".concat(iterations + 1, " - Asking Claude to decide on tools"));
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
                console.warn(" Anthropic API overloaded, retrying in ".concat(delay, "ms (attempt ").concat(retryCount, "/").concat(maxRetries, ")"));
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
              console.log(" Claude says: ".concat(content.text.substring(0, 100), "..."));
            } else if (content.type === 'tool_use') {
              hasToolUse = true;
              console.log("\uD83D\uDD27 Claude chose tool: ".concat(content.name, " with args:"), content.input);
              try {
                const toolResult = await this.callMCPTool(content.name, content.input);
                console.log(" Tool ".concat(content.name, " executed successfully"));
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
                console.error(" Tool ".concat(content.name, " failed:"), error);
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
            console.log(' Claude provided final answer without additional tools');
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
        const systemPrompt = "You are a medical AI assistant with access to these tools:\n\n".concat(availableToolsDescription, "\n\nThe user's query is: \"").concat(query, "\"\n\nBased on this query, determine what tools (if any) you need to use and provide a helpful response. If you need to use tools, explain what you would do, but note that in this mode you cannot actually execute tools.");
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
        console.log(" Switched to ".concat(provider.toUpperCase(), " provider with intelligent tool selection"));
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
        console.log('Shutting down MCP Clients...');
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
        let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http://localhost:3001';
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
          await this.sendNotification('initialized', {});
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
          const response = await fetch("".concat(this.baseUrl, "/mcp"), {
            method: 'POST',
            headers,
            body: JSON.stringify(notification),
            signal: AbortSignal.timeout(10000)
          });
          if (!response.ok) {
            console.warn("Notification ".concat(method, " failed: ").concat(response.status));
          }
        } catch (error) {
          console.warn("Notification ".concat(method, " failed:"), error);
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
      async 'mcp.processQuery'(query, sessionId) {
        check(query, String);
        check(sessionId, Match.Maybe(String));
        if (!this.isSimulation) {
          const mcpManager = MCPClientManager.getInstance();
          if (!mcpManager.isReady()) {
            return 'MCP Client is not ready. Please check your API configuration.';
          }
          try {
            console.log(" Processing query with intelligent tool selection: \"".concat(query, "\""));
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
              // Get conversation context
              const contextData = await ContextManager.getContext(sessionId);
              context.conversationContext = contextData;
            }
            // Let Claude intelligently decide what tools to use (includes Epic tools)
            const response = await mcpManager.processQueryWithIntelligentToolSelection(query, context);
            // Update context after processing
            if (sessionId) {
              await extractAndUpdateContext(query, response, sessionId);
            }
            return response;
          } catch (error) {
            console.error('Intelligent MCP processing error:', error);
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
              aidbox: health.aidbox ? 'healthy' : 'unavailable'
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
        console.log("  Upload request for: ".concat(fileData.filename, " (").concat(fileData.mimeType, ")"));
        console.log(" Content size: ".concat(fileData.content.length, " chars"));
        if (this.isSimulation) {
          console.log(' Simulation mode - returning mock document ID');
          return {
            success: true,
            documentId: 'sim-' + Date.now(),
            message: 'Document uploaded (simulation mode)'
          };
        }
        const mcpManager = MCPClientManager.getInstance();
        if (!mcpManager.isReady()) {
          console.error(' MCP Client not ready');
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
          console.log(" Estimated file size: ".concat(Math.round(estimatedFileSize / 1024), "KB"));
          const medical = mcpManager.getMedicalOperations();
          // Convert base64 back to buffer for MCP server
          const fileBuffer = Buffer.from(fileData.content, 'base64');
          const result = await medical.uploadDocument(fileBuffer, fileData.filename, fileData.mimeType, {
            patientName: fileData.patientName || 'Unknown Patient',
            sessionId: fileData.sessionId || ((_this$connection = this.connection) === null || _this$connection === void 0 ? void 0 : _this$connection.id) || 'default',
            uploadedBy: this.userId || 'anonymous',
            uploadDate: new Date().toISOString()
          });
          console.log(' MCP upload successful:', result);
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
              console.log(' Session metadata updated');
            } catch (updateError) {
              console.warn(' Failed to update session metadata:', updateError);
              // Don't fail the whole operation for this
            }
          }
          return result;
        } catch (error) {
          var _error$message, _error$message2, _error$message3, _error$message4, _error$message5;
          console.error(' Document upload error:', error);
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
          console.error(' Document processing error:', error);
          throw new Meteor.Error('processing-failed', "Failed to process document: ".concat(error.message || 'Unknown error'));
        }
      }
    });
    // Helper function to extract and update context
    async function extractAndUpdateContext(query, response, sessionId) {
      try {
        // Extract patient name from query
        const patientMatch = query.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (patientMatch) {
          await SessionsCollection.updateAsync(sessionId, {
            $set: {
              'metadata.patientId': patientMatch[1]
            }
          });
        }
        // Extract medical terms from response
        const medicalTerms = extractMedicalTermsFromResponse(response);
        if (medicalTerms.length > 0) {
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
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.dataSources': {
                $each: dataSources
              }
            }
          });
        }
      } catch (error) {
        console.error('Error updating context:', error);
      }
    }
    function extractMedicalTermsFromResponse(response) {
      const medicalPatterns = [/\b(?:diagnosed with|diagnosis of)\s+([^,.]+)/gi, /\b(?:prescribed|medication)\s+([^,.]+)/gi, /\b(?:treatment for|treating)\s+([^,.]+)/gi, /\b(?:condition|disease):\s*([^,.]+)/gi];
      const terms = new Set();
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
        const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3001';
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsIm1lZGljYWxUb29sTmFtZXMiLCJhdmFpbGFibGVUb29sIiwiYXZhaWxhYmxlVG9vbE5hbWVzIiwiY2FsbEVwaWNUb29sIiwiZXBpYyIsImFpZGJveCIsIm1lZGljYWwiLCJlcGljSGVhbHRoIiwiYWlkYm94SGVhbHRoIiwibWVkaWNhbEhlYWx0aCIsInByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50IiwicHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudCIsIl9lcnJvciRtZXNzYWdlIiwiX2Vycm9yJG1lc3NhZ2UyIiwiX2Vycm9yJG1lc3NhZ2UzIiwiTk9ERV9FTlYiLCJxdWVyeUludGVudCIsImNvbnRleHRJbmZvIiwic3lzdGVtUHJvbXB0IiwiY29udmVyc2F0aW9uSGlzdG9yeSIsImZpbmFsUmVzcG9uc2UiLCJpdGVyYXRpb25zIiwibWF4SXRlcmF0aW9ucyIsIm1heFJldHJpZXMiLCJyZXRyeUNvdW50IiwiY3JlYXRlIiwibW9kZWwiLCJtYXhfdG9rZW5zIiwic3lzdGVtIiwidG9vbF9jaG9pY2UiLCJkZWxheSIsInBvdyIsIlByb21pc2UiLCJyZXNvbHZlIiwic2V0VGltZW91dCIsImhhc1Rvb2xVc2UiLCJhc3Npc3RhbnRSZXNwb25zZSIsImlucHV0IiwidG9vbFJlc3VsdCIsInRvb2xfdXNlX2lkIiwiZm9ybWF0VG9vbFJlc3VsdCIsImlzX2Vycm9yIiwiX3RoaXMkY29uZmlnIiwiZW5kcG9pbnQiLCJvendlbGxFbmRwb2ludCIsImF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24iLCJfdGhpcyRjb25maWcyIiwiX2RhdGEkY2hvaWNlcyIsIl9kYXRhJGNob2ljZXMkIiwicHJvbXB0IiwidGVtcGVyYXR1cmUiLCJzdHJlYW0iLCJkYXRhIiwiY2hvaWNlcyIsImNvbXBsZXRpb24iLCJwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQiLCJnZXRBdmFpbGFibGVUb29scyIsImlzVG9vbEF2YWlsYWJsZSIsInNvbWUiLCJnZXRNZWRpY2FsT3BlcmF0aW9ucyIsImdldEVwaWNPcGVyYXRpb25zIiwiZ2V0QWlkYm94T3BlcmF0aW9ucyIsInN3aXRjaFByb3ZpZGVyIiwidG9VcHBlckNhc2UiLCJnZXRDdXJyZW50UHJvdmlkZXIiLCJfdGhpcyRjb25maWczIiwiZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX2dsb2JhbCRNZXRlb3I0IiwiX2dsb2JhbCRNZXRlb3I0JHNldHRpIiwiYW50aHJvcGljS2V5IiwiQU5USFJPUElDX0FQSV9LRVkiLCJvendlbGxLZXkiLCJPWldFTExfQVBJX0tFWSIsInByb3ZpZGVycyIsImlzUmVhZHkiLCJnZXRDb25maWciLCJzaHV0ZG93biIsImNvbnRlbnRUeXBlIiwiaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UiLCJyZXNwb25zZVRleHQiLCJyZWplY3QiLCJfcmVzcG9uc2UkYm9keSIsInJlYWRlciIsImdldFJlYWRlciIsImRlY29kZXIiLCJUZXh0RGVjb2RlciIsImJ1ZmZlciIsInByb2Nlc3NDaHVuayIsImRvbmUiLCJ2YWx1ZSIsInJlYWQiLCJkZWNvZGUiLCJsaW5lcyIsInBvcCIsImxpbmUiLCJwYXJzZWQiLCJjYW5jZWwiLCJjYXRjaCIsInVwbG9hZERvY3VtZW50IiwiZmlsZSIsImZpbGVuYW1lIiwibWltZVR5cGUiLCJ0aXRsZSIsImZpbGVCdWZmZXIiLCJ0b1N0cmluZyIsImZpbGVUeXBlIiwic2VhcmNoRG9jdW1lbnRzIiwidGhyZXNob2xkIiwibGlzdERvY3VtZW50cyIsIm9mZnNldCIsImRvY3VtZW50SWQiLCJmaW5kU2ltaWxhckNhc2VzIiwiY3JpdGVyaWEiLCJhbmFseXplUGF0aWVudEhpc3RvcnkiLCJhbmFseXNpc1R5cGUiLCJkYXRlUmFuZ2UiLCJnZXRNZWRpY2FsSW5zaWdodHMiLCJleHRyYWN0VGV4dCIsIl9pZCIsImRvY3VtZW50cyIsInN1Y2Nlc3MiLCJleHRyYWN0ZWRUZXh0IiwiY29uZmlkZW5jZSIsInNlYXJjaEJ5RGlhZ25vc2lzIiwicGF0aWVudElkZW50aWZpZXIiLCJkaWFnbm9zaXNRdWVyeSIsInNlbWFudGljU2VhcmNoIiwiZ2V0UGF0aWVudFN1bW1hcnkiLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJleHRyYWN0QW5kVXBkYXRlQ29udGV4dCIsImV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UiLCJleHRyYWN0RGF0YVNvdXJjZXMiLCJzYW5pdGl6ZVBhdGllbnROYW1lIiwiY2hlY2siLCJNYXRjaCIsIm1ldGhvZHMiLCJtZXNzYWdlcy5pbnNlcnQiLCJtZXNzYWdlRGF0YSIsIlN0cmluZyIsIm1lc3NhZ2VJZCIsImluc2VydEFzeW5jIiwiJGluYyIsImNhbGwiLCJtY3AucHJvY2Vzc1F1ZXJ5IiwiTWF5YmUiLCJpc1NpbXVsYXRpb24iLCJtY3BNYW5hZ2VyIiwiX3Nlc3Npb24kbWV0YWRhdGEiLCJjb250ZXh0RGF0YSIsImNvbnZlcnNhdGlvbkNvbnRleHQiLCJtY3Auc3dpdGNoUHJvdmlkZXIiLCJtY3AuZ2V0Q3VycmVudFByb3ZpZGVyIiwibWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycyIsIl9NZXRlb3Ikc2V0dGluZ3MiLCJtY3AuZ2V0QXZhaWxhYmxlVG9vbHMiLCJtY3AuaGVhbHRoQ2hlY2siLCJzZXJ2ZXJzIiwibWVkaWNhbC51cGxvYWREb2N1bWVudCIsImZpbGVEYXRhIiwicGF0aWVudE5hbWUiLCJub3ciLCJfdGhpcyRjb25uZWN0aW9uIiwiZXN0aW1hdGVkRmlsZVNpemUiLCJyb3VuZCIsIkJ1ZmZlciIsInVwbG9hZGVkQnkiLCJ1c2VySWQiLCJ1cGxvYWREYXRlIiwidG9JU09TdHJpbmciLCIkYWRkVG9TZXQiLCJ1cGRhdGVFcnJvciIsIl9lcnJvciRtZXNzYWdlNCIsIl9lcnJvciRtZXNzYWdlNSIsIm1lZGljYWwucHJvY2Vzc0RvY3VtZW50IiwidGV4dEV4dHJhY3Rpb24iLCJkaWFnbm9zaXNDb3VudCIsIm1lZGljYXRpb25Db3VudCIsImxhYlJlc3VsdENvdW50IiwicGF0aWVudE1hdGNoIiwiJGVhY2giLCJkYXRhU291cmNlcyIsIm1lZGljYWxQYXR0ZXJucyIsInNvdXJjZXMiLCJ3b3JkIiwiY2hhckF0IiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3JpZXMiLCJjYXRlZ29yeSIsImlzU2VhcmNoQW5hbHlzaXNUb29sIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQUEsQ0FBT0MsTUFBRTtNQUFBQyxjQUE2QixFQUFBQSxDQUFBLEtBQUFBO0lBQU07SUFBQSxJQUFBQyxrQkFBdUI7SUFBQUgsTUFBQSxDQUFBSSxJQUFBO01BQUFELG1CQUFBRSxDQUFBO1FBQUFGLGtCQUFBLEdBQUFFLENBQUE7TUFBQTtJQUFBO0lBQUEsSUFBQUMsa0JBQUE7SUFBQU4sTUFBQSxDQUFBSSxJQUFBO01B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Q0FBQztJQUFDamMsc0JBQUE7RUFBQSxTQUFBQyxXQUFBO0lBQUEsT0FBQUQsc0JBQUEsQ0FBQUMsV0FBQTtFQUFBO0VBQUFELHNCQUFBO0FBQUE7RUFBQUUsSUFBQTtFQUFBQyxLQUFBO0FBQUEsRyIsImZpbGUiOiIvYXBwLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uLCBNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZXMvbWVzc2FnZXMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnZlcnNhdGlvbkNvbnRleHQge1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgcmVjZW50TWVzc2FnZXM6IE1lc3NhZ2VbXTtcbiAgcGF0aWVudENvbnRleHQ/OiBzdHJpbmc7XG4gIGRvY3VtZW50Q29udGV4dD86IHN0cmluZ1tdO1xuICBtZWRpY2FsRW50aXRpZXM/OiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT47XG4gIG1heENvbnRleHRMZW5ndGg6IG51bWJlcjtcbiAgdG90YWxUb2tlbnM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzdGF0aWMgY29udGV4dHMgPSBuZXcgTWFwPHN0cmluZywgQ29udmVyc2F0aW9uQ29udGV4dD4oKTtcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0NPTlRFWFRfTEVOR1RIID0gNDAwMDsgLy8gQWRqdXN0IGJhc2VkIG9uIG1vZGVsXG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9NRVNTQUdFUyA9IDIwO1xuICBcbiAgc3RhdGljIGFzeW5jIGdldENvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPENvbnZlcnNhdGlvbkNvbnRleHQ+IHtcbiAgICBsZXQgY29udGV4dCA9IHRoaXMuY29udGV4dHMuZ2V0KHNlc3Npb25JZCk7XG4gICAgXG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAvLyBMb2FkIGNvbnRleHQgZnJvbSBkYXRhYmFzZVxuICAgICAgY29udGV4dCA9IGF3YWl0IHRoaXMubG9hZENvbnRleHRGcm9tREIoc2Vzc2lvbklkKTtcbiAgICAgIHRoaXMuY29udGV4dHMuc2V0KHNlc3Npb25JZCwgY29udGV4dCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBhc3luYyBsb2FkQ29udGV4dEZyb21EQihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29udmVyc2F0aW9uQ29udGV4dD4ge1xuICAgIC8vIExvYWQgcmVjZW50IG1lc3NhZ2VzXG4gICAgY29uc3QgcmVjZW50TWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgc2Vzc2lvbklkIH0sXG4gICAgICB7IFxuICAgICAgICBzb3J0OiB7IHRpbWVzdGFtcDogLTEgfSwgXG4gICAgICAgIGxpbWl0OiB0aGlzLk1BWF9NRVNTQUdFUyBcbiAgICAgIH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICAvLyBMb2FkIHNlc3Npb24gbWV0YWRhdGFcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhzZXNzaW9uSWQpO1xuICAgIFxuICAgIGNvbnN0IGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQgPSB7XG4gICAgICBzZXNzaW9uSWQsXG4gICAgICByZWNlbnRNZXNzYWdlczogcmVjZW50TWVzc2FnZXMucmV2ZXJzZSgpLFxuICAgICAgbWF4Q29udGV4dExlbmd0aDogdGhpcy5NQVhfQ09OVEVYVF9MRU5HVEgsXG4gICAgICB0b3RhbFRva2VuczogMFxuICAgIH07XG4gICAgXG4gICAgLy8gQWRkIG1ldGFkYXRhIGZyb20gc2Vzc2lvblxuICAgIGlmIChzZXNzaW9uPy5tZXRhZGF0YSkge1xuICAgICAgY29udGV4dC5wYXRpZW50Q29udGV4dCA9IHNlc3Npb24ubWV0YWRhdGEucGF0aWVudElkO1xuICAgICAgY29udGV4dC5kb2N1bWVudENvbnRleHQgPSBzZXNzaW9uLm1ldGFkYXRhLmRvY3VtZW50SWRzO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IG1lZGljYWwgZW50aXRpZXMgZnJvbSByZWNlbnQgbWVzc2FnZXNcbiAgICBjb250ZXh0Lm1lZGljYWxFbnRpdGllcyA9IHRoaXMuZXh0cmFjdE1lZGljYWxFbnRpdGllcyhyZWNlbnRNZXNzYWdlcyk7XG4gICAgXG4gICAgLy8gQ2FsY3VsYXRlIHRva2VuIHVzYWdlXG4gICAgY29udGV4dC50b3RhbFRva2VucyA9IHRoaXMuY2FsY3VsYXRlVG9rZW5zKGNvbnRleHQpO1xuICAgIFxuICAgIC8vIFRyaW0gaWYgbmVlZGVkXG4gICAgdGhpcy50cmltQ29udGV4dChjb250ZXh0KTtcbiAgICBcbiAgICByZXR1cm4gY29udGV4dDtcbiAgfVxuICBcbiAgc3RhdGljIGFzeW5jIHVwZGF0ZUNvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcsIG5ld01lc3NhZ2U6IE1lc3NhZ2UpIHtcbiAgICBjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5nZXRDb250ZXh0KHNlc3Npb25JZCk7XG4gICAgXG4gICAgLy8gQWRkIG5ldyBtZXNzYWdlXG4gICAgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5wdXNoKG5ld01lc3NhZ2UpO1xuICAgIFxuICAgIC8vIFVwZGF0ZSBtZWRpY2FsIGVudGl0aWVzIGlmIG1lc3NhZ2UgY29udGFpbnMgdGhlbVxuICAgIGlmIChuZXdNZXNzYWdlLnJvbGUgPT09ICdhc3Npc3RhbnQnKSB7XG4gICAgICBjb25zdCBlbnRpdGllcyA9IHRoaXMuZXh0cmFjdEVudGl0aWVzRnJvbU1lc3NhZ2UobmV3TWVzc2FnZS5jb250ZW50KTtcbiAgICAgIGlmIChlbnRpdGllcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnRleHQubWVkaWNhbEVudGl0aWVzID0gW1xuICAgICAgICAgIC4uLihjb250ZXh0Lm1lZGljYWxFbnRpdGllcyB8fCBbXSksXG4gICAgICAgICAgLi4uZW50aXRpZXNcbiAgICAgICAgXS5zbGljZSgtNTApOyAvLyBLZWVwIGxhc3QgNTAgZW50aXRpZXNcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gUmVjYWxjdWxhdGUgdG9rZW5zIGFuZCB0cmltXG4gICAgY29udGV4dC50b3RhbFRva2VucyA9IHRoaXMuY2FsY3VsYXRlVG9rZW5zKGNvbnRleHQpO1xuICAgIHRoaXMudHJpbUNvbnRleHQoY29udGV4dCk7XG4gICAgXG4gICAgdGhpcy5jb250ZXh0cy5zZXQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgICBcbiAgICAvLyBQZXJzaXN0IGltcG9ydGFudCBjb250ZXh0IGJhY2sgdG8gc2Vzc2lvblxuICAgIGF3YWl0IHRoaXMucGVyc2lzdENvbnRleHQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgdHJpbUNvbnRleHQoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCkge1xuICAgIHdoaWxlIChjb250ZXh0LnRvdGFsVG9rZW5zID4gY29udGV4dC5tYXhDb250ZXh0TGVuZ3RoICYmIGNvbnRleHQucmVjZW50TWVzc2FnZXMubGVuZ3RoID4gMikge1xuICAgICAgLy8gUmVtb3ZlIG9sZGVzdCBtZXNzYWdlcywgYnV0IGtlZXAgYXQgbGVhc3QgMlxuICAgICAgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5zaGlmdCgpO1xuICAgICAgY29udGV4dC50b3RhbFRva2VucyA9IHRoaXMuY2FsY3VsYXRlVG9rZW5zKGNvbnRleHQpO1xuICAgIH1cbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgY2FsY3VsYXRlVG9rZW5zKGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpOiBudW1iZXIge1xuICAgIC8vIFJvdWdoIGVzdGltYXRpb246IDEgdG9rZW4g4omIIDQgY2hhcmFjdGVyc1xuICAgIGxldCB0b3RhbENoYXJzID0gMDtcbiAgICBcbiAgICAvLyBDb3VudCBtZXNzYWdlIGNvbnRlbnRcbiAgICB0b3RhbENoYXJzICs9IGNvbnRleHQucmVjZW50TWVzc2FnZXNcbiAgICAgIC5tYXAobXNnID0+IG1zZy5jb250ZW50KVxuICAgICAgLmpvaW4oJyAnKS5sZW5ndGg7XG4gICAgXG4gICAgLy8gQ291bnQgbWV0YWRhdGFcbiAgICBpZiAoY29udGV4dC5wYXRpZW50Q29udGV4dCkge1xuICAgICAgdG90YWxDaGFycyArPSBjb250ZXh0LnBhdGllbnRDb250ZXh0Lmxlbmd0aCArIDIwOyAvLyBJbmNsdWRlIGxhYmVsXG4gICAgfVxuICAgIFxuICAgIGlmIChjb250ZXh0LmRvY3VtZW50Q29udGV4dCkge1xuICAgICAgdG90YWxDaGFycyArPSBjb250ZXh0LmRvY3VtZW50Q29udGV4dC5qb2luKCcgJykubGVuZ3RoICsgMzA7XG4gICAgfVxuICAgIFxuICAgIGlmIChjb250ZXh0Lm1lZGljYWxFbnRpdGllcykge1xuICAgICAgdG90YWxDaGFycyArPSBjb250ZXh0Lm1lZGljYWxFbnRpdGllc1xuICAgICAgICAubWFwKGUgPT4gYCR7ZS50ZXh0fSAoJHtlLmxhYmVsfSlgKVxuICAgICAgICAuam9pbignLCAnKS5sZW5ndGg7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBNYXRoLmNlaWwodG90YWxDaGFycyAvIDQpO1xuICB9XG4gIFxuICBzdGF0aWMgYnVpbGRDb250ZXh0UHJvbXB0KGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpOiBzdHJpbmcge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIFxuICAgIC8vIEFkZCBwYXRpZW50IGNvbnRleHRcbiAgICBpZiAoY29udGV4dC5wYXRpZW50Q29udGV4dCkge1xuICAgICAgcGFydHMucHVzaChgQ3VycmVudCBQYXRpZW50OiAke2NvbnRleHQucGF0aWVudENvbnRleHR9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBkb2N1bWVudCBjb250ZXh0XG4gICAgaWYgKGNvbnRleHQuZG9jdW1lbnRDb250ZXh0ICYmIGNvbnRleHQuZG9jdW1lbnRDb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgIHBhcnRzLnB1c2goYFJlbGF0ZWQgRG9jdW1lbnRzOiAke2NvbnRleHQuZG9jdW1lbnRDb250ZXh0LnNsaWNlKDAsIDUpLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBtZWRpY2FsIGVudGl0aWVzIHN1bW1hcnlcbiAgICBpZiAoY29udGV4dC5tZWRpY2FsRW50aXRpZXMgJiYgY29udGV4dC5tZWRpY2FsRW50aXRpZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgZW50aXR5U3VtbWFyeSA9IHRoaXMuc3VtbWFyaXplTWVkaWNhbEVudGl0aWVzKGNvbnRleHQubWVkaWNhbEVudGl0aWVzKTtcbiAgICAgIHBhcnRzLnB1c2goYE1lZGljYWwgQ29udGV4dDogJHtlbnRpdHlTdW1tYXJ5fWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgY29udmVyc2F0aW9uIGhpc3RvcnlcbiAgICBpZiAoY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjb252ZXJzYXRpb24gPSBjb250ZXh0LnJlY2VudE1lc3NhZ2VzXG4gICAgICAgIC5tYXAobXNnID0+IGAke21zZy5yb2xlID09PSAndXNlcicgPyAnVXNlcicgOiAnQXNzaXN0YW50J306ICR7bXNnLmNvbnRlbnR9YClcbiAgICAgICAgLmpvaW4oJ1xcbicpO1xuICAgICAgXG4gICAgICBwYXJ0cy5wdXNoKGBSZWNlbnQgQ29udmVyc2F0aW9uOlxcbiR7Y29udmVyc2F0aW9ufWApO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gcGFydHMuam9pbignXFxuXFxuJyk7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIHN1bW1hcml6ZU1lZGljYWxFbnRpdGllcyhlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+KTogc3RyaW5nIHtcbiAgICBjb25zdCBncm91cGVkID0gZW50aXRpZXMucmVkdWNlKChhY2MsIGVudGl0eSkgPT4ge1xuICAgICAgaWYgKCFhY2NbZW50aXR5LmxhYmVsXSkge1xuICAgICAgICBhY2NbZW50aXR5LmxhYmVsXSA9IFtdO1xuICAgICAgfVxuICAgICAgYWNjW2VudGl0eS5sYWJlbF0ucHVzaChlbnRpdHkudGV4dCk7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPik7XG4gICAgXG4gICAgY29uc3Qgc3VtbWFyeSA9IE9iamVjdC5lbnRyaWVzKGdyb3VwZWQpXG4gICAgICAubWFwKChbbGFiZWwsIHRleHRzXSkgPT4ge1xuICAgICAgICBjb25zdCB1bmlxdWUgPSBbLi4ubmV3IFNldCh0ZXh0cyldLnNsaWNlKDAsIDUpO1xuICAgICAgICByZXR1cm4gYCR7bGFiZWx9OiAke3VuaXF1ZS5qb2luKCcsICcpfWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJzsgJyk7XG4gICAgXG4gICAgcmV0dXJuIHN1bW1hcnk7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGV4dHJhY3RNZWRpY2FsRW50aXRpZXMobWVzc2FnZXM6IE1lc3NhZ2VbXSk6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiB7XG4gICAgY29uc3QgZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiA9IFtdO1xuICAgIFxuICAgIC8vIFNpbXBsZSBleHRyYWN0aW9uIC0gbG9vayBmb3IgcGF0dGVybnNcbiAgICBjb25zdCBwYXR0ZXJucyA9IHtcbiAgICAgIE1FRElDQVRJT046IC9cXGIobWVkaWNhdGlvbnxtZWRpY2luZXxkcnVnfHByZXNjcmlwdGlvbik6XFxzKihbXiwuXSspL2dpLFxuICAgICAgQ09ORElUSU9OOiAvXFxiKGRpYWdub3Npc3xjb25kaXRpb258ZGlzZWFzZSk6XFxzKihbXiwuXSspL2dpLFxuICAgICAgU1lNUFRPTTogL1xcYihzeW1wdG9tfGNvbXBsYWluKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgfTtcbiAgICBcbiAgICBtZXNzYWdlcy5mb3JFYWNoKG1zZyA9PiB7XG4gICAgICBPYmplY3QuZW50cmllcyhwYXR0ZXJucykuZm9yRWFjaCgoW2xhYmVsLCBwYXR0ZXJuXSkgPT4ge1xuICAgICAgICBsZXQgbWF0Y2g7XG4gICAgICAgIHdoaWxlICgobWF0Y2ggPSBwYXR0ZXJuLmV4ZWMobXNnLmNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgICAgIGVudGl0aWVzLnB1c2goe1xuICAgICAgICAgICAgdGV4dDogbWF0Y2hbMl0udHJpbSgpLFxuICAgICAgICAgICAgbGFiZWxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIGVudGl0aWVzO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBleHRyYWN0RW50aXRpZXNGcm9tTWVzc2FnZShjb250ZW50OiBzdHJpbmcpOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4ge1xuICAgIGNvbnN0IGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4gPSBbXTtcbiAgICBcbiAgICAvLyBMb29rIGZvciBtZWRpY2FsIHRlcm1zIGluIHRoZSByZXNwb25zZVxuICAgIGNvbnN0IG1lZGljYWxUZXJtcyA9IHtcbiAgICAgIE1FRElDQVRJT046IFsnbWVkaWNhdGlvbicsICdwcmVzY3JpYmVkJywgJ2Rvc2FnZScsICdtZycsICd0YWJsZXRzJ10sXG4gICAgICBDT05ESVRJT046IFsnZGlhZ25vc2lzJywgJ2NvbmRpdGlvbicsICdzeW5kcm9tZScsICdkaXNlYXNlJ10sXG4gICAgICBQUk9DRURVUkU6IFsnc3VyZ2VyeScsICdwcm9jZWR1cmUnLCAndGVzdCcsICdleGFtaW5hdGlvbiddLFxuICAgICAgU1lNUFRPTTogWydwYWluJywgJ2ZldmVyJywgJ25hdXNlYScsICdmYXRpZ3VlJ11cbiAgICB9O1xuICAgIFxuICAgIE9iamVjdC5lbnRyaWVzKG1lZGljYWxUZXJtcykuZm9yRWFjaCgoW2xhYmVsLCB0ZXJtc10pID0+IHtcbiAgICAgIHRlcm1zLmZvckVhY2godGVybSA9PiB7XG4gICAgICAgIGlmIChjb250ZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGVybSkpIHtcbiAgICAgICAgICAvLyBFeHRyYWN0IHRoZSBzZW50ZW5jZSBjb250YWluaW5nIHRoZSB0ZXJtXG4gICAgICAgICAgY29uc3Qgc2VudGVuY2VzID0gY29udGVudC5zcGxpdCgvWy4hP10vKTtcbiAgICAgICAgICBzZW50ZW5jZXMuZm9yRWFjaChzZW50ZW5jZSA9PiB7XG4gICAgICAgICAgICBpZiAoc2VudGVuY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgICAgICBjb25zdCBleHRyYWN0ZWQgPSBzZW50ZW5jZS50cmltKCkuc3Vic3RyaW5nKDAsIDEwMCk7XG4gICAgICAgICAgICAgIGlmIChleHRyYWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBlbnRpdGllcy5wdXNoKHsgdGV4dDogZXh0cmFjdGVkLCBsYWJlbCB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gZW50aXRpZXM7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIHBlcnNpc3RDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nLCBjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KSB7XG4gICAgLy8gVXBkYXRlIHNlc3Npb24gd2l0aCBsYXRlc3QgY29udGV4dCBtZXRhZGF0YVxuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICRzZXQ6IHtcbiAgICAgICAgJ21ldGFkYXRhLnBhdGllbnRJZCc6IGNvbnRleHQucGF0aWVudENvbnRleHQsXG4gICAgICAgICdtZXRhZGF0YS5kb2N1bWVudElkcyc6IGNvbnRleHQuZG9jdW1lbnRDb250ZXh0LFxuICAgICAgICAnbWV0YWRhdGEubGFzdEVudGl0aWVzJzogY29udGV4dC5tZWRpY2FsRW50aXRpZXM/LnNsaWNlKC0xMCksXG4gICAgICAgIGxhc3RNZXNzYWdlOiBjb250ZXh0LnJlY2VudE1lc3NhZ2VzW2NvbnRleHQucmVjZW50TWVzc2FnZXMubGVuZ3RoIC0gMV0/LmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgIG1lc3NhZ2VDb3VudDogYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHsgc2Vzc2lvbklkIH0pLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICBcbiAgc3RhdGljIGNsZWFyQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIHRoaXMuY29udGV4dHMuZGVsZXRlKHNlc3Npb25JZCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBjbGVhckFsbENvbnRleHRzKCkge1xuICAgIHRoaXMuY29udGV4dHMuY2xlYXIoKTtcbiAgfVxuICBcbiAgc3RhdGljIGdldENvbnRleHRTdGF0cyhzZXNzaW9uSWQ6IHN0cmluZyk6IHsgc2l6ZTogbnVtYmVyOyBtZXNzYWdlczogbnVtYmVyOyB0b2tlbnM6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgY29uc3QgY29udGV4dCA9IHRoaXMuY29udGV4dHMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFjb250ZXh0KSByZXR1cm4gbnVsbDtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2l6ZTogdGhpcy5jb250ZXh0cy5zaXplLFxuICAgICAgbWVzc2FnZXM6IGNvbnRleHQucmVjZW50TWVzc2FnZXMubGVuZ3RoLFxuICAgICAgdG9rZW5zOiBjb250ZXh0LnRvdGFsVG9rZW5zXG4gICAgfTtcbiAgfVxufSIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuXG5pbnRlcmZhY2UgTUNQUmVxdWVzdCB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGFyYW1zOiBhbnk7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmludGVyZmFjZSBNQ1BSZXNwb25zZSB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICByZXN1bHQ/OiBhbnk7XG4gIGVycm9yPzoge1xuICAgIGNvZGU6IG51bWJlcjtcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gIH07XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIHtcbiAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gIHByaXZhdGUgc2Vzc2lvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgcmVxdWVzdElkID0gMTtcblxuICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcgPSAnaHR0cDovL2xvY2FsaG9zdDozMDAyJykge1xuICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gIH1cblxuICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgbmFtZTogJ21ldGVvci1haWRib3gtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygnIEFpZGJveCBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG5cbiAgICAgIC8vIFNlbmQgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uXG4gICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ2luaXRpYWxpemVkJywge30pO1xuXG4gICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgIGNvbnNvbGUubG9nKGBBaWRib3ggTUNQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICBjb25zb2xlLmxvZygnIEF2YWlsYWJsZSBBaWRib3ggdG9vbHM6Jyk7XG4gICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIEZhaWxlZCB0byBjb25uZWN0IHRvIEFpZGJveCBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmVcbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgU2VuZGluZyByZXF1ZXN0IHRvIEFpZGJveDogJHttZXRob2R9YCwgeyBpZCwgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3QpLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwMDApIC8vIDMwIHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgLy8gRXh0cmFjdCBzZXNzaW9uIElEIGZyb20gcmVzcG9uc2UgaGVhZGVycyBpZiBwcmVzZW50XG4gICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICBjb25zb2xlLmxvZygnIFJlY2VpdmVkIEFpZGJveCBzZXNzaW9uIElEOicsIHRoaXMuc2Vzc2lvbklkKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0uIFJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFpZGJveCBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgQWlkYm94IHJlcXVlc3QgJHttZXRob2R9IHN1Y2Nlc3NmdWxgKTtcbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcihgIEFpZGJveCByZXF1ZXN0IGZhaWxlZCBmb3IgbWV0aG9kICR7bWV0aG9kfTpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXNcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG5vdGlmaWNhdGlvbiksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsaXN0VG9vbHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvY2FsbCcsIHtcbiAgICAgIG5hbWUsXG4gICAgICBhcmd1bWVudHM6IGFyZ3NcbiAgICB9KTtcbiAgfVxuXG4gIGRpc2Nvbm5lY3QoKSB7XG4gICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIGNvbnNvbGUubG9nKCcgRGlzY29ubmVjdGVkIGZyb20gQWlkYm94IE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBBaWRib3ggRkhJUiBvcGVyYXRpb25zXG5leHBvcnQgaW50ZXJmYWNlIEFpZGJveEZISVJPcGVyYXRpb25zIHtcbiAgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZVBhdGllbnQocGF0aWVudERhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgdXBkYXRlUGF0aWVudChwYXRpZW50SWQ6IHN0cmluZywgdXBkYXRlczogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdChtZWRpY2F0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZUVuY291bnRlcihlbmNvdW50ZXJEYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBaWRib3hPcGVyYXRpb25zKGNvbm5lY3Rpb246IEFpZGJveFNlcnZlckNvbm5lY3Rpb24pOiBBaWRib3hGSElST3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94U2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50RGV0YWlscycsIHsgcGF0aWVudElkIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVQYXRpZW50KHBhdGllbnREYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZVBhdGllbnQnLCBwYXRpZW50RGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVBhdGllbnQocGF0aWVudElkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94VXBkYXRlUGF0aWVudCcsIHsgcGF0aWVudElkLCAuLi51cGRhdGVzIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudE9ic2VydmF0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlT2JzZXJ2YXRpb24nLCBvYnNlcnZhdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QobWVkaWNhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLCBtZWRpY2F0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlQ29uZGl0aW9uJywgY29uZGl0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlRW5jb3VudGVyKGVuY291bnRlckRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlRW5jb3VudGVyJywgZW5jb3VudGVyRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfVxuICB9O1xufSIsImludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAgICBqc29ucnBjOiAnMi4wJztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBwYXJhbXM6IGFueTtcbiAgICBpZDogc3RyaW5nIHwgbnVtYmVyO1xuICB9XG4gIFxuICBpbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICAgIGpzb25ycGM6ICcyLjAnO1xuICAgIHJlc3VsdD86IGFueTtcbiAgICBlcnJvcj86IHtcbiAgICAgIGNvZGU6IG51bWJlcjtcbiAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICB9O1xuICAgIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIH1cbiAgXG4gIGV4cG9ydCBjbGFzcyBFcGljU2VydmVyQ29ubmVjdGlvbiB7XG4gICAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgcmVxdWVzdElkID0gMTtcbiAgXG4gICAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMycpIHtcbiAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gICAgfVxuICBcbiAgICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgICBcbiAgICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfTogJHtoZWFsdGhDaGVjay5lcnJvcn1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgICAgbmFtZTogJ21ldGVvci1lcGljLWNsaWVudCcsXG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKCcgRXBpYyBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG4gIFxuICAgICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ2luaXRpYWxpemVkJywge30pO1xuICBcbiAgICAgICAgLy8gVGVzdCBieSBsaXN0aW5nIHRvb2xzXG4gICAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgICAgY29uc29sZS5sb2coYCBFcGljIE1DUCBDb25uZWN0aW9uIHN1Y2Nlc3NmdWwhIEZvdW5kICR7dG9vbHNSZXN1bHQudG9vbHM/Lmxlbmd0aCB8fCAwfSB0b29sc2ApO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJyBBdmFpbGFibGUgRXBpYyB0b29sczonKTtcbiAgICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGNvbm5lY3QgdG8gRXBpYyBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrU2VydmVySGVhbHRoKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRXBpYyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXJhbXMsXG4gICAgICAgIGlkXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9O1xuICBcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgcmVxdWVzdCB0byBFcGljIE1DUDogJHttZXRob2R9YCwgeyBpZCwgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9KTtcbiAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwMDApIC8vIDMwIHNlY29uZCB0aW1lb3V0XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgY29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbWNwLXNlc3Npb24taWQnKTtcbiAgICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgICAgY29uc29sZS5sb2coJyBSZWNlaXZlZCBFcGljIHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgICB9XG4gIFxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0uIFJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgXG4gICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEVwaWMgTUNQIGVycm9yICR7cmVzdWx0LmVycm9yLmNvZGV9OiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhgIEVwaWMgcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYCBFcGljIHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBwcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICBjb25zdCBub3RpZmljYXRpb24gPSB7XG4gICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIHBhcmFtc1xuICAgICAgfTtcbiAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH07XG4gIFxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBFcGljIG5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIGFzeW5jIGxpc3RUb29scygpOiBQcm9taXNlPGFueT4ge1xuICAgICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgICB9XG4gIFxuICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgfVxuICBcbiAgICBhc3luYyBjYWxsVG9vbChuYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvY2FsbCcsIHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgYXJndW1lbnRzOiBhcmdzXG4gICAgICB9KTtcbiAgICB9XG4gIFxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICB0aGlzLnNlc3Npb25JZCA9IG51bGw7XG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAgIGNvbnNvbGUubG9nKCcgRGlzY29ubmVjdGVkIGZyb20gRXBpYyBNQ1AgU2VydmVyJyk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFcGljIEZISVIgb3BlcmF0aW9ucyBpbnRlcmZhY2VcbiAgZXhwb3J0IGludGVyZmFjZSBFcGljRkhJUk9wZXJhdGlvbnMge1xuICAgIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFcGljT3BlcmF0aW9ucyhjb25uZWN0aW9uOiBFcGljU2VydmVyQ29ubmVjdGlvbik6IEVwaWNGSElST3BlcmF0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudERldGFpbHMnLCB7IHBhdGllbnRJZCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfVxuICAgIH07XG4gIH0iLCJpbXBvcnQgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB7IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uLCBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zLCBjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyB9IGZyb20gJy4vbWVkaWNhbFNlcnZlckNvbm5lY3Rpb24nO1xuaW1wb3J0IHsgQWlkYm94U2VydmVyQ29ubmVjdGlvbiwgQWlkYm94RkhJUk9wZXJhdGlvbnMsIGNyZWF0ZUFpZGJveE9wZXJhdGlvbnMgfSBmcm9tICcuL2FpZGJveFNlcnZlckNvbm5lY3Rpb24nO1xuaW1wb3J0IHsgRXBpY1NlcnZlckNvbm5lY3Rpb24sIEVwaWNGSElST3BlcmF0aW9ucywgY3JlYXRlRXBpY09wZXJhdGlvbnMgfSBmcm9tICcuL2VwaWNTZXJ2ZXJDb25uZWN0aW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBNQ1BDbGllbnRDb25maWcge1xuICBwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJztcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG96d2VsbEVuZHBvaW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTUNQQ2xpZW50TWFuYWdlciB7XG4gIHByaXZhdGUgYW50aHJvcGljPzogQW50aHJvcGljO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBjb25maWc/OiBNQ1BDbGllbnRDb25maWc7XG4gIFxuICAvLyBNZWRpY2FsIE1DUCBjb25uZWN0aW9uIChTdHJlYW1hYmxlIEhUVFApXG4gIHByaXZhdGUgbWVkaWNhbENvbm5lY3Rpb24/OiBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBtZWRpY2FsT3BlcmF0aW9ucz86IE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnM7XG4gIHByaXZhdGUgYXZhaWxhYmxlVG9vbHM6IGFueVtdID0gW107XG5cbiAgLy8gQWlkYm94IE1DUCBjb25uZWN0aW9uXG4gIHByaXZhdGUgYWlkYm94Q29ubmVjdGlvbj86IEFpZGJveFNlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgYWlkYm94T3BlcmF0aW9ucz86IEFpZGJveEZISVJPcGVyYXRpb25zO1xuICBwcml2YXRlIGFpZGJveFRvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIC8vIEVwaWMgTUNQIGNvbm5lY3Rpb25cbiAgcHJpdmF0ZSBlcGljQ29ubmVjdGlvbj86IEVwaWNTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIGVwaWNPcGVyYXRpb25zPzogRXBpY0ZISVJPcGVyYXRpb25zO1xuICBwcml2YXRlIGVwaWNUb29sczogYW55W10gPSBbXTtcblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkge31cblxuICBwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IE1DUENsaWVudE1hbmFnZXIge1xuICAgIGlmICghTUNQQ2xpZW50TWFuYWdlci5pbnN0YW5jZSkge1xuICAgICAgTUNQQ2xpZW50TWFuYWdlci5pbnN0YW5jZSA9IG5ldyBNQ1BDbGllbnRNYW5hZ2VyKCk7XG4gICAgfVxuICAgIHJldHVybiBNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGluaXRpYWxpemUoY29uZmlnOiBNQ1BDbGllbnRDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZygnIEluaXRpYWxpemluZyBNQ1AgQ2xpZW50IHdpdGggSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24nKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIHRyeSB7XG4gICAgICBpZiAoY29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJykge1xuICAgICAgICBjb25zb2xlLmxvZygnQ3JlYXRpbmcgQW50aHJvcGljIGNsaWVudCB3aXRoIG5hdGl2ZSB0b29sIGNhbGxpbmcgc3VwcG9ydC4uLicpO1xuICAgICAgICB0aGlzLmFudGhyb3BpYyA9IG5ldyBBbnRocm9waWMoe1xuICAgICAgICAgIGFwaUtleTogY29uZmlnLmFwaUtleSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQW50aHJvcGljIGNsaWVudCBpbml0aWFsaXplZCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmxvZyhgTUNQIENsaWVudCByZWFkeSB3aXRoIHByb3ZpZGVyOiAke2NvbmZpZy5wcm92aWRlcn1gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIEZhaWxlZCB0byBpbml0aWFsaXplIE1DUCBjbGllbnQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLy8gQ29ubmVjdCB0byBtZWRpY2FsIE1DUCBzZXJ2ZXIgYW5kIGdldCBhbGwgYXZhaWxhYmxlIHRvb2xzXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9NZWRpY2FsU2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgICAgY29uc3QgbWNwU2VydmVyVXJsID0gc2V0dGluZ3M/Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMSc7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgYXQ6ICR7bWNwU2VydmVyVXJsfWApO1xuICAgICAgXG4gICAgICB0aGlzLm1lZGljYWxDb25uZWN0aW9uID0gbmV3IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKG1jcFNlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMubWVkaWNhbE9wZXJhdGlvbnMgPSBjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyh0aGlzLm1lZGljYWxDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IGFsbCBhdmFpbGFibGUgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0b29sc1Jlc3VsdC50b29scyB8fCBbXTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0ZWQgd2l0aCAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSBtZWRpY2FsIHRvb2xzIGF2YWlsYWJsZWApO1xuICAgICAgY29uc29sZS5sb2coYCBNZWRpY2FsIHRvb2wgbmFtZXM6ICR7dGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIE1lZGljYWwgTUNQIFNlcnZlciBIVFRQIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9BaWRib3hTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBhaWRib3hTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDInO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgYXQ6ICR7YWlkYm94U2VydmVyVXJsfWApO1xuICAgICAgXG4gICAgICB0aGlzLmFpZGJveENvbm5lY3Rpb24gPSBuZXcgQWlkYm94U2VydmVyQ29ubmVjdGlvbihhaWRib3hTZXJ2ZXJVcmwpO1xuICAgICAgYXdhaXQgdGhpcy5haWRib3hDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMuYWlkYm94T3BlcmF0aW9ucyA9IGNyZWF0ZUFpZGJveE9wZXJhdGlvbnModGhpcy5haWRib3hDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IEFpZGJveCB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLmFpZGJveENvbm5lY3Rpb24ubGlzdFRvb2xzKCk7XG4gICAgICB0aGlzLmFpZGJveFRvb2xzID0gdG9vbHNSZXN1bHQudG9vbHMgfHwgW107XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGVkIHRvIEFpZGJveCB3aXRoICR7dGhpcy5haWRib3hUb29scy5sZW5ndGh9IHRvb2xzIGF2YWlsYWJsZWApO1xuICAgICAgY29uc29sZS5sb2coYCBBaWRib3ggdG9vbCBuYW1lczogJHt0aGlzLmFpZGJveFRvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICAgIFxuICAgICAgLy8gTWVyZ2Ugd2l0aCBleGlzdGluZyB0b29scywgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gdGhpcy5tZXJnZVRvb2xzVW5pcXVlKHRoaXMuYXZhaWxhYmxlVG9vbHMsIHRoaXMuYWlkYm94VG9vbHMpO1xuICAgICAgXG4gICAgICB0aGlzLmxvZ0F2YWlsYWJsZVRvb2xzKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIEFpZGJveCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9FcGljU2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgICAgY29uc3QgZXBpY1NlcnZlclVybCA9IHNldHRpbmdzPy5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDMnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGF0OiAke2VwaWNTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMuZXBpY0Nvbm5lY3Rpb24gPSBuZXcgRXBpY1NlcnZlckNvbm5lY3Rpb24oZXBpY1NlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMuZXBpY09wZXJhdGlvbnMgPSBjcmVhdGVFcGljT3BlcmF0aW9ucyh0aGlzLmVwaWNDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IEVwaWMgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuZXBpY1Rvb2xzID0gdG9vbHNSZXN1bHQudG9vbHMgfHwgW107XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGVkIHRvIEVwaWMgd2l0aCAke3RoaXMuZXBpY1Rvb2xzLmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhgIEVwaWMgdG9vbCBuYW1lczogJHt0aGlzLmVwaWNUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgICBcbiAgICAgIC8vIE1lcmdlIHdpdGggZXhpc3RpbmcgdG9vbHMsIGVuc3VyaW5nIHVuaXF1ZSBuYW1lc1xuICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRoaXMubWVyZ2VUb29sc1VuaXF1ZSh0aGlzLmF2YWlsYWJsZVRvb2xzLCB0aGlzLmVwaWNUb29scyk7XG4gICAgICBcbiAgICAgIHRoaXMubG9nQXZhaWxhYmxlVG9vbHMoKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRXBpYyBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lcmdlIHRvb2xzIGVuc3VyaW5nIHVuaXF1ZSBuYW1lc1xuICBwcml2YXRlIG1lcmdlVG9vbHNVbmlxdWUoZXhpc3RpbmdUb29sczogYW55W10sIG5ld1Rvb2xzOiBhbnlbXSk6IGFueVtdIHtcbiAgICBjb25zb2xlLmxvZyhg8J+UpyBNZXJnaW5nIHRvb2xzOiAke2V4aXN0aW5nVG9vbHMubGVuZ3RofSBleGlzdGluZyArICR7bmV3VG9vbHMubGVuZ3RofSBuZXdgKTtcbiAgICBcbiAgICBjb25zdCB0b29sTmFtZVNldCA9IG5ldyBTZXQoZXhpc3RpbmdUb29scy5tYXAodG9vbCA9PiB0b29sLm5hbWUpKTtcbiAgICBjb25zdCB1bmlxdWVOZXdUb29scyA9IG5ld1Rvb2xzLmZpbHRlcih0b29sID0+IHtcbiAgICAgIGlmICh0b29sTmFtZVNldC5oYXModG9vbC5uYW1lKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oYCBEdXBsaWNhdGUgdG9vbCBuYW1lIGZvdW5kOiAke3Rvb2wubmFtZX0gLSBza2lwcGluZyBkdXBsaWNhdGVgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgdG9vbE5hbWVTZXQuYWRkKHRvb2wubmFtZSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCBtZXJnZWRUb29scyA9IFsuLi5leGlzdGluZ1Rvb2xzLCAuLi51bmlxdWVOZXdUb29sc107XG4gICAgY29uc29sZS5sb2coYCBNZXJnZWQgdG9vbHM6ICR7ZXhpc3RpbmdUb29scy5sZW5ndGh9IGV4aXN0aW5nICsgJHt1bmlxdWVOZXdUb29scy5sZW5ndGh9IG5ldyA9ICR7bWVyZ2VkVG9vbHMubGVuZ3RofSB0b3RhbGApO1xuICAgIFxuICAgIHJldHVybiBtZXJnZWRUb29scztcbiAgfVxuXG5wcml2YXRlIGxvZ0F2YWlsYWJsZVRvb2xzKCk6IHZvaWQge1xuICBjb25zb2xlLmxvZygnXFxuIEF2YWlsYWJsZSBUb29scyBmb3IgSW50ZWxsaWdlbnQgU2VsZWN0aW9uOicpO1xuICBcbiAgLy8gU2VwYXJhdGUgdG9vbHMgYnkgYWN0dWFsIHNvdXJjZS90eXBlLCBub3QgYnkgcGF0dGVybiBtYXRjaGluZ1xuICBjb25zdCBlcGljVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHQubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKVxuICApO1xuICBcbiAgY29uc3QgYWlkYm94VG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNBaWRib3hGSElSVG9vbCh0KSAmJiAhdC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpXG4gICk7XG4gIFxuICBjb25zdCBkb2N1bWVudFRvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0aGlzLmlzRG9jdW1lbnRUb29sKHQpXG4gICk7XG4gIFxuICBjb25zdCBhbmFseXNpc1Rvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0aGlzLmlzQW5hbHlzaXNUb29sKHQpXG4gICk7XG4gIFxuICBjb25zdCBvdGhlclRvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICAhZXBpY1Rvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFhaWRib3hUb29scy5pbmNsdWRlcyh0KSAmJiBcbiAgICAhZG9jdW1lbnRUb29scy5pbmNsdWRlcyh0KSAmJiBcbiAgICAhYW5hbHlzaXNUb29scy5pbmNsdWRlcyh0KVxuICApO1xuICBcbiAgaWYgKGFpZGJveFRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygnIEFpZGJveCBGSElSIFRvb2xzOicpO1xuICAgIGFpZGJveFRvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChlcGljVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCcgRXBpYyBFSFIgVG9vbHM6Jyk7XG4gICAgZXBpY1Rvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChkb2N1bWVudFRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygnIERvY3VtZW50IFRvb2xzOicpO1xuICAgIGRvY3VtZW50VG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKGFuYWx5c2lzVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCcgU2VhcmNoICYgQW5hbHlzaXMgVG9vbHM6Jyk7XG4gICAgYW5hbHlzaXNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAob3RoZXJUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJyBPdGhlciBUb29sczonKTtcbiAgICBvdGhlclRvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGBcXG4gQ2xhdWRlIHdpbGwgaW50ZWxsaWdlbnRseSBzZWxlY3QgZnJvbSAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSB0b3RhbCB0b29scyBiYXNlZCBvbiB1c2VyIHF1ZXJpZXNgKTtcbiAgXG4gIC8vIERlYnVnOiBDaGVjayBmb3IgZHVwbGljYXRlc1xuICB0aGlzLmRlYnVnVG9vbER1cGxpY2F0ZXMoKTtcbn1cblxuLy8gQWRkIHRoZXNlIGhlbHBlciBtZXRob2RzIHRvIE1DUENsaWVudE1hbmFnZXIgY2xhc3NcbnByaXZhdGUgaXNBaWRib3hGSElSVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYWlkYm94RkhJUlRvb2xOYW1lcyA9IFtcbiAgICAnc2VhcmNoUGF0aWVudHMnLCAnZ2V0UGF0aWVudERldGFpbHMnLCAnY3JlYXRlUGF0aWVudCcsICd1cGRhdGVQYXRpZW50JyxcbiAgICAnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdjcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsICdjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2dldFBhdGllbnRDb25kaXRpb25zJywgJ2NyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgJ2NyZWF0ZUVuY291bnRlcidcbiAgXTtcbiAgXG4gIHJldHVybiBhaWRib3hGSElSVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbnByaXZhdGUgaXNEb2N1bWVudFRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGRvY3VtZW50VG9vbE5hbWVzID0gW1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGRvY3VtZW50VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbnByaXZhdGUgaXNBbmFseXNpc1Rvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFuYWx5c2lzVG9vbE5hbWVzID0gW1xuICAgICdhbmFseXplUGF0aWVudEhpc3RvcnknLCAnZmluZFNpbWlsYXJDYXNlcycsICdnZXRNZWRpY2FsSW5zaWdodHMnLFxuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gYW5hbHlzaXNUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuICAvLyBEZWJ1ZyBtZXRob2QgdG8gaWRlbnRpZnkgZHVwbGljYXRlIHRvb2xzXG4gIHByaXZhdGUgZGVidWdUb29sRHVwbGljYXRlcygpOiB2b2lkIHtcbiAgICBjb25zdCB0b29sTmFtZXMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0ID0+IHQubmFtZSk7XG4gICAgY29uc3QgbmFtZUNvdW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBcbiAgICB0b29sTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIG5hbWVDb3VudC5zZXQobmFtZSwgKG5hbWVDb3VudC5nZXQobmFtZSkgfHwgMCkgKyAxKTtcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCBkdXBsaWNhdGVzID0gQXJyYXkuZnJvbShuYW1lQ291bnQuZW50cmllcygpKVxuICAgICAgLmZpbHRlcigoW25hbWUsIGNvdW50XSkgPT4gY291bnQgPiAxKTtcbiAgICBcbiAgICBpZiAoZHVwbGljYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRFVQTElDQVRFIFRPT0wgTkFNRVMgRk9VTkQ6Jyk7XG4gICAgICBkdXBsaWNhdGVzLmZvckVhY2goKFtuYW1lLCBjb3VudF0pID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgICDigKIgJHtuYW1lfTogYXBwZWFycyAke2NvdW50fSB0aW1lc2ApO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIHRvb2wgbmFtZXMgYXJlIHVuaXF1ZScpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbHRlciB0b29scyBiYXNlZCBvbiB1c2VyJ3Mgc3BlY2lmaWVkIGRhdGEgc291cmNlXG4gIHByaXZhdGUgZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UodG9vbHM6IGFueVtdLCBkYXRhU291cmNlOiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbW9uZ29kYicpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYXRsYXMnKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBNb25nb0RCL0F0bGFzIC0gcmV0dXJuIG9ubHkgZG9jdW1lbnQgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdEb2N1bWVudCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ3NlYXJjaCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ3VwbG9hZCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2V4dHJhY3QnKSB8fCBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdNZWRpY2FsJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdTaW1pbGFyJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdJbnNpZ2h0JykgfHxcbiAgICAgICAgKHRvb2wubmFtZS5pbmNsdWRlcygnc2VhcmNoJykgJiYgIXRvb2wubmFtZS5pbmNsdWRlcygnUGF0aWVudCcpKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWlkYm94JykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgQWlkYm94IC0gcmV0dXJuIG9ubHkgRkhJUiB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICAodG9vbC5uYW1lLmluY2x1ZGVzKCdQYXRpZW50JykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ09ic2VydmF0aW9uJykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ01lZGljYXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnQ29uZGl0aW9uJykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0VuY291bnRlcicpIHx8XG4gICAgICAgICB0b29sLm5hbWUgPT09ICdzZWFyY2hQYXRpZW50cycpICYmXG4gICAgICAgICF0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJylcbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGlmIChkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VocicpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIEVwaWMgLSByZXR1cm4gb25seSBFcGljIHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgIHRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnREZXRhaWxzJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRDb25kaXRpb25zJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50RW5jb3VudGVycycpIHx8XG4gICAgICAgICh0b29sLm5hbWUgPT09ICdzZWFyY2hQYXRpZW50cycgJiYgdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgLy8gTm8gc3BlY2lmaWMgcHJlZmVyZW5jZSwgcmV0dXJuIGFsbCB0b29sc1xuICAgIHJldHVybiB0b29scztcbiAgfVxuXG4gIC8vIEFuYWx5emUgcXVlcnkgdG8gdW5kZXJzdGFuZCB1c2VyJ3MgaW50ZW50IGFib3V0IGRhdGEgc291cmNlc1xuICBwcml2YXRlIGFuYWx5emVRdWVyeUludGVudChxdWVyeTogc3RyaW5nKTogeyBkYXRhU291cmNlPzogc3RyaW5nOyBpbnRlbnQ/OiBzdHJpbmcgfSB7XG4gICAgY29uc3QgbG93ZXJRdWVyeSA9IHF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIGV4cGxpY2l0IGRhdGEgc291cmNlIG1lbnRpb25zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2VwaWMnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdlaHInKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ0VwaWMgRUhSJyxcbiAgICAgICAgaW50ZW50OiAnU2VhcmNoIEVwaWMgRUhSIHBhdGllbnQgZGF0YSdcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdtb25nb2RiJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnYXRsYXMnKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ01vbmdvREIgQXRsYXMnLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggdXBsb2FkZWQgZG9jdW1lbnRzIGFuZCBtZWRpY2FsIHJlY29yZHMnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnYWlkYm94JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnQWlkYm94IEZISVInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggc3RydWN0dXJlZCBwYXRpZW50IGRhdGEnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZG9jdW1lbnQtcmVsYXRlZCB0ZXJtc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdkb2N1bWVudCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ3VwbG9hZCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2ZpbGUnKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ01vbmdvREIgQXRsYXMgKGRvY3VtZW50cyknLFxuICAgICAgICBpbnRlbnQ6ICdXb3JrIHdpdGggdXBsb2FkZWQgbWVkaWNhbCBkb2N1bWVudHMnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBmb3IgcGF0aWVudCBzZWFyY2ggcGF0dGVybnNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnc2VhcmNoIGZvciBwYXRpZW50JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmluZCBwYXRpZW50JykpIHtcbiAgICAgIC8vIERlZmF1bHQgdG8gRXBpYyBmb3IgcGF0aWVudCBzZWFyY2hlcyB1bmxlc3Mgc3BlY2lmaWVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnRXBpYyBFSFInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggZm9yIHBhdGllbnQgaW5mb3JtYXRpb24nXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4ge307XG4gIH1cblxuICAvLyBDb252ZXJ0IHRvb2xzIHRvIEFudGhyb3BpYyBmb3JtYXQgd2l0aCBzdHJpY3QgZGVkdXBsaWNhdGlvblxuICBwcml2YXRlIGdldEFudGhyb3BpY1Rvb2xzKCk6IGFueVtdIHtcbiAgICAvLyBVc2UgTWFwIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGJ5IHRvb2wgbmFtZVxuICAgIGNvbnN0IHVuaXF1ZVRvb2xzID0gbmV3IE1hcDxzdHJpbmcsIGFueT4oKTtcbiAgICBcbiAgICB0aGlzLmF2YWlsYWJsZVRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgICBpZiAoIXVuaXF1ZVRvb2xzLmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIHVuaXF1ZVRvb2xzLnNldCh0b29sLm5hbWUsIHtcbiAgICAgICAgICBuYW1lOiB0b29sLm5hbWUsXG4gICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG4gICAgICAgICAgaW5wdXRfc2NoZW1hOiB7XG4gICAgICAgICAgICB0eXBlOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgcHJvcGVydGllczogdG9vbC5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyB8fCB7fSxcbiAgICAgICAgICAgIHJlcXVpcmVkOiB0b29sLmlucHV0U2NoZW1hPy5yZXF1aXJlZCB8fCBbXVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYCBTa2lwcGluZyBkdXBsaWNhdGUgdG9vbCBpbiBBbnRocm9waWMgZm9ybWF0OiAke3Rvb2wubmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCB0b29sc0FycmF5ID0gQXJyYXkuZnJvbSh1bmlxdWVUb29scy52YWx1ZXMoKSk7XG4gICAgY29uc29sZS5sb2coYCBQcmVwYXJlZCAke3Rvb2xzQXJyYXkubGVuZ3RofSB1bmlxdWUgdG9vbHMgZm9yIEFudGhyb3BpYyAoZnJvbSAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSB0b3RhbClgKTtcbiAgICBcbiAgICByZXR1cm4gdG9vbHNBcnJheTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIHRvb2xzIGJlZm9yZSBzZW5kaW5nIHRvIEFudGhyb3BpYyAoYWRkaXRpb25hbCBzYWZldHkgY2hlY2spXG4gIHByaXZhdGUgdmFsaWRhdGVUb29sc0ZvckFudGhyb3BpYygpOiBhbnlbXSB7XG4gICAgY29uc3QgdG9vbHMgPSB0aGlzLmdldEFudGhyb3BpY1Rvb2xzKCk7XG4gICAgXG4gICAgLy8gRmluYWwgY2hlY2sgZm9yIGR1cGxpY2F0ZXNcbiAgICBjb25zdCBuYW1lU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgdmFsaWRUb29sczogYW55W10gPSBbXTtcbiAgICBcbiAgICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgICAgaWYgKCFuYW1lU2V0Lmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIG5hbWVTZXQuYWRkKHRvb2wubmFtZSk7XG4gICAgICAgIHZhbGlkVG9vbHMucHVzaCh0b29sKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYCBDUklUSUNBTDogRHVwbGljYXRlIHRvb2wgZm91bmQgaW4gZmluYWwgdmFsaWRhdGlvbjogJHt0b29sLm5hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgaWYgKHZhbGlkVG9vbHMubGVuZ3RoICE9PSB0b29scy5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg8J+nuSBSZW1vdmVkICR7dG9vbHMubGVuZ3RoIC0gdmFsaWRUb29scy5sZW5ndGh9IGR1cGxpY2F0ZSB0b29scyBpbiBmaW5hbCB2YWxpZGF0aW9uYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGAgRmluYWwgdmFsaWRhdGlvbjogJHt2YWxpZFRvb2xzLmxlbmd0aH0gdW5pcXVlIHRvb2xzIHJlYWR5IGZvciBBbnRocm9waWNgKTtcbiAgICByZXR1cm4gdmFsaWRUb29scztcbiAgfVxuXG5cbnB1YmxpYyBhc3luYyBjYWxsTUNQVG9vbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICBjb25zb2xlLmxvZyhg8J+UpyBSb3V0aW5nIHRvb2w6ICR7dG9vbE5hbWV9IHdpdGggYXJnczpgLCBKU09OLnN0cmluZ2lmeShhcmdzLCBudWxsLCAyKSk7XG4gIFxuICAvLyBFcGljIHRvb2xzIC0gTVVTVCBnbyB0byBFcGljIE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMylcbiAgY29uc3QgZXBpY1Rvb2xOYW1lcyA9IFtcbiAgICAnZXBpY1NlYXJjaFBhdGllbnRzJywgXG4gICAgJ2VwaWNHZXRQYXRpZW50RGV0YWlscycsXG4gICAgJ2VwaWNHZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgXG4gICAgJ2VwaWNHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRDb25kaXRpb25zJywgXG4gICAgJ2VwaWNHZXRQYXRpZW50RW5jb3VudGVycydcbiAgXTtcblxuICBpZiAoZXBpY1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBFcGljIHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGAgUm91dGluZyAke3Rvb2xOYW1lfSB0byBFcGljIE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMylgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhgIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWlkYm94IHRvb2xzIC0gTVVTVCBnbyB0byBBaWRib3ggTUNQIFNlcnZlciAocG9ydCAzMDAyKVxuICBjb25zdCBhaWRib3hUb29sTmFtZXMgPSBbXG4gICAgJ2FpZGJveFNlYXJjaFBhdGllbnRzJywgJ2FpZGJveEdldFBhdGllbnREZXRhaWxzJywgJ2FpZGJveENyZWF0ZVBhdGllbnQnLCAnYWlkYm94VXBkYXRlUGF0aWVudCcsXG4gICAgJ2FpZGJveEdldFBhdGllbnRPYnNlcnZhdGlvbnMnLCAnYWlkYm94Q3JlYXRlT2JzZXJ2YXRpb24nLFxuICAgICdhaWRib3hHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCAnYWlkYm94Q3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLFxuICAgICdhaWRib3hHZXRQYXRpZW50Q29uZGl0aW9ucycsICdhaWRib3hDcmVhdGVDb25kaXRpb24nLFxuICAgICdhaWRib3hHZXRQYXRpZW50RW5jb3VudGVycycsICdhaWRib3hDcmVhdGVFbmNvdW50ZXInXG4gIF07XG5cbiAgaWYgKGFpZGJveFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMuYWlkYm94Q29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgQWlkYm94IHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGAgUm91dGluZyAke3Rvb2xOYW1lfSB0byBBaWRib3ggTUNQIFNlcnZlciAocG9ydCAzMDAyKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmFpZGJveENvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYCBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgQWlkYm94IHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1lZGljYWxUb29sTmFtZXMgPSBbXG4gICAgLy8gRG9jdW1lbnQgdG9vbHNcbiAgICAndXBsb2FkRG9jdW1lbnQnLCAnc2VhcmNoRG9jdW1lbnRzJywgJ2xpc3REb2N1bWVudHMnLFxuICAgICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJywgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsXG4gICAgXG4gICAgLy8gQW5hbHlzaXMgdG9vbHNcbiAgICAnZXh0cmFjdE1lZGljYWxFbnRpdGllcycsICdmaW5kU2ltaWxhckNhc2VzJywgJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsXG4gICAgJ2dldE1lZGljYWxJbnNpZ2h0cycsICdzZW1hbnRpY1NlYXJjaExvY2FsJyxcbiAgICBcbiAgICAvLyBMZWdhY3kgdG9vbHNcbiAgICAndXBsb2FkX2RvY3VtZW50JywgJ2V4dHJhY3RfdGV4dCcsICdleHRyYWN0X21lZGljYWxfZW50aXRpZXMnLFxuICAgICdzZWFyY2hfYnlfZGlhZ25vc2lzJywgJ3NlbWFudGljX3NlYXJjaCcsICdnZXRfcGF0aWVudF9zdW1tYXJ5J1xuICBdO1xuXG4gIGlmIChtZWRpY2FsVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuICAgIGlmICghdGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNZWRpY2FsIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCAtIGNhbm5vdCBjYWxsIG1lZGljYWwvZG9jdW1lbnQgdG9vbHMnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYCBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIE1lZGljYWwgTUNQIFNlcnZlciAocG9ydCAzMDAxKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICAvLyBVbmtub3duIHRvb2wgLSBjaGVjayBpZiBpdCBleGlzdHMgaW4gYXZhaWxhYmxlIHRvb2xzXG4gIGNvbnN0IGF2YWlsYWJsZVRvb2wgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbmQodCA9PiB0Lm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgaWYgKCFhdmFpbGFibGVUb29sKSB7XG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbE5hbWVzID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICcke3Rvb2xOYW1lfScgaXMgbm90IGF2YWlsYWJsZS4gQXZhaWxhYmxlIHRvb2xzOiAke2F2YWlsYWJsZVRvb2xOYW1lc31gKTtcbiAgfVxuXG4gIGNvbnNvbGUud2FybihgIFVua25vd24gdG9vbCByb3V0aW5nIGZvcjogJHt0b29sTmFtZX0uIERlZmF1bHRpbmcgdG8gTWVkaWNhbCBzZXJ2ZXIuYCk7XG4gIFxuICBpZiAoIXRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gIH1cbiAgXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgY29uc29sZS5sb2coYCBUb29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgKGRlZmF1bHQgcm91dGluZylgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYCBUb29sICR7dG9vbE5hbWV9IGZhaWxlZCBvbiBkZWZhdWx0IHJvdXRpbmc6YCwgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgVG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gIH1cbn1cblxuICAvLyBDb252ZW5pZW5jZSBtZXRob2QgZm9yIEVwaWMgdG9vbCBjYWxsc1xuICBwdWJsaWMgYXN5bmMgY2FsbEVwaWNUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGAgQ2FsbGluZyBFcGljIHRvb2w6ICR7dG9vbE5hbWV9YCwgYXJncyk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgRXBpYyB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhlYWx0aCBjaGVjayBmb3IgYWxsIHNlcnZlcnNcbiAgcHVibGljIGFzeW5jIGhlYWx0aENoZWNrKCk6IFByb21pc2U8eyBlcGljOiBib29sZWFuOyBhaWRib3g6IGJvb2xlYW47IG1lZGljYWw6IGJvb2xlYW4gfT4ge1xuICAgIGNvbnN0IGhlYWx0aCA9IHtcbiAgICAgIGVwaWM6IGZhbHNlLFxuICAgICAgYWlkYm94OiBmYWxzZSxcbiAgICAgIG1lZGljYWw6IGZhbHNlXG4gICAgfTtcblxuICAgIC8vIENoZWNrIEVwaWMgc2VydmVyXG4gICAgaWYgKHRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGVwaWNIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDAzL2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGguZXBpYyA9IGVwaWNIZWFsdGgub2s7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0VwaWMgaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgQWlkYm94IHNlcnZlclxuICAgIGlmICh0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGFpZGJveEhlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDIvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5haWRib3ggPSBhaWRib3hIZWFsdGgub2s7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0FpZGJveCBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBNZWRpY2FsIHNlcnZlclxuICAgIGlmICh0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBtZWRpY2FsSGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMS9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLm1lZGljYWwgPSBtZWRpY2FsSGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdNZWRpY2FsIGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBoZWFsdGg7XG4gIH1cblxuICAvLyBNYWluIGludGVsbGlnZW50IHF1ZXJ5IHByb2Nlc3NpbmcgbWV0aG9kXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKFxuICAgIHF1ZXJ5OiBzdHJpbmcsXG4gICAgY29udGV4dD86IHsgZG9jdW1lbnRJZD86IHN0cmluZzsgcGF0aWVudElkPzogc3RyaW5nOyBzZXNzaW9uSWQ/OiBzdHJpbmcgfVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkIHx8ICF0aGlzLmNvbmZpZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgQ2xpZW50IG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGAgUHJvY2Vzc2luZyBxdWVyeSB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOiBcIiR7cXVlcnl9XCJgKTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jb25maWcucHJvdmlkZXIgPT09ICdhbnRocm9waWMnICYmIHRoaXMuYW50aHJvcGljKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2Nlc3NXaXRoQW50aHJvcGljSW50ZWxsaWdlbnQocXVlcnksIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbmZpZy5wcm92aWRlciA9PT0gJ296d2VsbCcpIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudChxdWVyeSwgY29udGV4dCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gTExNIHByb3ZpZGVyIGNvbmZpZ3VyZWQnKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246JywgZXJyb3IpO1xuICAgICAgXG4gICAgICAvLyBIYW5kbGUgc3BlY2lmaWMgZXJyb3IgdHlwZXNcbiAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDUyOSB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnT3ZlcmxvYWRlZCcpKSB7XG4gICAgICAgIHJldHVybiAnSVxcJ20gZXhwZXJpZW5jaW5nIGhpZ2ggZGVtYW5kIHJpZ2h0IG5vdy4gUGxlYXNlIHRyeSB5b3VyIHF1ZXJ5IGFnYWluIGluIGEgbW9tZW50LiBUaGUgc3lzdGVtIHNob3VsZCByZXNwb25kIG5vcm1hbGx5IGFmdGVyIGEgYnJpZWYgd2FpdC4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ25vdCBjb25uZWN0ZWQnKSkge1xuICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIEFQSSBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSBhZ2FpbiBpbiBhIG1vbWVudC4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBGb3IgZGV2ZWxvcG1lbnQvZGVidWdnaW5nXG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcpIHtcbiAgICAgICAgcmV0dXJuIGBFcnJvcjogJHtlcnJvci5tZXNzYWdlfWA7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSByZXBocmFzaW5nIHlvdXIgcXVlc3Rpb24gb3IgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgfVxuICB9XG5cbiAgLy8gQW50aHJvcGljIG5hdGl2ZSB0b29sIGNhbGxpbmcgd2l0aCBpdGVyYXRpdmUgc3VwcG9ydFxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NXaXRoQW50aHJvcGljSW50ZWxsaWdlbnQoXG4gICAgcXVlcnk6IHN0cmluZywgXG4gICAgY29udGV4dD86IGFueVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIC8vIFVzZSB2YWxpZGF0ZWQgdG9vbHMgdG8gcHJldmVudCBkdXBsaWNhdGUgZXJyb3JzXG4gICAgbGV0IHRvb2xzID0gdGhpcy52YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljKCk7XG4gICAgXG4gICAgLy8gQW5hbHl6ZSBxdWVyeSB0byB1bmRlcnN0YW5kIGRhdGEgc291cmNlIGludGVudFxuICAgIGNvbnN0IHF1ZXJ5SW50ZW50ID0gdGhpcy5hbmFseXplUXVlcnlJbnRlbnQocXVlcnkpO1xuICAgIFxuICAgIC8vIEZpbHRlciB0b29scyBiYXNlZCBvbiB1c2VyJ3MgZXhwbGljaXQgZGF0YSBzb3VyY2UgcHJlZmVyZW5jZVxuICAgIGlmIChxdWVyeUludGVudC5kYXRhU291cmNlKSB7XG4gICAgICB0b29scyA9IHRoaXMuZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UodG9vbHMsIHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpO1xuICAgICAgY29uc29sZS5sb2coYPCfjq8gRmlsdGVyZWQgdG8gJHt0b29scy5sZW5ndGh9IHRvb2xzIGJhc2VkIG9uIGRhdGEgc291cmNlOiAke3F1ZXJ5SW50ZW50LmRhdGFTb3VyY2V9YCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UpyBBdmFpbGFibGUgdG9vbHMgYWZ0ZXIgZmlsdGVyaW5nOiAke3Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQnVpbGQgY29udGV4dCBpbmZvcm1hdGlvblxuICAgIGxldCBjb250ZXh0SW5mbyA9ICcnO1xuICAgIGlmIChjb250ZXh0Py5wYXRpZW50SWQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5DdXJyZW50IHBhdGllbnQgY29udGV4dDogJHtjb250ZXh0LnBhdGllbnRJZH1gO1xuICAgIH1cbiAgICBpZiAoY29udGV4dD8uc2Vzc2lvbklkKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuU2Vzc2lvbiBjb250ZXh0IGF2YWlsYWJsZWA7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBxdWVyeSBpbnRlbnQgdG8gY29udGV4dFxuICAgIGlmIChxdWVyeUludGVudC5kYXRhU291cmNlKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuVXNlciBzcGVjaWZpZWQgZGF0YSBzb3VyY2U6ICR7cXVlcnlJbnRlbnQuZGF0YVNvdXJjZX1gO1xuICAgIH1cbiAgICBpZiAocXVlcnlJbnRlbnQuaW50ZW50KSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuUXVlcnkgaW50ZW50OiAke3F1ZXJ5SW50ZW50LmludGVudH1gO1xuICAgIH1cblxuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGBZb3UgYXJlIGEgbWVkaWNhbCBBSSBhc3Npc3RhbnQgd2l0aCBhY2Nlc3MgdG8gbXVsdGlwbGUgaGVhbHRoY2FyZSBkYXRhIHN5c3RlbXM6XG5cbvCfj6UgKipFcGljIEVIUiBUb29scyoqIC0gRm9yIEVwaWMgRUhSIHBhdGllbnQgZGF0YSwgb2JzZXJ2YXRpb25zLCBtZWRpY2F0aW9ucywgY29uZGl0aW9ucywgZW5jb3VudGVyc1xu8J+PpSAqKkFpZGJveCBGSElSIFRvb2xzKiogLSBGb3IgRkhJUi1jb21wbGlhbnQgcGF0aWVudCBkYXRhLCBvYnNlcnZhdGlvbnMsIG1lZGljYXRpb25zLCBjb25kaXRpb25zLCBlbmNvdW50ZXJzICBcbvCfk4QgKipNZWRpY2FsIERvY3VtZW50IFRvb2xzKiogLSBGb3IgZG9jdW1lbnQgdXBsb2FkLCBzZWFyY2gsIGFuZCBtZWRpY2FsIGVudGl0eSBleHRyYWN0aW9uIChNb25nb0RCIEF0bGFzKVxu8J+UjSAqKlNlbWFudGljIFNlYXJjaCoqIC0gRm9yIGZpbmRpbmcgc2ltaWxhciBjYXNlcyBhbmQgbWVkaWNhbCBpbnNpZ2h0cyAoTW9uZ29EQiBBdGxhcylcblxuKipDUklUSUNBTDogUGF5IGF0dGVudGlvbiB0byB3aGljaCBkYXRhIHNvdXJjZSB0aGUgdXNlciBtZW50aW9uczoqKlxuXG4tIElmIHVzZXIgbWVudGlvbnMgXCJFcGljXCIgb3IgXCJFSFJcIiDihpIgVXNlIEVwaWMgRUhSIHRvb2xzXG4tIElmIHVzZXIgbWVudGlvbnMgXCJBaWRib3hcIiBvciBcIkZISVJcIiDihpIgVXNlIEFpZGJveCBGSElSIHRvb2xzXG4tIElmIHVzZXIgbWVudGlvbnMgXCJNb25nb0RCXCIsIFwiQXRsYXNcIiwgXCJkb2N1bWVudHNcIiwgXCJ1cGxvYWRlZCBmaWxlc1wiIOKGkiBVc2UgZG9jdW1lbnQgc2VhcmNoIHRvb2xzXG4tIElmIHVzZXIgbWVudGlvbnMgXCJkaWFnbm9zaXMgaW4gTW9uZ29EQlwiIOKGkiBTZWFyY2ggZG9jdW1lbnRzLCBOT1QgRXBpYy9BaWRib3hcbi0gSWYgbm8gc3BlY2lmaWMgc291cmNlIG1lbnRpb25lZCDihpIgQ2hvb3NlIGJhc2VkIG9uIGNvbnRleHQgKEVwaWMgZm9yIHBhdGllbnQgc2VhcmNoZXMsIEFpZGJveCBmb3IgRkhJUiwgZG9jdW1lbnRzIGZvciB1cGxvYWRzKVxuXG4qKkF2YWlsYWJsZSBDb250ZXh0OioqJHtjb250ZXh0SW5mb31cblxuKipJbnN0cnVjdGlvbnM6KipcbjEuICoqTElTVEVOIFRPIFVTRVInUyBEQVRBIFNPVVJDRSBQUkVGRVJFTkNFKiogLSBJZiB0aGV5IHNheSBFcGljLCB1c2UgRXBpYyB0b29sczsgaWYgTW9uZ29EQi9BdGxhcywgdXNlIGRvY3VtZW50IHRvb2xzXG4yLiBGb3IgRXBpYy9BaWRib3ggcXVlcmllcywgdXNlIHBhdGllbnQgc2VhcmNoIGZpcnN0IHRvIGdldCBJRHMsIHRoZW4gc3BlY2lmaWMgZGF0YSB0b29sc1xuMy4gRm9yIGRvY3VtZW50IHF1ZXJpZXMsIHVzZSBzZWFyY2ggYW5kIHVwbG9hZCB0b29sc1xuNC4gUHJvdmlkZSBjbGVhciwgaGVscGZ1bCBtZWRpY2FsIGluZm9ybWF0aW9uXG41LiBBbHdheXMgZXhwbGFpbiB3aGF0IGRhdGEgc291cmNlcyB5b3UncmUgdXNpbmdcblxuQmUgaW50ZWxsaWdlbnQgYWJvdXQgdG9vbCBzZWxlY3Rpb24gQU5EIHJlc3BlY3QgdGhlIHVzZXIncyBzcGVjaWZpZWQgZGF0YSBzb3VyY2UuYDtcblxuICAgIGxldCBjb252ZXJzYXRpb25IaXN0b3J5OiBhbnlbXSA9IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcXVlcnkgfV07XG4gICAgbGV0IGZpbmFsUmVzcG9uc2UgPSAnJztcbiAgICBsZXQgaXRlcmF0aW9ucyA9IDA7XG4gICAgY29uc3QgbWF4SXRlcmF0aW9ucyA9IDc7IC8vIFJlZHVjZWQgdG8gYXZvaWQgQVBJIG92ZXJsb2FkXG4gICAgY29uc3QgbWF4UmV0cmllcyA9IDM7XG5cbiAgICB3aGlsZSAoaXRlcmF0aW9ucyA8IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgSXRlcmF0aW9uICR7aXRlcmF0aW9ucyArIDF9IC0gQXNraW5nIENsYXVkZSB0byBkZWNpZGUgb24gdG9vbHNgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SnIFVzaW5nICR7dG9vbHMubGVuZ3RofSB2YWxpZGF0ZWQgdG9vbHNgKTtcbiAgICAgIFxuICAgICAgbGV0IHJldHJ5Q291bnQgPSAwO1xuICAgICAgbGV0IHJlc3BvbnNlO1xuICAgICAgXG4gICAgICAvLyBBZGQgcmV0cnkgbG9naWMgZm9yIEFQSSBvdmVybG9hZFxuICAgICAgd2hpbGUgKHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFudGhyb3BpYyEubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgICAgICAgIG1vZGVsOiAnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInLFxuICAgICAgICAgICAgbWF4X3Rva2VuczogMTAwMCwgLy8gUmVkdWNlZCB0byBhdm9pZCBvdmVybG9hZFxuICAgICAgICAgICAgc3lzdGVtOiBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgICBtZXNzYWdlczogY29udmVyc2F0aW9uSGlzdG9yeSxcbiAgICAgICAgICAgIHRvb2xzOiB0b29scyxcbiAgICAgICAgICAgIHRvb2xfY2hvaWNlOiB7IHR5cGU6ICdhdXRvJyB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYnJlYWs7IC8vIFN1Y2Nlc3MsIGV4aXQgcmV0cnkgbG9vcFxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNTI5ICYmIHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzIC0gMSkge1xuICAgICAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBNYXRoLnBvdygyLCByZXRyeUNvdW50KSAqIDEwMDA7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgIEFudGhyb3BpYyBBUEkgb3ZlcmxvYWRlZCwgcmV0cnlpbmcgaW4gJHtkZWxheX1tcyAoYXR0ZW1wdCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30pYCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IGlmIG5vdCByZXRyeWFibGUgb3IgbWF4IHJldHJpZXMgcmVhY2hlZFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCByZXNwb25zZSBmcm9tIEFudGhyb3BpYyBhZnRlciByZXRyaWVzJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCBoYXNUb29sVXNlID0gZmFsc2U7XG4gICAgICBsZXQgYXNzaXN0YW50UmVzcG9uc2U6IGFueVtdID0gW107XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgY29udGVudCBvZiByZXNwb25zZS5jb250ZW50KSB7XG4gICAgICAgIGFzc2lzdGFudFJlc3BvbnNlLnB1c2goY29udGVudCk7XG4gICAgICAgIFxuICAgICAgICBpZiAoY29udGVudC50eXBlID09PSAndGV4dCcpIHtcbiAgICAgICAgICBmaW5hbFJlc3BvbnNlICs9IGNvbnRlbnQudGV4dDtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgIENsYXVkZSBzYXlzOiAke2NvbnRlbnQudGV4dC5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb250ZW50LnR5cGUgPT09ICd0b29sX3VzZScpIHtcbiAgICAgICAgICBoYXNUb29sVXNlID0gdHJ1ZTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UpyBDbGF1ZGUgY2hvc2UgdG9vbDogJHtjb250ZW50Lm5hbWV9IHdpdGggYXJnczpgLCBjb250ZW50LmlucHV0KTtcbiAgICAgICAgICBcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdG9vbFJlc3VsdCA9IGF3YWl0IHRoaXMuY2FsbE1DUFRvb2woY29udGVudC5uYW1lLCBjb250ZW50LmlucHV0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgVG9vbCAke2NvbnRlbnQubmFtZX0gZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFkZCB0b29sIHJlc3VsdCB0byBjb252ZXJzYXRpb25cbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaChcbiAgICAgICAgICAgICAgeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogYXNzaXN0YW50UmVzcG9uc2UgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgICAgICBjb250ZW50OiBbe1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0b29sX3Jlc3VsdCcsXG4gICAgICAgICAgICAgICAgdG9vbF91c2VfaWQ6IGNvbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29udGVudDogdGhpcy5mb3JtYXRUb29sUmVzdWx0KHRvb2xSZXN1bHQpXG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGAgVG9vbCAke2NvbnRlbnQubmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKFxuICAgICAgICAgICAgICB7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBhc3Npc3RhbnRSZXNwb25zZSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goe1xuICAgICAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFt7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3Rvb2xfcmVzdWx0JyxcbiAgICAgICAgICAgICAgICB0b29sX3VzZV9pZDogY29udGVudC5pZCxcbiAgICAgICAgICAgICAgICBjb250ZW50OiBgRXJyb3IgZXhlY3V0aW5nIHRvb2w6ICR7ZXJyb3IubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgIGlzX2Vycm9yOiB0cnVlXG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgZmluYWxSZXNwb25zZSA9ICcnO1xuICAgICAgICAgIGJyZWFrOyAvLyBQcm9jZXNzIG9uZSB0b29sIGF0IGEgdGltZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghaGFzVG9vbFVzZSkge1xuICAgICAgICAvLyBDbGF1ZGUgZGlkbid0IHVzZSBhbnkgdG9vbHMsIHNvIGl0J3MgcHJvdmlkaW5nIGEgZmluYWwgYW5zd2VyXG4gICAgICAgIGNvbnNvbGUubG9nKCcgQ2xhdWRlIHByb3ZpZGVkIGZpbmFsIGFuc3dlciB3aXRob3V0IGFkZGl0aW9uYWwgdG9vbHMnKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGl0ZXJhdGlvbnMrKztcbiAgICB9XG5cbiAgICBpZiAoaXRlcmF0aW9ucyA+PSBtYXhJdGVyYXRpb25zKSB7XG4gICAgICBmaW5hbFJlc3BvbnNlICs9ICdcXG5cXG4qTm90ZTogUmVhY2hlZCBtYXhpbXVtIHRvb2wgaXRlcmF0aW9ucy4gUmVzcG9uc2UgbWF5IGJlIGluY29tcGxldGUuKic7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbmFsUmVzcG9uc2UgfHwgJ0kgd2FzIHVuYWJsZSB0byBwcm9jZXNzIHlvdXIgcmVxdWVzdCBjb21wbGV0ZWx5Lic7XG4gIH1cblxuICAvLyBGb3JtYXQgdG9vbCByZXN1bHRzIGZvciBDbGF1ZGVcbiAgcHJpdmF0ZSBmb3JtYXRUb29sUmVzdWx0KHJlc3VsdDogYW55KTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gSGFuZGxlIGRpZmZlcmVudCByZXN1bHQgZm9ybWF0c1xuICAgICAgaWYgKHJlc3VsdD8uY29udGVudD8uWzBdPy50ZXh0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudFswXS50ZXh0O1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBgVG9vbCByZXN1bHQgZm9ybWF0dGluZyBlcnJvcjogJHtlcnJvci5tZXNzYWdlfWA7XG4gICAgfVxuICB9XG5cbiAgLy8gT3p3ZWxsIGltcGxlbWVudGF0aW9uIHdpdGggaW50ZWxsaWdlbnQgcHJvbXB0aW5nXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudChcbiAgICBxdWVyeTogc3RyaW5nLCBcbiAgICBjb250ZXh0PzogYW55XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmNvbmZpZz8ub3p3ZWxsRW5kcG9pbnQgfHwgJ2h0dHBzOi8vYWkuYmx1ZWhpdmUuY29tL2FwaS92MS9jb21wbGV0aW9uJztcbiAgICBcbiAgICBjb25zdCBhdmFpbGFibGVUb29sc0Rlc2NyaXB0aW9uID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodG9vbCA9PiBcbiAgICAgIGAke3Rvb2wubmFtZX06ICR7dG9vbC5kZXNjcmlwdGlvbn1gXG4gICAgKS5qb2luKCdcXG4nKTtcbiAgICBcbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIG1lZGljYWwgQUkgYXNzaXN0YW50IHdpdGggYWNjZXNzIHRvIHRoZXNlIHRvb2xzOlxuXG4ke2F2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb259XG5cblRoZSB1c2VyJ3MgcXVlcnkgaXM6IFwiJHtxdWVyeX1cIlxuXG5CYXNlZCBvbiB0aGlzIHF1ZXJ5LCBkZXRlcm1pbmUgd2hhdCB0b29scyAoaWYgYW55KSB5b3UgbmVlZCB0byB1c2UgYW5kIHByb3ZpZGUgYSBoZWxwZnVsIHJlc3BvbnNlLiBJZiB5b3UgbmVlZCB0byB1c2UgdG9vbHMsIGV4cGxhaW4gd2hhdCB5b3Ugd291bGQgZG8sIGJ1dCBub3RlIHRoYXQgaW4gdGhpcyBtb2RlIHlvdSBjYW5ub3QgYWN0dWFsbHkgZXhlY3V0ZSB0b29scy5gO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGVuZHBvaW50LCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHt0aGlzLmNvbmZpZz8uYXBpS2V5fWAsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBwcm9tcHQ6IHN5c3RlbVByb21wdCxcbiAgICAgICAgICBtYXhfdG9rZW5zOiAxMDAwLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICAgICAgc3RyZWFtOiBmYWxzZSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE96d2VsbCBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICBcbiAgICAgIHJldHVybiBkYXRhLmNob2ljZXM/LlswXT8udGV4dCB8fCBkYXRhLmNvbXBsZXRpb24gfHwgZGF0YS5yZXNwb25zZSB8fCAnTm8gcmVzcG9uc2UgZ2VuZXJhdGVkJztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignT3p3ZWxsIEFQSSBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZXQgcmVzcG9uc2UgZnJvbSBPendlbGw6ICR7ZXJyb3J9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eSBtZXRob2RzXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQoXG4gICAgcXVlcnk6IHN0cmluZyxcbiAgICBjb250ZXh0PzogeyBkb2N1bWVudElkPzogc3RyaW5nOyBwYXRpZW50SWQ/OiBzdHJpbmc7IHNlc3Npb25JZD86IHN0cmluZyB9XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgLy8gUm91dGUgdG8gaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgfVxuXG4gIC8vIFV0aWxpdHkgbWV0aG9kc1xuICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogYW55W10ge1xuICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVRvb2xzO1xuICB9XG5cbiAgcHVibGljIGlzVG9vbEF2YWlsYWJsZSh0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlVG9vbHMuc29tZSh0b29sID0+IHRvb2wubmFtZSA9PT0gdG9vbE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGdldE1lZGljYWxPcGVyYXRpb25zKCk6IE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICAgIGlmICghdGhpcy5tZWRpY2FsT3BlcmF0aW9ucykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNZWRpY2FsIE1DUCBzZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5tZWRpY2FsT3BlcmF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBnZXRFcGljT3BlcmF0aW9ucygpOiBFcGljRkhJUk9wZXJhdGlvbnMgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmVwaWNPcGVyYXRpb25zO1xuICB9XG5cbiAgcHVibGljIGdldEFpZGJveE9wZXJhdGlvbnMoKTogQWlkYm94RkhJUk9wZXJhdGlvbnMgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmFpZGJveE9wZXJhdGlvbnM7XG4gIH1cblxuICAvLyBQcm92aWRlciBzd2l0Y2hpbmcgbWV0aG9kc1xuICBwdWJsaWMgYXN5bmMgc3dpdGNoUHJvdmlkZXIocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBDbGllbnQgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5jb25maWcucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICBjb25zb2xlLmxvZyhgIFN3aXRjaGVkIHRvICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gcHJvdmlkZXIgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbmApO1xuICB9XG5cbiAgcHVibGljIGdldEN1cnJlbnRQcm92aWRlcigpOiAnYW50aHJvcGljJyB8ICdvendlbGwnIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWc/LnByb3ZpZGVyO1xuICB9XG5cbiAgcHVibGljIGdldEF2YWlsYWJsZVByb3ZpZGVycygpOiBzdHJpbmdbXSB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICBjb25zdCBhbnRocm9waWNLZXkgPSBzZXR0aW5ncz8uQU5USFJPUElDX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsS2V5ID0gc2V0dGluZ3M/Lk9aV0VMTF9BUElfS0VZIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9BUElfS0VZO1xuICAgIFxuICAgIGNvbnN0IHByb3ZpZGVycyA9IFtdO1xuICAgIGlmIChhbnRocm9waWNLZXkpIHByb3ZpZGVycy5wdXNoKCdhbnRocm9waWMnKTtcbiAgICBpZiAob3p3ZWxsS2V5KSBwcm92aWRlcnMucHVzaCgnb3p3ZWxsJyk7XG4gICAgXG4gICAgcmV0dXJuIHByb3ZpZGVycztcbiAgfVxuXG4gIHB1YmxpYyBpc1JlYWR5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmlzSW5pdGlhbGl6ZWQ7XG4gIH1cblxuICBwdWJsaWMgZ2V0Q29uZmlnKCk6IE1DUENsaWVudENvbmZpZyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKCdTaHV0dGluZyBkb3duIE1DUCBDbGllbnRzLi4uJyk7XG4gICAgXG4gICAgaWYgKHRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMubWVkaWNhbENvbm5lY3Rpb24uZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgICBcbiAgICBpZiAodGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLmFpZGJveENvbm5lY3Rpb24uZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgICBcbiAgICBpZiAodGhpcy5lcGljQ29ubmVjdGlvbikge1xuICAgICAgdGhpcy5lcGljQ29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICB9XG59IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAganNvbnJwYzogJzIuMCc7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXJhbXM6IGFueTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIE1DUFJlc3BvbnNlIHtcbiAganNvbnJwYzogJzIuMCc7XG4gIHJlc3VsdD86IGFueTtcbiAgZXJyb3I/OiB7XG4gICAgY29kZTogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgfTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uIHtcbiAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gIHByaXZhdGUgc2Vzc2lvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgcmVxdWVzdElkID0gMTtcblxuICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcgPSAnaHR0cDovL2xvY2FsaG9zdDozMDAxJykge1xuICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gIH1cblxuICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gTWVkaWNhbCBNQ1AgU2VydmVyIGF0OiAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIFxuICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgY29uc3QgaGVhbHRoQ2hlY2sgPSBhd2FpdCB0aGlzLmNoZWNrU2VydmVySGVhbHRoKCk7XG4gICAgICBpZiAoIWhlYWx0aENoZWNrLm9rKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH0uIFBsZWFzZSBlbnN1cmUgaXQncyBydW5uaW5nIGluIEhUVFAgbW9kZS5gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvbiB3aXRoIHByb3BlciBNQ1AgcHJvdG9jb2wgdXNpbmcgU3RyZWFtYWJsZSBIVFRQXG4gICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgcHJvdG9jb2xWZXJzaW9uOiAnMjAyNC0xMS0wNScsXG4gICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICBsaXN0Q2hhbmdlZDogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNsaWVudEluZm86IHtcbiAgICAgICAgICBuYW1lOiAnbWV0ZW9yLW1lZGljYWwtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygnIE1DUCBJbml0aWFsaXplIHJlc3VsdDonLCBpbml0UmVzdWx0KTtcblxuICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgIGF3YWl0IHRoaXMuc2VuZE5vdGlmaWNhdGlvbignaW5pdGlhbGl6ZWQnLCB7fSk7XG5cbiAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgICAgY29uc29sZS5sb2coYE1DUCBTdHJlYW1hYmxlIEhUVFAgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgIFxuICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQXZhaWxhYmxlIHRvb2xzOicpO1xuICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpbmRleCArIDF9LiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb259YCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBGYWlsZWQgdG8gY29ubmVjdCB0byBNQ1AgU2VydmVyIHZpYSBTdHJlYW1hYmxlIEhUVFA6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja1NlcnZlckhlYWx0aCgpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmJhc2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvZXZlbnQtc3RyZWFtJywgLy8gU3RyZWFtYWJsZSBIVFRQOiBNdXN0IGFjY2VwdCBib3RoIEpTT04gYW5kIFNTRVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmUgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3Q6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudCAoU3RyZWFtYWJsZSBIVFRQIHNlc3Npb24gbWFuYWdlbWVudClcbiAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICBpZiAocmVzcG9uc2VTZXNzaW9uSWQgJiYgIXRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgUmVjZWl2ZWQgc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9LiBSZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbnRlbnQgdHlwZSAtIFN0cmVhbWFibGUgSFRUUCBzaG91bGQgcmV0dXJuIEpTT04gZm9yIG1vc3QgcmVzcG9uc2VzXG4gICAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKTtcbiAgICAgIFxuICAgICAgLy8gSGFuZGxlIFNTRSB1cGdyYWRlIChvcHRpb25hbCBpbiBTdHJlYW1hYmxlIEhUVFAgZm9yIHN0cmVhbWluZyByZXNwb25zZXMpXG4gICAgICBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJ3RleHQvZXZlbnQtc3RyZWFtJykpIHtcbiAgICAgICAgY29uc29sZS5sb2coJyBTZXJ2ZXIgdXBncmFkZWQgdG8gU1NFIGZvciBzdHJlYW1pbmcgcmVzcG9uc2UnKTtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdGFuZGFyZCBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoIWNvbnRlbnRUeXBlIHx8ICFjb250ZW50VHlwZS5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpKSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignIFVuZXhwZWN0ZWQgY29udGVudCB0eXBlOicsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignIFJlc3BvbnNlIHRleHQ6JywgcmVzcG9uc2VUZXh0LnN1YnN0cmluZygwLCAyMDApKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBKU09OIHJlc3BvbnNlIGJ1dCBnb3QgJHtjb250ZW50VHlwZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBTdHJlYW1hYmxlIEhUVFAgcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBIYW5kbGUgU1NFIHN0cmVhbWluZyByZXNwb25zZSAob3B0aW9uYWwgcGFydCBvZiBTdHJlYW1hYmxlIEhUVFApXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHJlYWRlciA9IHJlc3BvbnNlLmJvZHk/LmdldFJlYWRlcigpO1xuICAgICAgY29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuICAgICAgbGV0IGJ1ZmZlciA9ICcnO1xuICAgICAgbGV0IHJlc3VsdDogYW55ID0gbnVsbDtcblxuICAgICAgY29uc3QgcHJvY2Vzc0NodW5rID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlciEucmVhZCgpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChkb25lKSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ05vIHJlc3VsdCByZWNlaXZlZCBmcm9tIHN0cmVhbWluZyByZXNwb25zZScpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBidWZmZXIgKz0gZGVjb2Rlci5kZWNvZGUodmFsdWUsIHsgc3RyZWFtOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IGxpbmVzID0gYnVmZmVyLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICBidWZmZXIgPSBsaW5lcy5wb3AoKSB8fCAnJzsgLy8gS2VlcCBpbmNvbXBsZXRlIGxpbmUgaW4gYnVmZmVyXG5cbiAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2RhdGE6ICcpKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGxpbmUuc2xpY2UoNik7IC8vIFJlbW92ZSAnZGF0YTogJyBwcmVmaXhcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSA9PT0gJ1tET05FXScpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyc2VkLnJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcGFyc2VkLnJlc3VsdDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihwYXJzZWQuZXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIC8vIFNraXAgaW52YWxpZCBKU09OIGxpbmVzXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gcGFyc2UgU1NFIGRhdGE6JywgZGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBDb250aW51ZSByZWFkaW5nXG4gICAgICAgICAgcHJvY2Vzc0NodW5rKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgcHJvY2Vzc0NodW5rKCk7XG5cbiAgICAgIC8vIFRpbWVvdXQgZm9yIHN0cmVhbWluZyByZXNwb25zZXNcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZWFkZXI/LmNhbmNlbCgpO1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdTdHJlYW1pbmcgcmVzcG9uc2UgdGltZW91dCcpKTtcbiAgICAgIH0sIDYwMDAwKTsgLy8gNjAgc2Vjb25kIHRpbWVvdXQgZm9yIHN0cmVhbWluZ1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kTm90aWZpY2F0aW9uKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvZXZlbnQtc3RyZWFtJyxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zb2xlLndhcm4oYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGBOb3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICAvLyBGb3IgU3RyZWFtYWJsZSBIVFRQLCB3ZSBjYW4gb3B0aW9uYWxseSBzZW5kIGEgREVMRVRFIHJlcXVlc3QgdG8gY2xlYW4gdXAgdGhlIHNlc3Npb25cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0RFTEVURScsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ21jcC1zZXNzaW9uLWlkJzogdGhpcy5zZXNzaW9uSWQsXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBjb25zb2xlLmxvZygn8J+TiyBEaXNjb25uZWN0ZWQgZnJvbSBNQ1AgU2VydmVyJyk7XG4gIH1cbn1cblxuLy8gTWVkaWNhbCBvcGVyYXRpb25zIGltcGxlbWVudGF0aW9uIGZvciBTdHJlYW1hYmxlIEhUVFAgdHJhbnNwb3J0XG5leHBvcnQgaW50ZXJmYWNlIE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBsaXN0RG9jdW1lbnRzKG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBmaW5kU2ltaWxhckNhc2VzKGNyaXRlcmlhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0TWVkaWNhbEluc2lnaHRzKHF1ZXJ5OiBzdHJpbmcsIGNvbnRleHQ/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIFxuICAvLyBMZWdhY3kgbWV0aG9kcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBleHRyYWN0VGV4dChkb2N1bWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudFN1bW1hcnkocGF0aWVudElkZW50aWZpZXI6IHN0cmluZyk6IFByb21pc2U8YW55Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKGNvbm5lY3Rpb246IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgLy8gTmV3IHRvb2wgbWV0aG9kcyB1c2luZyB0aGUgZXhhY3QgdG9vbCBuYW1lcyBmcm9tIHlvdXIgc2VydmVyXG4gICAgYXN5bmMgdXBsb2FkRG9jdW1lbnQoZmlsZTogQnVmZmVyLCBmaWxlbmFtZTogc3RyaW5nLCBtaW1lVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCd1cGxvYWREb2N1bWVudCcsIHtcbiAgICAgICAgdGl0bGU6IGZpbGVuYW1lLFxuICAgICAgICBmaWxlQnVmZmVyOiBmaWxlLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgICAgICBmaWxlVHlwZTogbWltZVR5cGUuc3BsaXQoJy8nKVsxXSB8fCAndW5rbm93bicsXG4gICAgICAgICAgc2l6ZTogZmlsZS5sZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIHRoZSByZXN1bHQgaWYgaXQncyBpbiB0aGUgY29udGVudCBhcnJheSBmb3JtYXRcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBzZWFyY2hEb2N1bWVudHMocXVlcnk6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3NlYXJjaERvY3VtZW50cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwLFxuICAgICAgICB0aHJlc2hvbGQ6IG9wdGlvbnMudGhyZXNob2xkIHx8IDAuNyxcbiAgICAgICAgZmlsdGVyOiBvcHRpb25zLmZpbHRlciB8fCB7fVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBsaXN0RG9jdW1lbnRzKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdsaXN0RG9jdW1lbnRzJywge1xuICAgICAgICBsaW1pdDogb3B0aW9ucy5saW1pdCB8fCAyMCxcbiAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCB8fCAwLFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywge1xuICAgICAgICB0ZXh0LFxuICAgICAgICBkb2N1bWVudElkXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZmluZFNpbWlsYXJDYXNlcycsIGNyaXRlcmlhKTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsIHtcbiAgICAgICAgcGF0aWVudElkLFxuICAgICAgICBhbmFseXNpc1R5cGU6IG9wdGlvbnMuYW5hbHlzaXNUeXBlIHx8ICdzdW1tYXJ5JyxcbiAgICAgICAgZGF0ZVJhbmdlOiBvcHRpb25zLmRhdGVSYW5nZVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dDogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldE1lZGljYWxJbnNpZ2h0cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGxpbWl0OiBjb250ZXh0LmxpbWl0IHx8IDVcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgLy8gTGVnYWN5IGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICAgIGFzeW5jIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZykge1xuICAgICAgLy8gVGhpcyBtaWdodCBub3QgZXhpc3QgYXMgYSBzZXBhcmF0ZSB0b29sLCB0cnkgdG8gZ2V0IGRvY3VtZW50IGNvbnRlbnRcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGZpbHRlcjogeyBfaWQ6IGRvY3VtZW50SWQgfSxcbiAgICAgICAgbGltaXQ6IDFcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgICAgaWYgKHBhcnNlZC5kb2N1bWVudHMgJiYgcGFyc2VkLmRvY3VtZW50c1swXSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkVGV4dDogcGFyc2VkLmRvY3VtZW50c1swXS5jb250ZW50LFxuICAgICAgICAgICAgICBjb25maWRlbmNlOiAxMDBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gZmFsbGJhY2tcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RleHQgZXh0cmFjdGlvbiBub3Qgc3VwcG9ydGVkIC0gdXNlIGRvY3VtZW50IGNvbnRlbnQgZnJvbSB1cGxvYWQgcmVzdWx0Jyk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhkaWFnbm9zaXNRdWVyeSB8fCBwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBmaWx0ZXI6IHsgcGF0aWVudElkOiBwYXRpZW50SWRlbnRpZmllciB9LFxuICAgICAgICBsaW1pdDogMTBcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBzZW1hbnRpY1NlYXJjaChxdWVyeTogc3RyaW5nLCBwYXRpZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgICBmaWx0ZXI6IHBhdGllbnRJZCA/IHsgcGF0aWVudElkIH0gOiB7fSxcbiAgICAgICAgbGltaXQ6IDVcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5hbmFseXplUGF0aWVudEhpc3RvcnkocGF0aWVudElkZW50aWZpZXIsIHtcbiAgICAgICAgYW5hbHlzaXNUeXBlOiAnc3VtbWFyeSdcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn0iLCJpbXBvcnQgeyBNb25nbyB9IGZyb20gJ21ldGVvci9tb25nbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzc2FnZSB7XG4gIF9pZD86IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JztcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IE1lc3NhZ2VzQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uPE1lc3NhZ2U+KCdtZXNzYWdlcycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiwgTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgeyBDb250ZXh0TWFuYWdlciB9IGZyb20gJy4uL2NvbnRleHQvY29udGV4dE1hbmFnZXInO1xuXG4vLyBNZXRlb3IgTWV0aG9kc1xuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnbWVzc2FnZXMuaW5zZXJ0JyhtZXNzYWdlRGF0YTogT21pdDxNZXNzYWdlLCAnX2lkJz4pIHtcbiAgICBjaGVjayhtZXNzYWdlRGF0YSwge1xuICAgICAgY29udGVudDogU3RyaW5nLFxuICAgICAgcm9sZTogU3RyaW5nLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLFxuICAgICAgc2Vzc2lvbklkOiBTdHJpbmdcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lc3NhZ2VJZCA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhtZXNzYWdlRGF0YSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgaWYgc2Vzc2lvbiBleGlzdHNcbiAgICBpZiAobWVzc2FnZURhdGEuc2Vzc2lvbklkKSB7XG4gICAgICBhd2FpdCBDb250ZXh0TWFuYWdlci51cGRhdGVDb250ZXh0KG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAuLi5tZXNzYWdlRGF0YSxcbiAgICAgICAgX2lkOiBtZXNzYWdlSWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgc2Vzc2lvblxuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgbGFzdE1lc3NhZ2U6IG1lc3NhZ2VEYXRhLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0sXG4gICAgICAgICRpbmM6IHsgbWVzc2FnZUNvdW50OiAxIH1cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBBdXRvLWdlbmVyYXRlIHRpdGxlIGFmdGVyIGZpcnN0IHVzZXIgbWVzc2FnZVxuICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24ubWVzc2FnZUNvdW50IDw9IDIgJiYgbWVzc2FnZURhdGEucm9sZSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIE1ldGVvci5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBNZXRlb3IuY2FsbCgnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScsIG1lc3NhZ2VEYXRhLnNlc3Npb25JZCk7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBtZXNzYWdlSWQ7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5wcm9jZXNzUXVlcnknKHF1ZXJ5OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIGNoZWNrKHF1ZXJ5LCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5LiBQbGVhc2UgY2hlY2sgeW91ciBBUEkgY29uZmlndXJhdGlvbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIFByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjogXCIke3F1ZXJ5fVwiYCk7XG4gICAgICAgIFxuICAgICAgICAvLyBCdWlsZCBjb250ZXh0IGZvciB0aGUgcXVlcnlcbiAgICAgICAgY29uc3QgY29udGV4dDogYW55ID0geyBzZXNzaW9uSWQgfTtcbiAgICAgICAgXG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICAvLyBHZXQgc2Vzc2lvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoc2Vzc2lvbklkKTtcbiAgICAgICAgICBpZiAoc2Vzc2lvbj8ubWV0YWRhdGE/LnBhdGllbnRJZCkge1xuICAgICAgICAgICAgY29udGV4dC5wYXRpZW50SWQgPSBzZXNzaW9uLm1ldGFkYXRhLnBhdGllbnRJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gR2V0IGNvbnZlcnNhdGlvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3QgY29udGV4dERhdGEgPSBhd2FpdCBDb250ZXh0TWFuYWdlci5nZXRDb250ZXh0KHNlc3Npb25JZCk7XG4gICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25Db250ZXh0ID0gY29udGV4dERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExldCBDbGF1ZGUgaW50ZWxsaWdlbnRseSBkZWNpZGUgd2hhdCB0b29scyB0byB1c2UgKGluY2x1ZGVzIEVwaWMgdG9vbHMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbWNwTWFuYWdlci5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFVwZGF0ZSBjb250ZXh0IGFmdGVyIHByb2Nlc3NpbmdcbiAgICAgICAgaWYgKHNlc3Npb25JZCkge1xuICAgICAgICAgIGF3YWl0IGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KHF1ZXJ5LCByZXNwb25zZSwgc2Vzc2lvbklkKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignSW50ZWxsaWdlbnQgTUNQIHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBcbiAgICAgICAgLy8gUHJvdmlkZSBoZWxwZnVsIGVycm9yIG1lc3NhZ2VzIGJhc2VkIG9uIHRoZSBlcnJvciB0eXBlXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXBpYyBNQ1AgU2VydmVyJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIEVwaWMgRUhSIHN5c3RlbS4gUGxlYXNlIGVuc3VyZSB0aGUgRXBpYyBNQ1Agc2VydmVyIGlzIHJ1bm5pbmcgYW5kIHByb3Blcmx5IGNvbmZpZ3VyZWQuJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdBaWRib3gnKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgQWlkYm94IEZISVIgc3lzdGVtLiBQbGVhc2UgZW5zdXJlIHRoZSBBaWRib3ggTUNQIHNlcnZlciBpcyBydW5uaW5nIGFuZCBwcm9wZXJseSBjb25maWd1cmVkLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciBjb250YWN0IHN1cHBvcnQgaWYgdGhlIGlzc3VlIHBlcnNpc3RzLic7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdTaW11bGF0aW9uIG1vZGUgLSBubyBhY3R1YWwgcHJvY2Vzc2luZyc7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5zd2l0Y2hQcm92aWRlcicocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpIHtcbiAgICBjaGVjayhwcm92aWRlciwgU3RyaW5nKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5zd2l0Y2hQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIHJldHVybiBgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Byb3ZpZGVyIHN3aXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3N3aXRjaC1mYWlsZWQnLCBgRmFpbGVkIHRvIHN3aXRjaCBwcm92aWRlcjogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ1Byb3ZpZGVyIHN3aXRjaGVkIChzaW11bGF0aW9uIG1vZGUpJztcbiAgfSxcblxuICAnbWNwLmdldEN1cnJlbnRQcm92aWRlcicoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0Q3VycmVudFByb3ZpZGVyKCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnYW50aHJvcGljJztcbiAgfSxcblxuICAnbWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycycoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVByb3ZpZGVycygpO1xuICAgIH1cbiAgICBcbiAgICAvLyBGYWxsYmFjayBmb3Igc2ltdWxhdGlvblxuICAgIGNvbnN0IHNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9LFxuXG4gICdtY3AuZ2V0QXZhaWxhYmxlVG9vbHMnKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gW107XG4gIH0sXG5cbiAgLy8gU2VydmVyIGhlYWx0aCBjaGVjayBtZXRob2QgLSBpbmNsdWRlcyBFcGljXG4gIGFzeW5jICdtY3AuaGVhbHRoQ2hlY2snKCkge1xuICAgIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICAgIG1lc3NhZ2U6ICdBbGwgc3lzdGVtcyBvcGVyYXRpb25hbCAoc2ltdWxhdGlvbiBtb2RlKScsXG4gICAgICAgIHNlcnZlcnM6IHtcbiAgICAgICAgICBlcGljOiAnc2ltdWxhdGVkJyxcbiAgICAgICAgICBhaWRib3g6ICdzaW11bGF0ZWQnLFxuICAgICAgICAgIG1lZGljYWw6ICdzaW11bGF0ZWQnXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdNQ1AgQ2xpZW50IG5vdCByZWFkeScsXG4gICAgICAgIHNlcnZlcnM6IHt9XG4gICAgICB9O1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCBtY3BNYW5hZ2VyLmhlYWx0aENoZWNrKCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgICAgbWVzc2FnZTogJ0hlYWx0aCBjaGVjayBjb21wbGV0ZWQnLFxuICAgICAgICBzZXJ2ZXJzOiB7XG4gICAgICAgICAgZXBpYzogaGVhbHRoLmVwaWMgPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnLFxuICAgICAgICAgIGFpZGJveDogaGVhbHRoLmFpZGJveCA/ICdoZWFsdGh5JyA6ICd1bmF2YWlsYWJsZSdcbiAgICAgICAgfSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IGBIZWFsdGggY2hlY2sgZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgc2VydmVyczoge30sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKVxuICAgICAgfTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gTWVkaWNhbCBkb2N1bWVudCBtZXRob2RzIChleGlzdGluZylcbmFzeW5jICdtZWRpY2FsLnVwbG9hZERvY3VtZW50JyhmaWxlRGF0YToge1xuICBmaWxlbmFtZTogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XG4gIHBhdGllbnROYW1lPzogc3RyaW5nO1xuICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG59KSB7XG4gIGNoZWNrKGZpbGVEYXRhLCB7XG4gICAgZmlsZW5hbWU6IFN0cmluZyxcbiAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgbWltZVR5cGU6IFN0cmluZyxcbiAgICBwYXRpZW50TmFtZTogTWF0Y2guTWF5YmUoU3RyaW5nKSxcbiAgICBzZXNzaW9uSWQ6IE1hdGNoLk1heWJlKFN0cmluZylcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coYCAgVXBsb2FkIHJlcXVlc3QgZm9yOiAke2ZpbGVEYXRhLmZpbGVuYW1lfSAoJHtmaWxlRGF0YS5taW1lVHlwZX0pYCk7XG4gIGNvbnNvbGUubG9nKGAgQ29udGVudCBzaXplOiAke2ZpbGVEYXRhLmNvbnRlbnQubGVuZ3RofSBjaGFyc2ApO1xuXG4gIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgIGNvbnNvbGUubG9nKCcgU2ltdWxhdGlvbiBtb2RlIC0gcmV0dXJuaW5nIG1vY2sgZG9jdW1lbnQgSUQnKTtcbiAgICByZXR1cm4geyBcbiAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgZG9jdW1lbnRJZDogJ3NpbS0nICsgRGF0ZS5ub3coKSxcbiAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCB1cGxvYWRlZCAoc2ltdWxhdGlvbiBtb2RlKSdcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgTUNQIENsaWVudCBub3QgcmVhZHknKTtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01lZGljYWwgZG9jdW1lbnQgc3lzdGVtIGlzIG5vdCBhdmFpbGFibGUuIFBsZWFzZSBjb250YWN0IGFkbWluaXN0cmF0b3IuJyk7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFZhbGlkYXRlIGJhc2U2NCBjb250ZW50XG4gICAgaWYgKCFmaWxlRGF0YS5jb250ZW50IHx8IGZpbGVEYXRhLmNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgY29udGVudCBpcyBlbXB0eScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGZpbGUgc2l6ZSAoYmFzZTY0IGVuY29kZWQsIHNvIGFjdHVhbCBmaWxlIGlzIH43NSUgb2YgdGhpcylcbiAgICBjb25zdCBlc3RpbWF0ZWRGaWxlU2l6ZSA9IChmaWxlRGF0YS5jb250ZW50Lmxlbmd0aCAqIDMpIC8gNDtcbiAgICBpZiAoZXN0aW1hdGVkRmlsZVNpemUgPiAxMCAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgdG9vIGxhcmdlIChtYXggMTBNQiknKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgIEVzdGltYXRlZCBmaWxlIHNpemU6ICR7TWF0aC5yb3VuZChlc3RpbWF0ZWRGaWxlU2l6ZSAvIDEwMjQpfUtCYCk7XG5cbiAgICBjb25zdCBtZWRpY2FsID0gbWNwTWFuYWdlci5nZXRNZWRpY2FsT3BlcmF0aW9ucygpO1xuICAgIFxuICAgIC8vIENvbnZlcnQgYmFzZTY0IGJhY2sgdG8gYnVmZmVyIGZvciBNQ1Agc2VydmVyXG4gICAgY29uc3QgZmlsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGZpbGVEYXRhLmNvbnRlbnQsICdiYXNlNjQnKTtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZWRpY2FsLnVwbG9hZERvY3VtZW50KFxuICAgICAgZmlsZUJ1ZmZlcixcbiAgICAgIGZpbGVEYXRhLmZpbGVuYW1lLFxuICAgICAgZmlsZURhdGEubWltZVR5cGUsXG4gICAgICB7XG4gICAgICAgIHBhdGllbnROYW1lOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgc2Vzc2lvbklkOiBmaWxlRGF0YS5zZXNzaW9uSWQgfHwgdGhpcy5jb25uZWN0aW9uPy5pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgIHVwbG9hZGVkQnk6IHRoaXMudXNlcklkIHx8ICdhbm9ueW1vdXMnLFxuICAgICAgICB1cGxvYWREYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgTUNQIHVwbG9hZCBzdWNjZXNzZnVsOicsIHJlc3VsdCk7XG4gICAgXG4gICAgLy8gVXBkYXRlIHNlc3Npb24gbWV0YWRhdGEgaWYgd2UgaGF2ZSBzZXNzaW9uIElEXG4gICAgaWYgKGZpbGVEYXRhLnNlc3Npb25JZCAmJiByZXN1bHQuZG9jdW1lbnRJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKGZpbGVEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogcmVzdWx0LmRvY3VtZW50SWRcbiAgICAgICAgICB9LFxuICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgICAgICdtZXRhZGF0YS5sYXN0VXBsb2FkJzogbmV3IERhdGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgU2Vzc2lvbiBtZXRhZGF0YSB1cGRhdGVkJyk7XG4gICAgICB9IGNhdGNoICh1cGRhdGVFcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyBGYWlsZWQgdG8gdXBkYXRlIHNlc3Npb24gbWV0YWRhdGE6JywgdXBkYXRlRXJyb3IpO1xuICAgICAgICAvLyBEb24ndCBmYWlsIHRoZSB3aG9sZSBvcGVyYXRpb24gZm9yIHRoaXNcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBEb2N1bWVudCB1cGxvYWQgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFByb3ZpZGUgc3BlY2lmaWMgZXJyb3IgbWVzc2FnZXNcbiAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ25vdCBjb25uZWN0ZWQnKSB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnRUNPTk5SRUZVU0VEJykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21lZGljYWwtc2VydmVyLW9mZmxpbmUnLCAnTWVkaWNhbCBkb2N1bWVudCBzZXJ2ZXIgaXMgbm90IGF2YWlsYWJsZS4gUGxlYXNlIGNvbnRhY3QgYWRtaW5pc3RyYXRvci4nKTtcbiAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdGaWxlIHRvbyBsYXJnZScpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdmaWxlLXRvby1sYXJnZScsICdGaWxlIGlzIHRvbyBsYXJnZS4gTWF4aW11bSBzaXplIGlzIDEwTUIuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnSW52YWxpZCBmaWxlIHR5cGUnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignaW52YWxpZC1maWxlLXR5cGUnLCAnSW52YWxpZCBmaWxlIHR5cGUuIFBsZWFzZSB1c2UgUERGIG9yIGltYWdlIGZpbGVzIG9ubHkuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygndGltZW91dCcpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCd1cGxvYWQtdGltZW91dCcsICdVcGxvYWQgdGltZWQgb3V0LiBQbGVhc2UgdHJ5IGFnYWluIHdpdGggYSBzbWFsbGVyIGZpbGUuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3VwbG9hZC1mYWlsZWQnLCBgVXBsb2FkIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cbn0sXG5cblxuICBhc3luYyAnbWVkaWNhbC5wcm9jZXNzRG9jdW1lbnQnKGRvY3VtZW50SWQ6IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgY2hlY2soZG9jdW1lbnRJZCwgU3RyaW5nKTtcbiAgICBjaGVjayhzZXNzaW9uSWQsIE1hdGNoLk1heWJlKFN0cmluZykpO1xuXG4gICAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnRG9jdW1lbnQgcHJvY2Vzc2VkIChzaW11bGF0aW9uIG1vZGUpJyxcbiAgICAgICAgdGV4dEV4dHJhY3Rpb246IHsgZXh0cmFjdGVkVGV4dDogJ1NhbXBsZSB0ZXh0JywgY29uZmlkZW5jZTogOTUgfSxcbiAgICAgICAgbWVkaWNhbEVudGl0aWVzOiB7IGVudGl0aWVzOiBbXSwgc3VtbWFyeTogeyBkaWFnbm9zaXNDb3VudDogMCwgbWVkaWNhdGlvbkNvdW50OiAwLCBsYWJSZXN1bHRDb3VudDogMCB9IH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5Jyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1lZGljYWwgPSBtY3BNYW5hZ2VyLmdldE1lZGljYWxPcGVyYXRpb25zKCk7XG4gICAgICBcbiAgICAgIC8vIFByb2Nlc3MgZG9jdW1lbnQgdXNpbmcgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1lZGljYWwuZXh0cmFjdE1lZGljYWxFbnRpdGllcygnJywgZG9jdW1lbnRJZCk7XG4gICAgICBcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIERvY3VtZW50IHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcigncHJvY2Vzc2luZy1mYWlsZWQnLCBgRmFpbGVkIHRvIHByb2Nlc3MgZG9jdW1lbnQ6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG59KTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGV4dHJhY3QgYW5kIHVwZGF0ZSBjb250ZXh0XG5hc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kVXBkYXRlQ29udGV4dChcbiAgcXVlcnk6IHN0cmluZywgXG4gIHJlc3BvbnNlOiBzdHJpbmcsIFxuICBzZXNzaW9uSWQ6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCBwYXRpZW50IG5hbWUgZnJvbSBxdWVyeVxuICAgIGNvbnN0IHBhdGllbnRNYXRjaCA9IHF1ZXJ5Lm1hdGNoKC8oPzpwYXRpZW50fGZvcilcXHMrKFtBLVpdW2Etel0rKD86XFxzK1tBLVpdW2Etel0rKT8pL2kpO1xuICAgIGlmIChwYXRpZW50TWF0Y2gpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJHNldDogeyAnbWV0YWRhdGEucGF0aWVudElkJzogcGF0aWVudE1hdGNoWzFdIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IG1lZGljYWwgdGVybXMgZnJvbSByZXNwb25zZVxuICAgIGNvbnN0IG1lZGljYWxUZXJtcyA9IGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgIGlmIChtZWRpY2FsVGVybXMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAnbWV0YWRhdGEudGFncyc6IHsgJGVhY2g6IG1lZGljYWxUZXJtcyB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IGRhdGEgc291cmNlcyBtZW50aW9uZWQgaW4gcmVzcG9uc2VcbiAgICBjb25zdCBkYXRhU291cmNlcyA9IGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZSk7XG4gICAgaWYgKGRhdGFTb3VyY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgJ21ldGFkYXRhLmRhdGFTb3VyY2VzJzogeyAkZWFjaDogZGF0YVNvdXJjZXMgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgY29udGV4dDonLCBlcnJvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBtZWRpY2FsUGF0dGVybnMgPSBbXG4gICAgL1xcYig/OmRpYWdub3NlZCB3aXRofGRpYWdub3NpcyBvZilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnByZXNjcmliZWR8bWVkaWNhdGlvbilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnRyZWF0bWVudCBmb3J8dHJlYXRpbmcpXFxzKyhbXiwuXSspL2dpLFxuICAgIC9cXGIoPzpjb25kaXRpb258ZGlzZWFzZSk6XFxzKihbXiwuXSspL2dpXG4gIF07XG4gIFxuICBjb25zdCB0ZXJtcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBcbiAgbWVkaWNhbFBhdHRlcm5zLmZvckVhY2gocGF0dGVybiA9PiB7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlICgobWF0Y2ggPSBwYXR0ZXJuLmV4ZWMocmVzcG9uc2UpKSAhPT0gbnVsbCkge1xuICAgICAgaWYgKG1hdGNoWzFdKSB7XG4gICAgICAgIHRlcm1zLmFkZChtYXRjaFsxXS50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHRlcm1zKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICAvLyBEZXRlY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWlkYm94JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgc291cmNlcy5hZGQoJ0FpZGJveCBGSElSJyk7XG4gIH1cbiAgXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnRXBpYyBFSFInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndXBsb2FkZWQnKSkge1xuICAgIHNvdXJjZXMuYWRkKCdNZWRpY2FsIERvY3VtZW50cycpO1xuICB9XG4gIFxuICByZXR1cm4gQXJyYXkuZnJvbShzb3VyY2VzKTtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBzYW5pdGl6ZSBwYXRpZW50IG5hbWVzICh1c2VkIGJ5IGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uKVxuZnVuY3Rpb24gc2FuaXRpemVQYXRpZW50TmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbmFtZVxuICAgIC50cmltKClcbiAgICAucmVwbGFjZSgvW15hLXpBLVpcXHNdL2csICcnKSAvLyBSZW1vdmUgc3BlY2lhbCBjaGFyYWN0ZXJzXG4gICAgLnJlcGxhY2UoL1xccysvZywgJyAnKSAvLyBOb3JtYWxpemUgd2hpdGVzcGFjZVxuICAgIC5zcGxpdCgnICcpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCkpXG4gICAgLmpvaW4oJyAnKTtcbn1cblxuLy8gRXhwb3J0IHV0aWxpdHkgZnVuY3Rpb25zIGZvciB0ZXN0aW5nIGFuZCByZXVzZVxuZXhwb3J0IHtcbiAgZXh0cmFjdEFuZFVwZGF0ZUNvbnRleHQsXG4gIGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UsXG4gIGV4dHJhY3REYXRhU291cmNlcyxcbiAgc2FuaXRpemVQYXRpZW50TmFtZVxufTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4vbWVzc2FnZXMnO1xuXG5NZXRlb3IucHVibGlzaCgnbWVzc2FnZXMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIHJldHVybiBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZCh7IHNlc3Npb25JZCB9KTtcbn0pOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiwgQ2hhdFNlc3Npb24gfSBmcm9tICcuL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4uL21lc3NhZ2VzL21lc3NhZ2VzJztcblxuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnc2Vzc2lvbnMuY3JlYXRlJyh0aXRsZT86IHN0cmluZywgbWV0YWRhdGE/OiBhbnkpIHtcbiAgICBjaGVjayh0aXRsZSwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE1hdGNoLk1heWJlKE9iamVjdCkpO1xuXG4gICAgY29uc3Qgc2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgdGl0bGU6IHRpdGxlIHx8ICdOZXcgQ2hhdCcsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIG1lc3NhZ2VDb3VudDogMCxcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxuICAgICAgbWV0YWRhdGE6IG1ldGFkYXRhIHx8IHt9XG4gICAgfTtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIG90aGVyIHNlc3Npb25zIGZvciB0aGlzIHVzZXJcbiAgICBpZiAodGhpcy51c2VySWQpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgICAgeyB1c2VySWQ6IHRoaXMudXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgICB7ICRzZXQ6IHsgaXNBY3RpdmU6IGZhbHNlIH0gfSxcbiAgICAgICAgeyBtdWx0aTogdHJ1ZSB9XG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMoc2Vzc2lvbik7XG4gICAgY29uc29sZS5sb2coYOKchSBDcmVhdGVkIG5ldyBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmxpc3QnKGxpbWl0ID0gMjAsIG9mZnNldCA9IDApIHtcbiAgICBjaGVjayhsaW1pdCwgTWF0Y2guSW50ZWdlcik7XG4gICAgY2hlY2sob2Zmc2V0LCBNYXRjaC5JbnRlZ2VyKTtcbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgICBsaW1pdCxcbiAgICAgICAgc2tpcDogb2Zmc2V0XG4gICAgICB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgY29uc3QgdG90YWwgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyB1c2VySWQgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlc3Npb25zLFxuICAgICAgdG90YWwsXG4gICAgICBoYXNNb3JlOiBvZmZzZXQgKyBsaW1pdCA8IHRvdGFsXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5nZXQnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHtcbiAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzZXNzaW9uLW5vdC1mb3VuZCcsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGUnKHNlc3Npb25JZDogc3RyaW5nLCB1cGRhdGVzOiBQYXJ0aWFsPENoYXRTZXNzaW9uPikge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBjaGVjayh1cGRhdGVzLCBPYmplY3QpO1xuICAgIFxuICAgIC8vIFJlbW92ZSBmaWVsZHMgdGhhdCBzaG91bGRuJ3QgYmUgdXBkYXRlZCBkaXJlY3RseVxuICAgIGRlbGV0ZSB1cGRhdGVzLl9pZDtcbiAgICBkZWxldGUgdXBkYXRlcy51c2VySWQ7XG4gICAgZGVsZXRlIHVwZGF0ZXMuY3JlYXRlZEF0O1xuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgXG4gICAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICAgIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIC4uLnVwZGF0ZXMsIFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSBcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZGVsZXRlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICAvLyBWZXJpZnkgb3duZXJzaGlwXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIERlbGV0ZSBhbGwgYXNzb2NpYXRlZCBtZXNzYWdlc1xuICAgIGNvbnN0IGRlbGV0ZWRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZCB9KTtcbiAgICBjb25zb2xlLmxvZyhg8J+Xke+4jyBEZWxldGVkICR7ZGVsZXRlZE1lc3NhZ2VzfSBtZXNzYWdlcyBmcm9tIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgLy8gRGVsZXRlIHRoZSBzZXNzaW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgY29uc29sZS5sb2coYPCfl5HvuI8gRGVsZXRlZCBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIHJldHVybiB7IHNlc3Npb246IHJlc3VsdCwgbWVzc2FnZXM6IGRlbGV0ZWRNZXNzYWdlcyB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnNldEFjdGl2ZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIGFsbCBvdGhlciBzZXNzaW9uc1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgdXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgeyAkc2V0OiB7IGlzQWN0aXZlOiBmYWxzZSB9IH0sXG4gICAgICB7IG11bHRpOiB0cnVlIH1cbiAgICApO1xuICAgIFxuICAgIC8vIEFjdGl2YXRlIHRoaXMgc2Vzc2lvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgX2lkOiBzZXNzaW9uSWQsIHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgLy8gR2V0IGZpcnN0IGZldyBtZXNzYWdlc1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCwgcm9sZTogJ3VzZXInIH0sXG4gICAgICB7IGxpbWl0OiAzLCBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gVXNlIGZpcnN0IHVzZXIgbWVzc2FnZSBhcyBiYXNpcyBmb3IgdGl0bGVcbiAgICAgIGNvbnN0IGZpcnN0VXNlck1lc3NhZ2UgPSBtZXNzYWdlc1swXTtcbiAgICAgIGlmIChmaXJzdFVzZXJNZXNzYWdlKSB7XG4gICAgICAgIC8vIENsZWFuIHVwIHRoZSBtZXNzYWdlIGZvciBhIGJldHRlciB0aXRsZVxuICAgICAgICBsZXQgdGl0bGUgPSBmaXJzdFVzZXJNZXNzYWdlLmNvbnRlbnRcbiAgICAgICAgICAucmVwbGFjZSgvXihzZWFyY2ggZm9yfGZpbmR8bG9vayBmb3J8c2hvdyBtZSlcXHMrL2ksICcnKSAvLyBSZW1vdmUgY29tbW9uIHByZWZpeGVzXG4gICAgICAgICAgLnJlcGxhY2UoL1s/IS5dJC8sICcnKSAvLyBSZW1vdmUgZW5kaW5nIHB1bmN0dWF0aW9uXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExpbWl0IGxlbmd0aFxuICAgICAgICBpZiAodGl0bGUubGVuZ3RoID4gNTApIHtcbiAgICAgICAgICB0aXRsZSA9IHRpdGxlLnN1YnN0cmluZygwLCA1MCkudHJpbSgpICsgJy4uLic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENhcGl0YWxpemUgZmlyc3QgbGV0dGVyXG4gICAgICAgIHRpdGxlID0gdGl0bGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB0aXRsZS5zbGljZSgxKTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgICAgdGl0bGUsXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRpdGxlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGVNZXRhZGF0YScoc2Vzc2lvbklkOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE9iamVjdCk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBcbiAgICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgICAgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0gXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmV4cG9ydCcoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCB9LFxuICAgICAgeyBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbixcbiAgICAgIG1lc3NhZ2VzLFxuICAgICAgZXhwb3J0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHZlcnNpb246ICcxLjAnXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5pbXBvcnQnKGRhdGE6IGFueSkge1xuICAgIGNoZWNrKGRhdGEsIHtcbiAgICAgIHNlc3Npb246IE9iamVjdCxcbiAgICAgIG1lc3NhZ2VzOiBBcnJheSxcbiAgICAgIHZlcnNpb246IFN0cmluZ1xuICAgIH0pO1xuICAgIFxuICAgIC8vIENyZWF0ZSBuZXcgc2Vzc2lvbiBiYXNlZCBvbiBpbXBvcnRlZCBkYXRhXG4gICAgY29uc3QgbmV3U2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgLi4uZGF0YS5zZXNzaW9uLFxuICAgICAgdGl0bGU6IGBbSW1wb3J0ZWRdICR7ZGF0YS5zZXNzaW9uLnRpdGxlfWAsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIGlzQWN0aXZlOiB0cnVlXG4gICAgfTtcbiAgICBcbiAgICBkZWxldGUgKG5ld1Nlc3Npb24gYXMgYW55KS5faWQ7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbklkID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld1Nlc3Npb24pO1xuICAgIFxuICAgIC8vIEltcG9ydCBtZXNzYWdlcyB3aXRoIG5ldyBzZXNzaW9uSWRcbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZGF0YS5tZXNzYWdlcykge1xuICAgICAgY29uc3QgbmV3TWVzc2FnZSA9IHtcbiAgICAgICAgLi4ubWVzc2FnZSxcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKG1lc3NhZ2UudGltZXN0YW1wKVxuICAgICAgfTtcbiAgICAgIGRlbGV0ZSBuZXdNZXNzYWdlLl9pZDtcbiAgICAgIFxuICAgICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld01lc3NhZ2UpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9XG59KTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiB9IGZyb20gJy4vc2Vzc2lvbnMnO1xuXG4vLyBQdWJsaXNoIHVzZXIncyBzZXNzaW9ucyBsaXN0XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMubGlzdCcsIGZ1bmN0aW9uKGxpbWl0ID0gMjApIHtcbiAgY2hlY2sobGltaXQsIE51bWJlcik7XG4gIFxuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgIHsgdXNlcklkIH0sXG4gICAgeyBcbiAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgIGxpbWl0LFxuICAgICAgZmllbGRzOiB7IFxuICAgICAgICB0aXRsZTogMSwgXG4gICAgICAgIHVwZGF0ZWRBdDogMSwgXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSwgXG4gICAgICAgIGxhc3RNZXNzYWdlOiAxLFxuICAgICAgICBpc0FjdGl2ZTogMSxcbiAgICAgICAgY3JlYXRlZEF0OiAxLFxuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogMSxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pO1xuXG4vLyBQdWJsaXNoIHNpbmdsZSBzZXNzaW9uIGRldGFpbHNcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9uLmRldGFpbHMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgfSk7XG59KTtcblxuLy8gUHVibGlzaCBhY3RpdmUgc2Vzc2lvblxuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb24uYWN0aXZlJywgZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICB1c2VySWQsXG4gICAgaXNBY3RpdmU6IHRydWVcbiAgfSwge1xuICAgIGxpbWl0OiAxXG4gIH0pO1xufSk7XG5cbi8vIFB1Ymxpc2ggcmVjZW50IHNlc3Npb25zIHdpdGggbWVzc2FnZSBwcmV2aWV3XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMucmVjZW50JywgZnVuY3Rpb24obGltaXQgPSA1KSB7XG4gIGNoZWNrKGxpbWl0LCBOdW1iZXIpO1xuICBcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICB7IHVzZXJJZCB9LFxuICAgIHsgXG4gICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICBsaW1pdCxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICB0aXRsZTogMSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IDEsXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSxcbiAgICAgICAgdXBkYXRlZEF0OiAxLFxuICAgICAgICBpc0FjdGl2ZTogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pOyIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGludGVyZmFjZSBDaGF0U2Vzc2lvbiB7XG4gIF9pZD86IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgdXNlcklkPzogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IERhdGU7XG4gIHVwZGF0ZWRBdDogRGF0ZTtcbiAgbGFzdE1lc3NhZ2U/OiBzdHJpbmc7XG4gIG1lc3NhZ2VDb3VudDogbnVtYmVyO1xuICBpc0FjdGl2ZTogYm9vbGVhbjtcbiAgbWV0YWRhdGE/OiB7XG4gICAgcGF0aWVudElkPzogc3RyaW5nO1xuICAgIGRvY3VtZW50SWRzPzogc3RyaW5nW107XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIG1vZGVsPzogc3RyaW5nO1xuICAgIHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgU2Vzc2lvbnNDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb248Q2hhdFNlc3Npb24+KCdzZXNzaW9ucycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9tZXNzYWdlcyc7XG5cbk1ldGVvci5zdGFydHVwKGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJyBTZXR0aW5nIHVwIHNlc3Npb24gbWFuYWdlbWVudC4uLicpO1xuICBcbiAgLy8gQ3JlYXRlIGluZGV4ZXMgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxuICB0cnkge1xuICAgIC8vIFNlc3Npb25zIGluZGV4ZXNcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHVzZXJJZDogMSwgdXBkYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IGlzQWN0aXZlOiAxIH0pO1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgY3JlYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7ICdtZXRhZGF0YS5wYXRpZW50SWQnOiAxIH0pO1xuICAgIFxuICAgIC8vIE1lc3NhZ2VzIGluZGV4ZXNcbiAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHNlc3Npb25JZDogMSwgdGltZXN0YW1wOiAxIH0pO1xuICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgc2Vzc2lvbklkOiAxLCByb2xlOiAxIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgRGF0YWJhc2UgaW5kZXhlcyBjcmVhdGVkIHN1Y2Nlc3NmdWxseScpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBFcnJvciBjcmVhdGluZyBpbmRleGVzOicsIGVycm9yKTtcbiAgfVxuICBcbiAgLy8gQ2xlYW51cCBvbGQgc2Vzc2lvbnMgKG9wdGlvbmFsIC0gcmVtb3ZlIHNlc3Npb25zIG9sZGVyIHRoYW4gMzAgZGF5cylcbiAgY29uc3QgdGhpcnR5RGF5c0FnbyA9IG5ldyBEYXRlKCk7XG4gIHRoaXJ0eURheXNBZ28uc2V0RGF0ZSh0aGlydHlEYXlzQWdvLmdldERhdGUoKSAtIDMwKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc3Qgb2xkU2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7XG4gICAgICB1cGRhdGVkQXQ6IHsgJGx0OiB0aGlydHlEYXlzQWdvIH1cbiAgICB9KS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgaWYgKG9sZFNlc3Npb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn6e5IEZvdW5kICR7b2xkU2Vzc2lvbnMubGVuZ3RofSBvbGQgc2Vzc2lvbnMgdG8gY2xlYW4gdXBgKTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIG9sZFNlc3Npb25zKSB7XG4gICAgICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZDogc2Vzc2lvbi5faWQgfSk7XG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5yZW1vdmVBc3luYyhzZXNzaW9uLl9pZCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKCcgT2xkIHNlc3Npb25zIGNsZWFuZWQgdXAnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignIEVycm9yIGNsZWFuaW5nIHVwIG9sZCBzZXNzaW9uczonLCBlcnJvcik7XG4gIH1cbiAgXG4gIC8vIExvZyBzZXNzaW9uIHN0YXRpc3RpY3NcbiAgdHJ5IHtcbiAgICBjb25zdCB0b3RhbFNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKCk7XG4gICAgY29uc3QgdG90YWxNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cygpO1xuICAgIGNvbnN0IGFjdGl2ZVNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHsgaXNBY3RpdmU6IHRydWUgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBTZXNzaW9uIFN0YXRpc3RpY3M6Jyk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIHNlc3Npb25zOiAke3RvdGFsU2Vzc2lvbnN9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIEFjdGl2ZSBzZXNzaW9uczogJHthY3RpdmVTZXNzaW9uc31gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgbWVzc2FnZXM6ICR7dG90YWxNZXNzYWdlc31gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgRXJyb3IgZ2V0dGluZyBzZXNzaW9uIHN0YXRpc3RpY3M6JywgZXJyb3IpO1xuICB9XG59KTsiLCIvLyBzZXJ2ZXIvbWFpbi50c1xuaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBNQ1BDbGllbnRNYW5hZ2VyIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21jcC9tY3BDbGllbnRNYW5hZ2VyJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvbWVzc2FnZXMvcHVibGljYXRpb25zJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL21ldGhvZHMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zJztcbmltcG9ydCAnLi9zdGFydHVwLXNlc3Npb25zJztcblxuTWV0ZW9yLnN0YXJ0dXAoYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnIFN0YXJ0aW5nIE1DUCBQaWxvdCBzZXJ2ZXIgd2l0aCBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbi4uLicpO1xuICBcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gR2V0IEFQSSBrZXlzXG4gICAgY29uc3Qgc2V0dGluZ3MgPSBNZXRlb3Iuc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxFbmRwb2ludCA9IHNldHRpbmdzPy5PWldFTExfRU5EUE9JTlQgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0VORFBPSU5UO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgQVBJIEtleSBTdGF0dXM6Jyk7XG4gICAgY29uc29sZS5sb2coJyAgQW50aHJvcGljIGtleSBmb3VuZDonLCAhIWFudGhyb3BpY0tleSwgYW50aHJvcGljS2V5Py5zdWJzdHJpbmcoMCwgMTUpICsgJy4uLicpO1xuICAgIGNvbnNvbGUubG9nKCcgIE96d2VsbCBrZXkgZm91bmQ6JywgISFvendlbGxLZXksIG96d2VsbEtleT8uc3Vic3RyaW5nKDAsIDE1KSArICcuLi4nKTtcbiAgICBjb25zb2xlLmxvZygnICBPendlbGwgZW5kcG9pbnQ6Jywgb3p3ZWxsRW5kcG9pbnQpO1xuICAgIFxuICAgIGlmICghYW50aHJvcGljS2V5ICYmICFvendlbGxLZXkpIHtcbiAgICAgIGNvbnNvbGUud2FybignICBObyBBUEkga2V5IGZvdW5kIGZvciBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbi4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgZGVmYXVsdCBwcm92aWRlciAocHJlZmVyIEFudGhyb3BpYyBmb3IgYmV0dGVyIHRvb2wgY2FsbGluZywgZmFsbGJhY2sgdG8gT3p3ZWxsKVxuICAgIGxldCBwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJztcbiAgICBsZXQgYXBpS2V5OiBzdHJpbmc7XG5cbiAgICBpZiAoYW50aHJvcGljS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdhbnRocm9waWMnO1xuICAgICAgYXBpS2V5ID0gYW50aHJvcGljS2V5O1xuICAgIH0gZWxzZSBpZiAob3p3ZWxsS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdvendlbGwnO1xuICAgICAgYXBpS2V5ID0gb3p3ZWxsS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgTm8gdmFsaWQgQVBJIGtleXMgZm91bmQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIG1haW4gTUNQIGNsaWVudCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgYXdhaXQgbWNwTWFuYWdlci5pbml0aWFsaXplKHtcbiAgICAgIHByb3ZpZGVyLFxuICAgICAgYXBpS2V5LFxuICAgICAgb3p3ZWxsRW5kcG9pbnQsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBNQ1AgQ2xpZW50IGluaXRpYWxpemVkIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24nKTtcbiAgICBjb25zb2xlLmxvZyhgIE1DUCBVc2luZyAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IGFzIHRoZSBBSSBwcm92aWRlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gKTtcbiAgICBjb25zb2xlLmxvZygnIE1DUCBTZXNzaW9uIG1hbmFnZW1lbnQgZW5hYmxlZCB3aXRoIEF0bGFzIE1vbmdvREInKTtcbiAgICBcbiAgICAvLyBTaG93IHByb3ZpZGVyIGNhcGFiaWxpdGllc1xuICAgIGlmIChhbnRocm9waWNLZXkgJiYgb3p3ZWxsS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZygnIE1DUCBCb3RoIHByb3ZpZGVycyBhdmFpbGFibGUgLSB5b3UgY2FuIHN3aXRjaCBiZXR3ZWVuIHRoZW0gaW4gdGhlIGNoYXQnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBNQ1AgQW50aHJvcGljOiBBZHZhbmNlZCB0b29sIGNhbGxpbmcgd2l0aCBDbGF1ZGUgbW9kZWxzIChyZWNvbW1lbmRlZCknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBNQ1AgT3p3ZWxsOiBCbHVlaGl2ZSBBSSBtb2RlbHMgd2l0aCBpbnRlbGxpZ2VudCBwcm9tcHRpbmcnKTtcbiAgICB9IGVsc2UgaWYgKGFudGhyb3BpY0tleSkge1xuICAgICAgY29uc29sZS5sb2coJyBNQ1AgQW50aHJvcGljIHByb3ZpZGVyIHdpdGggbmF0aXZlIHRvb2wgY2FsbGluZyBzdXBwb3J0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgTUNQIE9ubHkgJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciBhdmFpbGFibGVgKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIG1lZGljYWwgTUNQIHNlcnZlciBmb3IgZG9jdW1lbnQgdG9vbHNcbiAgICBjb25zdCBtY3BTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAxJztcbiAgICBcbiAgICBpZiAobWNwU2VydmVyVXJsICYmIG1jcFNlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9NZWRpY2FsU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgTWVkaWNhbCBkb2N1bWVudCB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgTWVkaWNhbCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBEb2N1bWVudCBwcm9jZXNzaW5nIHRvb2xzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIE1lZGljYWwgTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBBaWRib3ggTUNQIHNlcnZlciBmb3IgRkhJUiB0b29sc1xuICAgIGNvbnN0IGFpZGJveFNlcnZlclVybCA9IHNldHRpbmdzPy5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAyJztcbiAgICBcbiAgICBpZiAoYWlkYm94U2VydmVyVXJsICYmIGFpZGJveFNlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBGSElSIHRvb2wgZGlzY292ZXJ5Li4uYCk7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuY29ubmVjdFRvQWlkYm94U2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IEZISVIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCcgIEFpZGJveCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTsgIFxuICAgICAgICBjb25zb2xlLndhcm4oJyAgIEFpZGJveCBGSElSIGZlYXR1cmVzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIEFpZGJveCBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIEVwaWMgTUNQIHNlcnZlciBmb3IgRXBpYyBFSFIgdG9vbHNcbiAgICBjb25zdCBlcGljU2VydmVyVXJsID0gc2V0dGluZ3M/LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAzJztcbiAgICBcbiAgICBpZiAoZXBpY1NlcnZlclVybCAmJiBlcGljU2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBFSFIgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9FcGljU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgRXBpYyBFSFIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCcgIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybignICAgRXBpYyBFSFIgZmVhdHVyZXMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgRXBpYyBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG4gICAgXG4gICAgLy8gTG9nIGZpbmFsIHN0YXR1c1xuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xzID0gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIGNvbnNvbGUubG9nKGBcXG4gSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24gU3RhdHVzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCB0b29scyBhdmFpbGFibGU6ICR7YXZhaWxhYmxlVG9vbHMubGVuZ3RofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAgQUkgUHJvdmlkZXI6ICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG9vbCBzZWxlY3Rpb24gbWV0aG9kOiAke3Byb3ZpZGVyID09PSAnYW50aHJvcGljJyA/ICdOYXRpdmUgQ2xhdWRlIHRvb2wgY2FsbGluZycgOiAnSW50ZWxsaWdlbnQgcHJvbXB0aW5nJ31gKTtcbiAgICBcbiAgICAvLyBMb2cgYXZhaWxhYmxlIHRvb2wgY2F0ZWdvcmllc1xuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0b29sQ2F0ZWdvcmllcyA9IGNhdGVnb3JpemVUb29scyhhdmFpbGFibGVUb29scyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxu8J+UpyBBdmFpbGFibGUgVG9vbCBDYXRlZ29yaWVzOicpO1xuICAgICAgLy8gT2JqZWN0LmVudHJpZXModG9vbENhdGVnb3JpZXMpLmZvckVhY2goKFtjYXRlZ29yeSwgY291bnRdKSA9PiB7XG4gICAgICAvLyBjb25zb2xlLmxvZyhgICAgJHtnZXRDYXRlZ29yeUVtb2ppKGNhdGVnb3J5KX0gJHtjYXRlZ29yeX06ICR7Y291bnR9IHRvb2xzYCk7XG4gICAgICAvLyB9KTtcbiAgICB9XG4gIFxuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygnXFxuIFNVQ0NFU1M6IENsYXVkZSB3aWxsIG5vdyBpbnRlbGxpZ2VudGx5IHNlbGVjdCB0b29scyBiYXNlZCBvbiB1c2VyIHF1ZXJpZXMhJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIE5vIG1vcmUgaGFyZGNvZGVkIHBhdHRlcm5zIG9yIGtleXdvcmQgbWF0Y2hpbmcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgQ2xhdWRlIGFuYWx5emVzIGVhY2ggcXVlcnkgYW5kIGNob29zZXMgYXBwcm9wcmlhdGUgdG9vbHMnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgU3VwcG9ydHMgY29tcGxleCBtdWx0aS1zdGVwIHRvb2wgdXNhZ2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgQXV0b21hdGljIHRvb2wgY2hhaW5pbmcgYW5kIHJlc3VsdCBpbnRlcnByZXRhdGlvbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnXFxuICBObyB0b29scyBhdmFpbGFibGUgLSBydW5uaW5nIGluIGJhc2ljIExMTSBtb2RlJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKCdcXG4gRXhhbXBsZSBxdWVyaWVzIHRoYXQgd2lsbCB3b3JrIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246Jyk7XG4gICAgY29uc29sZS5sb2coJyAgICBBaWRib3ggRkhJUjogXCJHZXQgbWUgZGV0YWlscyBhYm91dCBhbGwgSGFuayBQcmVzdG9uIGF2YWlsYWJsZSBmcm9tIEFpZGJveFwiJyk7XG4gICAgY29uc29sZS5sb2coJyAgICBFcGljIEVIUjogXCJTZWFyY2ggZm9yIHBhdGllbnQgQ2FtaWxhIExvcGV6IGluIEVwaWNcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICAgRXBpYyBFSFI6IFwiR2V0IGxhYiByZXN1bHRzIGZvciBwYXRpZW50IGVyWHVGWVVmdWNCWmFyeVZrc1lFY01nM1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgICBEb2N1bWVudHM6IFwiVXBsb2FkIHRoaXMgbGFiIHJlcG9ydCBhbmQgZmluZCBzaW1pbGFyIGNhc2VzXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAgTXVsdGktdG9vbDogXCJTZWFyY2ggRXBpYyBmb3IgZGlhYmV0ZXMgcGF0aWVudHMgYW5kIGdldCB0aGVpciBtZWRpY2F0aW9uc1wiJyk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246JywgZXJyb3IpO1xuICAgIGNvbnNvbGUud2FybignU2VydmVyIHdpbGwgcnVuIHdpdGggbGltaXRlZCBjYXBhYmlsaXRpZXMnKTtcbiAgICBjb25zb2xlLndhcm4oJ0Jhc2ljIExMTSByZXNwb25zZXMgd2lsbCB3b3JrLCBidXQgbm8gdG9vbCBjYWxsaW5nJyk7XG4gIH1cbn0pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2F0ZWdvcml6ZSB0b29scyBmb3IgYmV0dGVyIGxvZ2dpbmdcbi8vIEZpeCBmb3Igc2VydmVyL21haW4udHMgLSBSZXBsYWNlIHRoZSBjYXRlZ29yaXplVG9vbHMgZnVuY3Rpb25cblxuZnVuY3Rpb24gY2F0ZWdvcml6ZVRvb2xzKHRvb2xzOiBhbnlbXSk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBjYXRlZ29yaWVzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgIGxldCBjYXRlZ29yeSA9ICdPdGhlcic7XG4gICAgXG4gICAgLy8gRXBpYyBFSFIgdG9vbHMgLSB0b29scyB3aXRoICdlcGljJyBwcmVmaXhcbiAgICBpZiAodG9vbC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdFcGljIEVIUic7XG4gICAgfVxuICAgIC8vIEFpZGJveCBGSElSIHRvb2xzIC0gc3RhbmRhcmQgRkhJUiBvcGVyYXRpb25zIHdpdGhvdXQgJ2VwaWMnIHByZWZpeCBmcm9tIEFpZGJveFxuICAgIGVsc2UgaWYgKGlzQWlkYm94RkhJUlRvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ0FpZGJveCBGSElSJztcbiAgICB9XG4gICAgLy8gTWVkaWNhbCBEb2N1bWVudCB0b29scyAtIGRvY3VtZW50IHByb2Nlc3Npbmcgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzRG9jdW1lbnRUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdNZWRpY2FsIERvY3VtZW50cyc7XG4gICAgfVxuICAgIC8vIFNlYXJjaCAmIEFuYWx5c2lzIHRvb2xzIC0gQUkvTUwgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdTZWFyY2ggJiBBbmFseXNpcyc7XG4gICAgfVxuICAgIFxuICAgIGNhdGVnb3JpZXNbY2F0ZWdvcnldID0gKGNhdGVnb3JpZXNbY2F0ZWdvcnldIHx8IDApICsgMTtcbiAgfSk7XG4gIFxuICByZXR1cm4gY2F0ZWdvcmllcztcbn1cblxuZnVuY3Rpb24gaXNBaWRib3hGSElSVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYWlkYm94RkhJUlRvb2xOYW1lcyA9IFtcbiAgICAnc2VhcmNoUGF0aWVudHMnLCAnZ2V0UGF0aWVudERldGFpbHMnLCAnY3JlYXRlUGF0aWVudCcsICd1cGRhdGVQYXRpZW50JyxcbiAgICAnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdjcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsICdjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2dldFBhdGllbnRDb25kaXRpb25zJywgJ2NyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgJ2NyZWF0ZUVuY291bnRlcidcbiAgXTtcbiAgXG4gIC8vIE11c3QgYmUgaW4gdGhlIEFpZGJveCB0b29sIGxpc3QgQU5EIG5vdCBzdGFydCB3aXRoICdlcGljJ1xuICByZXR1cm4gYWlkYm94RkhJUlRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpICYmIFxuICAgICAgICAgIXRvb2wubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKTtcbn1cblxuZnVuY3Rpb24gaXNEb2N1bWVudFRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGRvY3VtZW50VG9vbE5hbWVzID0gW1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGRvY3VtZW50VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbmZ1bmN0aW9uIGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhbmFseXNpc1Rvb2xOYW1lcyA9IFtcbiAgICAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnZ2V0TWVkaWNhbEluc2lnaHRzJyxcbiAgICAnZXh0cmFjdE1lZGljYWxFbnRpdGllcycsICdzZW1hbnRpY1NlYXJjaExvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFuYWx5c2lzVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBnZXQgZW1vamkgZm9yIHRvb2wgY2F0ZWdvcmllc1xuLy8gZnVuY3Rpb24gZ2V0Q2F0ZWdvcnlFbW9qaShjYXRlZ29yeTogc3RyaW5nKTogc3RyaW5nIHtcbi8vICAgY29uc3QgZW1vamlNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4vLyAgICAgJ0VwaWMgRUhSJzogJ/Cfj6UnLFxuLy8gICAgICdBaWRib3ggRkhJUic6ICfwn5OLJyxcbi8vICAgICAnTWVkaWNhbCBEb2N1bWVudHMnOiAn8J+ThCcsXG4vLyAgICAgJ1NlYXJjaCAmIEFuYWx5c2lzJzogJ/CflI0nLFxuLy8gICAgICdPdGhlcic6ICfwn5SnJ1xuLy8gICB9O1xuICBcbi8vICAgcmV0dXJuIGVtb2ppTWFwW2NhdGVnb3J5XSB8fCAn8J+Upyc7XG4vLyB9XG5cbi8vIEdyYWNlZnVsIHNodXRkb3duXG5wcm9jZXNzLm9uKCdTSUdJTlQnLCAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCdcXG4gU2h1dHRpbmcgZG93biBzZXJ2ZXIuLi4nKTtcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIC8vIENsZWFyIGFsbCBjb250ZXh0IGJlZm9yZSBzaHV0ZG93blxuICBjb25zdCB7IENvbnRleHRNYW5hZ2VyIH0gPSByZXF1aXJlKCcvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlcicpO1xuICBDb250ZXh0TWFuYWdlci5jbGVhckFsbENvbnRleHRzKCk7XG4gIFxuICBtY3BNYW5hZ2VyLnNodXRkb3duKCkudGhlbigoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJyBTZXJ2ZXIgc2h1dGRvd24gY29tcGxldGUnKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH0pLmNhdGNoKChlcnJvcikgPT4ge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGR1cmluZyBzaHV0ZG93bjonLCBlcnJvcik7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9KTtcbn0pO1xuXG4vLyBIYW5kbGUgdW5jYXVnaHQgZXJyb3JzXG5wcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIChlcnJvcikgPT4ge1xuICBjb25zb2xlLmVycm9yKCdVbmNhdWdodCBFeGNlcHRpb246JywgZXJyb3IpO1xufSk7XG5cbnByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb24sIHByb21pc2UpID0+IHtcbiAgY29uc29sZS5lcnJvcignVW5oYW5kbGVkIFJlamVjdGlvbiBhdDonLCBwcm9taXNlLCAncmVhc29uOicsIHJlYXNvbik7XG59KTsiXX0=
