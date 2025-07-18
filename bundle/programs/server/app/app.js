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

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/context/contextManager.ts                                                                               //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"mcp":{"aidboxServerConnection.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/mcp/aidboxServerConnection.ts                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
          console.log("\uD83C\uDFE5 Connecting to Aidbox MCP Server at: ".concat(this.baseUrl));
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
          console.log('🏥 Aidbox MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log("\u2705 Aidbox MCP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log('🏥 Available Aidbox tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error('❌ Failed to connect to Aidbox MCP Server:', error);
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
            console.log('✅ Aidbox MCP Server health check passed:', health);
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
          console.log("\uD83D\uDD04 Sending request to Aidbox: ".concat(method), {
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
            console.log('🏥 Received Aidbox session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("Aidbox MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log("\u2705 Aidbox request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error("\u274C Aidbox request failed for method ".concat(method, ":"), error);
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
        console.log('🏥 Disconnected from Aidbox MCP Server');
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"epicServerConnection.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/mcp/epicServerConnection.ts                                                                             //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
          console.log('🏥 Epic MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log("\u2705 Epic MCP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log('🏥 Available Epic tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error('❌ Failed to connect to Epic MCP Server:', error);
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
            console.log('✅ Epic MCP Server health check passed:', health);
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
          console.log("\uD83D\uDD04 Sending request to Epic MCP: ".concat(method), {
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
            console.log('🏥 Received Epic session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("Epic MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log("\u2705 Epic request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error("\u274C Epic request failed for method ".concat(method, ":"), error);
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
        console.log('🏥 Disconnected from Epic MCP Server');
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mcpClientManager.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/mcp/mcpClientManager.ts                                                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
        console.log('🤖 Initializing MCP Client with Intelligent Tool Selection');
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
          console.log("\u2705 MCP Client ready with provider: ".concat(config.provider));
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
          const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3001';
          console.log("\uD83C\uDFE5 Connecting to Medical MCP Server at: ".concat(mcpServerUrl));
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
          console.log("\uD83C\uDFE5 Connecting to Aidbox MCP Server at: ".concat(aidboxServerUrl));
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
          console.log("\uD83C\uDFE5 Connecting to Epic MCP Server at: ".concat(epicServerUrl));
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
        console.log("\uD83D\uDD27 Merged tools: ".concat(existingTools.length, " existing + ").concat(uniqueNewTools.length, " new = ").concat(mergedTools.length, " total"));
        return mergedTools;
      }
      // Fix for imports/api/mcp/mcpClientManager.ts - Replace the logAvailableTools method
      logAvailableTools() {
        console.log('\n🔧 Available Tools for Intelligent Selection:');
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
        console.log("\n\uD83E\uDDE0 Claude will intelligently select from ".concat(this.availableTools.length, " total tools based on user queries"));
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
            console.error("\u274C CRITICAL: Duplicate tool found in final validation: ".concat(tool.name));
          }
        });
        if (validTools.length !== tools.length) {
          console.warn("\uD83E\uDDF9 Removed ".concat(tools.length - validTools.length, " duplicate tools in final validation"));
        }
        console.log("\u2705 Final validation: ".concat(validTools.length, " unique tools ready for Anthropic"));
        return validTools;
      }
      // Route tool calls to appropriate MCP server
      // Fix for imports/api/mcp/mcpClientManager.ts
      // Replace the callMCPTool method with proper routing
      // Fixed callMCPTool method for imports/api/mcp/mcpClientManager.ts
      // Replace the existing callMCPTool method with this corrected version
      async callMCPTool(toolName, args) {
        console.log("\uD83D\uDD27 Routing tool: ".concat(toolName, " with args:"), JSON.stringify(args, null, 2));
        // Epic tools - MUST go to Epic MCP Server (port 3003)
        const epicToolNames = ['epicSearchPatients', 'epicGetPatientDetails', 'epicGetPatientObservations', 'epicGetPatientMedications', 'epicGetPatientConditions', 'epicGetPatientEncounters'];
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
            // FIXED: Pass the full tool name with 'aidbox' prefix to the server
            // The server expects the full tool names like 'aidboxCreatePatient'
            const result = await this.aidboxConnection.callTool(toolName, args);
            console.log("\u2705 Aidbox tool ".concat(toolName, " completed successfully"));
            return result;
          } catch (error) {
            console.error("\u274C Aidbox tool ".concat(toolName, " failed:"), error);
            throw new Error("Aidbox tool ".concat(toolName, " failed: ").concat(error instanceof Error ? error.message : 'Unknown error'));
          }
        }
        // Medical/Document tools - Go to Medical MCP Server (port 3001)
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
          console.log("\uD83D\uDCCB Routing ".concat(toolName, " to Medical MCP Server (port 3001)"));
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
        // If we get here, the tool exists but we don't know which server it belongs to
        // This shouldn't happen with proper categorization
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
        console.log("\uD83E\uDDE0 Processing query with intelligent tool selection: \"".concat(query, "\""));
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
              console.log("\uD83D\uDCAC Claude says: ".concat(content.text.substring(0, 100), "..."));
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
              // Clear the current response since we're continuing the conversation
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"medicalServerConnection.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/mcp/medicalServerConnection.ts                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
          console.log("\uD83D\uDCC4 Connecting to Medical MCP Server at: ".concat(this.baseUrl));
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
          console.log('📋 MCP Initialize result:', initResult);
          // Send initialized notification
          await this.sendNotification('initialized', {});
          // Test by listing tools
          const toolsResult = await this.sendRequest('tools/list', {});
          console.log("\u2705 MCP Streamable HTTP Connection successful! Found ".concat(((_toolsResult$tools = toolsResult.tools) === null || _toolsResult$tools === void 0 ? void 0 : _toolsResult$tools.length) || 0, " tools"));
          if (toolsResult.tools) {
            console.log('📋 Available tools:');
            toolsResult.tools.forEach((tool, index) => {
              console.log("   ".concat(index + 1, ". ").concat(tool.name, " - ").concat(tool.description));
            });
          }
          this.isInitialized = true;
        } catch (error) {
          console.error('❌ Failed to connect to MCP Server via Streamable HTTP:', error);
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
            console.log('✅ MCP Server health check passed:', health);
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
          console.log("\uD83D\uDD04 Sending Streamable HTTP request: ".concat(method), {
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
            console.log('📋 Received session ID:', this.sessionId);
          }
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error("HTTP ".concat(response.status, ": ").concat(response.statusText, ". Response: ").concat(errorText));
          }
          // Check content type - Streamable HTTP should return JSON for most responses
          const contentType = response.headers.get('content-type');
          // Handle SSE upgrade (optional in Streamable HTTP for streaming responses)
          if (contentType && contentType.includes('text/event-stream')) {
            console.log('📡 Server upgraded to SSE for streaming response');
            return await this.handleStreamingResponse(response);
          }
          // Standard JSON response
          if (!contentType || !contentType.includes('application/json')) {
            const responseText = await response.text();
            console.error('❌ Unexpected content type:', contentType);
            console.error('❌ Response text:', responseText.substring(0, 200));
            throw new Error("Expected JSON response but got ".concat(contentType));
          }
          const result = await response.json();
          if (result.error) {
            throw new Error("MCP error ".concat(result.error.code, ": ").concat(result.error.message));
          }
          console.log("\u2705 Streamable HTTP request ".concat(method, " successful"));
          return result.result;
        } catch (error) {
          console.error("\u274C Streamable HTTP request failed for method ".concat(method, ":"), error);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"messages":{"messages.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/messages/messages.ts                                                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"methods.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/messages/methods.ts                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
            console.log("\uD83E\uDDE0 Processing query with intelligent tool selection: \"".concat(query, "\""));
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
        console.log("\uD83D\uDCE4 Upload request for: ".concat(fileData.filename, " (").concat(fileData.mimeType, ")"));
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
          console.log("\uD83D\uDCCB Estimated file size: ".concat(Math.round(estimatedFileSize / 1024), "KB"));
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
              console.log('📝 Session metadata updated');
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
    // ================================
    // HELPER FUNCTIONS
    // ================================
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"publications.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/messages/publications.ts                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"sessions":{"methods.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/sessions/methods.ts                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"publications.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/sessions/publications.ts                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"sessions.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// imports/api/sessions/sessions.ts                                                                                    //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}},"server":{"startup-sessions.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// server/startup-sessions.ts                                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      console.log('🔧 Setting up session management...');
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
        console.log('✅ Database indexes created successfully');
      } catch (error) {
        console.error('❌ Error creating indexes:', error);
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
          console.log('✅ Old sessions cleaned up');
        }
      } catch (error) {
        console.error('❌ Error cleaning up old sessions:', error);
      }
      // Log session statistics
      try {
        const totalSessions = await SessionsCollection.countDocuments();
        const totalMessages = await MessagesCollection.countDocuments();
        const activeSessions = await SessionsCollection.countDocuments({
          isActive: true
        });
        console.log('📊 Session Statistics:');
        console.log("   Total sessions: ".concat(totalSessions));
        console.log("   Active sessions: ".concat(activeSessions));
        console.log("   Total messages: ".concat(totalMessages));
      } catch (error) {
        console.error('❌ Error getting session statistics:', error);
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"main.ts":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// server/main.ts                                                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
      console.log('🚀 Starting MCP Pilot server with Intelligent Tool Selection...');
      const mcpManager = MCPClientManager.getInstance();
      try {
        var _Meteor$settings;
        // Get API keys
        const settings = (_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : _Meteor$settings.private;
        const anthropicKey = (settings === null || settings === void 0 ? void 0 : settings.ANTHROPIC_API_KEY) || process.env.ANTHROPIC_API_KEY;
        const ozwellKey = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_API_KEY) || process.env.OZWELL_API_KEY;
        const ozwellEndpoint = (settings === null || settings === void 0 ? void 0 : settings.OZWELL_ENDPOINT) || process.env.OZWELL_ENDPOINT;
        console.log('🔑 API Key Status:');
        console.log('  Anthropic key found:', !!anthropicKey, (anthropicKey === null || anthropicKey === void 0 ? void 0 : anthropicKey.substring(0, 15)) + '...');
        console.log('  Ozwell key found:', !!ozwellKey, (ozwellKey === null || ozwellKey === void 0 ? void 0 : ozwellKey.substring(0, 15)) + '...');
        console.log('  Ozwell endpoint:', ozwellEndpoint);
        if (!anthropicKey && !ozwellKey) {
          console.warn('⚠️  No API key found for intelligent tool selection.');
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
          console.warn('⚠️  No valid API keys found');
          return;
        }
        // Initialize main MCP client with intelligent tool selection
        await mcpManager.initialize({
          provider,
          apiKey,
          ozwellEndpoint
        });
        console.log('✅ MCP Client initialized with intelligent tool selection');
        console.log("\uD83E\uDDE0 Using ".concat(provider.toUpperCase(), " as the AI provider for intelligent tool selection"));
        console.log('💾 Session management enabled with Atlas MongoDB');
        // Show provider capabilities
        if (anthropicKey && ozwellKey) {
          console.log('🔄 Both providers available - you can switch between them in the chat');
          console.log('   Anthropic: Advanced tool calling with Claude models (recommended)');
          console.log('   Ozwell: Bluehive AI models with intelligent prompting');
        } else if (anthropicKey) {
          console.log('🤖 Anthropic provider with native tool calling support');
        } else {
          console.log("\uD83D\uDD12 Only ".concat(provider.toUpperCase(), " provider available"));
        }
        // Connect to medical MCP server for document tools
        const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3001';
        if (mcpServerUrl && mcpServerUrl !== 'DISABLED') {
          try {
            console.log("\uD83C\uDFE5 Connecting to Medical MCP Server for intelligent tool discovery...");
            await mcpManager.connectToMedicalServer();
            console.log('✅ Medical document tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('⚠️  Medical MCP Server connection failed:', error);
            console.warn('   Document processing tools will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('⚠️  Medical MCP Server URL not configured.');
        }
        // Connect to Aidbox MCP server for FHIR tools
        const aidboxServerUrl = (settings === null || settings === void 0 ? void 0 : settings.AIDBOX_MCP_SERVER_URL) || process.env.AIDBOX_MCP_SERVER_URL || 'http://localhost:3002';
        if (aidboxServerUrl && aidboxServerUrl !== 'DISABLED') {
          try {
            console.log("\uD83C\uDFE5 Connecting to Aidbox MCP Server for intelligent FHIR tool discovery...");
            await mcpManager.connectToAidboxServer();
            console.log('✅ Aidbox FHIR tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('⚠️  Aidbox MCP Server connection failed:', error);
            console.warn('   Aidbox FHIR features will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('⚠️  Aidbox MCP Server URL not configured.');
        }
        // Connect to Epic MCP server for Epic EHR tools
        const epicServerUrl = (settings === null || settings === void 0 ? void 0 : settings.EPIC_MCP_SERVER_URL) || process.env.EPIC_MCP_SERVER_URL || 'http://localhost:3003';
        if (epicServerUrl && epicServerUrl !== 'DISABLED') {
          try {
            console.log("\uD83C\uDFE5 Connecting to Epic MCP Server for intelligent EHR tool discovery...");
            await mcpManager.connectToEpicServer();
            console.log('✅ Epic EHR tools discovered and ready for intelligent selection');
          } catch (error) {
            console.warn('⚠️  Epic MCP Server connection failed:', error);
            console.warn('   Epic EHR features will be unavailable for intelligent selection.');
          }
        } else {
          console.warn('⚠️  Epic MCP Server URL not configured.');
        }
        // Log final status
        const availableTools = mcpManager.getAvailableTools();
        console.log("\n\uD83C\uDFAF Intelligent Tool Selection Status:");
        console.log("   \uD83D\uDCCA Total tools available: ".concat(availableTools.length));
        console.log("   \uD83E\uDDE0 AI Provider: ".concat(provider.toUpperCase()));
        console.log("   \uD83D\uDD27 Tool selection method: ".concat(provider === 'anthropic' ? 'Native Claude tool calling' : 'Intelligent prompting'));
        // Log available tool categories
        if (availableTools.length > 0) {
          const toolCategories = categorizeTools(availableTools);
          console.log('\n🔧 Available Tool Categories:');
          Object.entries(toolCategories).forEach(_ref => {
            let [category, count] = _ref;
            console.log("   ".concat(getCategoryEmoji(category), " ").concat(category, ": ").concat(count, " tools"));
          });
        }
        if (availableTools.length > 0) {
          console.log('\n🏆 SUCCESS: Claude will now intelligently select tools based on user queries!');
          console.log('   • No more hardcoded patterns or keyword matching');
          console.log('   • Claude analyzes each query and chooses appropriate tools');
          console.log('   • Supports complex multi-step tool usage');
          console.log('   • Automatic tool chaining and result interpretation');
        } else {
          console.log('\n⚠️  No tools available - running in basic LLM mode');
        }
        console.log('\n💡 Example queries that will work with intelligent tool selection:');
        console.log('   📋 Aidbox FHIR: "Get me details about all Hank Preston available from Aidbox"');
        console.log('   🏥 Epic EHR: "Search for patient Camila Lopez in Epic"');
        console.log('   🏥 Epic EHR: "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"');
        console.log('   📄 Documents: "Upload this lab report and find similar cases"');
        console.log('   🔗 Multi-tool: "Search Epic for diabetes patients and get their medications"');
      } catch (error) {
        console.error('❌ Failed to initialize intelligent tool selection:', error);
        console.warn('⚠️  Server will run with limited capabilities');
        console.warn('   Basic LLM responses will work, but no tool calling');
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
    function getCategoryEmoji(category) {
      const emojiMap = {
        'Epic EHR': '🏥',
        'Aidbox FHIR': '📋',
        'Medical Documents': '📄',
        'Search & Analysis': '🔍',
        'Other': '🔧'
      };
      return emojiMap[category] || '🔧';
    }
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down server...');
      const mcpManager = MCPClientManager.getInstance();
      // Clear all context before shutdown
      const {
        ContextManager
      } = require('/imports/api/context/contextManager');
      ContextManager.clearAllContexts();
      mcpManager.shutdown().then(() => {
        console.log('👋 Server shutdown complete');
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
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsIm1lZGljYWxUb29sTmFtZXMiLCJhdmFpbGFibGVUb29sIiwiYXZhaWxhYmxlVG9vbE5hbWVzIiwiY2FsbEVwaWNUb29sIiwiZXBpYyIsImFpZGJveCIsIm1lZGljYWwiLCJlcGljSGVhbHRoIiwiYWlkYm94SGVhbHRoIiwibWVkaWNhbEhlYWx0aCIsInByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50IiwicHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudCIsIl9lcnJvciRtZXNzYWdlIiwiX2Vycm9yJG1lc3NhZ2UyIiwiX2Vycm9yJG1lc3NhZ2UzIiwiTk9ERV9FTlYiLCJxdWVyeUludGVudCIsImNvbnRleHRJbmZvIiwic3lzdGVtUHJvbXB0IiwiY29udmVyc2F0aW9uSGlzdG9yeSIsImZpbmFsUmVzcG9uc2UiLCJpdGVyYXRpb25zIiwibWF4SXRlcmF0aW9ucyIsIm1heFJldHJpZXMiLCJyZXRyeUNvdW50IiwiY3JlYXRlIiwibW9kZWwiLCJtYXhfdG9rZW5zIiwic3lzdGVtIiwidG9vbF9jaG9pY2UiLCJkZWxheSIsInBvdyIsIlByb21pc2UiLCJyZXNvbHZlIiwic2V0VGltZW91dCIsImhhc1Rvb2xVc2UiLCJhc3Npc3RhbnRSZXNwb25zZSIsImlucHV0IiwidG9vbFJlc3VsdCIsInRvb2xfdXNlX2lkIiwiZm9ybWF0VG9vbFJlc3VsdCIsImlzX2Vycm9yIiwiX3RoaXMkY29uZmlnIiwiZW5kcG9pbnQiLCJvendlbGxFbmRwb2ludCIsImF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24iLCJfdGhpcyRjb25maWcyIiwiX2RhdGEkY2hvaWNlcyIsIl9kYXRhJGNob2ljZXMkIiwicHJvbXB0IiwidGVtcGVyYXR1cmUiLCJzdHJlYW0iLCJkYXRhIiwiY2hvaWNlcyIsImNvbXBsZXRpb24iLCJwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQiLCJnZXRBdmFpbGFibGVUb29scyIsImlzVG9vbEF2YWlsYWJsZSIsInNvbWUiLCJnZXRNZWRpY2FsT3BlcmF0aW9ucyIsImdldEVwaWNPcGVyYXRpb25zIiwiZ2V0QWlkYm94T3BlcmF0aW9ucyIsInN3aXRjaFByb3ZpZGVyIiwidG9VcHBlckNhc2UiLCJnZXRDdXJyZW50UHJvdmlkZXIiLCJfdGhpcyRjb25maWczIiwiZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX2dsb2JhbCRNZXRlb3I0IiwiX2dsb2JhbCRNZXRlb3I0JHNldHRpIiwiYW50aHJvcGljS2V5IiwiQU5USFJPUElDX0FQSV9LRVkiLCJvendlbGxLZXkiLCJPWldFTExfQVBJX0tFWSIsInByb3ZpZGVycyIsImlzUmVhZHkiLCJnZXRDb25maWciLCJzaHV0ZG93biIsImNvbnRlbnRUeXBlIiwiaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UiLCJyZXNwb25zZVRleHQiLCJyZWplY3QiLCJfcmVzcG9uc2UkYm9keSIsInJlYWRlciIsImdldFJlYWRlciIsImRlY29kZXIiLCJUZXh0RGVjb2RlciIsImJ1ZmZlciIsInByb2Nlc3NDaHVuayIsImRvbmUiLCJ2YWx1ZSIsInJlYWQiLCJkZWNvZGUiLCJsaW5lcyIsInBvcCIsImxpbmUiLCJwYXJzZWQiLCJjYW5jZWwiLCJjYXRjaCIsInVwbG9hZERvY3VtZW50IiwiZmlsZSIsImZpbGVuYW1lIiwibWltZVR5cGUiLCJ0aXRsZSIsImZpbGVCdWZmZXIiLCJ0b1N0cmluZyIsImZpbGVUeXBlIiwic2VhcmNoRG9jdW1lbnRzIiwidGhyZXNob2xkIiwibGlzdERvY3VtZW50cyIsIm9mZnNldCIsImRvY3VtZW50SWQiLCJmaW5kU2ltaWxhckNhc2VzIiwiY3JpdGVyaWEiLCJhbmFseXplUGF0aWVudEhpc3RvcnkiLCJhbmFseXNpc1R5cGUiLCJkYXRlUmFuZ2UiLCJnZXRNZWRpY2FsSW5zaWdodHMiLCJleHRyYWN0VGV4dCIsIl9pZCIsImRvY3VtZW50cyIsInN1Y2Nlc3MiLCJleHRyYWN0ZWRUZXh0IiwiY29uZmlkZW5jZSIsInNlYXJjaEJ5RGlhZ25vc2lzIiwicGF0aWVudElkZW50aWZpZXIiLCJkaWFnbm9zaXNRdWVyeSIsInNlbWFudGljU2VhcmNoIiwiZ2V0UGF0aWVudFN1bW1hcnkiLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJleHRyYWN0QW5kVXBkYXRlQ29udGV4dCIsImV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UiLCJleHRyYWN0RGF0YVNvdXJjZXMiLCJzYW5pdGl6ZVBhdGllbnROYW1lIiwiY2hlY2siLCJNYXRjaCIsIm1ldGhvZHMiLCJtZXNzYWdlcy5pbnNlcnQiLCJtZXNzYWdlRGF0YSIsIlN0cmluZyIsIm1lc3NhZ2VJZCIsImluc2VydEFzeW5jIiwiJGluYyIsImNhbGwiLCJtY3AucHJvY2Vzc1F1ZXJ5IiwiTWF5YmUiLCJpc1NpbXVsYXRpb24iLCJtY3BNYW5hZ2VyIiwiX3Nlc3Npb24kbWV0YWRhdGEiLCJjb250ZXh0RGF0YSIsImNvbnZlcnNhdGlvbkNvbnRleHQiLCJtY3Auc3dpdGNoUHJvdmlkZXIiLCJtY3AuZ2V0Q3VycmVudFByb3ZpZGVyIiwibWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycyIsIl9NZXRlb3Ikc2V0dGluZ3MiLCJtY3AuZ2V0QXZhaWxhYmxlVG9vbHMiLCJtY3AuaGVhbHRoQ2hlY2siLCJzZXJ2ZXJzIiwibWVkaWNhbC51cGxvYWREb2N1bWVudCIsImZpbGVEYXRhIiwicGF0aWVudE5hbWUiLCJub3ciLCJfdGhpcyRjb25uZWN0aW9uIiwiZXN0aW1hdGVkRmlsZVNpemUiLCJyb3VuZCIsIkJ1ZmZlciIsInVwbG9hZGVkQnkiLCJ1c2VySWQiLCJ1cGxvYWREYXRlIiwidG9JU09TdHJpbmciLCIkYWRkVG9TZXQiLCJ1cGRhdGVFcnJvciIsIl9lcnJvciRtZXNzYWdlNCIsIl9lcnJvciRtZXNzYWdlNSIsIm1lZGljYWwucHJvY2Vzc0RvY3VtZW50IiwidGV4dEV4dHJhY3Rpb24iLCJkaWFnbm9zaXNDb3VudCIsIm1lZGljYXRpb25Db3VudCIsImxhYlJlc3VsdENvdW50IiwicGF0aWVudE1hdGNoIiwiJGVhY2giLCJkYXRhU291cmNlcyIsIm1lZGljYWxQYXR0ZXJucyIsInNvdXJjZXMiLCJ3b3JkIiwiY2hhckF0IiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3J5IiwiZ2V0Q2F0ZWdvcnlFbW9qaSIsImNhdGVnb3JpZXMiLCJpc1NlYXJjaEFuYWx5c2lzVG9vbCIsImVtb2ppTWFwIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQUEsQ0FBT0MsTUFBRTtNQUFBQyxjQUE2QixFQUFBQSxDQUFBLEtBQUFBO0lBQU07SUFBQSxJQUFBQyxrQkFBdUI7SUFBQUgsTUFBQSxDQUFBSSxJQUFBO01BQUFELG1CQUFBRSxDQUFBO1FBQUFGLGtCQUFBLEdBQUFFLENBQUE7TUFBQTtJQUFBO0lBQUEsSUFBQUMs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UUFBUSxFQUFFLENBQUM0SixJQUFJLENBQUMsTUFBSztRQUM5QmhiLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDLDZCQUE2QixDQUFDO1FBQzFDK0gsT0FBTyxDQUFDaVQsSUFBSSxDQUFDLENBQUMsQ0FBQztNQUNqQixDQUFDLENBQUMsQ0FBQ3hJLEtBQUssQ0FBRXBSLEtBQUssSUFBSTtRQUNqQnJCLE9BQU8sQ0FBQ3FCLEtBQUssQ0FBQyx3QkFBd0IsRUFBRUEsS0FBSyxDQUFDO1FBQzlDMkcsT0FBTyxDQUFDaVQsSUFBSSxDQUFDLENBQUMsQ0FBQztNQUNqQixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7SUFFRjtJQUNBalQsT0FBTyxDQUFDOFMsRUFBRSxDQUFDLG1CQUFtQixFQUFHelosS0FBSyxJQUFJO01BQ3hDckIsT0FBTyxDQUFDcUIsS0FBSyxDQUFDLHFCQUFxQixFQUFFQSxLQUFLLENBQUM7SUFDN0MsQ0FBQyxDQUFDO0lBRUYyRyxPQUFPLENBQUM4UyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQ0ksTUFBTSxFQUFFQyxPQUFPLEtBQUk7TUFDbkRuYixPQUFPLENBQUNxQixLQUFLLENBQUMseUJBQXlCLEVBQUU4WixPQUFPLEVBQUUsU0FBUyxFQUFFRCxNQUFNLENBQUM7SUFDdEUsQ0FBQyxDQUFDO0lBQUNuYyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9hcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24sIE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlcy9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udmVyc2F0aW9uQ29udGV4dCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICByZWNlbnRNZXNzYWdlczogTWVzc2FnZVtdO1xuICBwYXRpZW50Q29udGV4dD86IHN0cmluZztcbiAgZG9jdW1lbnRDb250ZXh0Pzogc3RyaW5nW107XG4gIG1lZGljYWxFbnRpdGllcz86IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PjtcbiAgbWF4Q29udGV4dExlbmd0aDogbnVtYmVyO1xuICB0b3RhbFRva2VuczogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBjb250ZXh0cyA9IG5ldyBNYXA8c3RyaW5nLCBDb252ZXJzYXRpb25Db250ZXh0PigpO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQ09OVEVYVF9MRU5HVEggPSA0MDAwOyAvLyBBZGp1c3QgYmFzZWQgb24gbW9kZWxcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX01FU1NBR0VTID0gMjA7XG4gIFxuICBzdGF0aWMgYXN5bmMgZ2V0Q29udGV4dChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29udmVyc2F0aW9uQ29udGV4dD4ge1xuICAgIGxldCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIC8vIExvYWQgY29udGV4dCBmcm9tIGRhdGFiYXNlXG4gICAgICBjb250ZXh0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGV4dEZyb21EQihzZXNzaW9uSWQpO1xuICAgICAgdGhpcy5jb250ZXh0cy5zZXQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIGxvYWRDb250ZXh0RnJvbURCKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb252ZXJzYXRpb25Db250ZXh0PiB7XG4gICAgLy8gTG9hZCByZWNlbnQgbWVzc2FnZXNcbiAgICBjb25zdCByZWNlbnRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQgfSxcbiAgICAgIHsgXG4gICAgICAgIHNvcnQ6IHsgdGltZXN0YW1wOiAtMSB9LCBcbiAgICAgICAgbGltaXQ6IHRoaXMuTUFYX01FU1NBR0VTIFxuICAgICAgfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIC8vIExvYWQgc2Vzc2lvbiBtZXRhZGF0YVxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgXG4gICAgY29uc3QgY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHJlY2VudE1lc3NhZ2VzOiByZWNlbnRNZXNzYWdlcy5yZXZlcnNlKCksXG4gICAgICBtYXhDb250ZXh0TGVuZ3RoOiB0aGlzLk1BWF9DT05URVhUX0xFTkdUSCxcbiAgICAgIHRvdGFsVG9rZW5zOiAwXG4gICAgfTtcbiAgICBcbiAgICAvLyBBZGQgbWV0YWRhdGEgZnJvbSBzZXNzaW9uXG4gICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhKSB7XG4gICAgICBjb250ZXh0LnBhdGllbnRDb250ZXh0ID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICBjb250ZXh0LmRvY3VtZW50Q29udGV4dCA9IHNlc3Npb24ubWV0YWRhdGEuZG9jdW1lbnRJZHM7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCBlbnRpdGllcyBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnRleHQubWVkaWNhbEVudGl0aWVzID0gdGhpcy5leHRyYWN0TWVkaWNhbEVudGl0aWVzKHJlY2VudE1lc3NhZ2VzKTtcbiAgICBcbiAgICAvLyBDYWxjdWxhdGUgdG9rZW4gdXNhZ2VcbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgXG4gICAgLy8gVHJpbSBpZiBuZWVkZWRcbiAgICB0aGlzLnRyaW1Db250ZXh0KGNvbnRleHQpO1xuICAgIFxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIFxuICBzdGF0aWMgYXN5bmMgdXBkYXRlQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgbmV3TWVzc2FnZTogTWVzc2FnZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICAvLyBBZGQgbmV3IG1lc3NhZ2VcbiAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnB1c2gobmV3TWVzc2FnZSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIG1lZGljYWwgZW50aXRpZXMgaWYgbWVzc2FnZSBjb250YWlucyB0aGVtXG4gICAgaWYgKG5ld01lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcbiAgICAgIGNvbnN0IGVudGl0aWVzID0gdGhpcy5leHRyYWN0RW50aXRpZXNGcm9tTWVzc2FnZShuZXdNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgaWYgKGVudGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29udGV4dC5tZWRpY2FsRW50aXRpZXMgPSBbXG4gICAgICAgICAgLi4uKGNvbnRleHQubWVkaWNhbEVudGl0aWVzIHx8IFtdKSxcbiAgICAgICAgICAuLi5lbnRpdGllc1xuICAgICAgICBdLnNsaWNlKC01MCk7IC8vIEtlZXAgbGFzdCA1MCBlbnRpdGllc1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBSZWNhbGN1bGF0ZSB0b2tlbnMgYW5kIHRyaW1cbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgdGhpcy50cmltQ29udGV4dChjb250ZXh0KTtcbiAgICBcbiAgICB0aGlzLmNvbnRleHRzLnNldChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICAgIFxuICAgIC8vIFBlcnNpc3QgaW1wb3J0YW50IGNvbnRleHQgYmFjayB0byBzZXNzaW9uXG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0Q29udGV4dChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyB0cmltQ29udGV4dChjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KSB7XG4gICAgd2hpbGUgKGNvbnRleHQudG90YWxUb2tlbnMgPiBjb250ZXh0Lm1heENvbnRleHRMZW5ndGggJiYgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggPiAyKSB7XG4gICAgICAvLyBSZW1vdmUgb2xkZXN0IG1lc3NhZ2VzLCBidXQga2VlcCBhdCBsZWFzdCAyXG4gICAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnNoaWZ0KCk7XG4gICAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgfVxuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBjYWxjdWxhdGVUb2tlbnMoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IG51bWJlciB7XG4gICAgLy8gUm91Z2ggZXN0aW1hdGlvbjogMSB0b2tlbiDiiYggNCBjaGFyYWN0ZXJzXG4gICAgbGV0IHRvdGFsQ2hhcnMgPSAwO1xuICAgIFxuICAgIC8vIENvdW50IG1lc3NhZ2UgY29udGVudFxuICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5yZWNlbnRNZXNzYWdlc1xuICAgICAgLm1hcChtc2cgPT4gbXNnLmNvbnRlbnQpXG4gICAgICAuam9pbignICcpLmxlbmd0aDtcbiAgICBcbiAgICAvLyBDb3VudCBtZXRhZGF0YVxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQucGF0aWVudENvbnRleHQubGVuZ3RoICsgMjA7IC8vIEluY2x1ZGUgbGFiZWxcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQuZG9jdW1lbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQuZG9jdW1lbnRDb250ZXh0LmpvaW4oJyAnKS5sZW5ndGggKyAzMDtcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQubWVkaWNhbEVudGl0aWVzKSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQubWVkaWNhbEVudGl0aWVzXG4gICAgICAgIC5tYXAoZSA9PiBgJHtlLnRleHR9ICgke2UubGFiZWx9KWApXG4gICAgICAgIC5qb2luKCcsICcpLmxlbmd0aDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIE1hdGguY2VpbCh0b3RhbENoYXJzIC8gNCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBidWlsZENvbnRleHRQcm9tcHQoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgLy8gQWRkIHBhdGllbnQgY29udGV4dFxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICBwYXJ0cy5wdXNoKGBDdXJyZW50IFBhdGllbnQ6ICR7Y29udGV4dC5wYXRpZW50Q29udGV4dH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIGRvY3VtZW50IGNvbnRleHRcbiAgICBpZiAoY29udGV4dC5kb2N1bWVudENvbnRleHQgJiYgY29udGV4dC5kb2N1bWVudENvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgcGFydHMucHVzaChgUmVsYXRlZCBEb2N1bWVudHM6ICR7Y29udGV4dC5kb2N1bWVudENvbnRleHQuc2xpY2UoMCwgNSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIG1lZGljYWwgZW50aXRpZXMgc3VtbWFyeVxuICAgIGlmIChjb250ZXh0Lm1lZGljYWxFbnRpdGllcyAmJiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBlbnRpdHlTdW1tYXJ5ID0gdGhpcy5zdW1tYXJpemVNZWRpY2FsRW50aXRpZXMoY29udGV4dC5tZWRpY2FsRW50aXRpZXMpO1xuICAgICAgcGFydHMucHVzaChgTWVkaWNhbCBDb250ZXh0OiAke2VudGl0eVN1bW1hcnl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGlmIChjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbiA9IGNvbnRleHQucmVjZW50TWVzc2FnZXNcbiAgICAgICAgLm1hcChtc2cgPT4gYCR7bXNnLnJvbGUgPT09ICd1c2VyJyA/ICdVc2VyJyA6ICdBc3Npc3RhbnQnfTogJHttc2cuY29udGVudH1gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICBcbiAgICAgIHBhcnRzLnB1c2goYFJlY2VudCBDb252ZXJzYXRpb246XFxuJHtjb252ZXJzYXRpb259YCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBwYXJ0cy5qb2luKCdcXG5cXG4nKTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgc3VtbWFyaXplTWVkaWNhbEVudGl0aWVzKGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4pOiBzdHJpbmcge1xuICAgIGNvbnN0IGdyb3VwZWQgPSBlbnRpdGllcy5yZWR1Y2UoKGFjYywgZW50aXR5KSA9PiB7XG4gICAgICBpZiAoIWFjY1tlbnRpdHkubGFiZWxdKSB7XG4gICAgICAgIGFjY1tlbnRpdHkubGFiZWxdID0gW107XG4gICAgICB9XG4gICAgICBhY2NbZW50aXR5LmxhYmVsXS5wdXNoKGVudGl0eS50ZXh0KTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nW10+KTtcbiAgICBcbiAgICBjb25zdCBzdW1tYXJ5ID0gT2JqZWN0LmVudHJpZXMoZ3JvdXBlZClcbiAgICAgIC5tYXAoKFtsYWJlbCwgdGV4dHNdKSA9PiB7XG4gICAgICAgIGNvbnN0IHVuaXF1ZSA9IFsuLi5uZXcgU2V0KHRleHRzKV0uc2xpY2UoMCwgNSk7XG4gICAgICAgIHJldHVybiBgJHtsYWJlbH06ICR7dW5pcXVlLmpvaW4oJywgJyl9YDtcbiAgICAgIH0pXG4gICAgICAuam9pbignOyAnKTtcbiAgICBcbiAgICByZXR1cm4gc3VtbWFyeTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyhtZXNzYWdlczogTWVzc2FnZVtdKTogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+IHtcbiAgICBjb25zdCBlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+ID0gW107XG4gICAgXG4gICAgLy8gU2ltcGxlIGV4dHJhY3Rpb24gLSBsb29rIGZvciBwYXR0ZXJuc1xuICAgIGNvbnN0IHBhdHRlcm5zID0ge1xuICAgICAgTUVESUNBVElPTjogL1xcYihtZWRpY2F0aW9ufG1lZGljaW5lfGRydWd8cHJlc2NyaXB0aW9uKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBDT05ESVRJT046IC9cXGIoZGlhZ25vc2lzfGNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBTWU1QVE9NOiAvXFxiKHN5bXB0b218Y29tcGxhaW4pOlxccyooW14sLl0rKS9naSxcbiAgICB9O1xuICAgIFxuICAgIG1lc3NhZ2VzLmZvckVhY2gobXNnID0+IHtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKS5mb3JFYWNoKChbbGFiZWwsIHBhdHRlcm5dKSA9PiB7XG4gICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhtc2cuY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICAgICAgZW50aXRpZXMucHVzaCh7XG4gICAgICAgICAgICB0ZXh0OiBtYXRjaFsyXS50cmltKCksXG4gICAgICAgICAgICBsYWJlbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gZW50aXRpZXM7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiB7XG4gICAgY29uc3QgZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiA9IFtdO1xuICAgIFxuICAgIC8vIExvb2sgZm9yIG1lZGljYWwgdGVybXMgaW4gdGhlIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0ge1xuICAgICAgTUVESUNBVElPTjogWydtZWRpY2F0aW9uJywgJ3ByZXNjcmliZWQnLCAnZG9zYWdlJywgJ21nJywgJ3RhYmxldHMnXSxcbiAgICAgIENPTkRJVElPTjogWydkaWFnbm9zaXMnLCAnY29uZGl0aW9uJywgJ3N5bmRyb21lJywgJ2Rpc2Vhc2UnXSxcbiAgICAgIFBST0NFRFVSRTogWydzdXJnZXJ5JywgJ3Byb2NlZHVyZScsICd0ZXN0JywgJ2V4YW1pbmF0aW9uJ10sXG4gICAgICBTWU1QVE9NOiBbJ3BhaW4nLCAnZmV2ZXInLCAnbmF1c2VhJywgJ2ZhdGlndWUnXVxuICAgIH07XG4gICAgXG4gICAgT2JqZWN0LmVudHJpZXMobWVkaWNhbFRlcm1zKS5mb3JFYWNoKChbbGFiZWwsIHRlcm1zXSkgPT4ge1xuICAgICAgdGVybXMuZm9yRWFjaCh0ZXJtID0+IHtcbiAgICAgICAgaWYgKGNvbnRlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHNlbnRlbmNlIGNvbnRhaW5pbmcgdGhlIHRlcm1cbiAgICAgICAgICBjb25zdCBzZW50ZW5jZXMgPSBjb250ZW50LnNwbGl0KC9bLiE/XS8pO1xuICAgICAgICAgIHNlbnRlbmNlcy5mb3JFYWNoKHNlbnRlbmNlID0+IHtcbiAgICAgICAgICAgIGlmIChzZW50ZW5jZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRlcm0pKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IHNlbnRlbmNlLnRyaW0oKS5zdWJzdHJpbmcoMCwgMTAwKTtcbiAgICAgICAgICAgICAgaWYgKGV4dHJhY3RlZCkge1xuICAgICAgICAgICAgICAgIGVudGl0aWVzLnB1c2goeyB0ZXh0OiBleHRyYWN0ZWQsIGxhYmVsIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiBlbnRpdGllcztcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgYXN5bmMgcGVyc2lzdENvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcsIGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAvLyBVcGRhdGUgc2Vzc2lvbiB3aXRoIGxhdGVzdCBjb250ZXh0IG1ldGFkYXRhXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgJHNldDoge1xuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogY29udGV4dC5wYXRpZW50Q29udGV4dCxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogY29udGV4dC5kb2N1bWVudENvbnRleHQsXG4gICAgICAgICdtZXRhZGF0YS5sYXN0RW50aXRpZXMnOiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcz8uc2xpY2UoLTEwKSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IGNvbnRleHQucmVjZW50TWVzc2FnZXNbY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggLSAxXT8uY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyBzZXNzaW9uSWQgfSksXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIFxuICBzdGF0aWMgY2xlYXJDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgdGhpcy5jb250ZXh0cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgfVxuICBcbiAgc3RhdGljIGNsZWFyQWxsQ29udGV4dHMoKSB7XG4gICAgdGhpcy5jb250ZXh0cy5jbGVhcigpO1xuICB9XG4gIFxuICBzdGF0aWMgZ2V0Q29udGV4dFN0YXRzKHNlc3Npb25JZDogc3RyaW5nKTogeyBzaXplOiBudW1iZXI7IG1lc3NhZ2VzOiBudW1iZXI7IHRva2VuczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzaXplOiB0aGlzLmNvbnRleHRzLnNpemUsXG4gICAgICBtZXNzYWdlczogY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGgsXG4gICAgICB0b2tlbnM6IGNvbnRleHQudG90YWxUb2tlbnNcbiAgICB9O1xuICB9XG59IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAganNvbnJwYzogJzIuMCc7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXJhbXM6IGFueTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIE1DUFJlc3BvbnNlIHtcbiAganNvbnJwYzogJzIuMCc7XG4gIHJlc3VsdD86IGFueTtcbiAgZXJyb3I/OiB7XG4gICAgY29kZTogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgfTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEFpZGJveFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDInKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgbmFtZTogJ21ldGVvci1haWRib3gtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+PpSBBaWRib3ggTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuXG4gICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcblxuICAgICAgLy8gVGVzdCBieSBsaXN0aW5nIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEFpZGJveCBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgIFxuICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEF2YWlsYWJsZSBBaWRib3ggdG9vbHM6Jyk7XG4gICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBjb25uZWN0IHRvIEFpZGJveCBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQWlkYm94IE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmVcbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFNlbmRpbmcgcmVxdWVzdCB0byBBaWRib3g6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudFxuICAgICAgY29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbWNwLXNlc3Npb24taWQnKTtcbiAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uSWQgPSByZXNwb25zZVNlc3Npb25JZDtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfj6UgUmVjZWl2ZWQgQWlkYm94IHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYOKchSBBaWRib3ggcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgQWlkYm94IHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBub3RpZmljYXRpb24gPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtc1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxpc3RUb29scygpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICB9XG5cbiAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICB0aGlzLnNlc3Npb25JZCA9IG51bGw7XG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gICAgY29uc29sZS5sb2coJ/Cfj6UgRGlzY29ubmVjdGVkIGZyb20gQWlkYm94IE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBBaWRib3ggRkhJUiBvcGVyYXRpb25zXG5leHBvcnQgaW50ZXJmYWNlIEFpZGJveEZISVJPcGVyYXRpb25zIHtcbiAgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZVBhdGllbnQocGF0aWVudERhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgdXBkYXRlUGF0aWVudChwYXRpZW50SWQ6IHN0cmluZywgdXBkYXRlczogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdChtZWRpY2F0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZUVuY291bnRlcihlbmNvdW50ZXJEYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBaWRib3hPcGVyYXRpb25zKGNvbm5lY3Rpb246IEFpZGJveFNlcnZlckNvbm5lY3Rpb24pOiBBaWRib3hGSElST3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94U2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50RGV0YWlscycsIHsgcGF0aWVudElkIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVQYXRpZW50KHBhdGllbnREYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZVBhdGllbnQnLCBwYXRpZW50RGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVBhdGllbnQocGF0aWVudElkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94VXBkYXRlUGF0aWVudCcsIHsgcGF0aWVudElkLCAuLi51cGRhdGVzIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudE9ic2VydmF0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlT2JzZXJ2YXRpb24nLCBvYnNlcnZhdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QobWVkaWNhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLCBtZWRpY2F0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlQ29uZGl0aW9uJywgY29uZGl0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlRW5jb3VudGVyKGVuY291bnRlckRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlRW5jb3VudGVyJywgZW5jb3VudGVyRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfVxuICB9O1xufSIsImludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAgICBqc29ucnBjOiAnMi4wJztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBwYXJhbXM6IGFueTtcbiAgICBpZDogc3RyaW5nIHwgbnVtYmVyO1xuICB9XG4gIFxuICBpbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICAgIGpzb25ycGM6ICcyLjAnO1xuICAgIHJlc3VsdD86IGFueTtcbiAgICBlcnJvcj86IHtcbiAgICAgIGNvZGU6IG51bWJlcjtcbiAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICB9O1xuICAgIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIH1cbiAgXG4gIGV4cG9ydCBjbGFzcyBFcGljU2VydmVyQ29ubmVjdGlvbiB7XG4gICAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgcmVxdWVzdElkID0gMTtcbiAgXG4gICAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMycpIHtcbiAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gICAgfVxuICBcbiAgICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgICBcbiAgICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfTogJHtoZWFsdGhDaGVjay5lcnJvcn1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgICAgbmFtZTogJ21ldGVvci1lcGljLWNsaWVudCcsXG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEVwaWMgTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuICBcbiAgICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcbiAgXG4gICAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEF2YWlsYWJsZSBFcGljIHRvb2xzOicpO1xuICAgICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gIFxuICAgICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gY29ubmVjdCB0byBFcGljIE1DUCBTZXJ2ZXI6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vaGVhbHRoYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgRXBpYyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXJhbXMsXG4gICAgICAgIGlkXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9O1xuICBcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBTZW5kaW5nIHJlcXVlc3QgdG8gRXBpYyBNQ1A6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG4gIFxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIFJlY2VpdmVkIEVwaWMgc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICBcbiAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyByZXF1ZXN0ICR7bWV0aG9kfSBzdWNjZXNzZnVsYCk7XG4gICAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVwaWMgcmVxdWVzdCBmYWlsZWQgZm9yIG1ldGhvZCAke21ldGhvZH06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgcGFyYW1zXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfTtcbiAgXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgICAgfVxuICBcbiAgICAgICAgYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEVwaWMgbm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICB9XG4gIFxuICAgIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgfVxuICBcbiAgICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgICBuYW1lLFxuICAgICAgICBhcmd1bWVudHM6IGFyZ3NcbiAgICAgIH0pO1xuICAgIH1cbiAgXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgY29uc29sZS5sb2coJ/Cfj6UgRGlzY29ubmVjdGVkIGZyb20gRXBpYyBNQ1AgU2VydmVyJyk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFcGljIEZISVIgb3BlcmF0aW9ucyBpbnRlcmZhY2VcbiAgZXhwb3J0IGludGVyZmFjZSBFcGljRkhJUk9wZXJhdGlvbnMge1xuICAgIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFcGljT3BlcmF0aW9ucyhjb25uZWN0aW9uOiBFcGljU2VydmVyQ29ubmVjdGlvbik6IEVwaWNGSElST3BlcmF0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudERldGFpbHMnLCB7IHBhdGllbnRJZCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfVxuICAgIH07XG4gIH0iLCIvLyBpbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlci50c1xuaW1wb3J0IEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgeyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbiwgTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucywgY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnMgfSBmcm9tICcuL21lZGljYWxTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEFpZGJveFNlcnZlckNvbm5lY3Rpb24sIEFpZGJveEZISVJPcGVyYXRpb25zLCBjcmVhdGVBaWRib3hPcGVyYXRpb25zIH0gZnJvbSAnLi9haWRib3hTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEVwaWNTZXJ2ZXJDb25uZWN0aW9uLCBFcGljRkhJUk9wZXJhdGlvbnMsIGNyZWF0ZUVwaWNPcGVyYXRpb25zIH0gZnJvbSAnLi9lcGljU2VydmVyQ29ubmVjdGlvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTUNQQ2xpZW50Q29uZmlnIHtcbiAgcHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCc7XG4gIGFwaUtleTogc3RyaW5nO1xuICBvendlbGxFbmRwb2ludD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE1DUENsaWVudE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZTogTUNQQ2xpZW50TWFuYWdlcjtcbiAgcHJpdmF0ZSBhbnRocm9waWM/OiBBbnRocm9waWM7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIGNvbmZpZz86IE1DUENsaWVudENvbmZpZztcbiAgXG4gIC8vIE1lZGljYWwgTUNQIGNvbm5lY3Rpb24gKFN0cmVhbWFibGUgSFRUUClcbiAgcHJpdmF0ZSBtZWRpY2FsQ29ubmVjdGlvbj86IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIG1lZGljYWxPcGVyYXRpb25zPzogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBhdmFpbGFibGVUb29sczogYW55W10gPSBbXTtcblxuICAvLyBBaWRib3ggTUNQIGNvbm5lY3Rpb25cbiAgcHJpdmF0ZSBhaWRib3hDb25uZWN0aW9uPzogQWlkYm94U2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBhaWRib3hPcGVyYXRpb25zPzogQWlkYm94RkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgYWlkYm94VG9vbHM6IGFueVtdID0gW107XG5cbiAgLy8gRXBpYyBNQ1AgY29ubmVjdGlvblxuICBwcml2YXRlIGVwaWNDb25uZWN0aW9uPzogRXBpY1NlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgZXBpY09wZXJhdGlvbnM/OiBFcGljRkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgZXBpY1Rvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7fVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogTUNQQ2xpZW50TWFuYWdlciB7XG4gICAgaWYgKCFNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlKSB7XG4gICAgICBNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlID0gbmV3IE1DUENsaWVudE1hbmFnZXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIE1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZShjb25maWc6IE1DUENsaWVudENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKCfwn6SWIEluaXRpYWxpemluZyBNQ1AgQ2xpZW50IHdpdGggSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24nKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIHRyeSB7XG4gICAgICBpZiAoY29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJykge1xuICAgICAgICBjb25zb2xlLmxvZygnQ3JlYXRpbmcgQW50aHJvcGljIGNsaWVudCB3aXRoIG5hdGl2ZSB0b29sIGNhbGxpbmcgc3VwcG9ydC4uLicpO1xuICAgICAgICB0aGlzLmFudGhyb3BpYyA9IG5ldyBBbnRocm9waWMoe1xuICAgICAgICAgIGFwaUtleTogY29uZmlnLmFwaUtleSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQW50aHJvcGljIGNsaWVudCBpbml0aWFsaXplZCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIE1DUCBDbGllbnQgcmVhZHkgd2l0aCBwcm92aWRlcjogJHtjb25maWcucHJvdmlkZXJ9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBNQ1AgY2xpZW50OicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIENvbm5lY3QgdG8gbWVkaWNhbCBNQ1Agc2VydmVyIGFuZCBnZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvTWVkaWNhbFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICAgIGNvbnN0IG1jcFNlcnZlclVybCA9IHNldHRpbmdzPy5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDEnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBhdDogJHttY3BTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMubWVkaWNhbENvbm5lY3Rpb24gPSBuZXcgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24obWNwU2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5tZWRpY2FsT3BlcmF0aW9ucyA9IGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKHRoaXMubWVkaWNhbENvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbm5lY3RlZCB3aXRoICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IG1lZGljYWwgdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBNZWRpY2FsIHRvb2wgbmFtZXM6ICR7dGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIE1lZGljYWwgTUNQIFNlcnZlciBIVFRQIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9BaWRib3hTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBhaWRib3hTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDInO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGF0OiAke2FpZGJveFNlcnZlclVybH1gKTtcbiAgICAgIFxuICAgICAgdGhpcy5haWRib3hDb25uZWN0aW9uID0gbmV3IEFpZGJveFNlcnZlckNvbm5lY3Rpb24oYWlkYm94U2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLmFpZGJveE9wZXJhdGlvbnMgPSBjcmVhdGVBaWRib3hPcGVyYXRpb25zKHRoaXMuYWlkYm94Q29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBBaWRib3ggdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5haWRib3hDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5haWRib3hUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbm5lY3RlZCB0byBBaWRib3ggd2l0aCAke3RoaXMuYWlkYm94VG9vbHMubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEFpZGJveCB0b29sIG5hbWVzOiAke3RoaXMuYWlkYm94VG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5haWRib3hUb29scyk7XG4gICAgICBcbiAgICAgIHRoaXMubG9nQXZhaWxhYmxlVG9vbHMoKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgQWlkYm94IE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb0VwaWNTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBlcGljU2VydmVyVXJsID0gc2V0dGluZ3M/LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMyc7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGF0OiAke2VwaWNTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMuZXBpY0Nvbm5lY3Rpb24gPSBuZXcgRXBpY1NlcnZlckNvbm5lY3Rpb24oZXBpY1NlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMuZXBpY09wZXJhdGlvbnMgPSBjcmVhdGVFcGljT3BlcmF0aW9ucyh0aGlzLmVwaWNDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IEVwaWMgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuZXBpY1Rvb2xzID0gdG9vbHNSZXN1bHQudG9vbHMgfHwgW107XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgQ29ubmVjdGVkIHRvIEVwaWMgd2l0aCAke3RoaXMuZXBpY1Rvb2xzLmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBFcGljIHRvb2wgbmFtZXM6ICR7dGhpcy5lcGljVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5lcGljVG9vbHMpO1xuICAgICAgXG4gICAgICB0aGlzLmxvZ0F2YWlsYWJsZVRvb2xzKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBNZXJnZSB0b29scyBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgcHJpdmF0ZSBtZXJnZVRvb2xzVW5pcXVlKGV4aXN0aW5nVG9vbHM6IGFueVtdLCBuZXdUb29sczogYW55W10pOiBhbnlbXSB7XG4gICAgY29uc29sZS5sb2coYPCflKcgTWVyZ2luZyB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke25ld1Rvb2xzLmxlbmd0aH0gbmV3YCk7XG4gICAgXG4gICAgY29uc3QgdG9vbE5hbWVTZXQgPSBuZXcgU2V0KGV4aXN0aW5nVG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG4gICAgY29uc3QgdW5pcXVlTmV3VG9vbHMgPSBuZXdUb29scy5maWx0ZXIodG9vbCA9PiB7XG4gICAgICBpZiAodG9vbE5hbWVTZXQuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRHVwbGljYXRlIHRvb2wgbmFtZSBmb3VuZDogJHt0b29sLm5hbWV9IC0gc2tpcHBpbmcgZHVwbGljYXRlYCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHRvb2xOYW1lU2V0LmFkZCh0b29sLm5hbWUpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgbWVyZ2VkVG9vbHMgPSBbLi4uZXhpc3RpbmdUb29scywgLi4udW5pcXVlTmV3VG9vbHNdO1xuICAgIGNvbnNvbGUubG9nKGDwn5SnIE1lcmdlZCB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke3VuaXF1ZU5ld1Rvb2xzLmxlbmd0aH0gbmV3ID0gJHttZXJnZWRUb29scy5sZW5ndGh9IHRvdGFsYCk7XG4gICAgXG4gICAgcmV0dXJuIG1lcmdlZFRvb2xzO1xuICB9XG5cbi8vIEZpeCBmb3IgaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMgLSBSZXBsYWNlIHRoZSBsb2dBdmFpbGFibGVUb29scyBtZXRob2RcblxucHJpdmF0ZSBsb2dBdmFpbGFibGVUb29scygpOiB2b2lkIHtcbiAgY29uc29sZS5sb2coJ1xcbvCflKcgQXZhaWxhYmxlIFRvb2xzIGZvciBJbnRlbGxpZ2VudCBTZWxlY3Rpb246Jyk7XG4gIFxuICAvLyBTZXBhcmF0ZSB0b29scyBieSBhY3R1YWwgc291cmNlL3R5cGUsIG5vdCBieSBwYXR0ZXJuIG1hdGNoaW5nXG4gIGNvbnN0IGVwaWNUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpXG4gICk7XG4gIFxuICBjb25zdCBhaWRib3hUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdGhpcy5pc0FpZGJveEZISVJUb29sKHQpICYmICF0Lm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJylcbiAgKTtcbiAgXG4gIGNvbnN0IGRvY3VtZW50VG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNEb2N1bWVudFRvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IGFuYWx5c2lzVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNBbmFseXNpc1Rvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IG90aGVyVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgICFlcGljVG9vbHMuaW5jbHVkZXModCkgJiYgXG4gICAgIWFpZGJveFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFkb2N1bWVudFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFhbmFseXNpc1Rvb2xzLmluY2x1ZGVzKHQpXG4gICk7XG4gIFxuICBpZiAoYWlkYm94VG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn4+lIEFpZGJveCBGSElSIFRvb2xzOicpO1xuICAgIGFpZGJveFRvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChlcGljVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn4+lIEVwaWMgRUhSIFRvb2xzOicpO1xuICAgIGVwaWNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoZG9jdW1lbnRUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgRG9jdW1lbnQgVG9vbHM6Jyk7XG4gICAgZG9jdW1lbnRUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoYW5hbHlzaXNUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/CflI0gU2VhcmNoICYgQW5hbHlzaXMgVG9vbHM6Jyk7XG4gICAgYW5hbHlzaXNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAob3RoZXJUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/CflKcgT3RoZXIgVG9vbHM6Jyk7XG4gICAgb3RoZXJUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu8J+noCBDbGF1ZGUgd2lsbCBpbnRlbGxpZ2VudGx5IHNlbGVjdCBmcm9tICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IHRvdGFsIHRvb2xzIGJhc2VkIG9uIHVzZXIgcXVlcmllc2ApO1xuICBcbiAgLy8gRGVidWc6IENoZWNrIGZvciBkdXBsaWNhdGVzXG4gIHRoaXMuZGVidWdUb29sRHVwbGljYXRlcygpO1xufVxuXG4vLyBBZGQgdGhlc2UgaGVscGVyIG1ldGhvZHMgdG8gTUNQQ2xpZW50TWFuYWdlciBjbGFzc1xucHJpdmF0ZSBpc0FpZGJveEZISVJUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhaWRib3hGSElSVG9vbE5hbWVzID0gW1xuICAgICdzZWFyY2hQYXRpZW50cycsICdnZXRQYXRpZW50RGV0YWlscycsICdjcmVhdGVQYXRpZW50JywgJ3VwZGF0ZVBhdGllbnQnLFxuICAgICdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2NyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2NyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFpZGJveEZISVJUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0RvY3VtZW50VG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgZG9jdW1lbnRUb29sTmFtZXMgPSBbXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnY2h1bmtBbmRFbWJlZERvY3VtZW50JywgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gZG9jdW1lbnRUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0FuYWx5c2lzVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYW5hbHlzaXNUb29sTmFtZXMgPSBbXG4gICAgJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsICdmaW5kU2ltaWxhckNhc2VzJywgJ2dldE1lZGljYWxJbnNpZ2h0cycsXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBhbmFseXNpc1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG4gIC8vIERlYnVnIG1ldGhvZCB0byBpZGVudGlmeSBkdXBsaWNhdGUgdG9vbHNcbiAgcHJpdmF0ZSBkZWJ1Z1Rvb2xEdXBsaWNhdGVzKCk6IHZvaWQge1xuICAgIGNvbnN0IHRvb2xOYW1lcyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKTtcbiAgICBjb25zdCBuYW1lQ291bnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAgIFxuICAgIHRvb2xOYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgbmFtZUNvdW50LnNldChuYW1lLCAobmFtZUNvdW50LmdldChuYW1lKSB8fCAwKSArIDEpO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGR1cGxpY2F0ZXMgPSBBcnJheS5mcm9tKG5hbWVDb3VudC5lbnRyaWVzKCkpXG4gICAgICAuZmlsdGVyKChbbmFtZSwgY291bnRdKSA9PiBjb3VudCA+IDEpO1xuICAgIFxuICAgIGlmIChkdXBsaWNhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEVVBMSUNBVEUgVE9PTCBOQU1FUyBGT1VORDonKTtcbiAgICAgIGR1cGxpY2F0ZXMuZm9yRWFjaCgoW25hbWUsIGNvdW50XSkgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgIOKAoiAke25hbWV9OiBhcHBlYXJzICR7Y291bnR9IHRpbWVzYCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgdG9vbCBuYW1lcyBhcmUgdW5pcXVlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBzcGVjaWZpZWQgZGF0YSBzb3VyY2VcbiAgcHJpdmF0ZSBmaWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29sczogYW55W10sIGRhdGFTb3VyY2U6IHN0cmluZyk6IGFueVtdIHtcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtb25nb2RiJykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIE1vbmdvREIvQXRsYXMgLSByZXR1cm4gb25seSBkb2N1bWVudCB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0RvY3VtZW50JykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnc2VhcmNoJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygndXBsb2FkJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZXh0cmFjdCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ01lZGljYWwnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ1NpbWlsYXInKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0luc2lnaHQnKSB8fFxuICAgICAgICAodG9vbC5uYW1lLmluY2x1ZGVzKCdzZWFyY2gnKSAmJiAhdG9vbC5uYW1lLmluY2x1ZGVzKCdQYXRpZW50JykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2ZoaXInKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBBaWRib3ggLSByZXR1cm4gb25seSBGSElSIHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgICh0b29sLm5hbWUuaW5jbHVkZXMoJ1BhdGllbnQnKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnT2JzZXJ2YXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnTWVkaWNhdGlvbicpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdDb25kaXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnRW5jb3VudGVyJykgfHxcbiAgICAgICAgIHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJykgJiZcbiAgICAgICAgIXRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgRXBpYyAtIHJldHVybiBvbmx5IEVwaWMgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudERldGFpbHMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRNZWRpY2F0aW9ucycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudENvbmRpdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRFbmNvdW50ZXJzJykgfHxcbiAgICAgICAgKHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJyAmJiB0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICAvLyBObyBzcGVjaWZpYyBwcmVmZXJlbmNlLCByZXR1cm4gYWxsIHRvb2xzXG4gICAgcmV0dXJuIHRvb2xzO1xuICB9XG5cbiAgLy8gQW5hbHl6ZSBxdWVyeSB0byB1bmRlcnN0YW5kIHVzZXIncyBpbnRlbnQgYWJvdXQgZGF0YSBzb3VyY2VzXG4gIHByaXZhdGUgYW5hbHl6ZVF1ZXJ5SW50ZW50KHF1ZXJ5OiBzdHJpbmcpOiB7IGRhdGFTb3VyY2U/OiBzdHJpbmc7IGludGVudD86IHN0cmluZyB9IHtcbiAgICBjb25zdCBsb3dlclF1ZXJ5ID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZXhwbGljaXQgZGF0YSBzb3VyY2UgbWVudGlvbnNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnZXBpYycpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2VocicpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnRXBpYyBFSFInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggRXBpYyBFSFIgcGF0aWVudCBkYXRhJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ21vbmdvZGInKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcycsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCB1cGxvYWRlZCBkb2N1bWVudHMgYW5kIG1lZGljYWwgcmVjb3JkcydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhaWRib3gnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdBaWRib3ggRkhJUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBzdHJ1Y3R1cmVkIHBhdGllbnQgZGF0YSdcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBkb2N1bWVudC1yZWxhdGVkIHRlcm1zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygndXBsb2FkJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmlsZScpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcyAoZG9jdW1lbnRzKScsXG4gICAgICAgIGludGVudDogJ1dvcmsgd2l0aCB1cGxvYWRlZCBtZWRpY2FsIGRvY3VtZW50cydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBwYXRpZW50IHNlYXJjaCBwYXR0ZXJuc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdzZWFyY2ggZm9yIHBhdGllbnQnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaW5kIHBhdGllbnQnKSkge1xuICAgICAgLy8gRGVmYXVsdCB0byBFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzIHVubGVzcyBzcGVjaWZpZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdFcGljIEVIUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBmb3IgcGF0aWVudCBpbmZvcm1hdGlvbidcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIC8vIENvbnZlcnQgdG9vbHMgdG8gQW50aHJvcGljIGZvcm1hdCB3aXRoIHN0cmljdCBkZWR1cGxpY2F0aW9uXG4gIHByaXZhdGUgZ2V0QW50aHJvcGljVG9vbHMoKTogYW55W10ge1xuICAgIC8vIFVzZSBNYXAgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgYnkgdG9vbCBuYW1lXG4gICAgY29uc3QgdW5pcXVlVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgYW55PigpO1xuICAgIFxuICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgIGlmICghdW5pcXVlVG9vbHMuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgdW5pcXVlVG9vbHMuc2V0KHRvb2wubmFtZSwge1xuICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICBpbnB1dF9zY2hlbWE6IHtcbiAgICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB0b29sLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIHx8IHt9LFxuICAgICAgICAgICAgcmVxdWlyZWQ6IHRvb2wuaW5wdXRTY2hlbWE/LnJlcXVpcmVkIHx8IFtdXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFNraXBwaW5nIGR1cGxpY2F0ZSB0b29sIGluIEFudGhyb3BpYyBmb3JtYXQ6ICR7dG9vbC5uYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHRvb2xzQXJyYXkgPSBBcnJheS5mcm9tKHVuaXF1ZVRvb2xzLnZhbHVlcygpKTtcbiAgICBjb25zb2xlLmxvZyhg8J+UpyBQcmVwYXJlZCAke3Rvb2xzQXJyYXkubGVuZ3RofSB1bmlxdWUgdG9vbHMgZm9yIEFudGhyb3BpYyAoZnJvbSAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSB0b3RhbClgKTtcbiAgICBcbiAgICByZXR1cm4gdG9vbHNBcnJheTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIHRvb2xzIGJlZm9yZSBzZW5kaW5nIHRvIEFudGhyb3BpYyAoYWRkaXRpb25hbCBzYWZldHkgY2hlY2spXG4gIHByaXZhdGUgdmFsaWRhdGVUb29sc0ZvckFudGhyb3BpYygpOiBhbnlbXSB7XG4gICAgY29uc3QgdG9vbHMgPSB0aGlzLmdldEFudGhyb3BpY1Rvb2xzKCk7XG4gICAgXG4gICAgLy8gRmluYWwgY2hlY2sgZm9yIGR1cGxpY2F0ZXNcbiAgICBjb25zdCBuYW1lU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgdmFsaWRUb29sczogYW55W10gPSBbXTtcbiAgICBcbiAgICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgICAgaWYgKCFuYW1lU2V0Lmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIG5hbWVTZXQuYWRkKHRvb2wubmFtZSk7XG4gICAgICAgIHZhbGlkVG9vbHMucHVzaCh0b29sKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBDUklUSUNBTDogRHVwbGljYXRlIHRvb2wgZm91bmQgaW4gZmluYWwgdmFsaWRhdGlvbjogJHt0b29sLm5hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgaWYgKHZhbGlkVG9vbHMubGVuZ3RoICE9PSB0b29scy5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg8J+nuSBSZW1vdmVkICR7dG9vbHMubGVuZ3RoIC0gdmFsaWRUb29scy5sZW5ndGh9IGR1cGxpY2F0ZSB0b29scyBpbiBmaW5hbCB2YWxpZGF0aW9uYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDinIUgRmluYWwgdmFsaWRhdGlvbjogJHt2YWxpZFRvb2xzLmxlbmd0aH0gdW5pcXVlIHRvb2xzIHJlYWR5IGZvciBBbnRocm9waWNgKTtcbiAgICByZXR1cm4gdmFsaWRUb29scztcbiAgfVxuXG4gIC8vIFJvdXRlIHRvb2wgY2FsbHMgdG8gYXBwcm9wcmlhdGUgTUNQIHNlcnZlclxuLy8gRml4IGZvciBpbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlci50c1xuLy8gUmVwbGFjZSB0aGUgY2FsbE1DUFRvb2wgbWV0aG9kIHdpdGggcHJvcGVyIHJvdXRpbmdcblxuLy8gRml4ZWQgY2FsbE1DUFRvb2wgbWV0aG9kIGZvciBpbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlci50c1xuLy8gUmVwbGFjZSB0aGUgZXhpc3RpbmcgY2FsbE1DUFRvb2wgbWV0aG9kIHdpdGggdGhpcyBjb3JyZWN0ZWQgdmVyc2lvblxuXG5wdWJsaWMgYXN5bmMgY2FsbE1DUFRvb2wodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc29sZS5sb2coYPCflKcgUm91dGluZyB0b29sOiAke3Rvb2xOYW1lfSB3aXRoIGFyZ3M6YCwgSlNPTi5zdHJpbmdpZnkoYXJncywgbnVsbCwgMikpO1xuICBcbiAgLy8gRXBpYyB0b29scyAtIE1VU1QgZ28gdG8gRXBpYyBNQ1AgU2VydmVyIChwb3J0IDMwMDMpXG4gIGNvbnN0IGVwaWNUb29sTmFtZXMgPSBbXG4gICAgJ2VwaWNTZWFyY2hQYXRpZW50cycsIFxuICAgICdlcGljR2V0UGF0aWVudERldGFpbHMnLFxuICAgICdlcGljR2V0UGF0aWVudE9ic2VydmF0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudE1lZGljYXRpb25zJywgXG4gICAgJ2VwaWNHZXRQYXRpZW50Q29uZGl0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudEVuY291bnRlcnMnXG4gIF07XG5cbiAgaWYgKGVwaWNUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgRXBpYyB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+PpSBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIEVwaWMgTUNQIFNlcnZlciAocG9ydCAzMDAzKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBaWRib3ggdG9vbHMgLSBNVVNUIGdvIHRvIEFpZGJveCBNQ1AgU2VydmVyIChwb3J0IDMwMDIpXG4gIGNvbnN0IGFpZGJveFRvb2xOYW1lcyA9IFtcbiAgICAnYWlkYm94U2VhcmNoUGF0aWVudHMnLCAnYWlkYm94R2V0UGF0aWVudERldGFpbHMnLCAnYWlkYm94Q3JlYXRlUGF0aWVudCcsICdhaWRib3hVcGRhdGVQYXRpZW50JyxcbiAgICAnYWlkYm94R2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdhaWRib3hDcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2FpZGJveEdldFBhdGllbnRNZWRpY2F0aW9ucycsICdhaWRib3hDcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2FpZGJveEdldFBhdGllbnRDb25kaXRpb25zJywgJ2FpZGJveENyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2FpZGJveEdldFBhdGllbnRFbmNvdW50ZXJzJywgJ2FpZGJveENyZWF0ZUVuY291bnRlcidcbiAgXTtcblxuICBpZiAoYWlkYm94VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuICAgIGlmICghdGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBBaWRib3ggdG9vbHMnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYPCfj6UgUm91dGluZyAke3Rvb2xOYW1lfSB0byBBaWRib3ggTUNQIFNlcnZlciAocG9ydCAzMDAyKWApO1xuICAgIHRyeSB7XG4gICAgICAvLyBGSVhFRDogUGFzcyB0aGUgZnVsbCB0b29sIG5hbWUgd2l0aCAnYWlkYm94JyBwcmVmaXggdG8gdGhlIHNlcnZlclxuICAgICAgLy8gVGhlIHNlcnZlciBleHBlY3RzIHRoZSBmdWxsIHRvb2wgbmFtZXMgbGlrZSAnYWlkYm94Q3JlYXRlUGF0aWVudCdcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEFpZGJveCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVkaWNhbC9Eb2N1bWVudCB0b29scyAtIEdvIHRvIE1lZGljYWwgTUNQIFNlcnZlciAocG9ydCAzMDAxKVxuICBjb25zdCBtZWRpY2FsVG9vbE5hbWVzID0gW1xuICAgIC8vIERvY3VtZW50IHRvb2xzXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnZ2VuZXJhdGVFbWJlZGRpbmdMb2NhbCcsICdjaHVua0FuZEVtYmVkRG9jdW1lbnQnLFxuICAgIFxuICAgIC8vIEFuYWx5c2lzIHRvb2xzXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnZmluZFNpbWlsYXJDYXNlcycsICdhbmFseXplUGF0aWVudEhpc3RvcnknLFxuICAgICdnZXRNZWRpY2FsSW5zaWdodHMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCcsXG4gICAgXG4gICAgLy8gTGVnYWN5IHRvb2xzXG4gICAgJ3VwbG9hZF9kb2N1bWVudCcsICdleHRyYWN0X3RleHQnLCAnZXh0cmFjdF9tZWRpY2FsX2VudGl0aWVzJyxcbiAgICAnc2VhcmNoX2J5X2RpYWdub3NpcycsICdzZW1hbnRpY19zZWFyY2gnLCAnZ2V0X3BhdGllbnRfc3VtbWFyeSdcbiAgXTtcblxuICBpZiAobWVkaWNhbFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBtZWRpY2FsL2RvY3VtZW50IHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5OLIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gTWVkaWNhbCBNQ1AgU2VydmVyIChwb3J0IDMwMDEpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIE1lZGljYWwgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVua25vd24gdG9vbCAtIGNoZWNrIGlmIGl0IGV4aXN0cyBpbiBhdmFpbGFibGUgdG9vbHNcbiAgY29uc3QgYXZhaWxhYmxlVG9vbCA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmluZCh0ID0+IHQubmFtZSA9PT0gdG9vbE5hbWUpO1xuICBpZiAoIWF2YWlsYWJsZVRvb2wpIHtcbiAgICBjb25zdCBhdmFpbGFibGVUb29sTmFtZXMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJyR7dG9vbE5hbWV9JyBpcyBub3QgYXZhaWxhYmxlLiBBdmFpbGFibGUgdG9vbHM6ICR7YXZhaWxhYmxlVG9vbE5hbWVzfWApO1xuICB9XG5cbiAgLy8gSWYgd2UgZ2V0IGhlcmUsIHRoZSB0b29sIGV4aXN0cyBidXQgd2UgZG9uJ3Qga25vdyB3aGljaCBzZXJ2ZXIgaXQgYmVsb25ncyB0b1xuICAvLyBUaGlzIHNob3VsZG4ndCBoYXBwZW4gd2l0aCBwcm9wZXIgY2F0ZWdvcml6YXRpb25cbiAgY29uc29sZS53YXJuKGDimqDvuI8gVW5rbm93biB0b29sIHJvdXRpbmcgZm9yOiAke3Rvb2xOYW1lfS4gRGVmYXVsdGluZyB0byBNZWRpY2FsIHNlcnZlci5gKTtcbiAgXG4gIGlmICghdGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgfVxuICBcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIFRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseSAoZGVmYXVsdCByb3V0aW5nKWApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihg4p2MIFRvb2wgJHt0b29sTmFtZX0gZmFpbGVkIG9uIGRlZmF1bHQgcm91dGluZzpgLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgfVxufVxuXG4gIC8vIENvbnZlbmllbmNlIG1ldGhvZCBmb3IgRXBpYyB0b29sIGNhbGxzXG4gIHB1YmxpYyBhc3luYyBjYWxsRXBpY1Rvb2wodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYPCfj6UgQ2FsbGluZyBFcGljIHRvb2w6ICR7dG9vbE5hbWV9YCwgYXJncyk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhlYWx0aCBjaGVjayBmb3IgYWxsIHNlcnZlcnNcbiAgcHVibGljIGFzeW5jIGhlYWx0aENoZWNrKCk6IFByb21pc2U8eyBlcGljOiBib29sZWFuOyBhaWRib3g6IGJvb2xlYW47IG1lZGljYWw6IGJvb2xlYW4gfT4ge1xuICAgIGNvbnN0IGhlYWx0aCA9IHtcbiAgICAgIGVwaWM6IGZhbHNlLFxuICAgICAgYWlkYm94OiBmYWxzZSxcbiAgICAgIG1lZGljYWw6IGZhbHNlXG4gICAgfTtcblxuICAgIC8vIENoZWNrIEVwaWMgc2VydmVyXG4gICAgaWYgKHRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGVwaWNIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDAzL2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGguZXBpYyA9IGVwaWNIZWFsdGgub2s7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0VwaWMgaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgQWlkYm94IHNlcnZlclxuICAgIGlmICh0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGFpZGJveEhlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDIvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5haWRib3ggPSBhaWRib3hIZWFsdGgub2s7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0FpZGJveCBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBNZWRpY2FsIHNlcnZlclxuICAgIGlmICh0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBtZWRpY2FsSGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMS9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLm1lZGljYWwgPSBtZWRpY2FsSGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdNZWRpY2FsIGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBoZWFsdGg7XG4gIH1cblxuICAvLyBNYWluIGludGVsbGlnZW50IHF1ZXJ5IHByb2Nlc3NpbmcgbWV0aG9kXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKFxuICAgIHF1ZXJ5OiBzdHJpbmcsXG4gICAgY29udGV4dD86IHsgZG9jdW1lbnRJZD86IHN0cmluZzsgcGF0aWVudElkPzogc3RyaW5nOyBzZXNzaW9uSWQ/OiBzdHJpbmcgfVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkIHx8ICF0aGlzLmNvbmZpZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgQ2xpZW50IG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGDwn6egIFByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjogXCIke3F1ZXJ5fVwiYCk7XG5cbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJyAmJiB0aGlzLmFudGhyb3BpYykge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50KHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb25maWcucHJvdmlkZXIgPT09ICdvendlbGwnKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2Nlc3NXaXRoT3p3ZWxsSW50ZWxsaWdlbnQocXVlcnksIGNvbnRleHQpO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIExMTSBwcm92aWRlciBjb25maWd1cmVkJyk7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBxdWVyeSB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOicsIGVycm9yKTtcbiAgICAgIFxuICAgICAgLy8gSGFuZGxlIHNwZWNpZmljIGVycm9yIHR5cGVzXG4gICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA1MjkgfHwgZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ092ZXJsb2FkZWQnKSkge1xuICAgICAgICByZXR1cm4gJ0lcXCdtIGV4cGVyaWVuY2luZyBoaWdoIGRlbWFuZCByaWdodCBub3cuIFBsZWFzZSB0cnkgeW91ciBxdWVyeSBhZ2FpbiBpbiBhIG1vbWVudC4gVGhlIHN5c3RlbSBzaG91bGQgcmVzcG9uZCBub3JtYWxseSBhZnRlciBhIGJyaWVmIHdhaXQuJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgcmV0dXJuICdJXFwnbSBoYXZpbmcgdHJvdWJsZSBjb25uZWN0aW5nIHRvIHRoZSBtZWRpY2FsIGRhdGEgc3lzdGVtcy4gUGxlYXNlIGVuc3VyZSB0aGUgTUNQIHNlcnZlcnMgYXJlIHJ1bm5pbmcgYW5kIHRyeSBhZ2Fpbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0FQSScpKSB7XG4gICAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBBUEkgZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgYWdhaW4gaW4gYSBtb21lbnQuJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRm9yIGRldmVsb3BtZW50L2RlYnVnZ2luZ1xuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnKSB7XG4gICAgICAgIHJldHVybiBgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgcmVwaHJhc2luZyB5b3VyIHF1ZXN0aW9uIG9yIHRyeSBhZ2FpbiBpbiBhIG1vbWVudC4nO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFudGhyb3BpYyBuYXRpdmUgdG9vbCBjYWxsaW5nIHdpdGggaXRlcmF0aXZlIHN1cHBvcnRcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50KFxuICAgIHF1ZXJ5OiBzdHJpbmcsIFxuICAgIGNvbnRleHQ/OiBhbnlcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAvLyBVc2UgdmFsaWRhdGVkIHRvb2xzIHRvIHByZXZlbnQgZHVwbGljYXRlIGVycm9yc1xuICAgIGxldCB0b29scyA9IHRoaXMudmFsaWRhdGVUb29sc0ZvckFudGhyb3BpYygpO1xuICAgIFxuICAgIC8vIEFuYWx5emUgcXVlcnkgdG8gdW5kZXJzdGFuZCBkYXRhIHNvdXJjZSBpbnRlbnRcbiAgICBjb25zdCBxdWVyeUludGVudCA9IHRoaXMuYW5hbHl6ZVF1ZXJ5SW50ZW50KHF1ZXJ5KTtcbiAgICBcbiAgICAvLyBGaWx0ZXIgdG9vbHMgYmFzZWQgb24gdXNlcidzIGV4cGxpY2l0IGRhdGEgc291cmNlIHByZWZlcmVuY2VcbiAgICBpZiAocXVlcnlJbnRlbnQuZGF0YVNvdXJjZSkge1xuICAgICAgdG9vbHMgPSB0aGlzLmZpbHRlclRvb2xzQnlEYXRhU291cmNlKHRvb2xzLCBxdWVyeUludGVudC5kYXRhU291cmNlKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46vIEZpbHRlcmVkIHRvICR7dG9vbHMubGVuZ3RofSB0b29scyBiYXNlZCBvbiBkYXRhIHNvdXJjZTogJHtxdWVyeUludGVudC5kYXRhU291cmNlfWApO1xuICAgICAgY29uc29sZS5sb2coYPCflKcgQXZhaWxhYmxlIHRvb2xzIGFmdGVyIGZpbHRlcmluZzogJHt0b29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEJ1aWxkIGNvbnRleHQgaW5mb3JtYXRpb25cbiAgICBsZXQgY29udGV4dEluZm8gPSAnJztcbiAgICBpZiAoY29udGV4dD8ucGF0aWVudElkKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuQ3VycmVudCBwYXRpZW50IGNvbnRleHQ6ICR7Y29udGV4dC5wYXRpZW50SWR9YDtcbiAgICB9XG4gICAgaWYgKGNvbnRleHQ/LnNlc3Npb25JZCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblNlc3Npb24gY29udGV4dCBhdmFpbGFibGVgO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgcXVlcnkgaW50ZW50IHRvIGNvbnRleHRcbiAgICBpZiAocXVlcnlJbnRlbnQuZGF0YVNvdXJjZSkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblVzZXIgc3BlY2lmaWVkIGRhdGEgc291cmNlOiAke3F1ZXJ5SW50ZW50LmRhdGFTb3VyY2V9YDtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5SW50ZW50LmludGVudCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblF1ZXJ5IGludGVudDogJHtxdWVyeUludGVudC5pbnRlbnR9YDtcbiAgICB9XG5cbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIG1lZGljYWwgQUkgYXNzaXN0YW50IHdpdGggYWNjZXNzIHRvIG11bHRpcGxlIGhlYWx0aGNhcmUgZGF0YSBzeXN0ZW1zOlxuXG7wn4+lICoqRXBpYyBFSFIgVG9vbHMqKiAtIEZvciBFcGljIEVIUiBwYXRpZW50IGRhdGEsIG9ic2VydmF0aW9ucywgbWVkaWNhdGlvbnMsIGNvbmRpdGlvbnMsIGVuY291bnRlcnNcbvCfj6UgKipBaWRib3ggRkhJUiBUb29scyoqIC0gRm9yIEZISVItY29tcGxpYW50IHBhdGllbnQgZGF0YSwgb2JzZXJ2YXRpb25zLCBtZWRpY2F0aW9ucywgY29uZGl0aW9ucywgZW5jb3VudGVycyAgXG7wn5OEICoqTWVkaWNhbCBEb2N1bWVudCBUb29scyoqIC0gRm9yIGRvY3VtZW50IHVwbG9hZCwgc2VhcmNoLCBhbmQgbWVkaWNhbCBlbnRpdHkgZXh0cmFjdGlvbiAoTW9uZ29EQiBBdGxhcylcbvCflI0gKipTZW1hbnRpYyBTZWFyY2gqKiAtIEZvciBmaW5kaW5nIHNpbWlsYXIgY2FzZXMgYW5kIG1lZGljYWwgaW5zaWdodHMgKE1vbmdvREIgQXRsYXMpXG5cbioqQ1JJVElDQUw6IFBheSBhdHRlbnRpb24gdG8gd2hpY2ggZGF0YSBzb3VyY2UgdGhlIHVzZXIgbWVudGlvbnM6KipcblxuLSBJZiB1c2VyIG1lbnRpb25zIFwiRXBpY1wiIG9yIFwiRUhSXCIg4oaSIFVzZSBFcGljIEVIUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiQWlkYm94XCIgb3IgXCJGSElSXCIg4oaSIFVzZSBBaWRib3ggRkhJUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiTW9uZ29EQlwiLCBcIkF0bGFzXCIsIFwiZG9jdW1lbnRzXCIsIFwidXBsb2FkZWQgZmlsZXNcIiDihpIgVXNlIGRvY3VtZW50IHNlYXJjaCB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiZGlhZ25vc2lzIGluIE1vbmdvREJcIiDihpIgU2VhcmNoIGRvY3VtZW50cywgTk9UIEVwaWMvQWlkYm94XG4tIElmIG5vIHNwZWNpZmljIHNvdXJjZSBtZW50aW9uZWQg4oaSIENob29zZSBiYXNlZCBvbiBjb250ZXh0IChFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzLCBBaWRib3ggZm9yIEZISVIsIGRvY3VtZW50cyBmb3IgdXBsb2FkcylcblxuKipBdmFpbGFibGUgQ29udGV4dDoqKiR7Y29udGV4dEluZm99XG5cbioqSW5zdHJ1Y3Rpb25zOioqXG4xLiAqKkxJU1RFTiBUTyBVU0VSJ1MgREFUQSBTT1VSQ0UgUFJFRkVSRU5DRSoqIC0gSWYgdGhleSBzYXkgRXBpYywgdXNlIEVwaWMgdG9vbHM7IGlmIE1vbmdvREIvQXRsYXMsIHVzZSBkb2N1bWVudCB0b29sc1xuMi4gRm9yIEVwaWMvQWlkYm94IHF1ZXJpZXMsIHVzZSBwYXRpZW50IHNlYXJjaCBmaXJzdCB0byBnZXQgSURzLCB0aGVuIHNwZWNpZmljIGRhdGEgdG9vbHNcbjMuIEZvciBkb2N1bWVudCBxdWVyaWVzLCB1c2Ugc2VhcmNoIGFuZCB1cGxvYWQgdG9vbHNcbjQuIFByb3ZpZGUgY2xlYXIsIGhlbHBmdWwgbWVkaWNhbCBpbmZvcm1hdGlvblxuNS4gQWx3YXlzIGV4cGxhaW4gd2hhdCBkYXRhIHNvdXJjZXMgeW91J3JlIHVzaW5nXG5cbkJlIGludGVsbGlnZW50IGFib3V0IHRvb2wgc2VsZWN0aW9uIEFORCByZXNwZWN0IHRoZSB1c2VyJ3Mgc3BlY2lmaWVkIGRhdGEgc291cmNlLmA7XG5cbiAgICBsZXQgY29udmVyc2F0aW9uSGlzdG9yeTogYW55W10gPSBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHF1ZXJ5IH1dO1xuICAgIGxldCBmaW5hbFJlc3BvbnNlID0gJyc7XG4gICAgbGV0IGl0ZXJhdGlvbnMgPSAwO1xuICAgIGNvbnN0IG1heEl0ZXJhdGlvbnMgPSA3OyAvLyBSZWR1Y2VkIHRvIGF2b2lkIEFQSSBvdmVybG9hZFxuICAgIGNvbnN0IG1heFJldHJpZXMgPSAzO1xuXG4gICAgd2hpbGUgKGl0ZXJhdGlvbnMgPCBtYXhJdGVyYXRpb25zKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBJdGVyYXRpb24gJHtpdGVyYXRpb25zICsgMX0gLSBBc2tpbmcgQ2xhdWRlIHRvIGRlY2lkZSBvbiB0b29sc2ApO1xuICAgICAgY29uc29sZS5sb2coYPCflKcgVXNpbmcgJHt0b29scy5sZW5ndGh9IHZhbGlkYXRlZCB0b29sc2ApO1xuICAgICAgXG4gICAgICBsZXQgcmV0cnlDb3VudCA9IDA7XG4gICAgICBsZXQgcmVzcG9uc2U7XG4gICAgICBcbiAgICAgIC8vIEFkZCByZXRyeSBsb2dpYyBmb3IgQVBJIG92ZXJsb2FkXG4gICAgICB3aGlsZSAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXNwb25zZSA9IGF3YWl0IHRoaXMuYW50aHJvcGljIS5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgICAgICAgbW9kZWw6ICdjbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMicsXG4gICAgICAgICAgICBtYXhfdG9rZW5zOiAxMDAwLCAvLyBSZWR1Y2VkIHRvIGF2b2lkIG92ZXJsb2FkXG4gICAgICAgICAgICBzeXN0ZW06IHN5c3RlbVByb21wdCxcbiAgICAgICAgICAgIG1lc3NhZ2VzOiBjb252ZXJzYXRpb25IaXN0b3J5LFxuICAgICAgICAgICAgdG9vbHM6IHRvb2xzLFxuICAgICAgICAgICAgdG9vbF9jaG9pY2U6IHsgdHlwZTogJ2F1dG8nIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA1MjkgJiYgcmV0cnlDb3VudCA8IG1heFJldHJpZXMgLSAxKSB7XG4gICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IE1hdGgucG93KDIsIHJldHJ5Q291bnQpICogMTAwMDsgLy8gRXhwb25lbnRpYWwgYmFja29mZlxuICAgICAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gQW50aHJvcGljIEFQSSBvdmVybG9hZGVkLCByZXRyeWluZyBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7cmV0cnlDb3VudH0vJHttYXhSZXRyaWVzfSlgKTtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjsgLy8gUmUtdGhyb3cgaWYgbm90IHJldHJ5YWJsZSBvciBtYXggcmV0cmllcyByZWFjaGVkXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IHJlc3BvbnNlIGZyb20gQW50aHJvcGljIGFmdGVyIHJldHJpZXMnKTtcbiAgICAgIH1cblxuICAgICAgbGV0IGhhc1Rvb2xVc2UgPSBmYWxzZTtcbiAgICAgIGxldCBhc3Npc3RhbnRSZXNwb25zZTogYW55W10gPSBbXTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBjb250ZW50IG9mIHJlc3BvbnNlLmNvbnRlbnQpIHtcbiAgICAgICAgYXNzaXN0YW50UmVzcG9uc2UucHVzaChjb250ZW50KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChjb250ZW50LnR5cGUgPT09ICd0ZXh0Jykge1xuICAgICAgICAgIGZpbmFsUmVzcG9uc2UgKz0gY29udGVudC50ZXh0O1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5KsIENsYXVkZSBzYXlzOiAke2NvbnRlbnQudGV4dC5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb250ZW50LnR5cGUgPT09ICd0b29sX3VzZScpIHtcbiAgICAgICAgICBoYXNUb29sVXNlID0gdHJ1ZTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UpyBDbGF1ZGUgY2hvc2UgdG9vbDogJHtjb250ZW50Lm5hbWV9IHdpdGggYXJnczpgLCBjb250ZW50LmlucHV0KTtcbiAgICAgICAgICBcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdG9vbFJlc3VsdCA9IGF3YWl0IHRoaXMuY2FsbE1DUFRvb2woY29udGVudC5uYW1lLCBjb250ZW50LmlucHV0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgVG9vbCAke2NvbnRlbnQubmFtZX0gZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFkZCB0b29sIHJlc3VsdCB0byBjb252ZXJzYXRpb25cbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaChcbiAgICAgICAgICAgICAgeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogYXNzaXN0YW50UmVzcG9uc2UgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgICAgICBjb250ZW50OiBbe1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0b29sX3Jlc3VsdCcsXG4gICAgICAgICAgICAgICAgdG9vbF91c2VfaWQ6IGNvbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29udGVudDogdGhpcy5mb3JtYXRUb29sUmVzdWx0KHRvb2xSZXN1bHQpXG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgVG9vbCAke2NvbnRlbnQubmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKFxuICAgICAgICAgICAgICB7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBhc3Npc3RhbnRSZXNwb25zZSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goe1xuICAgICAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFt7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3Rvb2xfcmVzdWx0JyxcbiAgICAgICAgICAgICAgICB0b29sX3VzZV9pZDogY29udGVudC5pZCxcbiAgICAgICAgICAgICAgICBjb250ZW50OiBgRXJyb3IgZXhlY3V0aW5nIHRvb2w6ICR7ZXJyb3IubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgIGlzX2Vycm9yOiB0cnVlXG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2xlYXIgdGhlIGN1cnJlbnQgcmVzcG9uc2Ugc2luY2Ugd2UncmUgY29udGludWluZyB0aGUgY29udmVyc2F0aW9uXG4gICAgICAgICAgZmluYWxSZXNwb25zZSA9ICcnO1xuICAgICAgICAgIGJyZWFrOyAvLyBQcm9jZXNzIG9uZSB0b29sIGF0IGEgdGltZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghaGFzVG9vbFVzZSkge1xuICAgICAgICAvLyBDbGF1ZGUgZGlkbid0IHVzZSBhbnkgdG9vbHMsIHNvIGl0J3MgcHJvdmlkaW5nIGEgZmluYWwgYW5zd2VyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQ2xhdWRlIHByb3ZpZGVkIGZpbmFsIGFuc3dlciB3aXRob3V0IGFkZGl0aW9uYWwgdG9vbHMnKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGl0ZXJhdGlvbnMrKztcbiAgICB9XG5cbiAgICBpZiAoaXRlcmF0aW9ucyA+PSBtYXhJdGVyYXRpb25zKSB7XG4gICAgICBmaW5hbFJlc3BvbnNlICs9ICdcXG5cXG4qTm90ZTogUmVhY2hlZCBtYXhpbXVtIHRvb2wgaXRlcmF0aW9ucy4gUmVzcG9uc2UgbWF5IGJlIGluY29tcGxldGUuKic7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbmFsUmVzcG9uc2UgfHwgJ0kgd2FzIHVuYWJsZSB0byBwcm9jZXNzIHlvdXIgcmVxdWVzdCBjb21wbGV0ZWx5Lic7XG4gIH1cblxuICAvLyBGb3JtYXQgdG9vbCByZXN1bHRzIGZvciBDbGF1ZGVcbiAgcHJpdmF0ZSBmb3JtYXRUb29sUmVzdWx0KHJlc3VsdDogYW55KTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gSGFuZGxlIGRpZmZlcmVudCByZXN1bHQgZm9ybWF0c1xuICAgICAgaWYgKHJlc3VsdD8uY29udGVudD8uWzBdPy50ZXh0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudFswXS50ZXh0O1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBgVG9vbCByZXN1bHQgZm9ybWF0dGluZyBlcnJvcjogJHtlcnJvci5tZXNzYWdlfWA7XG4gICAgfVxuICB9XG5cbiAgLy8gT3p3ZWxsIGltcGxlbWVudGF0aW9uIHdpdGggaW50ZWxsaWdlbnQgcHJvbXB0aW5nXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudChcbiAgICBxdWVyeTogc3RyaW5nLCBcbiAgICBjb250ZXh0PzogYW55XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmNvbmZpZz8ub3p3ZWxsRW5kcG9pbnQgfHwgJ2h0dHBzOi8vYWkuYmx1ZWhpdmUuY29tL2FwaS92MS9jb21wbGV0aW9uJztcbiAgICBcbiAgICBjb25zdCBhdmFpbGFibGVUb29sc0Rlc2NyaXB0aW9uID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodG9vbCA9PiBcbiAgICAgIGAke3Rvb2wubmFtZX06ICR7dG9vbC5kZXNjcmlwdGlvbn1gXG4gICAgKS5qb2luKCdcXG4nKTtcbiAgICBcbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIG1lZGljYWwgQUkgYXNzaXN0YW50IHdpdGggYWNjZXNzIHRvIHRoZXNlIHRvb2xzOlxuXG4ke2F2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb259XG5cblRoZSB1c2VyJ3MgcXVlcnkgaXM6IFwiJHtxdWVyeX1cIlxuXG5CYXNlZCBvbiB0aGlzIHF1ZXJ5LCBkZXRlcm1pbmUgd2hhdCB0b29scyAoaWYgYW55KSB5b3UgbmVlZCB0byB1c2UgYW5kIHByb3ZpZGUgYSBoZWxwZnVsIHJlc3BvbnNlLiBJZiB5b3UgbmVlZCB0byB1c2UgdG9vbHMsIGV4cGxhaW4gd2hhdCB5b3Ugd291bGQgZG8sIGJ1dCBub3RlIHRoYXQgaW4gdGhpcyBtb2RlIHlvdSBjYW5ub3QgYWN0dWFsbHkgZXhlY3V0ZSB0b29scy5gO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGVuZHBvaW50LCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHt0aGlzLmNvbmZpZz8uYXBpS2V5fWAsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBwcm9tcHQ6IHN5c3RlbVByb21wdCxcbiAgICAgICAgICBtYXhfdG9rZW5zOiAxMDAwLFxuICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICAgICAgc3RyZWFtOiBmYWxzZSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE96d2VsbCBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICBcbiAgICAgIHJldHVybiBkYXRhLmNob2ljZXM/LlswXT8udGV4dCB8fCBkYXRhLmNvbXBsZXRpb24gfHwgZGF0YS5yZXNwb25zZSB8fCAnTm8gcmVzcG9uc2UgZ2VuZXJhdGVkJztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignT3p3ZWxsIEFQSSBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZXQgcmVzcG9uc2UgZnJvbSBPendlbGw6ICR7ZXJyb3J9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eSBtZXRob2RzXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQoXG4gICAgcXVlcnk6IHN0cmluZyxcbiAgICBjb250ZXh0PzogeyBkb2N1bWVudElkPzogc3RyaW5nOyBwYXRpZW50SWQ/OiBzdHJpbmc7IHNlc3Npb25JZD86IHN0cmluZyB9XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgLy8gUm91dGUgdG8gaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgfVxuXG4gIC8vIFV0aWxpdHkgbWV0aG9kc1xuICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogYW55W10ge1xuICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVRvb2xzO1xuICB9XG5cbiAgcHVibGljIGlzVG9vbEF2YWlsYWJsZSh0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlVG9vbHMuc29tZSh0b29sID0+IHRvb2wubmFtZSA9PT0gdG9vbE5hbWUpO1xuICB9XG5cbiAgcHVibGljIGdldE1lZGljYWxPcGVyYXRpb25zKCk6IE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICAgIGlmICghdGhpcy5tZWRpY2FsT3BlcmF0aW9ucykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNZWRpY2FsIE1DUCBzZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5tZWRpY2FsT3BlcmF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBnZXRFcGljT3BlcmF0aW9ucygpOiBFcGljRkhJUk9wZXJhdGlvbnMgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmVwaWNPcGVyYXRpb25zO1xuICB9XG5cbiAgcHVibGljIGdldEFpZGJveE9wZXJhdGlvbnMoKTogQWlkYm94RkhJUk9wZXJhdGlvbnMgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmFpZGJveE9wZXJhdGlvbnM7XG4gIH1cblxuICAvLyBQcm92aWRlciBzd2l0Y2hpbmcgbWV0aG9kc1xuICBwdWJsaWMgYXN5bmMgc3dpdGNoUHJvdmlkZXIocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBDbGllbnQgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5jb25maWcucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICBjb25zb2xlLmxvZyhg8J+UhCBTd2l0Y2hlZCB0byAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IHByb3ZpZGVyIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDdXJyZW50UHJvdmlkZXIoKTogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnPy5wcm92aWRlcjtcbiAgfVxuXG4gIHB1YmxpYyBnZXRBdmFpbGFibGVQcm92aWRlcnMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBcbiAgICBjb25zdCBwcm92aWRlcnMgPSBbXTtcbiAgICBpZiAoYW50aHJvcGljS2V5KSBwcm92aWRlcnMucHVzaCgnYW50aHJvcGljJyk7XG4gICAgaWYgKG96d2VsbEtleSkgcHJvdmlkZXJzLnB1c2goJ296d2VsbCcpO1xuICAgIFxuICAgIHJldHVybiBwcm92aWRlcnM7XG4gIH1cblxuICBwdWJsaWMgaXNSZWFkeSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5pc0luaXRpYWxpemVkO1xuICB9XG5cbiAgcHVibGljIGdldENvbmZpZygpOiBNQ1BDbGllbnRDb25maWcgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZztcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZygnU2h1dHRpbmcgZG93biBNQ1AgQ2xpZW50cy4uLicpO1xuICAgIFxuICAgIGlmICh0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHRoaXMuYWlkYm94Q29ubmVjdGlvbikge1xuICAgICAgdGhpcy5haWRib3hDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMuZXBpY0Nvbm5lY3Rpb24uZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgICBcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgfVxufSIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuXG5pbnRlcmZhY2UgTUNQUmVxdWVzdCB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGFyYW1zOiBhbnk7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmludGVyZmFjZSBNQ1BSZXNwb25zZSB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICByZXN1bHQ/OiBhbnk7XG4gIGVycm9yPzoge1xuICAgIGNvZGU6IG51bWJlcjtcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gIH07XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbiB7XG4gIHByaXZhdGUgYmFzZVVybDogc3RyaW5nO1xuICBwcml2YXRlIHNlc3Npb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlcXVlc3RJZCA9IDE7XG5cbiAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMScpIHtcbiAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJyk7IC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaFxuICB9XG5cbiAgYXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYPCfk4QgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfS4gUGxlYXNlIGVuc3VyZSBpdCdzIHJ1bm5pbmcgaW4gSFRUUCBtb2RlLmApO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0aWFsaXplIHRoZSBjb25uZWN0aW9uIHdpdGggcHJvcGVyIE1DUCBwcm90b2NvbCB1c2luZyBTdHJlYW1hYmxlIEhUVFBcbiAgICAgIGNvbnN0IGluaXRSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCdpbml0aWFsaXplJywge1xuICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgcm9vdHM6IHtcbiAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgIG5hbWU6ICdtZXRlb3ItbWVkaWNhbC1jbGllbnQnLFxuICAgICAgICAgIHZlcnNpb246ICcxLjAuMCdcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn5OLIE1DUCBJbml0aWFsaXplIHJlc3VsdDonLCBpbml0UmVzdWx0KTtcblxuICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgIGF3YWl0IHRoaXMuc2VuZE5vdGlmaWNhdGlvbignaW5pdGlhbGl6ZWQnLCB7fSk7XG5cbiAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgICAgY29uc29sZS5sb2coYOKchSBNQ1AgU3RyZWFtYWJsZSBIVFRQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+TiyBBdmFpbGFibGUgdG9vbHM6Jyk7XG4gICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBjb25uZWN0IHRvIE1DUCBTZXJ2ZXIgdmlhIFN0cmVhbWFibGUgSFRUUDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrU2VydmVySGVhbHRoKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vaGVhbHRoYCwge1xuICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApIC8vIDUgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgY29uc3QgcmVxdWVzdDogTUNQUmVxdWVzdCA9IHtcbiAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zLFxuICAgICAgaWRcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbiwgdGV4dC9ldmVudC1zdHJlYW0nLCAvLyBTdHJlYW1hYmxlIEhUVFA6IE11c3QgYWNjZXB0IGJvdGggSlNPTiBhbmQgU1NFXG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgc2Vzc2lvbiBJRCBpZiB3ZSBoYXZlIG9uZSAoU3RyZWFtYWJsZSBIVFRQIHNlc3Npb24gbWFuYWdlbWVudClcbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFNlbmRpbmcgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3Q6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudCAoU3RyZWFtYWJsZSBIVFRQIHNlc3Npb24gbWFuYWdlbWVudClcbiAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICBpZiAocmVzcG9uc2VTZXNzaW9uSWQgJiYgIXRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OLIFJlY2VpdmVkIHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb250ZW50IHR5cGUgLSBTdHJlYW1hYmxlIEhUVFAgc2hvdWxkIHJldHVybiBKU09OIGZvciBtb3N0IHJlc3BvbnNlc1xuICAgICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk7XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBTU0UgdXBncmFkZSAob3B0aW9uYWwgaW4gU3RyZWFtYWJsZSBIVFRQIGZvciBzdHJlYW1pbmcgcmVzcG9uc2VzKVxuICAgICAgaWYgKGNvbnRlbnRUeXBlICYmIGNvbnRlbnRUeXBlLmluY2x1ZGVzKCd0ZXh0L2V2ZW50LXN0cmVhbScpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OhIFNlcnZlciB1cGdyYWRlZCB0byBTU0UgZm9yIHN0cmVhbWluZyByZXNwb25zZScpO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5oYW5kbGVTdHJlYW1pbmdSZXNwb25zZShyZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFN0YW5kYXJkIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmICghY29udGVudFR5cGUgfHwgIWNvbnRlbnRUeXBlLmluY2x1ZGVzKCdhcHBsaWNhdGlvbi9qc29uJykpIHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2VUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgVW5leHBlY3RlZCBjb250ZW50IHR5cGU6JywgY29udGVudFR5cGUpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgUmVzcG9uc2UgdGV4dDonLCByZXNwb25zZVRleHQuc3Vic3RyaW5nKDAsIDIwMCkpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIEpTT04gcmVzcG9uc2UgYnV0IGdvdCAke2NvbnRlbnRUeXBlfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUNQIGVycm9yICR7cmVzdWx0LmVycm9yLmNvZGV9OiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0ICR7bWV0aG9kfSBzdWNjZXNzZnVsYCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBTdHJlYW1hYmxlIEhUVFAgcmVxdWVzdCBmYWlsZWQgZm9yIG1ldGhvZCAke21ldGhvZH06YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVTdHJlYW1pbmdSZXNwb25zZShyZXNwb25zZTogUmVzcG9uc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIEhhbmRsZSBTU0Ugc3RyZWFtaW5nIHJlc3BvbnNlIChvcHRpb25hbCBwYXJ0IG9mIFN0cmVhbWFibGUgSFRUUClcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuYm9keT8uZ2V0UmVhZGVyKCk7XG4gICAgICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG4gICAgICBsZXQgYnVmZmVyID0gJyc7XG4gICAgICBsZXQgcmVzdWx0OiBhbnkgPSBudWxsO1xuXG4gICAgICBjb25zdCBwcm9jZXNzQ2h1bmsgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyIS5yZWFkKCk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGRvbmUpIHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignTm8gcmVzdWx0IHJlY2VpdmVkIGZyb20gc3RyZWFtaW5nIHJlc3BvbnNlJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGJ1ZmZlciArPSBkZWNvZGVyLmRlY29kZSh2YWx1ZSwgeyBzdHJlYW06IHRydWUgfSk7XG4gICAgICAgICAgY29uc3QgbGluZXMgPSBidWZmZXIuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgIGJ1ZmZlciA9IGxpbmVzLnBvcCgpIHx8ICcnOyAvLyBLZWVwIGluY29tcGxldGUgbGluZSBpbiBidWZmZXJcblxuICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgaWYgKGxpbmUuc3RhcnRzV2l0aCgnZGF0YTogJykpIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gbGluZS5zbGljZSg2KTsgLy8gUmVtb3ZlICdkYXRhOiAnIHByZWZpeFxuICAgICAgICAgICAgICAgIGlmIChkYXRhID09PSAnW0RPTkVdJykge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgICAgIGlmIChwYXJzZWQucmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICByZXN1bHQgPSBwYXJzZWQucmVzdWx0O1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VkLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKHBhcnNlZC5lcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgLy8gU2tpcCBpbnZhbGlkIEpTT04gbGluZXNcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBwYXJzZSBTU0UgZGF0YTonLCBkYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIENvbnRpbnVlIHJlYWRpbmdcbiAgICAgICAgICBwcm9jZXNzQ2h1bmsoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBwcm9jZXNzQ2h1bmsoKTtcblxuICAgICAgLy8gVGltZW91dCBmb3Igc3RyZWFtaW5nIHJlc3BvbnNlc1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHJlYWRlcj8uY2FuY2VsKCk7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ1N0cmVhbWluZyByZXNwb25zZSB0aW1lb3V0JykpO1xuICAgICAgfSwgNjAwMDApOyAvLyA2MCBzZWNvbmQgdGltZW91dCBmb3Igc3RyZWFtaW5nXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXNcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbiwgdGV4dC9ldmVudC1zdHJlYW0nLFxuICAgICAgfTtcblxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG5vdGlmaWNhdGlvbiksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsaXN0VG9vbHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICB9XG5cbiAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2NhbGwnLCB7XG4gICAgICBuYW1lLFxuICAgICAgYXJndW1lbnRzOiBhcmdzXG4gICAgfSk7XG4gIH1cblxuICBkaXNjb25uZWN0KCkge1xuICAgIC8vIEZvciBTdHJlYW1hYmxlIEhUVFAsIHdlIGNhbiBvcHRpb25hbGx5IHNlbmQgYSBERUxFVEUgcmVxdWVzdCB0byBjbGVhbiB1cCB0aGUgc2Vzc2lvblxuICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnREVMRVRFJyxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnbWNwLXNlc3Npb24taWQnOiB0aGlzLnNlc3Npb25JZCxcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgICAgICB9XG4gICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBJZ25vcmUgZXJyb3JzIG9uIGRpc2Nvbm5lY3RcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBJZ25vcmUgZXJyb3JzIG9uIGRpc2Nvbm5lY3RcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIGNvbnNvbGUubG9nKCfwn5OLIERpc2Nvbm5lY3RlZCBmcm9tIE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBNZWRpY2FsIG9wZXJhdGlvbnMgaW1wbGVtZW50YXRpb24gZm9yIFN0cmVhbWFibGUgSFRUUCB0cmFuc3BvcnRcbmV4cG9ydCBpbnRlcmZhY2UgTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHVwbG9hZERvY3VtZW50KGZpbGU6IEJ1ZmZlciwgZmlsZW5hbWU6IHN0cmluZywgbWltZVR5cGU6IHN0cmluZywgbWV0YWRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgc2VhcmNoRG9jdW1lbnRzKHF1ZXJ5OiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGxpc3REb2N1bWVudHMob3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZXh0cmFjdE1lZGljYWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcsIGRvY3VtZW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgYW5hbHl6ZVBhdGllbnRIaXN0b3J5KHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dD86IGFueSk6IFByb21pc2U8YW55PjtcbiAgXG4gIC8vIExlZ2FjeSBtZXRob2RzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgc2VhcmNoQnlEaWFnbm9zaXMocGF0aWVudElkZW50aWZpZXI6IHN0cmluZywgZGlhZ25vc2lzUXVlcnk/OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgc2VtYW50aWNTZWFyY2gocXVlcnk6IHN0cmluZywgcGF0aWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnMoY29ubmVjdGlvbjogTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24pOiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zIHtcbiAgcmV0dXJuIHtcbiAgICAvLyBOZXcgdG9vbCBtZXRob2RzIHVzaW5nIHRoZSBleGFjdCB0b29sIG5hbWVzIGZyb20geW91ciBzZXJ2ZXJcbiAgICBhc3luYyB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3VwbG9hZERvY3VtZW50Jywge1xuICAgICAgICB0aXRsZTogZmlsZW5hbWUsXG4gICAgICAgIGZpbGVCdWZmZXI6IGZpbGUudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIC4uLm1ldGFkYXRhLFxuICAgICAgICAgIGZpbGVUeXBlOiBtaW1lVHlwZS5zcGxpdCgnLycpWzFdIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBzaXplOiBmaWxlLmxlbmd0aFxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgdGhlIHJlc3VsdCBpZiBpdCdzIGluIHRoZSBjb250ZW50IGFycmF5IGZvcm1hdFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoRG9jdW1lbnRzJywge1xuICAgICAgICBxdWVyeSxcbiAgICAgICAgbGltaXQ6IG9wdGlvbnMubGltaXQgfHwgMTAsXG4gICAgICAgIHRocmVzaG9sZDogb3B0aW9ucy50aHJlc2hvbGQgfHwgMC43LFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGxpc3REb2N1bWVudHMob3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDIwLFxuICAgICAgICBvZmZzZXQ6IG9wdGlvbnMub2Zmc2V0IHx8IDAsXG4gICAgICAgIGZpbHRlcjogb3B0aW9ucy5maWx0ZXIgfHwge31cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcsIGRvY3VtZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCB7XG4gICAgICAgIHRleHQsXG4gICAgICAgIGRvY3VtZW50SWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZmluZFNpbWlsYXJDYXNlcyhjcml0ZXJpYTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdmaW5kU2ltaWxhckNhc2VzJywgY3JpdGVyaWEpO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgYW5hbHl6ZVBhdGllbnRIaXN0b3J5KHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYW5hbHl6ZVBhdGllbnRIaXN0b3J5Jywge1xuICAgICAgICBwYXRpZW50SWQsXG4gICAgICAgIGFuYWx5c2lzVHlwZTogb3B0aW9ucy5hbmFseXNpc1R5cGUgfHwgJ3N1bW1hcnknLFxuICAgICAgICBkYXRlUmFuZ2U6IG9wdGlvbnMuZGF0ZVJhbmdlXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldE1lZGljYWxJbnNpZ2h0cyhxdWVyeTogc3RyaW5nLCBjb250ZXh0OiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0TWVkaWNhbEluc2lnaHRzJywge1xuICAgICAgICBxdWVyeSxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgbGltaXQ6IGNvbnRleHQubGltaXQgfHwgNVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICAvLyBMZWdhY3kgY29tcGF0aWJpbGl0eSBtZXRob2RzXG4gICAgYXN5bmMgZXh0cmFjdFRleHQoZG9jdW1lbnRJZDogc3RyaW5nKSB7XG4gICAgICAvLyBUaGlzIG1pZ2h0IG5vdCBleGlzdCBhcyBhIHNlcGFyYXRlIHRvb2wsIHRyeSB0byBnZXQgZG9jdW1lbnQgY29udGVudFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnbGlzdERvY3VtZW50cycsIHtcbiAgICAgICAgZmlsdGVyOiB7IF9pZDogZG9jdW1lbnRJZCB9LFxuICAgICAgICBsaW1pdDogMVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgICBpZiAocGFyc2VkLmRvY3VtZW50cyAmJiBwYXJzZWQuZG9jdW1lbnRzWzBdKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICBleHRyYWN0ZWRUZXh0OiBwYXJzZWQuZG9jdW1lbnRzWzBdLmNvbnRlbnQsXG4gICAgICAgICAgICAgIGNvbmZpZGVuY2U6IDEwMFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBmYWxsYmFja1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGV4dCBleHRyYWN0aW9uIG5vdCBzdXBwb3J0ZWQgLSB1c2UgZG9jdW1lbnQgY29udGVudCBmcm9tIHVwbG9hZCByZXN1bHQnKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgc2VhcmNoQnlEaWFnbm9zaXMocGF0aWVudElkZW50aWZpZXI6IHN0cmluZywgZGlhZ25vc2lzUXVlcnk/OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VhcmNoRG9jdW1lbnRzKGRpYWdub3Npc1F1ZXJ5IHx8IHBhdGllbnRJZGVudGlmaWVyLCB7XG4gICAgICAgIGZpbHRlcjogeyBwYXRpZW50SWQ6IHBhdGllbnRJZGVudGlmaWVyIH0sXG4gICAgICAgIGxpbWl0OiAxMFxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZykge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VhcmNoRG9jdW1lbnRzKHF1ZXJ5LCB7XG4gICAgICAgIGZpbHRlcjogcGF0aWVudElkID8geyBwYXRpZW50SWQgfSA6IHt9LFxuICAgICAgICBsaW1pdDogNVxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRTdW1tYXJ5KHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBhbmFseXNpc1R5cGU6ICdzdW1tYXJ5J1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufSIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGludGVyZmFjZSBNZXNzYWdlIHtcbiAgX2lkPzogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIHJvbGU6ICd1c2VyJyB8ICdhc3Npc3RhbnQnO1xuICB0aW1lc3RhbXA6IERhdGU7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgTWVzc2FnZXNDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb248TWVzc2FnZT4oJ21lc3NhZ2VzJyk7IiwiLy8gaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWV0aG9kcy50c1xuaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjaywgTWF0Y2ggfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uLCBNZXNzYWdlIH0gZnJvbSAnLi9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5pbXBvcnQgeyBNQ1BDbGllbnRNYW5hZ2VyIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21jcC9tY3BDbGllbnRNYW5hZ2VyJztcbmltcG9ydCB7IENvbnRleHRNYW5hZ2VyIH0gZnJvbSAnLi4vY29udGV4dC9jb250ZXh0TWFuYWdlcic7XG5cbi8vIE1ldGVvciBNZXRob2RzXG5NZXRlb3IubWV0aG9kcyh7XG4gIGFzeW5jICdtZXNzYWdlcy5pbnNlcnQnKG1lc3NhZ2VEYXRhOiBPbWl0PE1lc3NhZ2UsICdfaWQnPikge1xuICAgIGNoZWNrKG1lc3NhZ2VEYXRhLCB7XG4gICAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgICByb2xlOiBTdHJpbmcsXG4gICAgICB0aW1lc3RhbXA6IERhdGUsXG4gICAgICBzZXNzaW9uSWQ6IFN0cmluZ1xuICAgIH0pO1xuXG4gICAgY29uc3QgbWVzc2FnZUlkID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG1lc3NhZ2VEYXRhKTtcbiAgICBcbiAgICAvLyBVcGRhdGUgY29udGV4dCBpZiBzZXNzaW9uIGV4aXN0c1xuICAgIGlmIChtZXNzYWdlRGF0YS5zZXNzaW9uSWQpIHtcbiAgICAgIGF3YWl0IENvbnRleHRNYW5hZ2VyLnVwZGF0ZUNvbnRleHQobWVzc2FnZURhdGEuc2Vzc2lvbklkLCB7XG4gICAgICAgIC4uLm1lc3NhZ2VEYXRhLFxuICAgICAgICBfaWQ6IG1lc3NhZ2VJZFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSBzZXNzaW9uXG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkLCB7XG4gICAgICAgICRzZXQ6IHtcbiAgICAgICAgICBsYXN0TWVzc2FnZTogbWVzc2FnZURhdGEuY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSxcbiAgICAgICAgJGluYzogeyBtZXNzYWdlQ291bnQ6IDEgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEF1dG8tZ2VuZXJhdGUgdGl0bGUgYWZ0ZXIgZmlyc3QgdXNlciBtZXNzYWdlXG4gICAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhtZXNzYWdlRGF0YS5zZXNzaW9uSWQpO1xuICAgICAgaWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5tZXNzYWdlQ291bnQgPD0gMiAmJiBtZXNzYWdlRGF0YS5yb2xlID09PSAndXNlcicpIHtcbiAgICAgICAgTWV0ZW9yLnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIE1ldGVvci5jYWxsKCdzZXNzaW9ucy5nZW5lcmF0ZVRpdGxlJywgbWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgICAgfSwgMTAwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG1lc3NhZ2VJZDtcbiAgfSxcblxuICBhc3luYyAnbWNwLnByb2Nlc3NRdWVyeScocXVlcnk6IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgY2hlY2socXVlcnksIFN0cmluZyk7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBNYXRjaC5NYXliZShTdHJpbmcpKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHJldHVybiAnTUNQIENsaWVudCBpcyBub3QgcmVhZHkuIFBsZWFzZSBjaGVjayB5b3VyIEFQSSBjb25maWd1cmF0aW9uLic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn6egIFByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjogXCIke3F1ZXJ5fVwiYCk7XG4gICAgICAgIFxuICAgICAgICAvLyBCdWlsZCBjb250ZXh0IGZvciB0aGUgcXVlcnlcbiAgICAgICAgY29uc3QgY29udGV4dDogYW55ID0geyBzZXNzaW9uSWQgfTtcbiAgICAgICAgXG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICAvLyBHZXQgc2Vzc2lvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoc2Vzc2lvbklkKTtcbiAgICAgICAgICBpZiAoc2Vzc2lvbj8ubWV0YWRhdGE/LnBhdGllbnRJZCkge1xuICAgICAgICAgICAgY29udGV4dC5wYXRpZW50SWQgPSBzZXNzaW9uLm1ldGFkYXRhLnBhdGllbnRJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gR2V0IGNvbnZlcnNhdGlvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3QgY29udGV4dERhdGEgPSBhd2FpdCBDb250ZXh0TWFuYWdlci5nZXRDb250ZXh0KHNlc3Npb25JZCk7XG4gICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25Db250ZXh0ID0gY29udGV4dERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExldCBDbGF1ZGUgaW50ZWxsaWdlbnRseSBkZWNpZGUgd2hhdCB0b29scyB0byB1c2UgKGluY2x1ZGVzIEVwaWMgdG9vbHMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbWNwTWFuYWdlci5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFVwZGF0ZSBjb250ZXh0IGFmdGVyIHByb2Nlc3NpbmdcbiAgICAgICAgaWYgKHNlc3Npb25JZCkge1xuICAgICAgICAgIGF3YWl0IGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KHF1ZXJ5LCByZXNwb25zZSwgc2Vzc2lvbklkKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignSW50ZWxsaWdlbnQgTUNQIHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBcbiAgICAgICAgLy8gUHJvdmlkZSBoZWxwZnVsIGVycm9yIG1lc3NhZ2VzIGJhc2VkIG9uIHRoZSBlcnJvciB0eXBlXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXBpYyBNQ1AgU2VydmVyJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIEVwaWMgRUhSIHN5c3RlbS4gUGxlYXNlIGVuc3VyZSB0aGUgRXBpYyBNQ1Agc2VydmVyIGlzIHJ1bm5pbmcgYW5kIHByb3Blcmx5IGNvbmZpZ3VyZWQuJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdBaWRib3gnKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgQWlkYm94IEZISVIgc3lzdGVtLiBQbGVhc2UgZW5zdXJlIHRoZSBBaWRib3ggTUNQIHNlcnZlciBpcyBydW5uaW5nIGFuZCBwcm9wZXJseSBjb25maWd1cmVkLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciBjb250YWN0IHN1cHBvcnQgaWYgdGhlIGlzc3VlIHBlcnNpc3RzLic7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdTaW11bGF0aW9uIG1vZGUgLSBubyBhY3R1YWwgcHJvY2Vzc2luZyc7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5zd2l0Y2hQcm92aWRlcicocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpIHtcbiAgICBjaGVjayhwcm92aWRlciwgU3RyaW5nKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5zd2l0Y2hQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIHJldHVybiBgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Byb3ZpZGVyIHN3aXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3N3aXRjaC1mYWlsZWQnLCBgRmFpbGVkIHRvIHN3aXRjaCBwcm92aWRlcjogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ1Byb3ZpZGVyIHN3aXRjaGVkIChzaW11bGF0aW9uIG1vZGUpJztcbiAgfSxcblxuICAnbWNwLmdldEN1cnJlbnRQcm92aWRlcicoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0Q3VycmVudFByb3ZpZGVyKCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnYW50aHJvcGljJztcbiAgfSxcblxuICAnbWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycycoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVByb3ZpZGVycygpO1xuICAgIH1cbiAgICBcbiAgICAvLyBGYWxsYmFjayBmb3Igc2ltdWxhdGlvblxuICAgIGNvbnN0IHNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9LFxuXG4gICdtY3AuZ2V0QXZhaWxhYmxlVG9vbHMnKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gW107XG4gIH0sXG5cbiAgLy8gU2VydmVyIGhlYWx0aCBjaGVjayBtZXRob2QgLSBpbmNsdWRlcyBFcGljXG4gIGFzeW5jICdtY3AuaGVhbHRoQ2hlY2snKCkge1xuICAgIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICAgIG1lc3NhZ2U6ICdBbGwgc3lzdGVtcyBvcGVyYXRpb25hbCAoc2ltdWxhdGlvbiBtb2RlKScsXG4gICAgICAgIHNlcnZlcnM6IHtcbiAgICAgICAgICBlcGljOiAnc2ltdWxhdGVkJyxcbiAgICAgICAgICBhaWRib3g6ICdzaW11bGF0ZWQnLFxuICAgICAgICAgIG1lZGljYWw6ICdzaW11bGF0ZWQnXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdNQ1AgQ2xpZW50IG5vdCByZWFkeScsXG4gICAgICAgIHNlcnZlcnM6IHt9XG4gICAgICB9O1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCBtY3BNYW5hZ2VyLmhlYWx0aENoZWNrKCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgICAgbWVzc2FnZTogJ0hlYWx0aCBjaGVjayBjb21wbGV0ZWQnLFxuICAgICAgICBzZXJ2ZXJzOiB7XG4gICAgICAgICAgZXBpYzogaGVhbHRoLmVwaWMgPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnLFxuICAgICAgICAgIGFpZGJveDogaGVhbHRoLmFpZGJveCA/ICdoZWFsdGh5JyA6ICd1bmF2YWlsYWJsZSdcbiAgICAgICAgfSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IGBIZWFsdGggY2hlY2sgZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgc2VydmVyczoge30sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKVxuICAgICAgfTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gTWVkaWNhbCBkb2N1bWVudCBtZXRob2RzIChleGlzdGluZylcbmFzeW5jICdtZWRpY2FsLnVwbG9hZERvY3VtZW50JyhmaWxlRGF0YToge1xuICBmaWxlbmFtZTogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XG4gIHBhdGllbnROYW1lPzogc3RyaW5nO1xuICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG59KSB7XG4gIGNoZWNrKGZpbGVEYXRhLCB7XG4gICAgZmlsZW5hbWU6IFN0cmluZyxcbiAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgbWltZVR5cGU6IFN0cmluZyxcbiAgICBwYXRpZW50TmFtZTogTWF0Y2guTWF5YmUoU3RyaW5nKSxcbiAgICBzZXNzaW9uSWQ6IE1hdGNoLk1heWJlKFN0cmluZylcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coYPCfk6QgVXBsb2FkIHJlcXVlc3QgZm9yOiAke2ZpbGVEYXRhLmZpbGVuYW1lfSAoJHtmaWxlRGF0YS5taW1lVHlwZX0pYCk7XG4gIGNvbnNvbGUubG9nKGDwn5OKIENvbnRlbnQgc2l6ZTogJHtmaWxlRGF0YS5jb250ZW50Lmxlbmd0aH0gY2hhcnNgKTtcblxuICBpZiAodGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICBjb25zb2xlLmxvZygn8J+UhCBTaW11bGF0aW9uIG1vZGUgLSByZXR1cm5pbmcgbW9jayBkb2N1bWVudCBJRCcpO1xuICAgIHJldHVybiB7IFxuICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICBkb2N1bWVudElkOiAnc2ltLScgKyBEYXRlLm5vdygpLFxuICAgICAgbWVzc2FnZTogJ0RvY3VtZW50IHVwbG9hZGVkIChzaW11bGF0aW9uIG1vZGUpJ1xuICAgIH07XG4gIH1cblxuICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICBcbiAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBNQ1AgQ2xpZW50IG5vdCByZWFkeScpO1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTWVkaWNhbCBkb2N1bWVudCBzeXN0ZW0gaXMgbm90IGF2YWlsYWJsZS4gUGxlYXNlIGNvbnRhY3QgYWRtaW5pc3RyYXRvci4nKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gVmFsaWRhdGUgYmFzZTY0IGNvbnRlbnRcbiAgICBpZiAoIWZpbGVEYXRhLmNvbnRlbnQgfHwgZmlsZURhdGEuY29udGVudC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsZSBjb250ZW50IGlzIGVtcHR5Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZmlsZSBzaXplIChiYXNlNjQgZW5jb2RlZCwgc28gYWN0dWFsIGZpbGUgaXMgfjc1JSBvZiB0aGlzKVxuICAgIGNvbnN0IGVzdGltYXRlZEZpbGVTaXplID0gKGZpbGVEYXRhLmNvbnRlbnQubGVuZ3RoICogMykgLyA0O1xuICAgIGlmIChlc3RpbWF0ZWRGaWxlU2l6ZSA+IDEwICogMTAyNCAqIDEwMjQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsZSB0b28gbGFyZ2UgKG1heCAxME1CKScpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGDwn5OLIEVzdGltYXRlZCBmaWxlIHNpemU6ICR7TWF0aC5yb3VuZChlc3RpbWF0ZWRGaWxlU2l6ZSAvIDEwMjQpfUtCYCk7XG5cbiAgICBjb25zdCBtZWRpY2FsID0gbWNwTWFuYWdlci5nZXRNZWRpY2FsT3BlcmF0aW9ucygpO1xuICAgIFxuICAgIC8vIENvbnZlcnQgYmFzZTY0IGJhY2sgdG8gYnVmZmVyIGZvciBNQ1Agc2VydmVyXG4gICAgY29uc3QgZmlsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGZpbGVEYXRhLmNvbnRlbnQsICdiYXNlNjQnKTtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZWRpY2FsLnVwbG9hZERvY3VtZW50KFxuICAgICAgZmlsZUJ1ZmZlcixcbiAgICAgIGZpbGVEYXRhLmZpbGVuYW1lLFxuICAgICAgZmlsZURhdGEubWltZVR5cGUsXG4gICAgICB7XG4gICAgICAgIHBhdGllbnROYW1lOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgc2Vzc2lvbklkOiBmaWxlRGF0YS5zZXNzaW9uSWQgfHwgdGhpcy5jb25uZWN0aW9uPy5pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgIHVwbG9hZGVkQnk6IHRoaXMudXNlcklkIHx8ICdhbm9ueW1vdXMnLFxuICAgICAgICB1cGxvYWREYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfinIUgTUNQIHVwbG9hZCBzdWNjZXNzZnVsOicsIHJlc3VsdCk7XG4gICAgXG4gICAgLy8gVXBkYXRlIHNlc3Npb24gbWV0YWRhdGEgaWYgd2UgaGF2ZSBzZXNzaW9uIElEXG4gICAgaWYgKGZpbGVEYXRhLnNlc3Npb25JZCAmJiByZXN1bHQuZG9jdW1lbnRJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKGZpbGVEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogcmVzdWx0LmRvY3VtZW50SWRcbiAgICAgICAgICB9LFxuICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgICAgICdtZXRhZGF0YS5sYXN0VXBsb2FkJzogbmV3IERhdGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OdIFNlc3Npb24gbWV0YWRhdGEgdXBkYXRlZCcpO1xuICAgICAgfSBjYXRjaCAodXBkYXRlRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gRmFpbGVkIHRvIHVwZGF0ZSBzZXNzaW9uIG1ldGFkYXRhOicsIHVwZGF0ZUVycm9yKTtcbiAgICAgICAgLy8gRG9uJ3QgZmFpbCB0aGUgd2hvbGUgb3BlcmF0aW9uIGZvciB0aGlzXG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRG9jdW1lbnQgdXBsb2FkIGVycm9yOicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBQcm92aWRlIHNwZWNpZmljIGVycm9yIG1lc3NhZ2VzXG4gICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykgfHwgZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0VDT05OUkVGVVNFRCcpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtZWRpY2FsLXNlcnZlci1vZmZsaW5lJywgJ01lZGljYWwgZG9jdW1lbnQgc2VydmVyIGlzIG5vdCBhdmFpbGFibGUuIFBsZWFzZSBjb250YWN0IGFkbWluaXN0cmF0b3IuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnRmlsZSB0b28gbGFyZ2UnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignZmlsZS10b28tbGFyZ2UnLCAnRmlsZSBpcyB0b28gbGFyZ2UuIE1heGltdW0gc2l6ZSBpcyAxME1CLicpO1xuICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0ludmFsaWQgZmlsZSB0eXBlJykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ2ludmFsaWQtZmlsZS10eXBlJywgJ0ludmFsaWQgZmlsZSB0eXBlLiBQbGVhc2UgdXNlIFBERiBvciBpbWFnZSBmaWxlcyBvbmx5LicpO1xuICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ3RpbWVvdXQnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcigndXBsb2FkLXRpbWVvdXQnLCAnVXBsb2FkIHRpbWVkIG91dC4gUGxlYXNlIHRyeSBhZ2FpbiB3aXRoIGEgc21hbGxlciBmaWxlLicpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCd1cGxvYWQtZmFpbGVkJywgYFVwbG9hZCBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG59LFxuXG5cbiAgYXN5bmMgJ21lZGljYWwucHJvY2Vzc0RvY3VtZW50Jyhkb2N1bWVudElkOiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIGNoZWNrKGRvY3VtZW50SWQsIFN0cmluZyk7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBNYXRjaC5NYXliZShTdHJpbmcpKTtcblxuICAgIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogJ0RvY3VtZW50IHByb2Nlc3NlZCAoc2ltdWxhdGlvbiBtb2RlKScsXG4gICAgICAgIHRleHRFeHRyYWN0aW9uOiB7IGV4dHJhY3RlZFRleHQ6ICdTYW1wbGUgdGV4dCcsIGNvbmZpZGVuY2U6IDk1IH0sXG4gICAgICAgIG1lZGljYWxFbnRpdGllczogeyBlbnRpdGllczogW10sIHN1bW1hcnk6IHsgZGlhZ25vc2lzQ291bnQ6IDAsIG1lZGljYXRpb25Db3VudDogMCwgbGFiUmVzdWx0Q291bnQ6IDAgfSB9XG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgXG4gICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignbWNwLW5vdC1yZWFkeScsICdNQ1AgQ2xpZW50IGlzIG5vdCByZWFkeScpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBtZWRpY2FsID0gbWNwTWFuYWdlci5nZXRNZWRpY2FsT3BlcmF0aW9ucygpO1xuICAgICAgXG4gICAgICAvLyBQcm9jZXNzIGRvY3VtZW50IHVzaW5nIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZWRpY2FsLmV4dHJhY3RNZWRpY2FsRW50aXRpZXMoJycsIGRvY3VtZW50SWQpO1xuICAgICAgXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEb2N1bWVudCBwcm9jZXNzaW5nIGVycm9yOicsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Byb2Nlc3NpbmctZmFpbGVkJywgYEZhaWxlZCB0byBwcm9jZXNzIGRvY3VtZW50OiAke2Vycm9yLm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZXh0cmFjdCBhbmQgdXBkYXRlIGNvbnRleHRcbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KFxuICBxdWVyeTogc3RyaW5nLCBcbiAgcmVzcG9uc2U6IHN0cmluZywgXG4gIHNlc3Npb25JZDogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHBhdGllbnQgbmFtZSBmcm9tIHF1ZXJ5XG4gICAgY29uc3QgcGF0aWVudE1hdGNoID0gcXVlcnkubWF0Y2goLyg/OnBhdGllbnR8Zm9yKVxccysoW0EtWl1bYS16XSsoPzpcXHMrW0EtWl1bYS16XSspPykvaSk7XG4gICAgaWYgKHBhdGllbnRNYXRjaCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7ICdtZXRhZGF0YS5wYXRpZW50SWQnOiBwYXRpZW50TWF0Y2hbMV0gfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCB0ZXJtcyBmcm9tIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZSk7XG4gICAgaWYgKG1lZGljYWxUZXJtcy5sZW5ndGggPiAwKSB7XG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoc2Vzc2lvbklkLCB7XG4gICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICdtZXRhZGF0YS50YWdzJzogeyAkZWFjaDogbWVkaWNhbFRlcm1zIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICAgIGNvbnN0IGRhdGFTb3VyY2VzID0gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlKTtcbiAgICBpZiAoZGF0YVNvdXJjZXMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAnbWV0YWRhdGEuZGF0YVNvdXJjZXMnOiB7ICRlYWNoOiBkYXRhU291cmNlcyB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjb250ZXh0OicsIGVycm9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0TWVkaWNhbFRlcm1zRnJvbVJlc3BvbnNlKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IG1lZGljYWxQYXR0ZXJucyA9IFtcbiAgICAvXFxiKD86ZGlhZ25vc2VkIHdpdGh8ZGlhZ25vc2lzIG9mKVxccysoW14sLl0rKS9naSxcbiAgICAvXFxiKD86cHJlc2NyaWJlZHxtZWRpY2F0aW9uKVxccysoW14sLl0rKS9naSxcbiAgICAvXFxiKD86dHJlYXRtZW50IGZvcnx0cmVhdGluZylcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OmNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2lcbiAgXTtcbiAgXG4gIGNvbnN0IHRlcm1zID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICBtZWRpY2FsUGF0dGVybnMuZm9yRWFjaChwYXR0ZXJuID0+IHtcbiAgICBsZXQgbWF0Y2g7XG4gICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhyZXNwb25zZSkpICE9PSBudWxsKSB7XG4gICAgICBpZiAobWF0Y2hbMV0pIHtcbiAgICAgICAgdGVybXMuYWRkKG1hdGNoWzFdLnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBcbiAgcmV0dXJuIEFycmF5LmZyb20odGVybXMpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgXG4gIC8vIERldGVjdCBkYXRhIHNvdXJjZXMgbWVudGlvbmVkIGluIHJlc3BvbnNlXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnQWlkYm94IEZISVInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlaHInKSkge1xuICAgIHNvdXJjZXMuYWRkKCdFcGljIEVIUicpO1xuICB9XG4gIFxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZG9jdW1lbnQnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd1cGxvYWRlZCcpKSB7XG4gICAgc291cmNlcy5hZGQoJ01lZGljYWwgRG9jdW1lbnRzJyk7XG4gIH1cbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHNvdXJjZXMpO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIHNhbml0aXplIHBhdGllbnQgbmFtZXMgKHVzZWQgYnkgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24pXG5mdW5jdGlvbiBzYW5pdGl6ZVBhdGllbnROYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBuYW1lXG4gICAgLnRyaW0oKVxuICAgIC5yZXBsYWNlKC9bXmEtekEtWlxcc10vZywgJycpIC8vIFJlbW92ZSBzcGVjaWFsIGNoYXJhY3RlcnNcbiAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpIC8vIE5vcm1hbGl6ZSB3aGl0ZXNwYWNlXG4gICAgLnNwbGl0KCcgJylcbiAgICAubWFwKHdvcmQgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAuam9pbignICcpO1xufVxuXG4vLyBFeHBvcnQgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHRlc3RpbmcgYW5kIHJldXNlXG5leHBvcnQge1xuICBleHRyYWN0QW5kVXBkYXRlQ29udGV4dCxcbiAgZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZSxcbiAgZXh0cmFjdERhdGFTb3VyY2VzLFxuICBzYW5pdGl6ZVBhdGllbnROYW1lXG59OyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi9tZXNzYWdlcyc7XG5cbk1ldGVvci5wdWJsaXNoKCdtZXNzYWdlcycsIGZ1bmN0aW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgcmV0dXJuIE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKHsgc2Vzc2lvbklkIH0pO1xufSk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjaywgTWF0Y2ggfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uLCBDaGF0U2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vbWVzc2FnZXMvbWVzc2FnZXMnO1xuXG5NZXRlb3IubWV0aG9kcyh7XG4gIGFzeW5jICdzZXNzaW9ucy5jcmVhdGUnKHRpdGxlPzogc3RyaW5nLCBtZXRhZGF0YT86IGFueSkge1xuICAgIGNoZWNrKHRpdGxlLCBNYXRjaC5NYXliZShTdHJpbmcpKTtcbiAgICBjaGVjayhtZXRhZGF0YSwgTWF0Y2guTWF5YmUoT2JqZWN0KSk7XG5cbiAgICBjb25zdCBzZXNzaW9uOiBPbWl0PENoYXRTZXNzaW9uLCAnX2lkJz4gPSB7XG4gICAgICB0aXRsZTogdGl0bGUgfHwgJ05ldyBDaGF0JyxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgbWVzc2FnZUNvdW50OiAwLFxuICAgICAgaXNBY3RpdmU6IHRydWUsXG4gICAgICBtZXRhZGF0YTogbWV0YWRhdGEgfHwge31cbiAgICB9O1xuICAgIFxuICAgIC8vIERlYWN0aXZhdGUgb3RoZXIgc2Vzc2lvbnMgZm9yIHRoaXMgdXNlclxuICAgIGlmICh0aGlzLnVzZXJJZCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgICB7IHVzZXJJZDogdGhpcy51c2VySWQsIGlzQWN0aXZlOiB0cnVlIH0sXG4gICAgICAgIHsgJHNldDogeyBpc0FjdGl2ZTogZmFsc2UgfSB9LFxuICAgICAgICB7IG11bHRpOiB0cnVlIH1cbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHNlc3Npb25JZCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhzZXNzaW9uKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIENyZWF0ZWQgbmV3IHNlc3Npb246ICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIHJldHVybiBzZXNzaW9uSWQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMubGlzdCcobGltaXQgPSAyMCwgb2Zmc2V0ID0gMCkge1xuICAgIGNoZWNrKGxpbWl0LCBNYXRjaC5JbnRlZ2VyKTtcbiAgICBjaGVjayhvZmZzZXQsIE1hdGNoLkludGVnZXIpO1xuICAgIFxuICAgIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgdXNlcklkIH0sXG4gICAgICB7IFxuICAgICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICAgIGxpbWl0LFxuICAgICAgICBza2lwOiBvZmZzZXRcbiAgICAgIH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBjb25zdCB0b3RhbCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyh7IHVzZXJJZCB9KTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbnMsXG4gICAgICB0b3RhbCxcbiAgICAgIGhhc01vcmU6IG9mZnNldCArIGxpbWl0IDwgdG90YWxcbiAgICB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmdldCcoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBzZXNzaW9uO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnVwZGF0ZScoc2Vzc2lvbklkOiBzdHJpbmcsIHVwZGF0ZXM6IFBhcnRpYWw8Q2hhdFNlc3Npb24+KSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIGNoZWNrKHVwZGF0ZXMsIE9iamVjdCk7XG4gICAgXG4gICAgLy8gUmVtb3ZlIGZpZWxkcyB0aGF0IHNob3VsZG4ndCBiZSB1cGRhdGVkIGRpcmVjdGx5XG4gICAgZGVsZXRlIHVwZGF0ZXMuX2lkO1xuICAgIGRlbGV0ZSB1cGRhdGVzLnVzZXJJZDtcbiAgICBkZWxldGUgdXBkYXRlcy5jcmVhdGVkQXQ7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBcbiAgICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgICAgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgLi4udXBkYXRlcywgXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpIFxuICAgICAgICB9IFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5kZWxldGUnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIC8vIFZlcmlmeSBvd25lcnNoaXBcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyh7XG4gICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgIH0pO1xuICAgIFxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc2Vzc2lvbi1ub3QtZm91bmQnLCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRGVsZXRlIGFsbCBhc3NvY2lhdGVkIG1lc3NhZ2VzXG4gICAgY29uc3QgZGVsZXRlZE1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHsgc2Vzc2lvbklkIH0pO1xuICAgIGNvbnNvbGUubG9nKGDwn5eR77iPIERlbGV0ZWQgJHtkZWxldGVkTWVzc2FnZXN9IG1lc3NhZ2VzIGZyb20gc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICAvLyBEZWxldGUgdGhlIHNlc3Npb25cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoc2Vzc2lvbklkKTtcbiAgICBjb25zb2xlLmxvZyhg8J+Xke+4jyBEZWxldGVkIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgcmV0dXJuIHsgc2Vzc2lvbjogcmVzdWx0LCBtZXNzYWdlczogZGVsZXRlZE1lc3NhZ2VzIH07XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuc2V0QWN0aXZlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICAgIFxuICAgIC8vIERlYWN0aXZhdGUgYWxsIG90aGVyIHNlc3Npb25zXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyB1c2VySWQsIGlzQWN0aXZlOiB0cnVlIH0sXG4gICAgICB7ICRzZXQ6IHsgaXNBY3RpdmU6IGZhbHNlIH0gfSxcbiAgICAgIHsgbXVsdGk6IHRydWUgfVxuICAgICk7XG4gICAgXG4gICAgLy8gQWN0aXZhdGUgdGhpcyBzZXNzaW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBfaWQ6IHNlc3Npb25JZCwgdXNlcklkIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgICB9IFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5nZW5lcmF0ZVRpdGxlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICAvLyBHZXQgZmlyc3QgZmV3IG1lc3NhZ2VzXG4gICAgY29uc3QgbWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgc2Vzc2lvbklkLCByb2xlOiAndXNlcicgfSxcbiAgICAgIHsgbGltaXQ6IDMsIHNvcnQ6IHsgdGltZXN0YW1wOiAxIH0gfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIGlmIChtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBVc2UgZmlyc3QgdXNlciBtZXNzYWdlIGFzIGJhc2lzIGZvciB0aXRsZVxuICAgICAgY29uc3QgZmlyc3RVc2VyTWVzc2FnZSA9IG1lc3NhZ2VzWzBdO1xuICAgICAgaWYgKGZpcnN0VXNlck1lc3NhZ2UpIHtcbiAgICAgICAgLy8gQ2xlYW4gdXAgdGhlIG1lc3NhZ2UgZm9yIGEgYmV0dGVyIHRpdGxlXG4gICAgICAgIGxldCB0aXRsZSA9IGZpcnN0VXNlck1lc3NhZ2UuY29udGVudFxuICAgICAgICAgIC5yZXBsYWNlKC9eKHNlYXJjaCBmb3J8ZmluZHxsb29rIGZvcnxzaG93IG1lKVxccysvaSwgJycpIC8vIFJlbW92ZSBjb21tb24gcHJlZml4ZXNcbiAgICAgICAgICAucmVwbGFjZSgvWz8hLl0kLywgJycpIC8vIFJlbW92ZSBlbmRpbmcgcHVuY3R1YXRpb25cbiAgICAgICAgICAudHJpbSgpO1xuICAgICAgICBcbiAgICAgICAgLy8gTGltaXQgbGVuZ3RoXG4gICAgICAgIGlmICh0aXRsZS5sZW5ndGggPiA1MCkge1xuICAgICAgICAgIHRpdGxlID0gdGl0bGUuc3Vic3RyaW5nKDAsIDUwKS50cmltKCkgKyAnLi4uJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ2FwaXRhbGl6ZSBmaXJzdCBsZXR0ZXJcbiAgICAgICAgdGl0bGUgPSB0aXRsZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHRpdGxlLnNsaWNlKDEpO1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgICB0aXRsZSxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gdGl0bGU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnVwZGF0ZU1ldGFkYXRhJyhzZXNzaW9uSWQ6IHN0cmluZywgbWV0YWRhdGE6IGFueSkge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBjaGVjayhtZXRhZGF0YSwgT2JqZWN0KTtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICB7IFxuICAgICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgICB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZXhwb3J0JyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyh7XG4gICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgIH0pO1xuICAgIFxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc2Vzc2lvbi1ub3QtZm91bmQnLCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgc2Vzc2lvbklkIH0sXG4gICAgICB7IHNvcnQ6IHsgdGltZXN0YW1wOiAxIH0gfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzZXNzaW9uLFxuICAgICAgbWVzc2FnZXMsXG4gICAgICBleHBvcnRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdmVyc2lvbjogJzEuMCdcbiAgICB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmltcG9ydCcoZGF0YTogYW55KSB7XG4gICAgY2hlY2soZGF0YSwge1xuICAgICAgc2Vzc2lvbjogT2JqZWN0LFxuICAgICAgbWVzc2FnZXM6IEFycmF5LFxuICAgICAgdmVyc2lvbjogU3RyaW5nXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQ3JlYXRlIG5ldyBzZXNzaW9uIGJhc2VkIG9uIGltcG9ydGVkIGRhdGFcbiAgICBjb25zdCBuZXdTZXNzaW9uOiBPbWl0PENoYXRTZXNzaW9uLCAnX2lkJz4gPSB7XG4gICAgICAuLi5kYXRhLnNlc3Npb24sXG4gICAgICB0aXRsZTogYFtJbXBvcnRlZF0gJHtkYXRhLnNlc3Npb24udGl0bGV9YCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgaXNBY3RpdmU6IHRydWVcbiAgICB9O1xuICAgIFxuICAgIGRlbGV0ZSAobmV3U2Vzc2lvbiBhcyBhbnkpLl9pZDtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMobmV3U2Vzc2lvbik7XG4gICAgXG4gICAgLy8gSW1wb3J0IG1lc3NhZ2VzIHdpdGggbmV3IHNlc3Npb25JZFxuICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiBkYXRhLm1lc3NhZ2VzKSB7XG4gICAgICBjb25zdCBuZXdNZXNzYWdlID0ge1xuICAgICAgICAuLi5tZXNzYWdlLFxuICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUobWVzc2FnZS50aW1lc3RhbXApXG4gICAgICB9O1xuICAgICAgZGVsZXRlIG5ld01lc3NhZ2UuX2lkO1xuICAgICAgXG4gICAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMobmV3TWVzc2FnZSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBzZXNzaW9uSWQ7XG4gIH1cbn0pOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi9zZXNzaW9ucyc7XG5cbi8vIFB1Ymxpc2ggdXNlcidzIHNlc3Npb25zIGxpc3Rcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9ucy5saXN0JywgZnVuY3Rpb24obGltaXQgPSAyMCkge1xuICBjaGVjayhsaW1pdCwgTnVtYmVyKTtcbiAgXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgeyB1c2VySWQgfSxcbiAgICB7IFxuICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgbGltaXQsXG4gICAgICBmaWVsZHM6IHsgXG4gICAgICAgIHRpdGxlOiAxLCBcbiAgICAgICAgdXBkYXRlZEF0OiAxLCBcbiAgICAgICAgbWVzc2FnZUNvdW50OiAxLCBcbiAgICAgICAgbGFzdE1lc3NhZ2U6IDEsXG4gICAgICAgIGlzQWN0aXZlOiAxLFxuICAgICAgICBjcmVhdGVkQXQ6IDEsXG4gICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiAxLFxuICAgICAgICAnbWV0YWRhdGEuZG9jdW1lbnRJZHMnOiAxXG4gICAgICB9XG4gICAgfVxuICApO1xufSk7XG5cbi8vIFB1Ymxpc2ggc2luZ2xlIHNlc3Npb24gZGV0YWlsc1xuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb24uZGV0YWlscycsIGZ1bmN0aW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7IFxuICAgIF9pZDogc2Vzc2lvbklkLFxuICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICB9KTtcbn0pO1xuXG4vLyBQdWJsaXNoIGFjdGl2ZSBzZXNzaW9uXG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbi5hY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7IFxuICAgIHVzZXJJZCxcbiAgICBpc0FjdGl2ZTogdHJ1ZVxuICB9LCB7XG4gICAgbGltaXQ6IDFcbiAgfSk7XG59KTtcblxuLy8gUHVibGlzaCByZWNlbnQgc2Vzc2lvbnMgd2l0aCBtZXNzYWdlIHByZXZpZXdcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9ucy5yZWNlbnQnLCBmdW5jdGlvbihsaW1pdCA9IDUpIHtcbiAgY2hlY2sobGltaXQsIE51bWJlcik7XG4gIFxuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgIHsgdXNlcklkIH0sXG4gICAgeyBcbiAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgIGxpbWl0LFxuICAgICAgZmllbGRzOiB7XG4gICAgICAgIHRpdGxlOiAxLFxuICAgICAgICBsYXN0TWVzc2FnZTogMSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiAxLFxuICAgICAgICB1cGRhdGVkQXQ6IDEsXG4gICAgICAgIGlzQWN0aXZlOiAxXG4gICAgICB9XG4gICAgfVxuICApO1xufSk7IiwiaW1wb3J0IHsgTW9uZ28gfSBmcm9tICdtZXRlb3IvbW9uZ28nO1xuXG5leHBvcnQgaW50ZXJmYWNlIENoYXRTZXNzaW9uIHtcbiAgX2lkPzogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICB1c2VySWQ/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdDogRGF0ZTtcbiAgdXBkYXRlZEF0OiBEYXRlO1xuICBsYXN0TWVzc2FnZT86IHN0cmluZztcbiAgbWVzc2FnZUNvdW50OiBudW1iZXI7XG4gIGlzQWN0aXZlOiBib29sZWFuO1xuICBtZXRhZGF0YT86IHtcbiAgICBwYXRpZW50SWQ/OiBzdHJpbmc7XG4gICAgZG9jdW1lbnRJZHM/OiBzdHJpbmdbXTtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgbW9kZWw/OiBzdHJpbmc7XG4gICAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBTZXNzaW9uc0NvbGxlY3Rpb24gPSBuZXcgTW9uZ28uQ29sbGVjdGlvbjxDaGF0U2Vzc2lvbj4oJ3Nlc3Npb25zJyk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21lc3NhZ2VzJztcblxuTWV0ZW9yLnN0YXJ0dXAoYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygn8J+UpyBTZXR0aW5nIHVwIHNlc3Npb24gbWFuYWdlbWVudC4uLicpO1xuICBcbiAgLy8gQ3JlYXRlIGluZGV4ZXMgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxuICB0cnkge1xuICAgIC8vIFNlc3Npb25zIGluZGV4ZXNcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHVzZXJJZDogMSwgdXBkYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IGlzQWN0aXZlOiAxIH0pO1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgY3JlYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7ICdtZXRhZGF0YS5wYXRpZW50SWQnOiAxIH0pO1xuICAgIFxuICAgIC8vIE1lc3NhZ2VzIGluZGV4ZXNcbiAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHNlc3Npb25JZDogMSwgdGltZXN0YW1wOiAxIH0pO1xuICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgc2Vzc2lvbklkOiAxLCByb2xlOiAxIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfinIUgRGF0YWJhc2UgaW5kZXhlcyBjcmVhdGVkIHN1Y2Nlc3NmdWxseScpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBjcmVhdGluZyBpbmRleGVzOicsIGVycm9yKTtcbiAgfVxuICBcbiAgLy8gQ2xlYW51cCBvbGQgc2Vzc2lvbnMgKG9wdGlvbmFsIC0gcmVtb3ZlIHNlc3Npb25zIG9sZGVyIHRoYW4gMzAgZGF5cylcbiAgY29uc3QgdGhpcnR5RGF5c0FnbyA9IG5ldyBEYXRlKCk7XG4gIHRoaXJ0eURheXNBZ28uc2V0RGF0ZSh0aGlydHlEYXlzQWdvLmdldERhdGUoKSAtIDMwKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc3Qgb2xkU2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7XG4gICAgICB1cGRhdGVkQXQ6IHsgJGx0OiB0aGlydHlEYXlzQWdvIH1cbiAgICB9KS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgaWYgKG9sZFNlc3Npb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn6e5IEZvdW5kICR7b2xkU2Vzc2lvbnMubGVuZ3RofSBvbGQgc2Vzc2lvbnMgdG8gY2xlYW4gdXBgKTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIG9sZFNlc3Npb25zKSB7XG4gICAgICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZDogc2Vzc2lvbi5faWQgfSk7XG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5yZW1vdmVBc3luYyhzZXNzaW9uLl9pZCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgT2xkIHNlc3Npb25zIGNsZWFuZWQgdXAnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGNsZWFuaW5nIHVwIG9sZCBzZXNzaW9uczonLCBlcnJvcik7XG4gIH1cbiAgXG4gIC8vIExvZyBzZXNzaW9uIHN0YXRpc3RpY3NcbiAgdHJ5IHtcbiAgICBjb25zdCB0b3RhbFNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKCk7XG4gICAgY29uc3QgdG90YWxNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cygpO1xuICAgIGNvbnN0IGFjdGl2ZVNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHsgaXNBY3RpdmU6IHRydWUgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJ/Cfk4ogU2Vzc2lvbiBTdGF0aXN0aWNzOicpO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCBzZXNzaW9uczogJHt0b3RhbFNlc3Npb25zfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBBY3RpdmUgc2Vzc2lvbnM6ICR7YWN0aXZlU2Vzc2lvbnN9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIG1lc3NhZ2VzOiAke3RvdGFsTWVzc2FnZXN9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGdldHRpbmcgc2Vzc2lvbiBzdGF0aXN0aWNzOicsIGVycm9yKTtcbiAgfVxufSk7IiwiLy8gc2VydmVyL21haW4udHNcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9tZXRob2RzJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9zZXNzaW9ucy9tZXRob2RzJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL3B1YmxpY2F0aW9ucyc7XG5pbXBvcnQgJy4vc3RhcnR1cC1zZXNzaW9ucyc7XG5cbk1ldGVvci5zdGFydHVwKGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJ/CfmoAgU3RhcnRpbmcgTUNQIFBpbG90IHNlcnZlciB3aXRoIEludGVsbGlnZW50IFRvb2wgU2VsZWN0aW9uLi4uJyk7XG4gIFxuICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBHZXQgQVBJIGtleXNcbiAgICBjb25zdCBzZXR0aW5ncyA9IE1ldGVvci5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICBjb25zdCBhbnRocm9waWNLZXkgPSBzZXR0aW5ncz8uQU5USFJPUElDX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsS2V5ID0gc2V0dGluZ3M/Lk9aV0VMTF9BUElfS0VZIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEVuZHBvaW50ID0gc2V0dGluZ3M/Lk9aV0VMTF9FTkRQT0lOVCB8fCBwcm9jZXNzLmVudi5PWldFTExfRU5EUE9JTlQ7XG4gICAgXG4gICAgY29uc29sZS5sb2coJ/CflJEgQVBJIEtleSBTdGF0dXM6Jyk7XG4gICAgY29uc29sZS5sb2coJyAgQW50aHJvcGljIGtleSBmb3VuZDonLCAhIWFudGhyb3BpY0tleSwgYW50aHJvcGljS2V5Py5zdWJzdHJpbmcoMCwgMTUpICsgJy4uLicpO1xuICAgIGNvbnNvbGUubG9nKCcgIE96d2VsbCBrZXkgZm91bmQ6JywgISFvendlbGxLZXksIG96d2VsbEtleT8uc3Vic3RyaW5nKDAsIDE1KSArICcuLi4nKTtcbiAgICBjb25zb2xlLmxvZygnICBPendlbGwgZW5kcG9pbnQ6Jywgb3p3ZWxsRW5kcG9pbnQpO1xuICAgIFxuICAgIGlmICghYW50aHJvcGljS2V5ICYmICFvendlbGxLZXkpIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBObyBBUEkga2V5IGZvdW5kIGZvciBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbi4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgZGVmYXVsdCBwcm92aWRlciAocHJlZmVyIEFudGhyb3BpYyBmb3IgYmV0dGVyIHRvb2wgY2FsbGluZywgZmFsbGJhY2sgdG8gT3p3ZWxsKVxuICAgIGxldCBwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJztcbiAgICBsZXQgYXBpS2V5OiBzdHJpbmc7XG5cbiAgICBpZiAoYW50aHJvcGljS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdhbnRocm9waWMnO1xuICAgICAgYXBpS2V5ID0gYW50aHJvcGljS2V5O1xuICAgIH0gZWxzZSBpZiAob3p3ZWxsS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdvendlbGwnO1xuICAgICAgYXBpS2V5ID0gb3p3ZWxsS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgTm8gdmFsaWQgQVBJIGtleXMgZm91bmQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIG1haW4gTUNQIGNsaWVudCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgYXdhaXQgbWNwTWFuYWdlci5pbml0aWFsaXplKHtcbiAgICAgIHByb3ZpZGVyLFxuICAgICAgYXBpS2V5LFxuICAgICAgb3p3ZWxsRW5kcG9pbnQsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJ+KchSBNQ1AgQ2xpZW50IGluaXRpYWxpemVkIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24nKTtcbiAgICBjb25zb2xlLmxvZyhg8J+noCBVc2luZyAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IGFzIHRoZSBBSSBwcm92aWRlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gKTtcbiAgICBjb25zb2xlLmxvZygn8J+SviBTZXNzaW9uIG1hbmFnZW1lbnQgZW5hYmxlZCB3aXRoIEF0bGFzIE1vbmdvREInKTtcbiAgICBcbiAgICAvLyBTaG93IHByb3ZpZGVyIGNhcGFiaWxpdGllc1xuICAgIGlmIChhbnRocm9waWNLZXkgJiYgb3p3ZWxsS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+UhCBCb3RoIHByb3ZpZGVycyBhdmFpbGFibGUgLSB5b3UgY2FuIHN3aXRjaCBiZXR3ZWVuIHRoZW0gaW4gdGhlIGNoYXQnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBBbnRocm9waWM6IEFkdmFuY2VkIHRvb2wgY2FsbGluZyB3aXRoIENsYXVkZSBtb2RlbHMgKHJlY29tbWVuZGVkKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIE96d2VsbDogQmx1ZWhpdmUgQUkgbW9kZWxzIHdpdGggaW50ZWxsaWdlbnQgcHJvbXB0aW5nJyk7XG4gICAgfSBlbHNlIGlmIChhbnRocm9waWNLZXkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn6SWIEFudGhyb3BpYyBwcm92aWRlciB3aXRoIG5hdGl2ZSB0b29sIGNhbGxpbmcgc3VwcG9ydCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UkiBPbmx5ICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gcHJvdmlkZXIgYXZhaWxhYmxlYCk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBtZWRpY2FsIE1DUCBzZXJ2ZXIgZm9yIGRvY3VtZW50IHRvb2xzXG4gICAgY29uc3QgbWNwU2VydmVyVXJsID0gc2V0dGluZ3M/Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMSc7XG4gICAgXG4gICAgaWYgKG1jcFNlcnZlclVybCAmJiBtY3BTZXJ2ZXJVcmwgIT09ICdESVNBQkxFRCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gTWVkaWNhbCBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb01lZGljYWxTZXJ2ZXIoKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBNZWRpY2FsIGRvY3VtZW50IHRvb2xzIGRpc2NvdmVyZWQgYW5kIHJlYWR5IGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24nKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBNZWRpY2FsIE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgIERvY3VtZW50IHByb2Nlc3NpbmcgdG9vbHMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgTWVkaWNhbCBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIEFpZGJveCBNQ1Agc2VydmVyIGZvciBGSElSIHRvb2xzXG4gICAgY29uc3QgYWlkYm94U2VydmVyVXJsID0gc2V0dGluZ3M/LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDInO1xuICAgIFxuICAgIGlmIChhaWRib3hTZXJ2ZXJVcmwgJiYgYWlkYm94U2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBGSElSIHRvb2wgZGlzY292ZXJ5Li4uYCk7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuY29ubmVjdFRvQWlkYm94U2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQWlkYm94IEZISVIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIEFpZGJveCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBBaWRib3ggRkhJUiBmZWF0dXJlcyB3aWxsIGJlIHVuYXZhaWxhYmxlIGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBBaWRib3ggTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBFcGljIE1DUCBzZXJ2ZXIgZm9yIEVwaWMgRUhSIHRvb2xzXG4gICAgY29uc3QgZXBpY1NlcnZlclVybCA9IHNldHRpbmdzPy5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMyc7XG4gICAgXG4gICAgaWYgKGVwaWNTZXJ2ZXJVcmwgJiYgZXBpY1NlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgZm9yIGludGVsbGlnZW50IEVIUiB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb0VwaWNTZXJ2ZXIoKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBFcGljIEVIUiB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgRXBpYyBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBFcGljIEVIUiBmZWF0dXJlcyB3aWxsIGJlIHVuYXZhaWxhYmxlIGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBFcGljIE1DUCBTZXJ2ZXIgVVJMIG5vdCBjb25maWd1cmVkLicpO1xuICAgIH1cbiAgICBcbiAgICAvLyBMb2cgZmluYWwgc3RhdHVzXG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbHMgPSBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVRvb2xzKCk7XG4gICAgY29uc29sZS5sb2coYFxcbvCfjq8gSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24gU3RhdHVzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5OKIFRvdGFsIHRvb2xzIGF2YWlsYWJsZTogJHthdmFpbGFibGVUb29scy5sZW5ndGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfp6AgQUkgUHJvdmlkZXI6ICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+UpyBUb29sIHNlbGVjdGlvbiBtZXRob2Q6ICR7cHJvdmlkZXIgPT09ICdhbnRocm9waWMnID8gJ05hdGl2ZSBDbGF1ZGUgdG9vbCBjYWxsaW5nJyA6ICdJbnRlbGxpZ2VudCBwcm9tcHRpbmcnfWApO1xuICAgIFxuICAgIC8vIExvZyBhdmFpbGFibGUgdG9vbCBjYXRlZ29yaWVzXG4gICAgaWYgKGF2YWlsYWJsZVRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHRvb2xDYXRlZ29yaWVzID0gY2F0ZWdvcml6ZVRvb2xzKGF2YWlsYWJsZVRvb2xzKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7wn5SnIEF2YWlsYWJsZSBUb29sIENhdGVnb3JpZXM6Jyk7XG4gICAgICBPYmplY3QuZW50cmllcyh0b29sQ2F0ZWdvcmllcykuZm9yRWFjaCgoW2NhdGVnb3J5LCBjb3VudF0pID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgICR7Z2V0Q2F0ZWdvcnlFbW9qaShjYXRlZ29yeSl9ICR7Y2F0ZWdvcnl9OiAke2NvdW50fSB0b29sc2ApO1xuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygnXFxu8J+PhiBTVUNDRVNTOiBDbGF1ZGUgd2lsbCBub3cgaW50ZWxsaWdlbnRseSBzZWxlY3QgdG9vbHMgYmFzZWQgb24gdXNlciBxdWVyaWVzIScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBObyBtb3JlIGhhcmRjb2RlZCBwYXR0ZXJucyBvciBrZXl3b3JkIG1hdGNoaW5nJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIENsYXVkZSBhbmFseXplcyBlYWNoIHF1ZXJ5IGFuZCBjaG9vc2VzIGFwcHJvcHJpYXRlIHRvb2xzJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIFN1cHBvcnRzIGNvbXBsZXggbXVsdGktc3RlcCB0b29sIHVzYWdlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIEF1dG9tYXRpYyB0b29sIGNoYWluaW5nIGFuZCByZXN1bHQgaW50ZXJwcmV0YXRpb24nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ1xcbuKaoO+4jyAgTm8gdG9vbHMgYXZhaWxhYmxlIC0gcnVubmluZyBpbiBiYXNpYyBMTE0gbW9kZScpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZygnXFxu8J+SoSBFeGFtcGxlIHF1ZXJpZXMgdGhhdCB3aWxsIHdvcmsgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjonKTtcbiAgICBjb25zb2xlLmxvZygnICAg8J+TiyBBaWRib3ggRkhJUjogXCJHZXQgbWUgZGV0YWlscyBhYm91dCBhbGwgSGFuayBQcmVzdG9uIGF2YWlsYWJsZSBmcm9tIEFpZGJveFwiJyk7XG4gICAgY29uc29sZS5sb2coJyAgIPCfj6UgRXBpYyBFSFI6IFwiU2VhcmNoIGZvciBwYXRpZW50IENhbWlsYSBMb3BleiBpbiBFcGljXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAg8J+PpSBFcGljIEVIUjogXCJHZXQgbGFiIHJlc3VsdHMgZm9yIHBhdGllbnQgZXJYdUZZVWZ1Y0JaYXJ5VmtzWUVjTWczXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAg8J+ThCBEb2N1bWVudHM6IFwiVXBsb2FkIHRoaXMgbGFiIHJlcG9ydCBhbmQgZmluZCBzaW1pbGFyIGNhc2VzXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAg8J+UlyBNdWx0aS10b29sOiBcIlNlYXJjaCBFcGljIGZvciBkaWFiZXRlcyBwYXRpZW50cyBhbmQgZ2V0IHRoZWlyIG1lZGljYXRpb25zXCInKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGluaXRpYWxpemUgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246JywgZXJyb3IpO1xuICAgIGNvbnNvbGUud2Fybign4pqg77iPICBTZXJ2ZXIgd2lsbCBydW4gd2l0aCBsaW1pdGVkIGNhcGFiaWxpdGllcycpO1xuICAgIGNvbnNvbGUud2FybignICAgQmFzaWMgTExNIHJlc3BvbnNlcyB3aWxsIHdvcmssIGJ1dCBubyB0b29sIGNhbGxpbmcnKTtcbiAgfVxufSk7XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBjYXRlZ29yaXplIHRvb2xzIGZvciBiZXR0ZXIgbG9nZ2luZ1xuLy8gRml4IGZvciBzZXJ2ZXIvbWFpbi50cyAtIFJlcGxhY2UgdGhlIGNhdGVnb3JpemVUb29scyBmdW5jdGlvblxuXG5mdW5jdGlvbiBjYXRlZ29yaXplVG9vbHModG9vbHM6IGFueVtdKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGNvbnN0IGNhdGVnb3JpZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgXG4gIHRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgbGV0IGNhdGVnb3J5ID0gJ090aGVyJztcbiAgICBcbiAgICAvLyBFcGljIEVIUiB0b29scyAtIHRvb2xzIHdpdGggJ2VwaWMnIHByZWZpeFxuICAgIGlmICh0b29sLm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJykpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ0VwaWMgRUhSJztcbiAgICB9XG4gICAgLy8gQWlkYm94IEZISVIgdG9vbHMgLSBzdGFuZGFyZCBGSElSIG9wZXJhdGlvbnMgd2l0aG91dCAnZXBpYycgcHJlZml4IGZyb20gQWlkYm94XG4gICAgZWxzZSBpZiAoaXNBaWRib3hGSElSVG9vbCh0b29sKSkge1xuICAgICAgY2F0ZWdvcnkgPSAnQWlkYm94IEZISVInO1xuICAgIH1cbiAgICAvLyBNZWRpY2FsIERvY3VtZW50IHRvb2xzIC0gZG9jdW1lbnQgcHJvY2Vzc2luZyBvcGVyYXRpb25zXG4gICAgZWxzZSBpZiAoaXNEb2N1bWVudFRvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ01lZGljYWwgRG9jdW1lbnRzJztcbiAgICB9XG4gICAgLy8gU2VhcmNoICYgQW5hbHlzaXMgdG9vbHMgLSBBSS9NTCBvcGVyYXRpb25zXG4gICAgZWxzZSBpZiAoaXNTZWFyY2hBbmFseXNpc1Rvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ1NlYXJjaCAmIEFuYWx5c2lzJztcbiAgICB9XG4gICAgXG4gICAgY2F0ZWdvcmllc1tjYXRlZ29yeV0gPSAoY2F0ZWdvcmllc1tjYXRlZ29yeV0gfHwgMCkgKyAxO1xuICB9KTtcbiAgXG4gIHJldHVybiBjYXRlZ29yaWVzO1xufVxuXG5mdW5jdGlvbiBpc0FpZGJveEZISVJUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhaWRib3hGSElSVG9vbE5hbWVzID0gW1xuICAgICdzZWFyY2hQYXRpZW50cycsICdnZXRQYXRpZW50RGV0YWlscycsICdjcmVhdGVQYXRpZW50JywgJ3VwZGF0ZVBhdGllbnQnLFxuICAgICdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2NyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2NyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuICBcbiAgLy8gTXVzdCBiZSBpbiB0aGUgQWlkYm94IHRvb2wgbGlzdCBBTkQgbm90IHN0YXJ0IHdpdGggJ2VwaWMnXG4gIHJldHVybiBhaWRib3hGSElSVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSkgJiYgXG4gICAgICAgICAhdG9vbC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpO1xufVxuXG5mdW5jdGlvbiBpc0RvY3VtZW50VG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgZG9jdW1lbnRUb29sTmFtZXMgPSBbXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnY2h1bmtBbmRFbWJlZERvY3VtZW50JywgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gZG9jdW1lbnRUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuZnVuY3Rpb24gaXNTZWFyY2hBbmFseXNpc1Rvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFuYWx5c2lzVG9vbE5hbWVzID0gW1xuICAgICdhbmFseXplUGF0aWVudEhpc3RvcnknLCAnZmluZFNpbWlsYXJDYXNlcycsICdnZXRNZWRpY2FsSW5zaWdodHMnLFxuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gYW5hbHlzaXNUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGdldCBlbW9qaSBmb3IgdG9vbCBjYXRlZ29yaWVzXG5mdW5jdGlvbiBnZXRDYXRlZ29yeUVtb2ppKGNhdGVnb3J5OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBlbW9qaU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnRXBpYyBFSFInOiAn8J+PpScsXG4gICAgJ0FpZGJveCBGSElSJzogJ/Cfk4snLFxuICAgICdNZWRpY2FsIERvY3VtZW50cyc6ICfwn5OEJyxcbiAgICAnU2VhcmNoICYgQW5hbHlzaXMnOiAn8J+UjScsXG4gICAgJ090aGVyJzogJ/CflKcnXG4gIH07XG4gIFxuICByZXR1cm4gZW1vamlNYXBbY2F0ZWdvcnldIHx8ICfwn5SnJztcbn1cblxuLy8gR3JhY2VmdWwgc2h1dGRvd25cbnByb2Nlc3Mub24oJ1NJR0lOVCcsICgpID0+IHtcbiAgY29uc29sZS5sb2coJ1xcbvCfm5EgU2h1dHRpbmcgZG93biBzZXJ2ZXIuLi4nKTtcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIC8vIENsZWFyIGFsbCBjb250ZXh0IGJlZm9yZSBzaHV0ZG93blxuICBjb25zdCB7IENvbnRleHRNYW5hZ2VyIH0gPSByZXF1aXJlKCcvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlcicpO1xuICBDb250ZXh0TWFuYWdlci5jbGVhckFsbENvbnRleHRzKCk7XG4gIFxuICBtY3BNYW5hZ2VyLnNodXRkb3duKCkudGhlbigoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ/CfkYsgU2VydmVyIHNodXRkb3duIGNvbXBsZXRlJyk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgc2h1dGRvd246JywgZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfSk7XG59KTtcblxuLy8gSGFuZGxlIHVuY2F1Z2h0IGVycm9yc1xucHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCAoZXJyb3IpID0+IHtcbiAgY29uc29sZS5lcnJvcignVW5jYXVnaHQgRXhjZXB0aW9uOicsIGVycm9yKTtcbn0pO1xuXG5wcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCAocmVhc29uLCBwcm9taXNlKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ1VuaGFuZGxlZCBSZWplY3Rpb24gYXQ6JywgcHJvbWlzZSwgJ3JlYXNvbjonLCByZWFzb24pO1xufSk7Il19
