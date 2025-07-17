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
        async createPatient(patientData) {
          var _result$content3, _result$content3$;
          const result = await connection.callTool('createPatient', patientData);
          return (_result$content3 = result.content) !== null && _result$content3 !== void 0 && (_result$content3$ = _result$content3[0]) !== null && _result$content3$ !== void 0 && _result$content3$.text ? JSON.parse(result.content[0].text) : result;
        },
        async updatePatient(patientId, updates) {
          var _result$content4, _result$content4$;
          const result = await connection.callTool('updatePatient', _objectSpread({
            patientId
          }, updates));
          return (_result$content4 = result.content) !== null && _result$content4 !== void 0 && (_result$content4$ = _result$content4[0]) !== null && _result$content4$ !== void 0 && _result$content4$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientObservations(patientId) {
          var _result$content5, _result$content5$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientObservations', _objectSpread({
            patientId
          }, options));
          return (_result$content5 = result.content) !== null && _result$content5 !== void 0 && (_result$content5$ = _result$content5[0]) !== null && _result$content5$ !== void 0 && _result$content5$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createObservation(observationData) {
          var _result$content6, _result$content6$;
          const result = await connection.callTool('createObservation', observationData);
          return (_result$content6 = result.content) !== null && _result$content6 !== void 0 && (_result$content6$ = _result$content6[0]) !== null && _result$content6$ !== void 0 && _result$content6$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientMedications(patientId) {
          var _result$content7, _result$content7$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientMedications', _objectSpread({
            patientId
          }, options));
          return (_result$content7 = result.content) !== null && _result$content7 !== void 0 && (_result$content7$ = _result$content7[0]) !== null && _result$content7$ !== void 0 && _result$content7$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createMedicationRequest(medicationData) {
          var _result$content8, _result$content8$;
          const result = await connection.callTool('createMedicationRequest', medicationData);
          return (_result$content8 = result.content) !== null && _result$content8 !== void 0 && (_result$content8$ = _result$content8[0]) !== null && _result$content8$ !== void 0 && _result$content8$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientConditions(patientId) {
          var _result$content9, _result$content9$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientConditions', _objectSpread({
            patientId
          }, options));
          return (_result$content9 = result.content) !== null && _result$content9 !== void 0 && (_result$content9$ = _result$content9[0]) !== null && _result$content9$ !== void 0 && _result$content9$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createCondition(conditionData) {
          var _result$content0, _result$content0$;
          const result = await connection.callTool('createCondition', conditionData);
          return (_result$content0 = result.content) !== null && _result$content0 !== void 0 && (_result$content0$ = _result$content0[0]) !== null && _result$content0$ !== void 0 && _result$content0$.text ? JSON.parse(result.content[0].text) : result;
        },
        async getPatientEncounters(patientId) {
          var _result$content1, _result$content1$;
          let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
          const result = await connection.callTool('getPatientEncounters', _objectSpread({
            patientId
          }, options));
          return (_result$content1 = result.content) !== null && _result$content1 !== void 0 && (_result$content1$ = _result$content1[0]) !== null && _result$content1$ !== void 0 && _result$content1$.text ? JSON.parse(result.content[0].text) : result;
        },
        async createEncounter(encounterData) {
          var _result$content10, _result$content10$;
          const result = await connection.callTool('createEncounter', encounterData);
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
        const aidboxToolNames = ['searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient', 'getPatientObservations', 'createObservation', 'getPatientMedications', 'createMedicationRequest', 'getPatientConditions', 'createCondition', 'getPatientEncounters', 'createEncounter',
        // Also handle renamed aidbox tools if they exist
        'aidboxSearchPatients', 'aidboxGetPatientDetails', 'aidboxCreatePatient', 'aidboxUpdatePatient', 'aidboxGetPatientObservations', 'aidboxCreateObservation', 'aidboxGetPatientMedications', 'aidboxCreateMedicationRequest', 'aidboxGetPatientConditions', 'aidboxCreateCondition', 'aidboxGetPatientEncounters', 'aidboxCreateEncounter'];
        if (aidboxToolNames.includes(toolName)) {
          if (!this.aidboxConnection) {
            throw new Error('Aidbox MCP Server not connected - cannot call Aidbox tools');
          }
          console.log("\uD83C\uDFE5 Routing ".concat(toolName, " to Aidbox MCP Server (port 3002)"));
          try {
            // Handle renamed tools by converting back to original name
            let actualToolName = toolName;
            if (toolName.startsWith('aidbox')) {
              // Convert aidboxSearchPatients → searchPatients
              actualToolName = toolName.charAt(6).toLowerCase() + toolName.slice(7);
              console.log("\uD83D\uDD04 Converting renamed tool: ".concat(toolName, " \u2192 ").concat(actualToolName));
            }
            const result = await this.aidboxConnection.callTool(actualToolName, args);
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
        console.log("\uD83D\uDCE4 Uploading document: ".concat(fileData.filename, " (").concat(fileData.mimeType, ")"));
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
          var _this$connection;
          const medical = mcpManager.getMedicalOperations();
          const result = await medical.uploadDocument(Buffer.from(fileData.content, 'base64'), fileData.filename, fileData.mimeType, {
            patientName: fileData.patientName,
            sessionId: fileData.sessionId || ((_this$connection = this.connection) === null || _this$connection === void 0 ? void 0 : _this$connection.id) || 'default',
            uploadedBy: this.userId || 'anonymous',
            uploadDate: new Date()
          });
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
          throw new Meteor.Error('upload-failed', "Failed to upload document: ".concat(error.message || 'Unknown error'));
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsImFjdHVhbFRvb2xOYW1lIiwiY2hhckF0IiwibWVkaWNhbFRvb2xOYW1lcyIsImF2YWlsYWJsZVRvb2wiLCJhdmFpbGFibGVUb29sTmFtZXMiLCJjYWxsRXBpY1Rvb2wiLCJlcGljIiwiYWlkYm94IiwibWVkaWNhbCIsImVwaWNIZWFsdGgiLCJhaWRib3hIZWFsdGgiLCJtZWRpY2FsSGVhbHRoIiwicHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbiIsInByb2Nlc3NXaXRoQW50aHJvcGljSW50ZWxsaWdlbnQiLCJwcm9jZXNzV2l0aE96d2VsbEludGVsbGlnZW50IiwiX2Vycm9yJG1lc3NhZ2UiLCJfZXJyb3IkbWVzc2FnZTIiLCJfZXJyb3IkbWVzc2FnZTMiLCJOT0RFX0VOViIsInF1ZXJ5SW50ZW50IiwiY29udGV4dEluZm8iLCJzeXN0ZW1Qcm9tcHQiLCJjb252ZXJzYXRpb25IaXN0b3J5IiwiZmluYWxSZXNwb25zZSIsIml0ZXJhdGlvbnMiLCJtYXhJdGVyYXRpb25zIiwibWF4UmV0cmllcyIsInJldHJ5Q291bnQiLCJjcmVhdGUiLCJtb2RlbCIsIm1heF90b2tlbnMiLCJzeXN0ZW0iLCJ0b29sX2Nob2ljZSIsImRlbGF5IiwicG93IiwiUHJvbWlzZSIsInJlc29sdmUiLCJzZXRUaW1lb3V0IiwiaGFzVG9vbFVzZSIsImFzc2lzdGFudFJlc3BvbnNlIiwiaW5wdXQiLCJ0b29sUmVzdWx0IiwidG9vbF91c2VfaWQiLCJmb3JtYXRUb29sUmVzdWx0IiwiaXNfZXJyb3IiLCJfdGhpcyRjb25maWciLCJlbmRwb2ludCIsIm96d2VsbEVuZHBvaW50IiwiYXZhaWxhYmxlVG9vbHNEZXNjcmlwdGlvbiIsIl90aGlzJGNvbmZpZzIiLCJfZGF0YSRjaG9pY2VzIiwiX2RhdGEkY2hvaWNlcyQiLCJwcm9tcHQiLCJ0ZW1wZXJhdHVyZSIsInN0cmVhbSIsImRhdGEiLCJjaG9pY2VzIiwiY29tcGxldGlvbiIsInByb2Nlc3NRdWVyeVdpdGhNZWRpY2FsQ29udGV4dCIsImdldEF2YWlsYWJsZVRvb2xzIiwiaXNUb29sQXZhaWxhYmxlIiwic29tZSIsImdldE1lZGljYWxPcGVyYXRpb25zIiwiZ2V0RXBpY09wZXJhdGlvbnMiLCJnZXRBaWRib3hPcGVyYXRpb25zIiwic3dpdGNoUHJvdmlkZXIiLCJ0b1VwcGVyQ2FzZSIsImdldEN1cnJlbnRQcm92aWRlciIsIl90aGlzJGNvbmZpZzMiLCJnZXRBdmFpbGFibGVQcm92aWRlcnMiLCJfZ2xvYmFsJE1ldGVvcjQiLCJfZ2xvYmFsJE1ldGVvcjQkc2V0dGkiLCJhbnRocm9waWNLZXkiLCJBTlRIUk9QSUNfQVBJX0tFWSIsIm96d2VsbEtleSIsIk9aV0VMTF9BUElfS0VZIiwicHJvdmlkZXJzIiwiaXNSZWFkeSIsImdldENvbmZpZyIsInNodXRkb3duIiwiY29udGVudFR5cGUiLCJoYW5kbGVTdHJlYW1pbmdSZXNwb25zZSIsInJlc3BvbnNlVGV4dCIsInJlamVjdCIsIl9yZXNwb25zZSRib2R5IiwicmVhZGVyIiwiZ2V0UmVhZGVyIiwiZGVjb2RlciIsIlRleHREZWNvZGVyIiwiYnVmZmVyIiwicHJvY2Vzc0NodW5rIiwiZG9uZSIsInZhbHVlIiwicmVhZCIsImRlY29kZSIsImxpbmVzIiwicG9wIiwibGluZSIsInBhcnNlZCIsImNhbmNlbCIsImNhdGNoIiwidXBsb2FkRG9jdW1lbnQiLCJmaWxlIiwiZmlsZW5hbWUiLCJtaW1lVHlwZSIsInRpdGxlIiwiZmlsZUJ1ZmZlciIsInRvU3RyaW5nIiwiZmlsZVR5cGUiLCJzZWFyY2hEb2N1bWVudHMiLCJ0aHJlc2hvbGQiLCJsaXN0RG9jdW1lbnRzIiwib2Zmc2V0IiwiZG9jdW1lbnRJZCIsImZpbmRTaW1pbGFyQ2FzZXMiLCJjcml0ZXJpYSIsImFuYWx5emVQYXRpZW50SGlzdG9yeSIsImFuYWx5c2lzVHlwZSIsImRhdGVSYW5nZSIsImdldE1lZGljYWxJbnNpZ2h0cyIsImV4dHJhY3RUZXh0IiwiX2lkIiwiZG9jdW1lbnRzIiwic3VjY2VzcyIsImV4dHJhY3RlZFRleHQiLCJjb25maWRlbmNlIiwic2VhcmNoQnlEaWFnbm9zaXMiLCJwYXRpZW50SWRlbnRpZmllciIsImRpYWdub3Npc1F1ZXJ5Iiwic2VtYW50aWNTZWFyY2giLCJnZXRQYXRpZW50U3VtbWFyeSIsIk1vbmdvIiwiQ29sbGVjdGlvbiIsImV4dHJhY3RBbmRVcGRhdGVDb250ZXh0IiwiZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZSIsImV4dHJhY3REYXRhU291cmNlcyIsInNhbml0aXplUGF0aWVudE5hbWUiLCJjaGVjayIsIk1hdGNoIiwibWV0aG9kcyIsIm1lc3NhZ2VzLmluc2VydCIsIm1lc3NhZ2VEYXRhIiwiU3RyaW5nIiwibWVzc2FnZUlkIiwiaW5zZXJ0QXN5bmMiLCIkaW5jIiwiY2FsbCIsIm1jcC5wcm9jZXNzUXVlcnkiLCJNYXliZSIsImlzU2ltdWxhdGlvbiIsIm1jcE1hbmFnZXIiLCJfc2Vzc2lvbiRtZXRhZGF0YSIsImNvbnRleHREYXRhIiwiY29udmVyc2F0aW9uQ29udGV4dCIsIm1jcC5zd2l0Y2hQcm92aWRlciIsIm1jcC5nZXRDdXJyZW50UHJvdmlkZXIiLCJtY3AuZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX01ldGVvciRzZXR0aW5ncyIsIm1jcC5nZXRBdmFpbGFibGVUb29scyIsIm1jcC5oZWFsdGhDaGVjayIsInNlcnZlcnMiLCJtZWRpY2FsLnVwbG9hZERvY3VtZW50IiwiZmlsZURhdGEiLCJwYXRpZW50TmFtZSIsIm5vdyIsIl90aGlzJGNvbm5lY3Rpb24iLCJCdWZmZXIiLCJ1cGxvYWRlZEJ5IiwidXNlcklkIiwidXBsb2FkRGF0ZSIsIiRhZGRUb1NldCIsIm1lZGljYWwucHJvY2Vzc0RvY3VtZW50IiwidGV4dEV4dHJhY3Rpb24iLCJkaWFnbm9zaXNDb3VudCIsIm1lZGljYXRpb25Db3VudCIsImxhYlJlc3VsdENvdW50IiwicGF0aWVudE1hdGNoIiwiJGVhY2giLCJkYXRhU291cmNlcyIsIm1lZGljYWxQYXR0ZXJucyIsInNvdXJjZXMiLCJ3b3JkIiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3J5IiwiZ2V0Q2F0ZWdvcnlFbW9qaSIsImNhdGVnb3JpZXMiLCJpc1NlYXJjaEFuYWx5c2lzVG9vbCIsImVtb2ppTWFwIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQUEsQ0FBT0MsTUFBRTtNQUFBQyxjQUE2QixFQUFBQSxDQUFBLEtBQUFBO0lBQU07SUFBQSxJQUFBQyxrQkFBdUI7SUFBQUgsTUFBQSxDQUFBSSxJQUFBO01BQUFELG1CQUFBRSxDQUFBO1FBQUFGLGtCQUFBLEdBQUFFLENBQUE7TUFBQTtJQUFBO0lBQUEsSUFBQUMsa0JBQUE7SUFBQU4sTUFBQSxDQUFBSSxJQUFBO01BQUFFLG1CQUFBRCxDQUFBO1FBQUFDLGtCQUFBLEdBQUFELENBQUE7TUFBQTtJ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LG1CQUFtQixFQUFHcFosS0FBSyxJQUFJO01BQ3hDckIsT0FBTyxDQUFDcUIsS0FBSyxDQUFDLHFCQUFxQixFQUFFQSxLQUFLLENBQUM7SUFDN0MsQ0FBQyxDQUFDO0lBRUYyRyxPQUFPLENBQUN5UyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQ0ksTUFBTSxFQUFFQyxPQUFPLEtBQUk7TUFDbkQ5YSxPQUFPLENBQUNxQixLQUFLLENBQUMseUJBQXlCLEVBQUV5WixPQUFPLEVBQUUsU0FBUyxFQUFFRCxNQUFNLENBQUM7SUFDdEUsQ0FBQyxDQUFDO0lBQUM5YixzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9hcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24sIE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlcy9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udmVyc2F0aW9uQ29udGV4dCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICByZWNlbnRNZXNzYWdlczogTWVzc2FnZVtdO1xuICBwYXRpZW50Q29udGV4dD86IHN0cmluZztcbiAgZG9jdW1lbnRDb250ZXh0Pzogc3RyaW5nW107XG4gIG1lZGljYWxFbnRpdGllcz86IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PjtcbiAgbWF4Q29udGV4dExlbmd0aDogbnVtYmVyO1xuICB0b3RhbFRva2VuczogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBjb250ZXh0cyA9IG5ldyBNYXA8c3RyaW5nLCBDb252ZXJzYXRpb25Db250ZXh0PigpO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQ09OVEVYVF9MRU5HVEggPSA0MDAwOyAvLyBBZGp1c3QgYmFzZWQgb24gbW9kZWxcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX01FU1NBR0VTID0gMjA7XG4gIFxuICBzdGF0aWMgYXN5bmMgZ2V0Q29udGV4dChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29udmVyc2F0aW9uQ29udGV4dD4ge1xuICAgIGxldCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIC8vIExvYWQgY29udGV4dCBmcm9tIGRhdGFiYXNlXG4gICAgICBjb250ZXh0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGV4dEZyb21EQihzZXNzaW9uSWQpO1xuICAgICAgdGhpcy5jb250ZXh0cy5zZXQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIGxvYWRDb250ZXh0RnJvbURCKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb252ZXJzYXRpb25Db250ZXh0PiB7XG4gICAgLy8gTG9hZCByZWNlbnQgbWVzc2FnZXNcbiAgICBjb25zdCByZWNlbnRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQgfSxcbiAgICAgIHsgXG4gICAgICAgIHNvcnQ6IHsgdGltZXN0YW1wOiAtMSB9LCBcbiAgICAgICAgbGltaXQ6IHRoaXMuTUFYX01FU1NBR0VTIFxuICAgICAgfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIC8vIExvYWQgc2Vzc2lvbiBtZXRhZGF0YVxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgXG4gICAgY29uc3QgY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHJlY2VudE1lc3NhZ2VzOiByZWNlbnRNZXNzYWdlcy5yZXZlcnNlKCksXG4gICAgICBtYXhDb250ZXh0TGVuZ3RoOiB0aGlzLk1BWF9DT05URVhUX0xFTkdUSCxcbiAgICAgIHRvdGFsVG9rZW5zOiAwXG4gICAgfTtcbiAgICBcbiAgICAvLyBBZGQgbWV0YWRhdGEgZnJvbSBzZXNzaW9uXG4gICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhKSB7XG4gICAgICBjb250ZXh0LnBhdGllbnRDb250ZXh0ID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICBjb250ZXh0LmRvY3VtZW50Q29udGV4dCA9IHNlc3Npb24ubWV0YWRhdGEuZG9jdW1lbnRJZHM7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCBlbnRpdGllcyBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnRleHQubWVkaWNhbEVudGl0aWVzID0gdGhpcy5leHRyYWN0TWVkaWNhbEVudGl0aWVzKHJlY2VudE1lc3NhZ2VzKTtcbiAgICBcbiAgICAvLyBDYWxjdWxhdGUgdG9rZW4gdXNhZ2VcbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgXG4gICAgLy8gVHJpbSBpZiBuZWVkZWRcbiAgICB0aGlzLnRyaW1Db250ZXh0KGNvbnRleHQpO1xuICAgIFxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIFxuICBzdGF0aWMgYXN5bmMgdXBkYXRlQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgbmV3TWVzc2FnZTogTWVzc2FnZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICAvLyBBZGQgbmV3IG1lc3NhZ2VcbiAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnB1c2gobmV3TWVzc2FnZSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIG1lZGljYWwgZW50aXRpZXMgaWYgbWVzc2FnZSBjb250YWlucyB0aGVtXG4gICAgaWYgKG5ld01lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcbiAgICAgIGNvbnN0IGVudGl0aWVzID0gdGhpcy5leHRyYWN0RW50aXRpZXNGcm9tTWVzc2FnZShuZXdNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgaWYgKGVudGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29udGV4dC5tZWRpY2FsRW50aXRpZXMgPSBbXG4gICAgICAgICAgLi4uKGNvbnRleHQubWVkaWNhbEVudGl0aWVzIHx8IFtdKSxcbiAgICAgICAgICAuLi5lbnRpdGllc1xuICAgICAgICBdLnNsaWNlKC01MCk7IC8vIEtlZXAgbGFzdCA1MCBlbnRpdGllc1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBSZWNhbGN1bGF0ZSB0b2tlbnMgYW5kIHRyaW1cbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgdGhpcy50cmltQ29udGV4dChjb250ZXh0KTtcbiAgICBcbiAgICB0aGlzLmNvbnRleHRzLnNldChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICAgIFxuICAgIC8vIFBlcnNpc3QgaW1wb3J0YW50IGNvbnRleHQgYmFjayB0byBzZXNzaW9uXG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0Q29udGV4dChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyB0cmltQ29udGV4dChjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KSB7XG4gICAgd2hpbGUgKGNvbnRleHQudG90YWxUb2tlbnMgPiBjb250ZXh0Lm1heENvbnRleHRMZW5ndGggJiYgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggPiAyKSB7XG4gICAgICAvLyBSZW1vdmUgb2xkZXN0IG1lc3NhZ2VzLCBidXQga2VlcCBhdCBsZWFzdCAyXG4gICAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnNoaWZ0KCk7XG4gICAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgfVxuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBjYWxjdWxhdGVUb2tlbnMoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IG51bWJlciB7XG4gICAgLy8gUm91Z2ggZXN0aW1hdGlvbjogMSB0b2tlbiDiiYggNCBjaGFyYWN0ZXJzXG4gICAgbGV0IHRvdGFsQ2hhcnMgPSAwO1xuICAgIFxuICAgIC8vIENvdW50IG1lc3NhZ2UgY29udGVudFxuICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5yZWNlbnRNZXNzYWdlc1xuICAgICAgLm1hcChtc2cgPT4gbXNnLmNvbnRlbnQpXG4gICAgICAuam9pbignICcpLmxlbmd0aDtcbiAgICBcbiAgICAvLyBDb3VudCBtZXRhZGF0YVxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQucGF0aWVudENvbnRleHQubGVuZ3RoICsgMjA7IC8vIEluY2x1ZGUgbGFiZWxcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQuZG9jdW1lbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQuZG9jdW1lbnRDb250ZXh0LmpvaW4oJyAnKS5sZW5ndGggKyAzMDtcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQubWVkaWNhbEVudGl0aWVzKSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQubWVkaWNhbEVudGl0aWVzXG4gICAgICAgIC5tYXAoZSA9PiBgJHtlLnRleHR9ICgke2UubGFiZWx9KWApXG4gICAgICAgIC5qb2luKCcsICcpLmxlbmd0aDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIE1hdGguY2VpbCh0b3RhbENoYXJzIC8gNCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBidWlsZENvbnRleHRQcm9tcHQoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgLy8gQWRkIHBhdGllbnQgY29udGV4dFxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICBwYXJ0cy5wdXNoKGBDdXJyZW50IFBhdGllbnQ6ICR7Y29udGV4dC5wYXRpZW50Q29udGV4dH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIGRvY3VtZW50IGNvbnRleHRcbiAgICBpZiAoY29udGV4dC5kb2N1bWVudENvbnRleHQgJiYgY29udGV4dC5kb2N1bWVudENvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgcGFydHMucHVzaChgUmVsYXRlZCBEb2N1bWVudHM6ICR7Y29udGV4dC5kb2N1bWVudENvbnRleHQuc2xpY2UoMCwgNSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIG1lZGljYWwgZW50aXRpZXMgc3VtbWFyeVxuICAgIGlmIChjb250ZXh0Lm1lZGljYWxFbnRpdGllcyAmJiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBlbnRpdHlTdW1tYXJ5ID0gdGhpcy5zdW1tYXJpemVNZWRpY2FsRW50aXRpZXMoY29udGV4dC5tZWRpY2FsRW50aXRpZXMpO1xuICAgICAgcGFydHMucHVzaChgTWVkaWNhbCBDb250ZXh0OiAke2VudGl0eVN1bW1hcnl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGlmIChjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbiA9IGNvbnRleHQucmVjZW50TWVzc2FnZXNcbiAgICAgICAgLm1hcChtc2cgPT4gYCR7bXNnLnJvbGUgPT09ICd1c2VyJyA/ICdVc2VyJyA6ICdBc3Npc3RhbnQnfTogJHttc2cuY29udGVudH1gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICBcbiAgICAgIHBhcnRzLnB1c2goYFJlY2VudCBDb252ZXJzYXRpb246XFxuJHtjb252ZXJzYXRpb259YCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBwYXJ0cy5qb2luKCdcXG5cXG4nKTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgc3VtbWFyaXplTWVkaWNhbEVudGl0aWVzKGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4pOiBzdHJpbmcge1xuICAgIGNvbnN0IGdyb3VwZWQgPSBlbnRpdGllcy5yZWR1Y2UoKGFjYywgZW50aXR5KSA9PiB7XG4gICAgICBpZiAoIWFjY1tlbnRpdHkubGFiZWxdKSB7XG4gICAgICAgIGFjY1tlbnRpdHkubGFiZWxdID0gW107XG4gICAgICB9XG4gICAgICBhY2NbZW50aXR5LmxhYmVsXS5wdXNoKGVudGl0eS50ZXh0KTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nW10+KTtcbiAgICBcbiAgICBjb25zdCBzdW1tYXJ5ID0gT2JqZWN0LmVudHJpZXMoZ3JvdXBlZClcbiAgICAgIC5tYXAoKFtsYWJlbCwgdGV4dHNdKSA9PiB7XG4gICAgICAgIGNvbnN0IHVuaXF1ZSA9IFsuLi5uZXcgU2V0KHRleHRzKV0uc2xpY2UoMCwgNSk7XG4gICAgICAgIHJldHVybiBgJHtsYWJlbH06ICR7dW5pcXVlLmpvaW4oJywgJyl9YDtcbiAgICAgIH0pXG4gICAgICAuam9pbignOyAnKTtcbiAgICBcbiAgICByZXR1cm4gc3VtbWFyeTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyhtZXNzYWdlczogTWVzc2FnZVtdKTogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+IHtcbiAgICBjb25zdCBlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+ID0gW107XG4gICAgXG4gICAgLy8gU2ltcGxlIGV4dHJhY3Rpb24gLSBsb29rIGZvciBwYXR0ZXJuc1xuICAgIGNvbnN0IHBhdHRlcm5zID0ge1xuICAgICAgTUVESUNBVElPTjogL1xcYihtZWRpY2F0aW9ufG1lZGljaW5lfGRydWd8cHJlc2NyaXB0aW9uKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBDT05ESVRJT046IC9cXGIoZGlhZ25vc2lzfGNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBTWU1QVE9NOiAvXFxiKHN5bXB0b218Y29tcGxhaW4pOlxccyooW14sLl0rKS9naSxcbiAgICB9O1xuICAgIFxuICAgIG1lc3NhZ2VzLmZvckVhY2gobXNnID0+IHtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKS5mb3JFYWNoKChbbGFiZWwsIHBhdHRlcm5dKSA9PiB7XG4gICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhtc2cuY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICAgICAgZW50aXRpZXMucHVzaCh7XG4gICAgICAgICAgICB0ZXh0OiBtYXRjaFsyXS50cmltKCksXG4gICAgICAgICAgICBsYWJlbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gZW50aXRpZXM7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiB7XG4gICAgY29uc3QgZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiA9IFtdO1xuICAgIFxuICAgIC8vIExvb2sgZm9yIG1lZGljYWwgdGVybXMgaW4gdGhlIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0ge1xuICAgICAgTUVESUNBVElPTjogWydtZWRpY2F0aW9uJywgJ3ByZXNjcmliZWQnLCAnZG9zYWdlJywgJ21nJywgJ3RhYmxldHMnXSxcbiAgICAgIENPTkRJVElPTjogWydkaWFnbm9zaXMnLCAnY29uZGl0aW9uJywgJ3N5bmRyb21lJywgJ2Rpc2Vhc2UnXSxcbiAgICAgIFBST0NFRFVSRTogWydzdXJnZXJ5JywgJ3Byb2NlZHVyZScsICd0ZXN0JywgJ2V4YW1pbmF0aW9uJ10sXG4gICAgICBTWU1QVE9NOiBbJ3BhaW4nLCAnZmV2ZXInLCAnbmF1c2VhJywgJ2ZhdGlndWUnXVxuICAgIH07XG4gICAgXG4gICAgT2JqZWN0LmVudHJpZXMobWVkaWNhbFRlcm1zKS5mb3JFYWNoKChbbGFiZWwsIHRlcm1zXSkgPT4ge1xuICAgICAgdGVybXMuZm9yRWFjaCh0ZXJtID0+IHtcbiAgICAgICAgaWYgKGNvbnRlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHNlbnRlbmNlIGNvbnRhaW5pbmcgdGhlIHRlcm1cbiAgICAgICAgICBjb25zdCBzZW50ZW5jZXMgPSBjb250ZW50LnNwbGl0KC9bLiE/XS8pO1xuICAgICAgICAgIHNlbnRlbmNlcy5mb3JFYWNoKHNlbnRlbmNlID0+IHtcbiAgICAgICAgICAgIGlmIChzZW50ZW5jZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRlcm0pKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IHNlbnRlbmNlLnRyaW0oKS5zdWJzdHJpbmcoMCwgMTAwKTtcbiAgICAgICAgICAgICAgaWYgKGV4dHJhY3RlZCkge1xuICAgICAgICAgICAgICAgIGVudGl0aWVzLnB1c2goeyB0ZXh0OiBleHRyYWN0ZWQsIGxhYmVsIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiBlbnRpdGllcztcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgYXN5bmMgcGVyc2lzdENvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcsIGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAvLyBVcGRhdGUgc2Vzc2lvbiB3aXRoIGxhdGVzdCBjb250ZXh0IG1ldGFkYXRhXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgJHNldDoge1xuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogY29udGV4dC5wYXRpZW50Q29udGV4dCxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogY29udGV4dC5kb2N1bWVudENvbnRleHQsXG4gICAgICAgICdtZXRhZGF0YS5sYXN0RW50aXRpZXMnOiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcz8uc2xpY2UoLTEwKSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IGNvbnRleHQucmVjZW50TWVzc2FnZXNbY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggLSAxXT8uY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyBzZXNzaW9uSWQgfSksXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIFxuICBzdGF0aWMgY2xlYXJDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgdGhpcy5jb250ZXh0cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgfVxuICBcbiAgc3RhdGljIGNsZWFyQWxsQ29udGV4dHMoKSB7XG4gICAgdGhpcy5jb250ZXh0cy5jbGVhcigpO1xuICB9XG4gIFxuICBzdGF0aWMgZ2V0Q29udGV4dFN0YXRzKHNlc3Npb25JZDogc3RyaW5nKTogeyBzaXplOiBudW1iZXI7IG1lc3NhZ2VzOiBudW1iZXI7IHRva2VuczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzaXplOiB0aGlzLmNvbnRleHRzLnNpemUsXG4gICAgICBtZXNzYWdlczogY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGgsXG4gICAgICB0b2tlbnM6IGNvbnRleHQudG90YWxUb2tlbnNcbiAgICB9O1xuICB9XG59IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAganNvbnJwYzogJzIuMCc7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXJhbXM6IGFueTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIE1DUFJlc3BvbnNlIHtcbiAganNvbnJwYzogJzIuMCc7XG4gIHJlc3VsdD86IGFueTtcbiAgZXJyb3I/OiB7XG4gICAgY29kZTogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgfTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEFpZGJveFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDInKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgbmFtZTogJ21ldGVvci1haWRib3gtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+PpSBBaWRib3ggTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuXG4gICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcblxuICAgICAgLy8gVGVzdCBieSBsaXN0aW5nIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEFpZGJveCBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgIFxuICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEF2YWlsYWJsZSBBaWRib3ggdG9vbHM6Jyk7XG4gICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2luZGV4ICsgMX0uICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBjb25uZWN0IHRvIEFpZGJveCBNQ1AgU2VydmVyOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQWlkYm94IE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmVcbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFNlbmRpbmcgcmVxdWVzdCB0byBBaWRib3g6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudFxuICAgICAgY29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbWNwLXNlc3Npb24taWQnKTtcbiAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uSWQgPSByZXNwb25zZVNlc3Npb25JZDtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfj6UgUmVjZWl2ZWQgQWlkYm94IHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYOKchSBBaWRib3ggcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgQWlkYm94IHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBub3RpZmljYXRpb24gPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtc1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxpc3RUb29scygpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICB9XG5cbiAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICB0aGlzLnNlc3Npb25JZCA9IG51bGw7XG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gICAgY29uc29sZS5sb2coJ/Cfj6UgRGlzY29ubmVjdGVkIGZyb20gQWlkYm94IE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBBaWRib3ggRkhJUiBvcGVyYXRpb25zXG5leHBvcnQgaW50ZXJmYWNlIEFpZGJveEZISVJPcGVyYXRpb25zIHtcbiAgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZVBhdGllbnQocGF0aWVudERhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgdXBkYXRlUGF0aWVudChwYXRpZW50SWQ6IHN0cmluZywgdXBkYXRlczogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdChtZWRpY2F0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZUVuY291bnRlcihlbmNvdW50ZXJEYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBaWRib3hPcGVyYXRpb25zKGNvbm5lY3Rpb246IEFpZGJveFNlcnZlckNvbm5lY3Rpb24pOiBBaWRib3hGSElST3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50RGV0YWlscycsIHsgcGF0aWVudElkIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVQYXRpZW50KHBhdGllbnREYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2NyZWF0ZVBhdGllbnQnLCBwYXRpZW50RGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVBhdGllbnQocGF0aWVudElkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgndXBkYXRlUGF0aWVudCcsIHsgcGF0aWVudElkLCAuLi51cGRhdGVzIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVPYnNlcnZhdGlvbihvYnNlcnZhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnY3JlYXRlT2JzZXJ2YXRpb24nLCBvYnNlcnZhdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QobWVkaWNhdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLCBtZWRpY2F0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlQ29uZGl0aW9uKGNvbmRpdGlvbkRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnY3JlYXRlQ29uZGl0aW9uJywgY29uZGl0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlRW5jb3VudGVyKGVuY291bnRlckRhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnY3JlYXRlRW5jb3VudGVyJywgZW5jb3VudGVyRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfVxuICB9O1xufSIsImludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAgICBqc29ucnBjOiAnMi4wJztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBwYXJhbXM6IGFueTtcbiAgICBpZDogc3RyaW5nIHwgbnVtYmVyO1xuICB9XG4gIFxuICBpbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICAgIGpzb25ycGM6ICcyLjAnO1xuICAgIHJlc3VsdD86IGFueTtcbiAgICBlcnJvcj86IHtcbiAgICAgIGNvZGU6IG51bWJlcjtcbiAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICB9O1xuICAgIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIH1cbiAgXG4gIGV4cG9ydCBjbGFzcyBFcGljU2VydmVyQ29ubmVjdGlvbiB7XG4gICAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgcmVxdWVzdElkID0gMTtcbiAgXG4gICAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMycpIHtcbiAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTsgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gICAgfVxuICBcbiAgICBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgICBcbiAgICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfTogJHtoZWFsdGhDaGVjay5lcnJvcn1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvblxuICAgICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgICAgbmFtZTogJ21ldGVvci1lcGljLWNsaWVudCcsXG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEVwaWMgTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuICBcbiAgICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcbiAgXG4gICAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIEF2YWlsYWJsZSBFcGljIHRvb2xzOicpO1xuICAgICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gIFxuICAgICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gY29ubmVjdCB0byBFcGljIE1DUCBTZXJ2ZXI6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vaGVhbHRoYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgRXBpYyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXJhbXMsXG4gICAgICAgIGlkXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9O1xuICBcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBTZW5kaW5nIHJlcXVlc3QgdG8gRXBpYyBNQ1A6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG4gIFxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn4+lIFJlY2VpdmVkIEVwaWMgc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICBcbiAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRXBpYyByZXF1ZXN0ICR7bWV0aG9kfSBzdWNjZXNzZnVsYCk7XG4gICAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVwaWMgcmVxdWVzdCBmYWlsZWQgZm9yIG1ldGhvZCAke21ldGhvZH06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgcGFyYW1zXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfTtcbiAgXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgICAgfVxuICBcbiAgICAgICAgYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEVwaWMgbm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICB9XG4gIFxuICAgIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgfVxuICBcbiAgICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgICBuYW1lLFxuICAgICAgICBhcmd1bWVudHM6IGFyZ3NcbiAgICAgIH0pO1xuICAgIH1cbiAgXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgY29uc29sZS5sb2coJ/Cfj6UgRGlzY29ubmVjdGVkIGZyb20gRXBpYyBNQ1AgU2VydmVyJyk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFcGljIEZISVIgb3BlcmF0aW9ucyBpbnRlcmZhY2VcbiAgZXhwb3J0IGludGVyZmFjZSBFcGljRkhJUk9wZXJhdGlvbnMge1xuICAgIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFcGljT3BlcmF0aW9ucyhjb25uZWN0aW9uOiBFcGljU2VydmVyQ29ubmVjdGlvbik6IEVwaWNGSElST3BlcmF0aW9ucyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoUGF0aWVudHMnLCBxdWVyeSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudERldGFpbHMnLCB7IHBhdGllbnRJZCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudEVuY291bnRlcnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfVxuICAgIH07XG4gIH0iLCIvLyBpbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlci50c1xuaW1wb3J0IEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgeyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbiwgTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucywgY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnMgfSBmcm9tICcuL21lZGljYWxTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEFpZGJveFNlcnZlckNvbm5lY3Rpb24sIEFpZGJveEZISVJPcGVyYXRpb25zLCBjcmVhdGVBaWRib3hPcGVyYXRpb25zIH0gZnJvbSAnLi9haWRib3hTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEVwaWNTZXJ2ZXJDb25uZWN0aW9uLCBFcGljRkhJUk9wZXJhdGlvbnMsIGNyZWF0ZUVwaWNPcGVyYXRpb25zIH0gZnJvbSAnLi9lcGljU2VydmVyQ29ubmVjdGlvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTUNQQ2xpZW50Q29uZmlnIHtcbiAgcHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCc7XG4gIGFwaUtleTogc3RyaW5nO1xuICBvendlbGxFbmRwb2ludD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE1DUENsaWVudE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZTogTUNQQ2xpZW50TWFuYWdlcjtcbiAgcHJpdmF0ZSBhbnRocm9waWM/OiBBbnRocm9waWM7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIGNvbmZpZz86IE1DUENsaWVudENvbmZpZztcbiAgXG4gIC8vIE1lZGljYWwgTUNQIGNvbm5lY3Rpb24gKFN0cmVhbWFibGUgSFRUUClcbiAgcHJpdmF0ZSBtZWRpY2FsQ29ubmVjdGlvbj86IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIG1lZGljYWxPcGVyYXRpb25zPzogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBhdmFpbGFibGVUb29sczogYW55W10gPSBbXTtcblxuICAvLyBBaWRib3ggTUNQIGNvbm5lY3Rpb25cbiAgcHJpdmF0ZSBhaWRib3hDb25uZWN0aW9uPzogQWlkYm94U2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBhaWRib3hPcGVyYXRpb25zPzogQWlkYm94RkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgYWlkYm94VG9vbHM6IGFueVtdID0gW107XG5cbiAgLy8gRXBpYyBNQ1AgY29ubmVjdGlvblxuICBwcml2YXRlIGVwaWNDb25uZWN0aW9uPzogRXBpY1NlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgZXBpY09wZXJhdGlvbnM/OiBFcGljRkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgZXBpY1Rvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7fVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogTUNQQ2xpZW50TWFuYWdlciB7XG4gICAgaWYgKCFNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlKSB7XG4gICAgICBNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlID0gbmV3IE1DUENsaWVudE1hbmFnZXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIE1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZShjb25maWc6IE1DUENsaWVudENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKCfwn6SWIEluaXRpYWxpemluZyBNQ1AgQ2xpZW50IHdpdGggSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24nKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIHRyeSB7XG4gICAgICBpZiAoY29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJykge1xuICAgICAgICBjb25zb2xlLmxvZygnQ3JlYXRpbmcgQW50aHJvcGljIGNsaWVudCB3aXRoIG5hdGl2ZSB0b29sIGNhbGxpbmcgc3VwcG9ydC4uLicpO1xuICAgICAgICB0aGlzLmFudGhyb3BpYyA9IG5ldyBBbnRocm9waWMoe1xuICAgICAgICAgIGFwaUtleTogY29uZmlnLmFwaUtleSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQW50aHJvcGljIGNsaWVudCBpbml0aWFsaXplZCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIE1DUCBDbGllbnQgcmVhZHkgd2l0aCBwcm92aWRlcjogJHtjb25maWcucHJvdmlkZXJ9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBNQ1AgY2xpZW50OicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIENvbm5lY3QgdG8gbWVkaWNhbCBNQ1Agc2VydmVyIGFuZCBnZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvTWVkaWNhbFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICAgIGNvbnN0IG1jcFNlcnZlclVybCA9IHNldHRpbmdzPy5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDEnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBhdDogJHttY3BTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMubWVkaWNhbENvbm5lY3Rpb24gPSBuZXcgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24obWNwU2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5tZWRpY2FsT3BlcmF0aW9ucyA9IGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKHRoaXMubWVkaWNhbENvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbm5lY3RlZCB3aXRoICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IG1lZGljYWwgdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBNZWRpY2FsIHRvb2wgbmFtZXM6ICR7dGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIE1lZGljYWwgTUNQIFNlcnZlciBIVFRQIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjb25uZWN0VG9BaWRib3hTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBhaWRib3hTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDInO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGF0OiAke2FpZGJveFNlcnZlclVybH1gKTtcbiAgICAgIFxuICAgICAgdGhpcy5haWRib3hDb25uZWN0aW9uID0gbmV3IEFpZGJveFNlcnZlckNvbm5lY3Rpb24oYWlkYm94U2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLmFpZGJveE9wZXJhdGlvbnMgPSBjcmVhdGVBaWRib3hPcGVyYXRpb25zKHRoaXMuYWlkYm94Q29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBBaWRib3ggdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5haWRib3hDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5haWRib3hUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIENvbm5lY3RlZCB0byBBaWRib3ggd2l0aCAke3RoaXMuYWlkYm94VG9vbHMubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEFpZGJveCB0b29sIG5hbWVzOiAke3RoaXMuYWlkYm94VG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5haWRib3hUb29scyk7XG4gICAgICBcbiAgICAgIHRoaXMubG9nQXZhaWxhYmxlVG9vbHMoKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgQWlkYm94IE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb0VwaWNTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBlcGljU2VydmVyVXJsID0gc2V0dGluZ3M/LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMyc7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGF0OiAke2VwaWNTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMuZXBpY0Nvbm5lY3Rpb24gPSBuZXcgRXBpY1NlcnZlckNvbm5lY3Rpb24oZXBpY1NlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNvbm5lY3QoKTtcbiAgICAgIHRoaXMuZXBpY09wZXJhdGlvbnMgPSBjcmVhdGVFcGljT3BlcmF0aW9ucyh0aGlzLmVwaWNDb25uZWN0aW9uKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IEVwaWMgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuZXBpY1Rvb2xzID0gdG9vbHNSZXN1bHQudG9vbHMgfHwgW107XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgQ29ubmVjdGVkIHRvIEVwaWMgd2l0aCAke3RoaXMuZXBpY1Rvb2xzLmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBFcGljIHRvb2wgbmFtZXM6ICR7dGhpcy5lcGljVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5lcGljVG9vbHMpO1xuICAgICAgXG4gICAgICB0aGlzLmxvZ0F2YWlsYWJsZVRvb2xzKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBNZXJnZSB0b29scyBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgcHJpdmF0ZSBtZXJnZVRvb2xzVW5pcXVlKGV4aXN0aW5nVG9vbHM6IGFueVtdLCBuZXdUb29sczogYW55W10pOiBhbnlbXSB7XG4gICAgY29uc29sZS5sb2coYPCflKcgTWVyZ2luZyB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke25ld1Rvb2xzLmxlbmd0aH0gbmV3YCk7XG4gICAgXG4gICAgY29uc3QgdG9vbE5hbWVTZXQgPSBuZXcgU2V0KGV4aXN0aW5nVG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG4gICAgY29uc3QgdW5pcXVlTmV3VG9vbHMgPSBuZXdUb29scy5maWx0ZXIodG9vbCA9PiB7XG4gICAgICBpZiAodG9vbE5hbWVTZXQuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gRHVwbGljYXRlIHRvb2wgbmFtZSBmb3VuZDogJHt0b29sLm5hbWV9IC0gc2tpcHBpbmcgZHVwbGljYXRlYCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHRvb2xOYW1lU2V0LmFkZCh0b29sLm5hbWUpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgbWVyZ2VkVG9vbHMgPSBbLi4uZXhpc3RpbmdUb29scywgLi4udW5pcXVlTmV3VG9vbHNdO1xuICAgIGNvbnNvbGUubG9nKGDwn5SnIE1lcmdlZCB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke3VuaXF1ZU5ld1Rvb2xzLmxlbmd0aH0gbmV3ID0gJHttZXJnZWRUb29scy5sZW5ndGh9IHRvdGFsYCk7XG4gICAgXG4gICAgcmV0dXJuIG1lcmdlZFRvb2xzO1xuICB9XG5cbi8vIEZpeCBmb3IgaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMgLSBSZXBsYWNlIHRoZSBsb2dBdmFpbGFibGVUb29scyBtZXRob2RcblxucHJpdmF0ZSBsb2dBdmFpbGFibGVUb29scygpOiB2b2lkIHtcbiAgY29uc29sZS5sb2coJ1xcbvCflKcgQXZhaWxhYmxlIFRvb2xzIGZvciBJbnRlbGxpZ2VudCBTZWxlY3Rpb246Jyk7XG4gIFxuICAvLyBTZXBhcmF0ZSB0b29scyBieSBhY3R1YWwgc291cmNlL3R5cGUsIG5vdCBieSBwYXR0ZXJuIG1hdGNoaW5nXG4gIGNvbnN0IGVwaWNUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpXG4gICk7XG4gIFxuICBjb25zdCBhaWRib3hUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdGhpcy5pc0FpZGJveEZISVJUb29sKHQpICYmICF0Lm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJylcbiAgKTtcbiAgXG4gIGNvbnN0IGRvY3VtZW50VG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNEb2N1bWVudFRvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IGFuYWx5c2lzVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNBbmFseXNpc1Rvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IG90aGVyVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgICFlcGljVG9vbHMuaW5jbHVkZXModCkgJiYgXG4gICAgIWFpZGJveFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFkb2N1bWVudFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFhbmFseXNpc1Rvb2xzLmluY2x1ZGVzKHQpXG4gICk7XG4gIFxuICBpZiAoYWlkYm94VG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn4+lIEFpZGJveCBGSElSIFRvb2xzOicpO1xuICAgIGFpZGJveFRvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChlcGljVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCfwn4+lIEVwaWMgRUhSIFRvb2xzOicpO1xuICAgIGVwaWNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoZG9jdW1lbnRUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgRG9jdW1lbnQgVG9vbHM6Jyk7XG4gICAgZG9jdW1lbnRUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoYW5hbHlzaXNUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/CflI0gU2VhcmNoICYgQW5hbHlzaXMgVG9vbHM6Jyk7XG4gICAgYW5hbHlzaXNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAob3RoZXJUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJ/CflKcgT3RoZXIgVG9vbHM6Jyk7XG4gICAgb3RoZXJUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu8J+noCBDbGF1ZGUgd2lsbCBpbnRlbGxpZ2VudGx5IHNlbGVjdCBmcm9tICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IHRvdGFsIHRvb2xzIGJhc2VkIG9uIHVzZXIgcXVlcmllc2ApO1xuICBcbiAgLy8gRGVidWc6IENoZWNrIGZvciBkdXBsaWNhdGVzXG4gIHRoaXMuZGVidWdUb29sRHVwbGljYXRlcygpO1xufVxuXG4vLyBBZGQgdGhlc2UgaGVscGVyIG1ldGhvZHMgdG8gTUNQQ2xpZW50TWFuYWdlciBjbGFzc1xucHJpdmF0ZSBpc0FpZGJveEZISVJUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhaWRib3hGSElSVG9vbE5hbWVzID0gW1xuICAgICdzZWFyY2hQYXRpZW50cycsICdnZXRQYXRpZW50RGV0YWlscycsICdjcmVhdGVQYXRpZW50JywgJ3VwZGF0ZVBhdGllbnQnLFxuICAgICdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2NyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2NyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFpZGJveEZISVJUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0RvY3VtZW50VG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgZG9jdW1lbnRUb29sTmFtZXMgPSBbXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnY2h1bmtBbmRFbWJlZERvY3VtZW50JywgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gZG9jdW1lbnRUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0FuYWx5c2lzVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYW5hbHlzaXNUb29sTmFtZXMgPSBbXG4gICAgJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsICdmaW5kU2ltaWxhckNhc2VzJywgJ2dldE1lZGljYWxJbnNpZ2h0cycsXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBhbmFseXNpc1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG4gIC8vIERlYnVnIG1ldGhvZCB0byBpZGVudGlmeSBkdXBsaWNhdGUgdG9vbHNcbiAgcHJpdmF0ZSBkZWJ1Z1Rvb2xEdXBsaWNhdGVzKCk6IHZvaWQge1xuICAgIGNvbnN0IHRvb2xOYW1lcyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKTtcbiAgICBjb25zdCBuYW1lQ291bnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAgIFxuICAgIHRvb2xOYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgbmFtZUNvdW50LnNldChuYW1lLCAobmFtZUNvdW50LmdldChuYW1lKSB8fCAwKSArIDEpO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGR1cGxpY2F0ZXMgPSBBcnJheS5mcm9tKG5hbWVDb3VudC5lbnRyaWVzKCkpXG4gICAgICAuZmlsdGVyKChbbmFtZSwgY291bnRdKSA9PiBjb3VudCA+IDEpO1xuICAgIFxuICAgIGlmIChkdXBsaWNhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEVVBMSUNBVEUgVE9PTCBOQU1FUyBGT1VORDonKTtcbiAgICAgIGR1cGxpY2F0ZXMuZm9yRWFjaCgoW25hbWUsIGNvdW50XSkgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgIOKAoiAke25hbWV9OiBhcHBlYXJzICR7Y291bnR9IHRpbWVzYCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgdG9vbCBuYW1lcyBhcmUgdW5pcXVlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBzcGVjaWZpZWQgZGF0YSBzb3VyY2VcbiAgcHJpdmF0ZSBmaWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29sczogYW55W10sIGRhdGFTb3VyY2U6IHN0cmluZyk6IGFueVtdIHtcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtb25nb2RiJykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIE1vbmdvREIvQXRsYXMgLSByZXR1cm4gb25seSBkb2N1bWVudCB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0RvY3VtZW50JykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnc2VhcmNoJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygndXBsb2FkJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZXh0cmFjdCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ01lZGljYWwnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ1NpbWlsYXInKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0luc2lnaHQnKSB8fFxuICAgICAgICAodG9vbC5uYW1lLmluY2x1ZGVzKCdzZWFyY2gnKSAmJiAhdG9vbC5uYW1lLmluY2x1ZGVzKCdQYXRpZW50JykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2ZoaXInKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBBaWRib3ggLSByZXR1cm4gb25seSBGSElSIHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgICh0b29sLm5hbWUuaW5jbHVkZXMoJ1BhdGllbnQnKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnT2JzZXJ2YXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnTWVkaWNhdGlvbicpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdDb25kaXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnRW5jb3VudGVyJykgfHxcbiAgICAgICAgIHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJykgJiZcbiAgICAgICAgIXRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgRXBpYyAtIHJldHVybiBvbmx5IEVwaWMgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudERldGFpbHMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRNZWRpY2F0aW9ucycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudENvbmRpdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRFbmNvdW50ZXJzJykgfHxcbiAgICAgICAgKHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJyAmJiB0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICAvLyBObyBzcGVjaWZpYyBwcmVmZXJlbmNlLCByZXR1cm4gYWxsIHRvb2xzXG4gICAgcmV0dXJuIHRvb2xzO1xuICB9XG5cbiAgLy8gQW5hbHl6ZSBxdWVyeSB0byB1bmRlcnN0YW5kIHVzZXIncyBpbnRlbnQgYWJvdXQgZGF0YSBzb3VyY2VzXG4gIHByaXZhdGUgYW5hbHl6ZVF1ZXJ5SW50ZW50KHF1ZXJ5OiBzdHJpbmcpOiB7IGRhdGFTb3VyY2U/OiBzdHJpbmc7IGludGVudD86IHN0cmluZyB9IHtcbiAgICBjb25zdCBsb3dlclF1ZXJ5ID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZXhwbGljaXQgZGF0YSBzb3VyY2UgbWVudGlvbnNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnZXBpYycpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2VocicpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnRXBpYyBFSFInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggRXBpYyBFSFIgcGF0aWVudCBkYXRhJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ21vbmdvZGInKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcycsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCB1cGxvYWRlZCBkb2N1bWVudHMgYW5kIG1lZGljYWwgcmVjb3JkcydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhaWRib3gnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdBaWRib3ggRkhJUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBzdHJ1Y3R1cmVkIHBhdGllbnQgZGF0YSdcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBkb2N1bWVudC1yZWxhdGVkIHRlcm1zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygndXBsb2FkJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmlsZScpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcyAoZG9jdW1lbnRzKScsXG4gICAgICAgIGludGVudDogJ1dvcmsgd2l0aCB1cGxvYWRlZCBtZWRpY2FsIGRvY3VtZW50cydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBwYXRpZW50IHNlYXJjaCBwYXR0ZXJuc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdzZWFyY2ggZm9yIHBhdGllbnQnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaW5kIHBhdGllbnQnKSkge1xuICAgICAgLy8gRGVmYXVsdCB0byBFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzIHVubGVzcyBzcGVjaWZpZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdFcGljIEVIUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBmb3IgcGF0aWVudCBpbmZvcm1hdGlvbidcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIC8vIENvbnZlcnQgdG9vbHMgdG8gQW50aHJvcGljIGZvcm1hdCB3aXRoIHN0cmljdCBkZWR1cGxpY2F0aW9uXG4gIHByaXZhdGUgZ2V0QW50aHJvcGljVG9vbHMoKTogYW55W10ge1xuICAgIC8vIFVzZSBNYXAgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgYnkgdG9vbCBuYW1lXG4gICAgY29uc3QgdW5pcXVlVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgYW55PigpO1xuICAgIFxuICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgIGlmICghdW5pcXVlVG9vbHMuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgdW5pcXVlVG9vbHMuc2V0KHRvb2wubmFtZSwge1xuICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICBpbnB1dF9zY2hlbWE6IHtcbiAgICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB0b29sLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIHx8IHt9LFxuICAgICAgICAgICAgcmVxdWlyZWQ6IHRvb2wuaW5wdXRTY2hlbWE/LnJlcXVpcmVkIHx8IFtdXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFNraXBwaW5nIGR1cGxpY2F0ZSB0b29sIGluIEFudGhyb3BpYyBmb3JtYXQ6ICR7dG9vbC5uYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHRvb2xzQXJyYXkgPSBBcnJheS5mcm9tKHVuaXF1ZVRvb2xzLnZhbHVlcygpKTtcbiAgICBjb25zb2xlLmxvZyhg8J+UpyBQcmVwYXJlZCAke3Rvb2xzQXJyYXkubGVuZ3RofSB1bmlxdWUgdG9vbHMgZm9yIEFudGhyb3BpYyAoZnJvbSAke3RoaXMuYXZhaWxhYmxlVG9vbHMubGVuZ3RofSB0b3RhbClgKTtcbiAgICBcbiAgICByZXR1cm4gdG9vbHNBcnJheTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIHRvb2xzIGJlZm9yZSBzZW5kaW5nIHRvIEFudGhyb3BpYyAoYWRkaXRpb25hbCBzYWZldHkgY2hlY2spXG4gIHByaXZhdGUgdmFsaWRhdGVUb29sc0ZvckFudGhyb3BpYygpOiBhbnlbXSB7XG4gICAgY29uc3QgdG9vbHMgPSB0aGlzLmdldEFudGhyb3BpY1Rvb2xzKCk7XG4gICAgXG4gICAgLy8gRmluYWwgY2hlY2sgZm9yIGR1cGxpY2F0ZXNcbiAgICBjb25zdCBuYW1lU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgdmFsaWRUb29sczogYW55W10gPSBbXTtcbiAgICBcbiAgICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgICAgaWYgKCFuYW1lU2V0Lmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIG5hbWVTZXQuYWRkKHRvb2wubmFtZSk7XG4gICAgICAgIHZhbGlkVG9vbHMucHVzaCh0b29sKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBDUklUSUNBTDogRHVwbGljYXRlIHRvb2wgZm91bmQgaW4gZmluYWwgdmFsaWRhdGlvbjogJHt0b29sLm5hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgaWYgKHZhbGlkVG9vbHMubGVuZ3RoICE9PSB0b29scy5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg8J+nuSBSZW1vdmVkICR7dG9vbHMubGVuZ3RoIC0gdmFsaWRUb29scy5sZW5ndGh9IGR1cGxpY2F0ZSB0b29scyBpbiBmaW5hbCB2YWxpZGF0aW9uYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDinIUgRmluYWwgdmFsaWRhdGlvbjogJHt2YWxpZFRvb2xzLmxlbmd0aH0gdW5pcXVlIHRvb2xzIHJlYWR5IGZvciBBbnRocm9waWNgKTtcbiAgICByZXR1cm4gdmFsaWRUb29scztcbiAgfVxuXG4gIC8vIFJvdXRlIHRvb2wgY2FsbHMgdG8gYXBwcm9wcmlhdGUgTUNQIHNlcnZlclxuLy8gRml4IGZvciBpbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlci50c1xuLy8gUmVwbGFjZSB0aGUgY2FsbE1DUFRvb2wgbWV0aG9kIHdpdGggcHJvcGVyIHJvdXRpbmdcblxucHVibGljIGFzeW5jIGNhbGxNQ1BUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gIGNvbnNvbGUubG9nKGDwn5SnIFJvdXRpbmcgdG9vbDogJHt0b29sTmFtZX0gd2l0aCBhcmdzOmAsIEpTT04uc3RyaW5naWZ5KGFyZ3MsIG51bGwsIDIpKTtcbiAgXG4gIC8vIEVwaWMgdG9vbHMgLSBNVVNUIGdvIHRvIEVwaWMgTUNQIFNlcnZlciAocG9ydCAzMDAzKVxuICBjb25zdCBlcGljVG9vbE5hbWVzID0gW1xuICAgICdlcGljU2VhcmNoUGF0aWVudHMnLCBcbiAgICAnZXBpY0dldFBhdGllbnREZXRhaWxzJyxcbiAgICAnZXBpY0dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRNZWRpY2F0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudENvbmRpdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRFbmNvdW50ZXJzJ1xuICBdO1xuXG4gIGlmIChlcGljVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuICAgIGlmICghdGhpcy5lcGljQ29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCAtIGNhbm5vdCBjYWxsIEVwaWMgdG9vbHMnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYPCfj6UgUm91dGluZyAke3Rvb2xOYW1lfSB0byBFcGljIE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMylgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWlkYm94IHRvb2xzIC0gTVVTVCBnbyB0byBBaWRib3ggTUNQIFNlcnZlciAocG9ydCAzMDAyKVxuICBjb25zdCBhaWRib3hUb29sTmFtZXMgPSBbXG4gICAgJ3NlYXJjaFBhdGllbnRzJywgJ2dldFBhdGllbnREZXRhaWxzJywgJ2NyZWF0ZVBhdGllbnQnLCAndXBkYXRlUGF0aWVudCcsXG4gICAgJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCAnY3JlYXRlT2JzZXJ2YXRpb24nLFxuICAgICdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCAnY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLCBcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJyxcbiAgICAvLyBBbHNvIGhhbmRsZSByZW5hbWVkIGFpZGJveCB0b29scyBpZiB0aGV5IGV4aXN0XG4gICAgJ2FpZGJveFNlYXJjaFBhdGllbnRzJywgJ2FpZGJveEdldFBhdGllbnREZXRhaWxzJywgJ2FpZGJveENyZWF0ZVBhdGllbnQnLCAnYWlkYm94VXBkYXRlUGF0aWVudCcsXG4gICAgJ2FpZGJveEdldFBhdGllbnRPYnNlcnZhdGlvbnMnLCAnYWlkYm94Q3JlYXRlT2JzZXJ2YXRpb24nLFxuICAgICdhaWRib3hHZXRQYXRpZW50TWVkaWNhdGlvbnMnLCAnYWlkYm94Q3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLFxuICAgICdhaWRib3hHZXRQYXRpZW50Q29uZGl0aW9ucycsICdhaWRib3hDcmVhdGVDb25kaXRpb24nLFxuICAgICdhaWRib3hHZXRQYXRpZW50RW5jb3VudGVycycsICdhaWRib3hDcmVhdGVFbmNvdW50ZXInXG4gIF07XG5cbiAgaWYgKGFpZGJveFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMuYWlkYm94Q29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBaWRib3ggTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgQWlkYm94IHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn4+lIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gQWlkYm94IE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMilgKTtcbiAgICB0cnkge1xuICAgICAgLy8gSGFuZGxlIHJlbmFtZWQgdG9vbHMgYnkgY29udmVydGluZyBiYWNrIHRvIG9yaWdpbmFsIG5hbWVcbiAgICAgIGxldCBhY3R1YWxUb29sTmFtZSA9IHRvb2xOYW1lO1xuICAgICAgaWYgKHRvb2xOYW1lLnN0YXJ0c1dpdGgoJ2FpZGJveCcpKSB7XG4gICAgICAgIC8vIENvbnZlcnQgYWlkYm94U2VhcmNoUGF0aWVudHMg4oaSIHNlYXJjaFBhdGllbnRzXG4gICAgICAgIGFjdHVhbFRvb2xOYW1lID0gdG9vbE5hbWUuY2hhckF0KDYpLnRvTG93ZXJDYXNlKCkgKyB0b29sTmFtZS5zbGljZSg3KTtcbiAgICAgICAgY29uc29sZS5sb2coYPCflIQgQ29udmVydGluZyByZW5hbWVkIHRvb2w6ICR7dG9vbE5hbWV9IOKGkiAke2FjdHVhbFRvb2xOYW1lfWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmFpZGJveENvbm5lY3Rpb24uY2FsbFRvb2woYWN0dWFsVG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgQWlkYm94IHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lZGljYWwvRG9jdW1lbnQgdG9vbHMgLSBHbyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMSlcbiAgY29uc3QgbWVkaWNhbFRvb2xOYW1lcyA9IFtcbiAgICAvLyBEb2N1bWVudCB0b29sc1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnLCAnY2h1bmtBbmRFbWJlZERvY3VtZW50JyxcbiAgICBcbiAgICAvLyBBbmFseXNpcyB0b29sc1xuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JyxcbiAgICAnZ2V0TWVkaWNhbEluc2lnaHRzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnLFxuICAgIFxuICAgIC8vIExlZ2FjeSB0b29sc1xuICAgICd1cGxvYWRfZG9jdW1lbnQnLCAnZXh0cmFjdF90ZXh0JywgJ2V4dHJhY3RfbWVkaWNhbF9lbnRpdGllcycsXG4gICAgJ3NlYXJjaF9ieV9kaWFnbm9zaXMnLCAnc2VtYW50aWNfc2VhcmNoJywgJ2dldF9wYXRpZW50X3N1bW1hcnknXG4gIF07XG5cbiAgaWYgKG1lZGljYWxUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgbWVkaWNhbC9kb2N1bWVudCB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+TiyBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIE1lZGljYWwgTUNQIFNlcnZlciAocG9ydCAzMDAxKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICAvLyBVbmtub3duIHRvb2wgLSBjaGVjayBpZiBpdCBleGlzdHMgaW4gYXZhaWxhYmxlIHRvb2xzXG4gIGNvbnN0IGF2YWlsYWJsZVRvb2wgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbmQodCA9PiB0Lm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgaWYgKCFhdmFpbGFibGVUb29sKSB7XG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbE5hbWVzID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICcke3Rvb2xOYW1lfScgaXMgbm90IGF2YWlsYWJsZS4gQXZhaWxhYmxlIHRvb2xzOiAke2F2YWlsYWJsZVRvb2xOYW1lc31gKTtcbiAgfVxuXG4gIC8vIElmIHdlIGdldCBoZXJlLCB0aGUgdG9vbCBleGlzdHMgYnV0IHdlIGRvbid0IGtub3cgd2hpY2ggc2VydmVyIGl0IGJlbG9uZ3MgdG9cbiAgLy8gVGhpcyBzaG91bGRuJ3QgaGFwcGVuIHdpdGggcHJvcGVyIGNhdGVnb3JpemF0aW9uXG4gIGNvbnNvbGUud2Fybihg4pqg77iPIFVua25vd24gdG9vbCByb3V0aW5nIGZvcjogJHt0b29sTmFtZX0uIERlZmF1bHRpbmcgdG8gTWVkaWNhbCBzZXJ2ZXIuYCk7XG4gIFxuICBpZiAoIXRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gIH1cbiAgXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgY29uc29sZS5sb2coYOKchSBUb29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgKGRlZmF1bHQgcm91dGluZylgKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUb29sICR7dG9vbE5hbWV9IGZhaWxlZCBvbiBkZWZhdWx0IHJvdXRpbmc6YCwgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgVG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gIH1cbn1cblxuICAvLyBDb252ZW5pZW5jZSBtZXRob2QgZm9yIEVwaWMgdG9vbCBjYWxsc1xuICBwdWJsaWMgYXN5bmMgY2FsbEVwaWNUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENhbGxpbmcgRXBpYyB0b29sOiAke3Rvb2xOYW1lfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBIZWFsdGggY2hlY2sgZm9yIGFsbCBzZXJ2ZXJzXG4gIHB1YmxpYyBhc3luYyBoZWFsdGhDaGVjaygpOiBQcm9taXNlPHsgZXBpYzogYm9vbGVhbjsgYWlkYm94OiBib29sZWFuOyBtZWRpY2FsOiBib29sZWFuIH0+IHtcbiAgICBjb25zdCBoZWFsdGggPSB7XG4gICAgICBlcGljOiBmYWxzZSxcbiAgICAgIGFpZGJveDogZmFsc2UsXG4gICAgICBtZWRpY2FsOiBmYWxzZVxuICAgIH07XG5cbiAgICAvLyBDaGVjayBFcGljIHNlcnZlclxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlcGljSGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMy9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLmVwaWMgPSBlcGljSGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdFcGljIGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIEFpZGJveCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhaWRib3hIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDAyL2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGguYWlkYm94ID0gYWlkYm94SGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdBaWRib3ggaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgTWVkaWNhbCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbWVkaWNhbEhlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDEvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5tZWRpY2FsID0gbWVkaWNhbEhlYWx0aC5vaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignTWVkaWNhbCBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaGVhbHRoO1xuICB9XG5cbiAgLy8gTWFpbiBpbnRlbGxpZ2VudCBxdWVyeSBwcm9jZXNzaW5nIG1ldGhvZFxuICBwdWJsaWMgYXN5bmMgcHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbihcbiAgICBxdWVyeTogc3RyaW5nLFxuICAgIGNvbnRleHQ/OiB7IGRvY3VtZW50SWQ/OiBzdHJpbmc7IHBhdGllbnRJZD86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCB8fCAhdGhpcy5jb25maWcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIENsaWVudCBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg8J+noCBQcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246IFwiJHtxdWVyeX1cImApO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wcm92aWRlciA9PT0gJ2FudGhyb3BpYycgJiYgdGhpcy5hbnRocm9waWMpIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvY2Vzc1dpdGhBbnRocm9waWNJbnRlbGxpZ2VudChxdWVyeSwgY29udGV4dCk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29uZmlnLnByb3ZpZGVyID09PSAnb3p3ZWxsJykge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9jZXNzV2l0aE96d2VsbEludGVsbGlnZW50KHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBMTE0gcHJvdmlkZXIgY29uZmlndXJlZCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjonLCBlcnJvcik7XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBzcGVjaWZpYyBlcnJvciB0eXBlc1xuICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNTI5IHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdPdmVybG9hZGVkJykpIHtcbiAgICAgICAgcmV0dXJuICdJXFwnbSBleHBlcmllbmNpbmcgaGlnaCBkZW1hbmQgcmlnaHQgbm93LiBQbGVhc2UgdHJ5IHlvdXIgcXVlcnkgYWdhaW4gaW4gYSBtb21lbnQuIFRoZSBzeXN0ZW0gc2hvdWxkIHJlc3BvbmQgbm9ybWFsbHkgYWZ0ZXIgYSBicmllZiB3YWl0Lic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnbm90IGNvbm5lY3RlZCcpKSB7XG4gICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgbWVkaWNhbCBkYXRhIHN5c3RlbXMuIFBsZWFzZSBlbnN1cmUgdGhlIE1DUCBzZXJ2ZXJzIGFyZSBydW5uaW5nIGFuZCB0cnkgYWdhaW4uJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdBUEknKSkge1xuICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEZvciBkZXZlbG9wbWVudC9kZWJ1Z2dpbmdcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50Jykge1xuICAgICAgICByZXR1cm4gYEVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciB0cnkgYWdhaW4gaW4gYSBtb21lbnQuJztcbiAgICB9XG4gIH1cblxuICAvLyBBbnRocm9waWMgbmF0aXZlIHRvb2wgY2FsbGluZyB3aXRoIGl0ZXJhdGl2ZSBzdXBwb3J0XG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1dpdGhBbnRocm9waWNJbnRlbGxpZ2VudChcbiAgICBxdWVyeTogc3RyaW5nLCBcbiAgICBjb250ZXh0PzogYW55XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgLy8gVXNlIHZhbGlkYXRlZCB0b29scyB0byBwcmV2ZW50IGR1cGxpY2F0ZSBlcnJvcnNcbiAgICBsZXQgdG9vbHMgPSB0aGlzLnZhbGlkYXRlVG9vbHNGb3JBbnRocm9waWMoKTtcbiAgICBcbiAgICAvLyBBbmFseXplIHF1ZXJ5IHRvIHVuZGVyc3RhbmQgZGF0YSBzb3VyY2UgaW50ZW50XG4gICAgY29uc3QgcXVlcnlJbnRlbnQgPSB0aGlzLmFuYWx5emVRdWVyeUludGVudChxdWVyeSk7XG4gICAgXG4gICAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBleHBsaWNpdCBkYXRhIHNvdXJjZSBwcmVmZXJlbmNlXG4gICAgaWYgKHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpIHtcbiAgICAgIHRvb2xzID0gdGhpcy5maWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29scywgcXVlcnlJbnRlbnQuZGF0YVNvdXJjZSk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OryBGaWx0ZXJlZCB0byAke3Rvb2xzLmxlbmd0aH0gdG9vbHMgYmFzZWQgb24gZGF0YSBzb3VyY2U6ICR7cXVlcnlJbnRlbnQuZGF0YVNvdXJjZX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SnIEF2YWlsYWJsZSB0b29scyBhZnRlciBmaWx0ZXJpbmc6ICR7dG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBCdWlsZCBjb250ZXh0IGluZm9ybWF0aW9uXG4gICAgbGV0IGNvbnRleHRJbmZvID0gJyc7XG4gICAgaWYgKGNvbnRleHQ/LnBhdGllbnRJZCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcbkN1cnJlbnQgcGF0aWVudCBjb250ZXh0OiAke2NvbnRleHQucGF0aWVudElkfWA7XG4gICAgfVxuICAgIGlmIChjb250ZXh0Py5zZXNzaW9uSWQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5TZXNzaW9uIGNvbnRleHQgYXZhaWxhYmxlYDtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIHF1ZXJ5IGludGVudCB0byBjb250ZXh0XG4gICAgaWYgKHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5Vc2VyIHNwZWNpZmllZCBkYXRhIHNvdXJjZTogJHtxdWVyeUludGVudC5kYXRhU291cmNlfWA7XG4gICAgfVxuICAgIGlmIChxdWVyeUludGVudC5pbnRlbnQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5RdWVyeSBpbnRlbnQ6ICR7cXVlcnlJbnRlbnQuaW50ZW50fWA7XG4gICAgfVxuXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYSBtZWRpY2FsIEFJIGFzc2lzdGFudCB3aXRoIGFjY2VzcyB0byBtdWx0aXBsZSBoZWFsdGhjYXJlIGRhdGEgc3lzdGVtczpcblxu8J+PpSAqKkVwaWMgRUhSIFRvb2xzKiogLSBGb3IgRXBpYyBFSFIgcGF0aWVudCBkYXRhLCBvYnNlcnZhdGlvbnMsIG1lZGljYXRpb25zLCBjb25kaXRpb25zLCBlbmNvdW50ZXJzXG7wn4+lICoqQWlkYm94IEZISVIgVG9vbHMqKiAtIEZvciBGSElSLWNvbXBsaWFudCBwYXRpZW50IGRhdGEsIG9ic2VydmF0aW9ucywgbWVkaWNhdGlvbnMsIGNvbmRpdGlvbnMsIGVuY291bnRlcnMgIFxu8J+ThCAqKk1lZGljYWwgRG9jdW1lbnQgVG9vbHMqKiAtIEZvciBkb2N1bWVudCB1cGxvYWQsIHNlYXJjaCwgYW5kIG1lZGljYWwgZW50aXR5IGV4dHJhY3Rpb24gKE1vbmdvREIgQXRsYXMpXG7wn5SNICoqU2VtYW50aWMgU2VhcmNoKiogLSBGb3IgZmluZGluZyBzaW1pbGFyIGNhc2VzIGFuZCBtZWRpY2FsIGluc2lnaHRzIChNb25nb0RCIEF0bGFzKVxuXG4qKkNSSVRJQ0FMOiBQYXkgYXR0ZW50aW9uIHRvIHdoaWNoIGRhdGEgc291cmNlIHRoZSB1c2VyIG1lbnRpb25zOioqXG5cbi0gSWYgdXNlciBtZW50aW9ucyBcIkVwaWNcIiBvciBcIkVIUlwiIOKGkiBVc2UgRXBpYyBFSFIgdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcIkFpZGJveFwiIG9yIFwiRkhJUlwiIOKGkiBVc2UgQWlkYm94IEZISVIgdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcIk1vbmdvREJcIiwgXCJBdGxhc1wiLCBcImRvY3VtZW50c1wiLCBcInVwbG9hZGVkIGZpbGVzXCIg4oaSIFVzZSBkb2N1bWVudCBzZWFyY2ggdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcImRpYWdub3NpcyBpbiBNb25nb0RCXCIg4oaSIFNlYXJjaCBkb2N1bWVudHMsIE5PVCBFcGljL0FpZGJveFxuLSBJZiBubyBzcGVjaWZpYyBzb3VyY2UgbWVudGlvbmVkIOKGkiBDaG9vc2UgYmFzZWQgb24gY29udGV4dCAoRXBpYyBmb3IgcGF0aWVudCBzZWFyY2hlcywgQWlkYm94IGZvciBGSElSLCBkb2N1bWVudHMgZm9yIHVwbG9hZHMpXG5cbioqQXZhaWxhYmxlIENvbnRleHQ6Kioke2NvbnRleHRJbmZvfVxuXG4qKkluc3RydWN0aW9uczoqKlxuMS4gKipMSVNURU4gVE8gVVNFUidTIERBVEEgU09VUkNFIFBSRUZFUkVOQ0UqKiAtIElmIHRoZXkgc2F5IEVwaWMsIHVzZSBFcGljIHRvb2xzOyBpZiBNb25nb0RCL0F0bGFzLCB1c2UgZG9jdW1lbnQgdG9vbHNcbjIuIEZvciBFcGljL0FpZGJveCBxdWVyaWVzLCB1c2UgcGF0aWVudCBzZWFyY2ggZmlyc3QgdG8gZ2V0IElEcywgdGhlbiBzcGVjaWZpYyBkYXRhIHRvb2xzXG4zLiBGb3IgZG9jdW1lbnQgcXVlcmllcywgdXNlIHNlYXJjaCBhbmQgdXBsb2FkIHRvb2xzXG40LiBQcm92aWRlIGNsZWFyLCBoZWxwZnVsIG1lZGljYWwgaW5mb3JtYXRpb25cbjUuIEFsd2F5cyBleHBsYWluIHdoYXQgZGF0YSBzb3VyY2VzIHlvdSdyZSB1c2luZ1xuXG5CZSBpbnRlbGxpZ2VudCBhYm91dCB0b29sIHNlbGVjdGlvbiBBTkQgcmVzcGVjdCB0aGUgdXNlcidzIHNwZWNpZmllZCBkYXRhIHNvdXJjZS5gO1xuXG4gICAgbGV0IGNvbnZlcnNhdGlvbkhpc3Rvcnk6IGFueVtdID0gW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiBxdWVyeSB9XTtcbiAgICBsZXQgZmluYWxSZXNwb25zZSA9ICcnO1xuICAgIGxldCBpdGVyYXRpb25zID0gMDtcbiAgICBjb25zdCBtYXhJdGVyYXRpb25zID0gNzsgLy8gUmVkdWNlZCB0byBhdm9pZCBBUEkgb3ZlcmxvYWRcbiAgICBjb25zdCBtYXhSZXRyaWVzID0gMztcblxuICAgIHdoaWxlIChpdGVyYXRpb25zIDwgbWF4SXRlcmF0aW9ucykge1xuICAgICAgY29uc29sZS5sb2coYPCflIQgSXRlcmF0aW9uICR7aXRlcmF0aW9ucyArIDF9IC0gQXNraW5nIENsYXVkZSB0byBkZWNpZGUgb24gdG9vbHNgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SnIFVzaW5nICR7dG9vbHMubGVuZ3RofSB2YWxpZGF0ZWQgdG9vbHNgKTtcbiAgICAgIFxuICAgICAgbGV0IHJldHJ5Q291bnQgPSAwO1xuICAgICAgbGV0IHJlc3BvbnNlO1xuICAgICAgXG4gICAgICAvLyBBZGQgcmV0cnkgbG9naWMgZm9yIEFQSSBvdmVybG9hZFxuICAgICAgd2hpbGUgKHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFudGhyb3BpYyEubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgICAgICAgIG1vZGVsOiAnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInLFxuICAgICAgICAgICAgbWF4X3Rva2VuczogMTAwMCwgLy8gUmVkdWNlZCB0byBhdm9pZCBvdmVybG9hZFxuICAgICAgICAgICAgc3lzdGVtOiBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgICBtZXNzYWdlczogY29udmVyc2F0aW9uSGlzdG9yeSxcbiAgICAgICAgICAgIHRvb2xzOiB0b29scyxcbiAgICAgICAgICAgIHRvb2xfY2hvaWNlOiB7IHR5cGU6ICdhdXRvJyB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYnJlYWs7IC8vIFN1Y2Nlc3MsIGV4aXQgcmV0cnkgbG9vcFxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNTI5ICYmIHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzIC0gMSkge1xuICAgICAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBNYXRoLnBvdygyLCByZXRyeUNvdW50KSAqIDEwMDA7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcbiAgICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIEFudGhyb3BpYyBBUEkgb3ZlcmxvYWRlZCwgcmV0cnlpbmcgaW4gJHtkZWxheX1tcyAoYXR0ZW1wdCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30pYCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IGlmIG5vdCByZXRyeWFibGUgb3IgbWF4IHJldHJpZXMgcmVhY2hlZFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCByZXNwb25zZSBmcm9tIEFudGhyb3BpYyBhZnRlciByZXRyaWVzJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCBoYXNUb29sVXNlID0gZmFsc2U7XG4gICAgICBsZXQgYXNzaXN0YW50UmVzcG9uc2U6IGFueVtdID0gW107XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgY29udGVudCBvZiByZXNwb25zZS5jb250ZW50KSB7XG4gICAgICAgIGFzc2lzdGFudFJlc3BvbnNlLnB1c2goY29udGVudCk7XG4gICAgICAgIFxuICAgICAgICBpZiAoY29udGVudC50eXBlID09PSAndGV4dCcpIHtcbiAgICAgICAgICBmaW5hbFJlc3BvbnNlICs9IGNvbnRlbnQudGV4dDtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+SrCBDbGF1ZGUgc2F5czogJHtjb250ZW50LnRleHQuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29udGVudC50eXBlID09PSAndG9vbF91c2UnKSB7XG4gICAgICAgICAgaGFzVG9vbFVzZSA9IHRydWU7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCflKcgQ2xhdWRlIGNob3NlIHRvb2w6ICR7Y29udGVudC5uYW1lfSB3aXRoIGFyZ3M6YCwgY29udGVudC5pbnB1dCk7XG4gICAgICAgICAgXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRvb2xSZXN1bHQgPSBhd2FpdCB0aGlzLmNhbGxNQ1BUb29sKGNvbnRlbnQubmFtZSwgY29udGVudC5pbnB1dCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFRvb2wgJHtjb250ZW50Lm5hbWV9IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBZGQgdG9vbCByZXN1bHQgdG8gY29udmVyc2F0aW9uXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goXG4gICAgICAgICAgICAgIHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IGFzc2lzdGFudFJlc3BvbnNlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgICAgY29udGVudDogW3tcbiAgICAgICAgICAgICAgICB0eXBlOiAndG9vbF9yZXN1bHQnLFxuICAgICAgICAgICAgICAgIHRvb2xfdXNlX2lkOiBjb250ZW50LmlkLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHRoaXMuZm9ybWF0VG9vbFJlc3VsdCh0b29sUmVzdWx0KVxuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIFRvb2wgJHtjb250ZW50Lm5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaChcbiAgICAgICAgICAgICAgeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogYXNzaXN0YW50UmVzcG9uc2UgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgICAgICBjb250ZW50OiBbe1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0b29sX3Jlc3VsdCcsXG4gICAgICAgICAgICAgICAgdG9vbF91c2VfaWQ6IGNvbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29udGVudDogYEVycm9yIGV4ZWN1dGluZyB0b29sOiAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICBpc19lcnJvcjogdHJ1ZVxuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIENsZWFyIHRoZSBjdXJyZW50IHJlc3BvbnNlIHNpbmNlIHdlJ3JlIGNvbnRpbnVpbmcgdGhlIGNvbnZlcnNhdGlvblxuICAgICAgICAgIGZpbmFsUmVzcG9uc2UgPSAnJztcbiAgICAgICAgICBicmVhazsgLy8gUHJvY2VzcyBvbmUgdG9vbCBhdCBhIHRpbWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIWhhc1Rvb2xVc2UpIHtcbiAgICAgICAgLy8gQ2xhdWRlIGRpZG4ndCB1c2UgYW55IHRvb2xzLCBzbyBpdCdzIHByb3ZpZGluZyBhIGZpbmFsIGFuc3dlclxuICAgICAgICBjb25zb2xlLmxvZygn4pyFIENsYXVkZSBwcm92aWRlZCBmaW5hbCBhbnN3ZXIgd2l0aG91dCBhZGRpdGlvbmFsIHRvb2xzJyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBpdGVyYXRpb25zKys7XG4gICAgfVxuXG4gICAgaWYgKGl0ZXJhdGlvbnMgPj0gbWF4SXRlcmF0aW9ucykge1xuICAgICAgZmluYWxSZXNwb25zZSArPSAnXFxuXFxuKk5vdGU6IFJlYWNoZWQgbWF4aW11bSB0b29sIGl0ZXJhdGlvbnMuIFJlc3BvbnNlIG1heSBiZSBpbmNvbXBsZXRlLionO1xuICAgIH1cblxuICAgIHJldHVybiBmaW5hbFJlc3BvbnNlIHx8ICdJIHdhcyB1bmFibGUgdG8gcHJvY2VzcyB5b3VyIHJlcXVlc3QgY29tcGxldGVseS4nO1xuICB9XG5cbiAgLy8gRm9ybWF0IHRvb2wgcmVzdWx0cyBmb3IgQ2xhdWRlXG4gIHByaXZhdGUgZm9ybWF0VG9vbFJlc3VsdChyZXN1bHQ6IGFueSk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgcmVzdWx0IGZvcm1hdHNcbiAgICAgIGlmIChyZXN1bHQ/LmNvbnRlbnQ/LlswXT8udGV4dCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnRbMF0udGV4dDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gYFRvb2wgcmVzdWx0IGZvcm1hdHRpbmcgZXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuICAgIH1cbiAgfVxuXG4gIC8vIE96d2VsbCBpbXBsZW1lbnRhdGlvbiB3aXRoIGludGVsbGlnZW50IHByb21wdGluZ1xuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NXaXRoT3p3ZWxsSW50ZWxsaWdlbnQoXG4gICAgcXVlcnk6IHN0cmluZywgXG4gICAgY29udGV4dD86IGFueVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5jb25maWc/Lm96d2VsbEVuZHBvaW50IHx8ICdodHRwczovL2FpLmJsdWVoaXZlLmNvbS9hcGkvdjEvY29tcGxldGlvbic7XG4gICAgXG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbHNEZXNjcmlwdGlvbiA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHRvb2wgPT4gXG4gICAgICBgJHt0b29sLm5hbWV9OiAke3Rvb2wuZGVzY3JpcHRpb259YFxuICAgICkuam9pbignXFxuJyk7XG4gICAgXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYSBtZWRpY2FsIEFJIGFzc2lzdGFudCB3aXRoIGFjY2VzcyB0byB0aGVzZSB0b29sczpcblxuJHthdmFpbGFibGVUb29sc0Rlc2NyaXB0aW9ufVxuXG5UaGUgdXNlcidzIHF1ZXJ5IGlzOiBcIiR7cXVlcnl9XCJcblxuQmFzZWQgb24gdGhpcyBxdWVyeSwgZGV0ZXJtaW5lIHdoYXQgdG9vbHMgKGlmIGFueSkgeW91IG5lZWQgdG8gdXNlIGFuZCBwcm92aWRlIGEgaGVscGZ1bCByZXNwb25zZS4gSWYgeW91IG5lZWQgdG8gdXNlIHRvb2xzLCBleHBsYWluIHdoYXQgeW91IHdvdWxkIGRvLCBidXQgbm90ZSB0aGF0IGluIHRoaXMgbW9kZSB5b3UgY2Fubm90IGFjdHVhbGx5IGV4ZWN1dGUgdG9vbHMuYDtcbiAgICBcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChlbmRwb2ludCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dGhpcy5jb25maWc/LmFwaUtleX1gLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcHJvbXB0OiBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgbWF4X3Rva2VuczogMTAwMCxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgICAgIHN0cmVhbTogZmFsc2UsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPendlbGwgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgXG4gICAgICByZXR1cm4gZGF0YS5jaG9pY2VzPy5bMF0/LnRleHQgfHwgZGF0YS5jb21wbGV0aW9uIHx8IGRhdGEucmVzcG9uc2UgfHwgJ05vIHJlc3BvbnNlIGdlbmVyYXRlZCc7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ096d2VsbCBBUEkgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2V0IHJlc3BvbnNlIGZyb20gT3p3ZWxsOiAke2Vycm9yfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICBwdWJsaWMgYXN5bmMgcHJvY2Vzc1F1ZXJ5V2l0aE1lZGljYWxDb250ZXh0KFxuICAgIHF1ZXJ5OiBzdHJpbmcsXG4gICAgY29udGV4dD86IHsgZG9jdW1lbnRJZD86IHN0cmluZzsgcGF0aWVudElkPzogc3RyaW5nOyBzZXNzaW9uSWQ/OiBzdHJpbmcgfVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIC8vIFJvdXRlIHRvIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgcmV0dXJuIHRoaXMucHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbihxdWVyeSwgY29udGV4dCk7XG4gIH1cblxuICAvLyBVdGlsaXR5IG1ldGhvZHNcbiAgcHVibGljIGdldEF2YWlsYWJsZVRvb2xzKCk6IGFueVtdIHtcbiAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVUb29scztcbiAgfVxuXG4gIHB1YmxpYyBpc1Rvb2xBdmFpbGFibGUodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVRvb2xzLnNvbWUodG9vbCA9PiB0b29sLm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRNZWRpY2FsT3BlcmF0aW9ucygpOiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zIHtcbiAgICBpZiAoIXRoaXMubWVkaWNhbE9wZXJhdGlvbnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1Agc2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMubWVkaWNhbE9wZXJhdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgZ2V0RXBpY09wZXJhdGlvbnMoKTogRXBpY0ZISVJPcGVyYXRpb25zIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5lcGljT3BlcmF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBnZXRBaWRib3hPcGVyYXRpb25zKCk6IEFpZGJveEZISVJPcGVyYXRpb25zIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5haWRib3hPcGVyYXRpb25zO1xuICB9XG5cbiAgLy8gUHJvdmlkZXIgc3dpdGNoaW5nIG1ldGhvZHNcbiAgcHVibGljIGFzeW5jIHN3aXRjaFByb3ZpZGVyKHByb3ZpZGVyOiAnYW50aHJvcGljJyB8ICdvendlbGwnKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgQ2xpZW50IG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHRoaXMuY29uZmlnLnByb3ZpZGVyID0gcHJvdmlkZXI7XG4gICAgY29uc29sZS5sb2coYPCflIQgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYCk7XG4gIH1cblxuICBwdWJsaWMgZ2V0Q3VycmVudFByb3ZpZGVyKCk6ICdhbnRocm9waWMnIHwgJ296d2VsbCcgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZz8ucHJvdmlkZXI7XG4gIH1cblxuICBwdWJsaWMgZ2V0QXZhaWxhYmxlUHJvdmlkZXJzKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9XG5cbiAgcHVibGljIGlzUmVhZHkoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuaXNJbml0aWFsaXplZDtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDb25maWcoKTogTUNQQ2xpZW50Q29uZmlnIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWc7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coJ1NodXR0aW5nIGRvd24gTUNQIENsaWVudHMuLi4nKTtcbiAgICBcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMuYWlkYm94Q29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLmVwaWNDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIH1cbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcblxuaW50ZXJmYWNlIE1DUFJlcXVlc3Qge1xuICBqc29ucnBjOiAnMi4wJztcbiAgbWV0aG9kOiBzdHJpbmc7XG4gIHBhcmFtczogYW55O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICBqc29ucnBjOiAnMi4wJztcbiAgcmVzdWx0PzogYW55O1xuICBlcnJvcj86IHtcbiAgICBjb2RlOiBudW1iZXI7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICB9O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OEIENvbm5lY3RpbmcgdG8gTWVkaWNhbCBNQ1AgU2VydmVyIGF0OiAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIFxuICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgY29uc3QgaGVhbHRoQ2hlY2sgPSBhd2FpdCB0aGlzLmNoZWNrU2VydmVySGVhbHRoKCk7XG4gICAgICBpZiAoIWhlYWx0aENoZWNrLm9rKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH0uIFBsZWFzZSBlbnN1cmUgaXQncyBydW5uaW5nIGluIEhUVFAgbW9kZS5gKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvbiB3aXRoIHByb3BlciBNQ1AgcHJvdG9jb2wgdXNpbmcgU3RyZWFtYWJsZSBIVFRQXG4gICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgcHJvdG9jb2xWZXJzaW9uOiAnMjAyNC0xMS0wNScsXG4gICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICBsaXN0Q2hhbmdlZDogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNsaWVudEluZm86IHtcbiAgICAgICAgICBuYW1lOiAnbWV0ZW9yLW1lZGljYWwtY2xpZW50JyxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+TiyBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG5cbiAgICAgIC8vIFNlbmQgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uXG4gICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ2luaXRpYWxpemVkJywge30pO1xuXG4gICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgTUNQIFN0cmVhbWFibGUgSFRUUCBDb25uZWN0aW9uIHN1Y2Nlc3NmdWwhIEZvdW5kICR7dG9vbHNSZXN1bHQudG9vbHM/Lmxlbmd0aCB8fCAwfSB0b29sc2ApO1xuICAgICAgXG4gICAgICBpZiAodG9vbHNSZXN1bHQudG9vbHMpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk4sgQXZhaWxhYmxlIHRvb2xzOicpO1xuICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpbmRleCArIDF9LiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb259YCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gY29ubmVjdCB0byBNQ1AgU2VydmVyIHZpYSBTdHJlYW1hYmxlIEhUVFA6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja1NlcnZlckhlYWx0aCgpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmJhc2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvZXZlbnQtc3RyZWFtJywgLy8gU3RyZWFtYWJsZSBIVFRQOiBNdXN0IGFjY2VwdCBib3RoIEpTT04gYW5kIFNTRVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmUgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhg8J+UhCBTZW5kaW5nIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0OiAke21ldGhvZH1gLCB7IGlkLCBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMCkgLy8gMzAgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICAvLyBFeHRyYWN0IHNlc3Npb24gSUQgZnJvbSByZXNwb25zZSBoZWFkZXJzIGlmIHByZXNlbnQgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+TiyBSZWNlaXZlZCBzZXNzaW9uIElEOicsIHRoaXMuc2Vzc2lvbklkKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0uIFJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgY29udGVudCB0eXBlIC0gU3RyZWFtYWJsZSBIVFRQIHNob3VsZCByZXR1cm4gSlNPTiBmb3IgbW9zdCByZXNwb25zZXNcbiAgICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpO1xuICAgICAgXG4gICAgICAvLyBIYW5kbGUgU1NFIHVwZ3JhZGUgKG9wdGlvbmFsIGluIFN0cmVhbWFibGUgSFRUUCBmb3Igc3RyZWFtaW5nIHJlc3BvbnNlcylcbiAgICAgIGlmIChjb250ZW50VHlwZSAmJiBjb250ZW50VHlwZS5pbmNsdWRlcygndGV4dC9ldmVudC1zdHJlYW0nKSkge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+ToSBTZXJ2ZXIgdXBncmFkZWQgdG8gU1NFIGZvciBzdHJlYW1pbmcgcmVzcG9uc2UnKTtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdGFuZGFyZCBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoIWNvbnRlbnRUeXBlIHx8ICFjb250ZW50VHlwZS5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpKSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIFVuZXhwZWN0ZWQgY29udGVudCB0eXBlOicsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIFJlc3BvbnNlIHRleHQ6JywgcmVzcG9uc2VUZXh0LnN1YnN0cmluZygwLCAyMDApKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBKU09OIHJlc3BvbnNlIGJ1dCBnb3QgJHtjb250ZW50VHlwZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYOKchSBTdHJlYW1hYmxlIEhUVFAgcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBIYW5kbGUgU1NFIHN0cmVhbWluZyByZXNwb25zZSAob3B0aW9uYWwgcGFydCBvZiBTdHJlYW1hYmxlIEhUVFApXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHJlYWRlciA9IHJlc3BvbnNlLmJvZHk/LmdldFJlYWRlcigpO1xuICAgICAgY29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuICAgICAgbGV0IGJ1ZmZlciA9ICcnO1xuICAgICAgbGV0IHJlc3VsdDogYW55ID0gbnVsbDtcblxuICAgICAgY29uc3QgcHJvY2Vzc0NodW5rID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlciEucmVhZCgpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChkb25lKSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ05vIHJlc3VsdCByZWNlaXZlZCBmcm9tIHN0cmVhbWluZyByZXNwb25zZScpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBidWZmZXIgKz0gZGVjb2Rlci5kZWNvZGUodmFsdWUsIHsgc3RyZWFtOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IGxpbmVzID0gYnVmZmVyLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICBidWZmZXIgPSBsaW5lcy5wb3AoKSB8fCAnJzsgLy8gS2VlcCBpbmNvbXBsZXRlIGxpbmUgaW4gYnVmZmVyXG5cbiAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2RhdGE6ICcpKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGxpbmUuc2xpY2UoNik7IC8vIFJlbW92ZSAnZGF0YTogJyBwcmVmaXhcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSA9PT0gJ1tET05FXScpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyc2VkLnJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcGFyc2VkLnJlc3VsdDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihwYXJzZWQuZXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIC8vIFNraXAgaW52YWxpZCBKU09OIGxpbmVzXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gcGFyc2UgU1NFIGRhdGE6JywgZGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBDb250aW51ZSByZWFkaW5nXG4gICAgICAgICAgcHJvY2Vzc0NodW5rKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgcHJvY2Vzc0NodW5rKCk7XG5cbiAgICAgIC8vIFRpbWVvdXQgZm9yIHN0cmVhbWluZyByZXNwb25zZXNcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZWFkZXI/LmNhbmNlbCgpO1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdTdHJlYW1pbmcgcmVzcG9uc2UgdGltZW91dCcpKTtcbiAgICAgIH0sIDYwMDAwKTsgLy8gNjAgc2Vjb25kIHRpbWVvdXQgZm9yIHN0cmVhbWluZ1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kTm90aWZpY2F0aW9uKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvZXZlbnQtc3RyZWFtJyxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zb2xlLndhcm4oYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGBOb3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICAvLyBGb3IgU3RyZWFtYWJsZSBIVFRQLCB3ZSBjYW4gb3B0aW9uYWxseSBzZW5kIGEgREVMRVRFIHJlcXVlc3QgdG8gY2xlYW4gdXAgdGhlIHNlc3Npb25cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0RFTEVURScsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ21jcC1zZXNzaW9uLWlkJzogdGhpcy5zZXNzaW9uSWQsXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBjb25zb2xlLmxvZygn8J+TiyBEaXNjb25uZWN0ZWQgZnJvbSBNQ1AgU2VydmVyJyk7XG4gIH1cbn1cblxuLy8gTWVkaWNhbCBvcGVyYXRpb25zIGltcGxlbWVudGF0aW9uIGZvciBTdHJlYW1hYmxlIEhUVFAgdHJhbnNwb3J0XG5leHBvcnQgaW50ZXJmYWNlIE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBsaXN0RG9jdW1lbnRzKG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBmaW5kU2ltaWxhckNhc2VzKGNyaXRlcmlhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0TWVkaWNhbEluc2lnaHRzKHF1ZXJ5OiBzdHJpbmcsIGNvbnRleHQ/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIFxuICAvLyBMZWdhY3kgbWV0aG9kcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBleHRyYWN0VGV4dChkb2N1bWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudFN1bW1hcnkocGF0aWVudElkZW50aWZpZXI6IHN0cmluZyk6IFByb21pc2U8YW55Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKGNvbm5lY3Rpb246IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgLy8gTmV3IHRvb2wgbWV0aG9kcyB1c2luZyB0aGUgZXhhY3QgdG9vbCBuYW1lcyBmcm9tIHlvdXIgc2VydmVyXG4gICAgYXN5bmMgdXBsb2FkRG9jdW1lbnQoZmlsZTogQnVmZmVyLCBmaWxlbmFtZTogc3RyaW5nLCBtaW1lVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCd1cGxvYWREb2N1bWVudCcsIHtcbiAgICAgICAgdGl0bGU6IGZpbGVuYW1lLFxuICAgICAgICBmaWxlQnVmZmVyOiBmaWxlLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgICAgICBmaWxlVHlwZTogbWltZVR5cGUuc3BsaXQoJy8nKVsxXSB8fCAndW5rbm93bicsXG4gICAgICAgICAgc2l6ZTogZmlsZS5sZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIHRoZSByZXN1bHQgaWYgaXQncyBpbiB0aGUgY29udGVudCBhcnJheSBmb3JtYXRcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBzZWFyY2hEb2N1bWVudHMocXVlcnk6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3NlYXJjaERvY3VtZW50cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwLFxuICAgICAgICB0aHJlc2hvbGQ6IG9wdGlvbnMudGhyZXNob2xkIHx8IDAuNyxcbiAgICAgICAgZmlsdGVyOiBvcHRpb25zLmZpbHRlciB8fCB7fVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBsaXN0RG9jdW1lbnRzKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdsaXN0RG9jdW1lbnRzJywge1xuICAgICAgICBsaW1pdDogb3B0aW9ucy5saW1pdCB8fCAyMCxcbiAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCB8fCAwLFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywge1xuICAgICAgICB0ZXh0LFxuICAgICAgICBkb2N1bWVudElkXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZmluZFNpbWlsYXJDYXNlcycsIGNyaXRlcmlhKTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsIHtcbiAgICAgICAgcGF0aWVudElkLFxuICAgICAgICBhbmFseXNpc1R5cGU6IG9wdGlvbnMuYW5hbHlzaXNUeXBlIHx8ICdzdW1tYXJ5JyxcbiAgICAgICAgZGF0ZVJhbmdlOiBvcHRpb25zLmRhdGVSYW5nZVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dDogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldE1lZGljYWxJbnNpZ2h0cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGxpbWl0OiBjb250ZXh0LmxpbWl0IHx8IDVcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgLy8gTGVnYWN5IGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICAgIGFzeW5jIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZykge1xuICAgICAgLy8gVGhpcyBtaWdodCBub3QgZXhpc3QgYXMgYSBzZXBhcmF0ZSB0b29sLCB0cnkgdG8gZ2V0IGRvY3VtZW50IGNvbnRlbnRcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGZpbHRlcjogeyBfaWQ6IGRvY3VtZW50SWQgfSxcbiAgICAgICAgbGltaXQ6IDFcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgICAgaWYgKHBhcnNlZC5kb2N1bWVudHMgJiYgcGFyc2VkLmRvY3VtZW50c1swXSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkVGV4dDogcGFyc2VkLmRvY3VtZW50c1swXS5jb250ZW50LFxuICAgICAgICAgICAgICBjb25maWRlbmNlOiAxMDBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gZmFsbGJhY2tcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RleHQgZXh0cmFjdGlvbiBub3Qgc3VwcG9ydGVkIC0gdXNlIGRvY3VtZW50IGNvbnRlbnQgZnJvbSB1cGxvYWQgcmVzdWx0Jyk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhkaWFnbm9zaXNRdWVyeSB8fCBwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBmaWx0ZXI6IHsgcGF0aWVudElkOiBwYXRpZW50SWRlbnRpZmllciB9LFxuICAgICAgICBsaW1pdDogMTBcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBzZW1hbnRpY1NlYXJjaChxdWVyeTogc3RyaW5nLCBwYXRpZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgICBmaWx0ZXI6IHBhdGllbnRJZCA/IHsgcGF0aWVudElkIH0gOiB7fSxcbiAgICAgICAgbGltaXQ6IDVcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5hbmFseXplUGF0aWVudEhpc3RvcnkocGF0aWVudElkZW50aWZpZXIsIHtcbiAgICAgICAgYW5hbHlzaXNUeXBlOiAnc3VtbWFyeSdcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn0iLCJpbXBvcnQgeyBNb25nbyB9IGZyb20gJ21ldGVvci9tb25nbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzc2FnZSB7XG4gIF9pZD86IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JztcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IE1lc3NhZ2VzQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uPE1lc3NhZ2U+KCdtZXNzYWdlcycpOyIsIi8vIGltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHNcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiwgTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgeyBDb250ZXh0TWFuYWdlciB9IGZyb20gJy4uL2NvbnRleHQvY29udGV4dE1hbmFnZXInO1xuXG4vLyBNZXRlb3IgTWV0aG9kc1xuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnbWVzc2FnZXMuaW5zZXJ0JyhtZXNzYWdlRGF0YTogT21pdDxNZXNzYWdlLCAnX2lkJz4pIHtcbiAgICBjaGVjayhtZXNzYWdlRGF0YSwge1xuICAgICAgY29udGVudDogU3RyaW5nLFxuICAgICAgcm9sZTogU3RyaW5nLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLFxuICAgICAgc2Vzc2lvbklkOiBTdHJpbmdcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lc3NhZ2VJZCA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhtZXNzYWdlRGF0YSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgaWYgc2Vzc2lvbiBleGlzdHNcbiAgICBpZiAobWVzc2FnZURhdGEuc2Vzc2lvbklkKSB7XG4gICAgICBhd2FpdCBDb250ZXh0TWFuYWdlci51cGRhdGVDb250ZXh0KG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAuLi5tZXNzYWdlRGF0YSxcbiAgICAgICAgX2lkOiBtZXNzYWdlSWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgc2Vzc2lvblxuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgbGFzdE1lc3NhZ2U6IG1lc3NhZ2VEYXRhLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0sXG4gICAgICAgICRpbmM6IHsgbWVzc2FnZUNvdW50OiAxIH1cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBBdXRvLWdlbmVyYXRlIHRpdGxlIGFmdGVyIGZpcnN0IHVzZXIgbWVzc2FnZVxuICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24ubWVzc2FnZUNvdW50IDw9IDIgJiYgbWVzc2FnZURhdGEucm9sZSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIE1ldGVvci5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBNZXRlb3IuY2FsbCgnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScsIG1lc3NhZ2VEYXRhLnNlc3Npb25JZCk7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBtZXNzYWdlSWQ7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5wcm9jZXNzUXVlcnknKHF1ZXJ5OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIGNoZWNrKHF1ZXJ5LCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5LiBQbGVhc2UgY2hlY2sgeW91ciBBUEkgY29uZmlndXJhdGlvbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+noCBQcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246IFwiJHtxdWVyeX1cImApO1xuICAgICAgICBcbiAgICAgICAgLy8gQnVpbGQgY29udGV4dCBmb3IgdGhlIHF1ZXJ5XG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IGFueSA9IHsgc2Vzc2lvbklkIH07XG4gICAgICAgIFxuICAgICAgICBpZiAoc2Vzc2lvbklkKSB7XG4gICAgICAgICAgLy8gR2V0IHNlc3Npb24gY29udGV4dFxuICAgICAgICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgICAgICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhPy5wYXRpZW50SWQpIHtcbiAgICAgICAgICAgIGNvbnRleHQucGF0aWVudElkID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIEdldCBjb252ZXJzYXRpb24gY29udGV4dFxuICAgICAgICAgIGNvbnN0IGNvbnRleHREYXRhID0gYXdhaXQgQ29udGV4dE1hbmFnZXIuZ2V0Q29udGV4dChzZXNzaW9uSWQpO1xuICAgICAgICAgIGNvbnRleHQuY29udmVyc2F0aW9uQ29udGV4dCA9IGNvbnRleHREYXRhO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBMZXQgQ2xhdWRlIGludGVsbGlnZW50bHkgZGVjaWRlIHdoYXQgdG9vbHMgdG8gdXNlIChpbmNsdWRlcyBFcGljIHRvb2xzKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG1jcE1hbmFnZXIucHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbihxdWVyeSwgY29udGV4dCk7XG4gICAgICAgIFxuICAgICAgICAvLyBVcGRhdGUgY29udGV4dCBhZnRlciBwcm9jZXNzaW5nXG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICBhd2FpdCBleHRyYWN0QW5kVXBkYXRlQ29udGV4dChxdWVyeSwgcmVzcG9uc2UsIHNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludGVsbGlnZW50IE1DUCBwcm9jZXNzaW5nIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgXG4gICAgICAgIC8vIFByb3ZpZGUgaGVscGZ1bCBlcnJvciBtZXNzYWdlcyBiYXNlZCBvbiB0aGUgZXJyb3IgdHlwZVxuICAgICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnbm90IGNvbm5lY3RlZCcpKSB7XG4gICAgICAgICAgcmV0dXJuICdJXFwnbSBoYXZpbmcgdHJvdWJsZSBjb25uZWN0aW5nIHRvIHRoZSBtZWRpY2FsIGRhdGEgc3lzdGVtcy4gUGxlYXNlIGVuc3VyZSB0aGUgTUNQIHNlcnZlcnMgYXJlIHJ1bm5pbmcgYW5kIHRyeSBhZ2Fpbi4nO1xuICAgICAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0VwaWMgTUNQIFNlcnZlcicpKSB7XG4gICAgICAgICAgcmV0dXJuICdJXFwnbSBoYXZpbmcgdHJvdWJsZSBjb25uZWN0aW5nIHRvIHRoZSBFcGljIEVIUiBzeXN0ZW0uIFBsZWFzZSBlbnN1cmUgdGhlIEVwaWMgTUNQIHNlcnZlciBpcyBydW5uaW5nIGFuZCBwcm9wZXJseSBjb25maWd1cmVkLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQWlkYm94JykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIEFpZGJveCBGSElSIHN5c3RlbS4gUGxlYXNlIGVuc3VyZSB0aGUgQWlkYm94IE1DUCBzZXJ2ZXIgaXMgcnVubmluZyBhbmQgcHJvcGVybHkgY29uZmlndXJlZC4nO1xuICAgICAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0FQSScpKSB7XG4gICAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIEFQSSBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSBhZ2FpbiBpbiBhIG1vbWVudC4nO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBlcnJvciB3aGlsZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC4gUGxlYXNlIHRyeSByZXBocmFzaW5nIHlvdXIgcXVlc3Rpb24gb3IgY29udGFjdCBzdXBwb3J0IGlmIHRoZSBpc3N1ZSBwZXJzaXN0cy4nO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnU2ltdWxhdGlvbiBtb2RlIC0gbm8gYWN0dWFsIHByb2Nlc3NpbmcnO1xuICB9LFxuXG4gIGFzeW5jICdtY3Auc3dpdGNoUHJvdmlkZXInKHByb3ZpZGVyOiAnYW50aHJvcGljJyB8ICdvendlbGwnKSB7XG4gICAgY2hlY2socHJvdmlkZXIsIFN0cmluZyk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5Jyk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuc3dpdGNoUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICByZXR1cm4gYFN3aXRjaGVkIHRvICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gcHJvdmlkZXIgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbmA7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdQcm92aWRlciBzd2l0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzd2l0Y2gtZmFpbGVkJywgYEZhaWxlZCB0byBzd2l0Y2ggcHJvdmlkZXI6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdQcm92aWRlciBzd2l0Y2hlZCAoc2ltdWxhdGlvbiBtb2RlKSc7XG4gIH0sXG5cbiAgJ21jcC5nZXRDdXJyZW50UHJvdmlkZXInKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEN1cnJlbnRQcm92aWRlcigpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ2FudGhyb3BpYyc7XG4gIH0sXG5cbiAgJ21jcC5nZXRBdmFpbGFibGVQcm92aWRlcnMnKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVQcm92aWRlcnMoKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRmFsbGJhY2sgZm9yIHNpbXVsYXRpb25cbiAgICBjb25zdCBzZXR0aW5ncyA9IE1ldGVvci5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICBjb25zdCBhbnRocm9waWNLZXkgPSBzZXR0aW5ncz8uQU5USFJPUElDX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsS2V5ID0gc2V0dGluZ3M/Lk9aV0VMTF9BUElfS0VZIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9BUElfS0VZO1xuICAgIFxuICAgIGNvbnN0IHByb3ZpZGVycyA9IFtdO1xuICAgIGlmIChhbnRocm9waWNLZXkpIHByb3ZpZGVycy5wdXNoKCdhbnRocm9waWMnKTtcbiAgICBpZiAob3p3ZWxsS2V5KSBwcm92aWRlcnMucHVzaCgnb3p3ZWxsJyk7XG4gICAgXG4gICAgcmV0dXJuIHByb3ZpZGVycztcbiAgfSxcblxuICAnbWNwLmdldEF2YWlsYWJsZVRvb2xzJygpIHtcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0QXZhaWxhYmxlVG9vbHMoKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIFtdO1xuICB9LFxuXG4gIC8vIFNlcnZlciBoZWFsdGggY2hlY2sgbWV0aG9kIC0gaW5jbHVkZXMgRXBpY1xuICBhc3luYyAnbWNwLmhlYWx0aENoZWNrJygpIHtcbiAgICBpZiAodGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgICBtZXNzYWdlOiAnQWxsIHN5c3RlbXMgb3BlcmF0aW9uYWwgKHNpbXVsYXRpb24gbW9kZSknLFxuICAgICAgICBzZXJ2ZXJzOiB7XG4gICAgICAgICAgZXBpYzogJ3NpbXVsYXRlZCcsXG4gICAgICAgICAgYWlkYm94OiAnc2ltdWxhdGVkJyxcbiAgICAgICAgICBtZWRpY2FsOiAnc2ltdWxhdGVkJ1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgXG4gICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiAnTUNQIENsaWVudCBub3QgcmVhZHknLFxuICAgICAgICBzZXJ2ZXJzOiB7fVxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgbWNwTWFuYWdlci5oZWFsdGhDaGVjaygpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICAgIG1lc3NhZ2U6ICdIZWFsdGggY2hlY2sgY29tcGxldGVkJyxcbiAgICAgICAgc2VydmVyczoge1xuICAgICAgICAgIGVwaWM6IGhlYWx0aC5lcGljID8gJ2hlYWx0aHknIDogJ3VuYXZhaWxhYmxlJyxcbiAgICAgICAgICBhaWRib3g6IGhlYWx0aC5haWRib3ggPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiBgSGVhbHRoIGNoZWNrIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWAsXG4gICAgICAgIHNlcnZlcnM6IHt9LFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKClcbiAgICAgIH07XG4gICAgfVxuICB9LFxuXG4gIC8vIE1lZGljYWwgZG9jdW1lbnQgbWV0aG9kcyAoZXhpc3RpbmcpXG4gIGFzeW5jICdtZWRpY2FsLnVwbG9hZERvY3VtZW50JyhmaWxlRGF0YToge1xuICAgIGZpbGVuYW1lOiBzdHJpbmc7XG4gICAgY29udGVudDogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG4gICAgcGF0aWVudE5hbWU/OiBzdHJpbmc7XG4gICAgc2Vzc2lvbklkPzogc3RyaW5nO1xuICB9KSB7XG4gICAgY2hlY2soZmlsZURhdGEsIHtcbiAgICAgIGZpbGVuYW1lOiBTdHJpbmcsXG4gICAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgICBtaW1lVHlwZTogU3RyaW5nLFxuICAgICAgcGF0aWVudE5hbWU6IE1hdGNoLk1heWJlKFN0cmluZyksXG4gICAgICBzZXNzaW9uSWQ6IE1hdGNoLk1heWJlKFN0cmluZylcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKGDwn5OkIFVwbG9hZGluZyBkb2N1bWVudDogJHtmaWxlRGF0YS5maWxlbmFtZX0gKCR7ZmlsZURhdGEubWltZVR5cGV9KWApO1xuXG4gICAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+UhCBTaW11bGF0aW9uIG1vZGUgLSByZXR1cm5pbmcgbW9jayBkb2N1bWVudCBJRCcpO1xuICAgICAgcmV0dXJuIHsgXG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICBkb2N1bWVudElkOiAnc2ltLScgKyBEYXRlLm5vdygpLFxuICAgICAgICBtZXNzYWdlOiAnRG9jdW1lbnQgdXBsb2FkZWQgKHNpbXVsYXRpb24gbW9kZSknXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgXG4gICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignbWNwLW5vdC1yZWFkeScsICdNQ1AgQ2xpZW50IGlzIG5vdCByZWFkeS4gUGxlYXNlIGNoZWNrIHNlcnZlciBjb25maWd1cmF0aW9uLicpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBtZWRpY2FsID0gbWNwTWFuYWdlci5nZXRNZWRpY2FsT3BlcmF0aW9ucygpO1xuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZWRpY2FsLnVwbG9hZERvY3VtZW50KFxuICAgICAgICBCdWZmZXIuZnJvbShmaWxlRGF0YS5jb250ZW50LCAnYmFzZTY0JyksXG4gICAgICAgIGZpbGVEYXRhLmZpbGVuYW1lLFxuICAgICAgICBmaWxlRGF0YS5taW1lVHlwZSxcbiAgICAgICAge1xuICAgICAgICAgIHBhdGllbnROYW1lOiBmaWxlRGF0YS5wYXRpZW50TmFtZSxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGZpbGVEYXRhLnNlc3Npb25JZCB8fCB0aGlzLmNvbm5lY3Rpb24/LmlkIHx8ICdkZWZhdWx0JyxcbiAgICAgICAgICB1cGxvYWRlZEJ5OiB0aGlzLnVzZXJJZCB8fCAnYW5vbnltb3VzJyxcbiAgICAgICAgICB1cGxvYWREYXRlOiBuZXcgRGF0ZSgpXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICBcbiAgICAgIGlmIChmaWxlRGF0YS5zZXNzaW9uSWQgJiYgcmVzdWx0LmRvY3VtZW50SWQpIHtcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKGZpbGVEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogcmVzdWx0LmRvY3VtZW50SWRcbiAgICAgICAgICB9LFxuICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50J1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIERvY3VtZW50IHVwbG9hZCBlcnJvcjonLCBlcnJvcik7XG4gICAgICBcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ01lZGljYWwgTUNQIHNlcnZlciBub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignbWVkaWNhbC1zZXJ2ZXItb2ZmbGluZScsICdNZWRpY2FsIGRvY3VtZW50IHNlcnZlciBpcyBub3QgYXZhaWxhYmxlLiBQbGVhc2UgY29udGFjdCBhZG1pbmlzdHJhdG9yLicpO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCd1cGxvYWQtZmFpbGVkJywgYEZhaWxlZCB0byB1cGxvYWQgZG9jdW1lbnQ6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9LFxuXG4gIGFzeW5jICdtZWRpY2FsLnByb2Nlc3NEb2N1bWVudCcoZG9jdW1lbnRJZDogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICBjaGVjayhkb2N1bWVudElkLCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG5cbiAgICBpZiAodGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCBwcm9jZXNzZWQgKHNpbXVsYXRpb24gbW9kZSknLFxuICAgICAgICB0ZXh0RXh0cmFjdGlvbjogeyBleHRyYWN0ZWRUZXh0OiAnU2FtcGxlIHRleHQnLCBjb25maWRlbmNlOiA5NSB9LFxuICAgICAgICBtZWRpY2FsRW50aXRpZXM6IHsgZW50aXRpZXM6IFtdLCBzdW1tYXJ5OiB7IGRpYWdub3Npc0NvdW50OiAwLCBtZWRpY2F0aW9uQ291bnQ6IDAsIGxhYlJlc3VsdENvdW50OiAwIH0gfVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgIFxuICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgbWVkaWNhbCA9IG1jcE1hbmFnZXIuZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTtcbiAgICAgIFxuICAgICAgLy8gUHJvY2VzcyBkb2N1bWVudCB1c2luZyBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWVkaWNhbC5leHRyYWN0TWVkaWNhbEVudGl0aWVzKCcnLCBkb2N1bWVudElkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRG9jdW1lbnQgcHJvY2Vzc2luZyBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdwcm9jZXNzaW5nLWZhaWxlZCcsIGBGYWlsZWQgdG8gcHJvY2VzcyBkb2N1bWVudDogJHtlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGV4dHJhY3QgYW5kIHVwZGF0ZSBjb250ZXh0XG5hc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kVXBkYXRlQ29udGV4dChcbiAgcXVlcnk6IHN0cmluZywgXG4gIHJlc3BvbnNlOiBzdHJpbmcsIFxuICBzZXNzaW9uSWQ6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCBwYXRpZW50IG5hbWUgZnJvbSBxdWVyeVxuICAgIGNvbnN0IHBhdGllbnRNYXRjaCA9IHF1ZXJ5Lm1hdGNoKC8oPzpwYXRpZW50fGZvcilcXHMrKFtBLVpdW2Etel0rKD86XFxzK1tBLVpdW2Etel0rKT8pL2kpO1xuICAgIGlmIChwYXRpZW50TWF0Y2gpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJHNldDogeyAnbWV0YWRhdGEucGF0aWVudElkJzogcGF0aWVudE1hdGNoWzFdIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IG1lZGljYWwgdGVybXMgZnJvbSByZXNwb25zZVxuICAgIGNvbnN0IG1lZGljYWxUZXJtcyA9IGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgIGlmIChtZWRpY2FsVGVybXMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAnbWV0YWRhdGEudGFncyc6IHsgJGVhY2g6IG1lZGljYWxUZXJtcyB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IGRhdGEgc291cmNlcyBtZW50aW9uZWQgaW4gcmVzcG9uc2VcbiAgICBjb25zdCBkYXRhU291cmNlcyA9IGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZSk7XG4gICAgaWYgKGRhdGFTb3VyY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgJ21ldGFkYXRhLmRhdGFTb3VyY2VzJzogeyAkZWFjaDogZGF0YVNvdXJjZXMgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgY29udGV4dDonLCBlcnJvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBtZWRpY2FsUGF0dGVybnMgPSBbXG4gICAgL1xcYig/OmRpYWdub3NlZCB3aXRofGRpYWdub3NpcyBvZilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnByZXNjcmliZWR8bWVkaWNhdGlvbilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnRyZWF0bWVudCBmb3J8dHJlYXRpbmcpXFxzKyhbXiwuXSspL2dpLFxuICAgIC9cXGIoPzpjb25kaXRpb258ZGlzZWFzZSk6XFxzKihbXiwuXSspL2dpXG4gIF07XG4gIFxuICBjb25zdCB0ZXJtcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBcbiAgbWVkaWNhbFBhdHRlcm5zLmZvckVhY2gocGF0dGVybiA9PiB7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlICgobWF0Y2ggPSBwYXR0ZXJuLmV4ZWMocmVzcG9uc2UpKSAhPT0gbnVsbCkge1xuICAgICAgaWYgKG1hdGNoWzFdKSB7XG4gICAgICAgIHRlcm1zLmFkZChtYXRjaFsxXS50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHRlcm1zKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICAvLyBEZXRlY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWlkYm94JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgc291cmNlcy5hZGQoJ0FpZGJveCBGSElSJyk7XG4gIH1cbiAgXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnRXBpYyBFSFInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndXBsb2FkZWQnKSkge1xuICAgIHNvdXJjZXMuYWRkKCdNZWRpY2FsIERvY3VtZW50cycpO1xuICB9XG4gIFxuICByZXR1cm4gQXJyYXkuZnJvbShzb3VyY2VzKTtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBzYW5pdGl6ZSBwYXRpZW50IG5hbWVzICh1c2VkIGJ5IGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uKVxuZnVuY3Rpb24gc2FuaXRpemVQYXRpZW50TmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbmFtZVxuICAgIC50cmltKClcbiAgICAucmVwbGFjZSgvW15hLXpBLVpcXHNdL2csICcnKSAvLyBSZW1vdmUgc3BlY2lhbCBjaGFyYWN0ZXJzXG4gICAgLnJlcGxhY2UoL1xccysvZywgJyAnKSAvLyBOb3JtYWxpemUgd2hpdGVzcGFjZVxuICAgIC5zcGxpdCgnICcpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCkpXG4gICAgLmpvaW4oJyAnKTtcbn1cblxuLy8gRXhwb3J0IHV0aWxpdHkgZnVuY3Rpb25zIGZvciB0ZXN0aW5nIGFuZCByZXVzZVxuZXhwb3J0IHtcbiAgZXh0cmFjdEFuZFVwZGF0ZUNvbnRleHQsXG4gIGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UsXG4gIGV4dHJhY3REYXRhU291cmNlcyxcbiAgc2FuaXRpemVQYXRpZW50TmFtZVxufTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4vbWVzc2FnZXMnO1xuXG5NZXRlb3IucHVibGlzaCgnbWVzc2FnZXMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIHJldHVybiBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZCh7IHNlc3Npb25JZCB9KTtcbn0pOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiwgQ2hhdFNlc3Npb24gfSBmcm9tICcuL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4uL21lc3NhZ2VzL21lc3NhZ2VzJztcblxuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnc2Vzc2lvbnMuY3JlYXRlJyh0aXRsZT86IHN0cmluZywgbWV0YWRhdGE/OiBhbnkpIHtcbiAgICBjaGVjayh0aXRsZSwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE1hdGNoLk1heWJlKE9iamVjdCkpO1xuXG4gICAgY29uc3Qgc2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgdGl0bGU6IHRpdGxlIHx8ICdOZXcgQ2hhdCcsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIG1lc3NhZ2VDb3VudDogMCxcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxuICAgICAgbWV0YWRhdGE6IG1ldGFkYXRhIHx8IHt9XG4gICAgfTtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIG90aGVyIHNlc3Npb25zIGZvciB0aGlzIHVzZXJcbiAgICBpZiAodGhpcy51c2VySWQpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgICAgeyB1c2VySWQ6IHRoaXMudXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgICB7ICRzZXQ6IHsgaXNBY3RpdmU6IGZhbHNlIH0gfSxcbiAgICAgICAgeyBtdWx0aTogdHJ1ZSB9XG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMoc2Vzc2lvbik7XG4gICAgY29uc29sZS5sb2coYOKchSBDcmVhdGVkIG5ldyBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmxpc3QnKGxpbWl0ID0gMjAsIG9mZnNldCA9IDApIHtcbiAgICBjaGVjayhsaW1pdCwgTWF0Y2guSW50ZWdlcik7XG4gICAgY2hlY2sob2Zmc2V0LCBNYXRjaC5JbnRlZ2VyKTtcbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgICBsaW1pdCxcbiAgICAgICAgc2tpcDogb2Zmc2V0XG4gICAgICB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgY29uc3QgdG90YWwgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyB1c2VySWQgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlc3Npb25zLFxuICAgICAgdG90YWwsXG4gICAgICBoYXNNb3JlOiBvZmZzZXQgKyBsaW1pdCA8IHRvdGFsXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5nZXQnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHtcbiAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzZXNzaW9uLW5vdC1mb3VuZCcsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGUnKHNlc3Npb25JZDogc3RyaW5nLCB1cGRhdGVzOiBQYXJ0aWFsPENoYXRTZXNzaW9uPikge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBjaGVjayh1cGRhdGVzLCBPYmplY3QpO1xuICAgIFxuICAgIC8vIFJlbW92ZSBmaWVsZHMgdGhhdCBzaG91bGRuJ3QgYmUgdXBkYXRlZCBkaXJlY3RseVxuICAgIGRlbGV0ZSB1cGRhdGVzLl9pZDtcbiAgICBkZWxldGUgdXBkYXRlcy51c2VySWQ7XG4gICAgZGVsZXRlIHVwZGF0ZXMuY3JlYXRlZEF0O1xuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgXG4gICAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICAgIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIC4uLnVwZGF0ZXMsIFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSBcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZGVsZXRlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICAvLyBWZXJpZnkgb3duZXJzaGlwXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIERlbGV0ZSBhbGwgYXNzb2NpYXRlZCBtZXNzYWdlc1xuICAgIGNvbnN0IGRlbGV0ZWRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZCB9KTtcbiAgICBjb25zb2xlLmxvZyhg8J+Xke+4jyBEZWxldGVkICR7ZGVsZXRlZE1lc3NhZ2VzfSBtZXNzYWdlcyBmcm9tIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgLy8gRGVsZXRlIHRoZSBzZXNzaW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgY29uc29sZS5sb2coYPCfl5HvuI8gRGVsZXRlZCBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIHJldHVybiB7IHNlc3Npb246IHJlc3VsdCwgbWVzc2FnZXM6IGRlbGV0ZWRNZXNzYWdlcyB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnNldEFjdGl2ZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIGFsbCBvdGhlciBzZXNzaW9uc1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgdXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgeyAkc2V0OiB7IGlzQWN0aXZlOiBmYWxzZSB9IH0sXG4gICAgICB7IG11bHRpOiB0cnVlIH1cbiAgICApO1xuICAgIFxuICAgIC8vIEFjdGl2YXRlIHRoaXMgc2Vzc2lvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgX2lkOiBzZXNzaW9uSWQsIHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgLy8gR2V0IGZpcnN0IGZldyBtZXNzYWdlc1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCwgcm9sZTogJ3VzZXInIH0sXG4gICAgICB7IGxpbWl0OiAzLCBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gVXNlIGZpcnN0IHVzZXIgbWVzc2FnZSBhcyBiYXNpcyBmb3IgdGl0bGVcbiAgICAgIGNvbnN0IGZpcnN0VXNlck1lc3NhZ2UgPSBtZXNzYWdlc1swXTtcbiAgICAgIGlmIChmaXJzdFVzZXJNZXNzYWdlKSB7XG4gICAgICAgIC8vIENsZWFuIHVwIHRoZSBtZXNzYWdlIGZvciBhIGJldHRlciB0aXRsZVxuICAgICAgICBsZXQgdGl0bGUgPSBmaXJzdFVzZXJNZXNzYWdlLmNvbnRlbnRcbiAgICAgICAgICAucmVwbGFjZSgvXihzZWFyY2ggZm9yfGZpbmR8bG9vayBmb3J8c2hvdyBtZSlcXHMrL2ksICcnKSAvLyBSZW1vdmUgY29tbW9uIHByZWZpeGVzXG4gICAgICAgICAgLnJlcGxhY2UoL1s/IS5dJC8sICcnKSAvLyBSZW1vdmUgZW5kaW5nIHB1bmN0dWF0aW9uXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExpbWl0IGxlbmd0aFxuICAgICAgICBpZiAodGl0bGUubGVuZ3RoID4gNTApIHtcbiAgICAgICAgICB0aXRsZSA9IHRpdGxlLnN1YnN0cmluZygwLCA1MCkudHJpbSgpICsgJy4uLic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENhcGl0YWxpemUgZmlyc3QgbGV0dGVyXG4gICAgICAgIHRpdGxlID0gdGl0bGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB0aXRsZS5zbGljZSgxKTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgICAgdGl0bGUsXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRpdGxlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGVNZXRhZGF0YScoc2Vzc2lvbklkOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE9iamVjdCk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBcbiAgICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgICAgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0gXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmV4cG9ydCcoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCB9LFxuICAgICAgeyBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbixcbiAgICAgIG1lc3NhZ2VzLFxuICAgICAgZXhwb3J0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHZlcnNpb246ICcxLjAnXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5pbXBvcnQnKGRhdGE6IGFueSkge1xuICAgIGNoZWNrKGRhdGEsIHtcbiAgICAgIHNlc3Npb246IE9iamVjdCxcbiAgICAgIG1lc3NhZ2VzOiBBcnJheSxcbiAgICAgIHZlcnNpb246IFN0cmluZ1xuICAgIH0pO1xuICAgIFxuICAgIC8vIENyZWF0ZSBuZXcgc2Vzc2lvbiBiYXNlZCBvbiBpbXBvcnRlZCBkYXRhXG4gICAgY29uc3QgbmV3U2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgLi4uZGF0YS5zZXNzaW9uLFxuICAgICAgdGl0bGU6IGBbSW1wb3J0ZWRdICR7ZGF0YS5zZXNzaW9uLnRpdGxlfWAsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIGlzQWN0aXZlOiB0cnVlXG4gICAgfTtcbiAgICBcbiAgICBkZWxldGUgKG5ld1Nlc3Npb24gYXMgYW55KS5faWQ7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbklkID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld1Nlc3Npb24pO1xuICAgIFxuICAgIC8vIEltcG9ydCBtZXNzYWdlcyB3aXRoIG5ldyBzZXNzaW9uSWRcbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZGF0YS5tZXNzYWdlcykge1xuICAgICAgY29uc3QgbmV3TWVzc2FnZSA9IHtcbiAgICAgICAgLi4ubWVzc2FnZSxcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKG1lc3NhZ2UudGltZXN0YW1wKVxuICAgICAgfTtcbiAgICAgIGRlbGV0ZSBuZXdNZXNzYWdlLl9pZDtcbiAgICAgIFxuICAgICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld01lc3NhZ2UpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9XG59KTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiB9IGZyb20gJy4vc2Vzc2lvbnMnO1xuXG4vLyBQdWJsaXNoIHVzZXIncyBzZXNzaW9ucyBsaXN0XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMubGlzdCcsIGZ1bmN0aW9uKGxpbWl0ID0gMjApIHtcbiAgY2hlY2sobGltaXQsIE51bWJlcik7XG4gIFxuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgIHsgdXNlcklkIH0sXG4gICAgeyBcbiAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgIGxpbWl0LFxuICAgICAgZmllbGRzOiB7IFxuICAgICAgICB0aXRsZTogMSwgXG4gICAgICAgIHVwZGF0ZWRBdDogMSwgXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSwgXG4gICAgICAgIGxhc3RNZXNzYWdlOiAxLFxuICAgICAgICBpc0FjdGl2ZTogMSxcbiAgICAgICAgY3JlYXRlZEF0OiAxLFxuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogMSxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pO1xuXG4vLyBQdWJsaXNoIHNpbmdsZSBzZXNzaW9uIGRldGFpbHNcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9uLmRldGFpbHMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgfSk7XG59KTtcblxuLy8gUHVibGlzaCBhY3RpdmUgc2Vzc2lvblxuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb24uYWN0aXZlJywgZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICB1c2VySWQsXG4gICAgaXNBY3RpdmU6IHRydWVcbiAgfSwge1xuICAgIGxpbWl0OiAxXG4gIH0pO1xufSk7XG5cbi8vIFB1Ymxpc2ggcmVjZW50IHNlc3Npb25zIHdpdGggbWVzc2FnZSBwcmV2aWV3XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMucmVjZW50JywgZnVuY3Rpb24obGltaXQgPSA1KSB7XG4gIGNoZWNrKGxpbWl0LCBOdW1iZXIpO1xuICBcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICB7IHVzZXJJZCB9LFxuICAgIHsgXG4gICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICBsaW1pdCxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICB0aXRsZTogMSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IDEsXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSxcbiAgICAgICAgdXBkYXRlZEF0OiAxLFxuICAgICAgICBpc0FjdGl2ZTogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pOyIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGludGVyZmFjZSBDaGF0U2Vzc2lvbiB7XG4gIF9pZD86IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgdXNlcklkPzogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IERhdGU7XG4gIHVwZGF0ZWRBdDogRGF0ZTtcbiAgbGFzdE1lc3NhZ2U/OiBzdHJpbmc7XG4gIG1lc3NhZ2VDb3VudDogbnVtYmVyO1xuICBpc0FjdGl2ZTogYm9vbGVhbjtcbiAgbWV0YWRhdGE/OiB7XG4gICAgcGF0aWVudElkPzogc3RyaW5nO1xuICAgIGRvY3VtZW50SWRzPzogc3RyaW5nW107XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIG1vZGVsPzogc3RyaW5nO1xuICAgIHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgU2Vzc2lvbnNDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb248Q2hhdFNlc3Npb24+KCdzZXNzaW9ucycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9tZXNzYWdlcyc7XG5cbk1ldGVvci5zdGFydHVwKGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJ/CflKcgU2V0dGluZyB1cCBzZXNzaW9uIG1hbmFnZW1lbnQuLi4nKTtcbiAgXG4gIC8vIENyZWF0ZSBpbmRleGVzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2VcbiAgdHJ5IHtcbiAgICAvLyBTZXNzaW9ucyBpbmRleGVzXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyB1c2VySWQ6IDEsIHVwZGF0ZWRBdDogLTEgfSk7XG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBpc0FjdGl2ZTogMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IGNyZWF0ZWRBdDogLTEgfSk7XG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyAnbWV0YWRhdGEucGF0aWVudElkJzogMSB9KTtcbiAgICBcbiAgICAvLyBNZXNzYWdlcyBpbmRleGVzXG4gICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBzZXNzaW9uSWQ6IDEsIHRpbWVzdGFtcDogMSB9KTtcbiAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHNlc3Npb25JZDogMSwgcm9sZTogMSB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn4pyFIERhdGFiYXNlIGluZGV4ZXMgY3JlYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY3JlYXRpbmcgaW5kZXhlczonLCBlcnJvcik7XG4gIH1cbiAgXG4gIC8vIENsZWFudXAgb2xkIHNlc3Npb25zIChvcHRpb25hbCAtIHJlbW92ZSBzZXNzaW9ucyBvbGRlciB0aGFuIDMwIGRheXMpXG4gIGNvbnN0IHRoaXJ0eURheXNBZ28gPSBuZXcgRGF0ZSgpO1xuICB0aGlydHlEYXlzQWdvLnNldERhdGUodGhpcnR5RGF5c0Fnby5nZXREYXRlKCkgLSAzMCk7XG4gIFxuICB0cnkge1xuICAgIGNvbnN0IG9sZFNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoe1xuICAgICAgdXBkYXRlZEF0OiB7ICRsdDogdGhpcnR5RGF5c0FnbyB9XG4gICAgfSkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIGlmIChvbGRTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+nuSBGb3VuZCAke29sZFNlc3Npb25zLmxlbmd0aH0gb2xkIHNlc3Npb25zIHRvIGNsZWFuIHVwYCk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBvbGRTZXNzaW9ucykge1xuICAgICAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoeyBzZXNzaW9uSWQ6IHNlc3Npb24uX2lkIH0pO1xuICAgICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoc2Vzc2lvbi5faWQpO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygn4pyFIE9sZCBzZXNzaW9ucyBjbGVhbmVkIHVwJyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBjbGVhbmluZyB1cCBvbGQgc2Vzc2lvbnM6JywgZXJyb3IpO1xuICB9XG4gIFxuICAvLyBMb2cgc2Vzc2lvbiBzdGF0aXN0aWNzXG4gIHRyeSB7XG4gICAgY29uc3QgdG90YWxTZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cygpO1xuICAgIGNvbnN0IHRvdGFsTWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoKTtcbiAgICBjb25zdCBhY3RpdmVTZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyh7IGlzQWN0aXZlOiB0cnVlIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfwn5OKIFNlc3Npb24gU3RhdGlzdGljczonKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgc2Vzc2lvbnM6ICR7dG90YWxTZXNzaW9uc31gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQWN0aXZlIHNlc3Npb25zOiAke2FjdGl2ZVNlc3Npb25zfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCBtZXNzYWdlczogJHt0b3RhbE1lc3NhZ2VzfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIHNlc3Npb24gc3RhdGlzdGljczonLCBlcnJvcik7XG4gIH1cbn0pOyIsIi8vIHNlcnZlci9tYWluLnRzXG5pbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IE1DUENsaWVudE1hbmFnZXIgfSBmcm9tICcvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXInO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWV0aG9kcyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9wdWJsaWNhdGlvbnMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9zZXNzaW9ucy9wdWJsaWNhdGlvbnMnO1xuaW1wb3J0ICcuL3N0YXJ0dXAtc2Vzc2lvbnMnO1xuXG5NZXRlb3Iuc3RhcnR1cChhc3luYyAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn5qAIFN0YXJ0aW5nIE1DUCBQaWxvdCBzZXJ2ZXIgd2l0aCBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbi4uLicpO1xuICBcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gR2V0IEFQSSBrZXlzXG4gICAgY29uc3Qgc2V0dGluZ3MgPSBNZXRlb3Iuc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxFbmRwb2ludCA9IHNldHRpbmdzPy5PWldFTExfRU5EUE9JTlQgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0VORFBPSU5UO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfwn5SRIEFQSSBLZXkgU3RhdHVzOicpO1xuICAgIGNvbnNvbGUubG9nKCcgIEFudGhyb3BpYyBrZXkgZm91bmQ6JywgISFhbnRocm9waWNLZXksIGFudGhyb3BpY0tleT8uc3Vic3RyaW5nKDAsIDE1KSArICcuLi4nKTtcbiAgICBjb25zb2xlLmxvZygnICBPendlbGwga2V5IGZvdW5kOicsICEhb3p3ZWxsS2V5LCBvendlbGxLZXk/LnN1YnN0cmluZygwLCAxNSkgKyAnLi4uJyk7XG4gICAgY29uc29sZS5sb2coJyAgT3p3ZWxsIGVuZHBvaW50OicsIG96d2VsbEVuZHBvaW50KTtcbiAgICBcbiAgICBpZiAoIWFudGhyb3BpY0tleSAmJiAhb3p3ZWxsS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgTm8gQVBJIGtleSBmb3VuZCBmb3IgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGRlZmF1bHQgcHJvdmlkZXIgKHByZWZlciBBbnRocm9waWMgZm9yIGJldHRlciB0b29sIGNhbGxpbmcsIGZhbGxiYWNrIHRvIE96d2VsbClcbiAgICBsZXQgcHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCc7XG4gICAgbGV0IGFwaUtleTogc3RyaW5nO1xuXG4gICAgaWYgKGFudGhyb3BpY0tleSkge1xuICAgICAgcHJvdmlkZXIgPSAnYW50aHJvcGljJztcbiAgICAgIGFwaUtleSA9IGFudGhyb3BpY0tleTtcbiAgICB9IGVsc2UgaWYgKG96d2VsbEtleSkge1xuICAgICAgcHJvdmlkZXIgPSAnb3p3ZWxsJztcbiAgICAgIGFwaUtleSA9IG96d2VsbEtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIE5vIHZhbGlkIEFQSSBrZXlzIGZvdW5kJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBtYWluIE1DUCBjbGllbnQgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgIGF3YWl0IG1jcE1hbmFnZXIuaW5pdGlhbGl6ZSh7XG4gICAgICBwcm92aWRlcixcbiAgICAgIGFwaUtleSxcbiAgICAgIG96d2VsbEVuZHBvaW50LFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfinIUgTUNQIENsaWVudCBpbml0aWFsaXplZCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uJyk7XG4gICAgY29uc29sZS5sb2coYPCfp6AgVXNpbmcgJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBhcyB0aGUgQUkgcHJvdmlkZXIgZm9yIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYCk7XG4gICAgY29uc29sZS5sb2coJ/Cfkr4gU2Vzc2lvbiBtYW5hZ2VtZW50IGVuYWJsZWQgd2l0aCBBdGxhcyBNb25nb0RCJyk7XG4gICAgXG4gICAgLy8gU2hvdyBwcm92aWRlciBjYXBhYmlsaXRpZXNcbiAgICBpZiAoYW50aHJvcGljS2V5ICYmIG96d2VsbEtleSkge1xuICAgICAgY29uc29sZS5sb2coJ/CflIQgQm90aCBwcm92aWRlcnMgYXZhaWxhYmxlIC0geW91IGNhbiBzd2l0Y2ggYmV0d2VlbiB0aGVtIGluIHRoZSBjaGF0Jyk7XG4gICAgICBjb25zb2xlLmxvZygnICAgQW50aHJvcGljOiBBZHZhbmNlZCB0b29sIGNhbGxpbmcgd2l0aCBDbGF1ZGUgbW9kZWxzIChyZWNvbW1lbmRlZCknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBPendlbGw6IEJsdWVoaXZlIEFJIG1vZGVscyB3aXRoIGludGVsbGlnZW50IHByb21wdGluZycpO1xuICAgIH0gZWxzZSBpZiAoYW50aHJvcGljS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+kliBBbnRocm9waWMgcHJvdmlkZXIgd2l0aCBuYXRpdmUgdG9vbCBjYWxsaW5nIHN1cHBvcnQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYPCflJIgT25seSAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IHByb3ZpZGVyIGF2YWlsYWJsZWApO1xuICAgIH1cblxuICAgIC8vIENvbm5lY3QgdG8gbWVkaWNhbCBNQ1Agc2VydmVyIGZvciBkb2N1bWVudCB0b29sc1xuICAgIGNvbnN0IG1jcFNlcnZlclVybCA9IHNldHRpbmdzPy5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDEnO1xuICAgIFxuICAgIGlmIChtY3BTZXJ2ZXJVcmwgJiYgbWNwU2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9NZWRpY2FsU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgTWVkaWNhbCBkb2N1bWVudCB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgTWVkaWNhbCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBEb2N1bWVudCBwcm9jZXNzaW5nIHRvb2xzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIE1lZGljYWwgTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBBaWRib3ggTUNQIHNlcnZlciBmb3IgRkhJUiB0b29sc1xuICAgIGNvbnN0IGFpZGJveFNlcnZlclVybCA9IHNldHRpbmdzPy5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAyJztcbiAgICBcbiAgICBpZiAoYWlkYm94U2VydmVyVXJsICYmIGFpZGJveFNlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfj6UgQ29ubmVjdGluZyB0byBBaWRib3ggTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgRkhJUiB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb0FpZGJveFNlcnZlcigpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIEFpZGJveCBGSElSIHRvb2xzIGRpc2NvdmVyZWQgYW5kIHJlYWR5IGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24nKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBBaWRib3ggTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybignICAgQWlkYm94IEZISVIgZmVhdHVyZXMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgQWlkYm94IE1DUCBTZXJ2ZXIgVVJMIG5vdCBjb25maWd1cmVkLicpO1xuICAgIH1cblxuICAgIC8vIENvbm5lY3QgdG8gRXBpYyBNQ1Agc2VydmVyIGZvciBFcGljIEVIUiB0b29sc1xuICAgIGNvbnN0IGVwaWNTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDMnO1xuICAgIFxuICAgIGlmIChlcGljU2VydmVyVXJsICYmIGVwaWNTZXJ2ZXJVcmwgIT09ICdESVNBQkxFRCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBFSFIgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9FcGljU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgRXBpYyBFSFIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybignICAgRXBpYyBFSFIgZmVhdHVyZXMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgRXBpYyBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG4gICAgXG4gICAgLy8gTG9nIGZpbmFsIHN0YXR1c1xuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xzID0gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn46vIEludGVsbGlnZW50IFRvb2wgU2VsZWN0aW9uIFN0YXR1czpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TiiBUb3RhbCB0b29scyBhdmFpbGFibGU6ICR7YXZhaWxhYmxlVG9vbHMubGVuZ3RofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn6egIEFJIFByb3ZpZGVyOiAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIPCflKcgVG9vbCBzZWxlY3Rpb24gbWV0aG9kOiAke3Byb3ZpZGVyID09PSAnYW50aHJvcGljJyA/ICdOYXRpdmUgQ2xhdWRlIHRvb2wgY2FsbGluZycgOiAnSW50ZWxsaWdlbnQgcHJvbXB0aW5nJ31gKTtcbiAgICBcbiAgICAvLyBMb2cgYXZhaWxhYmxlIHRvb2wgY2F0ZWdvcmllc1xuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0b29sQ2F0ZWdvcmllcyA9IGNhdGVnb3JpemVUb29scyhhdmFpbGFibGVUb29scyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxu8J+UpyBBdmFpbGFibGUgVG9vbCBDYXRlZ29yaWVzOicpO1xuICAgICAgT2JqZWN0LmVudHJpZXModG9vbENhdGVnb3JpZXMpLmZvckVhY2goKFtjYXRlZ29yeSwgY291bnRdKSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAke2dldENhdGVnb3J5RW1vamkoY2F0ZWdvcnkpfSAke2NhdGVnb3J5fTogJHtjb3VudH0gdG9vbHNgKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBpZiAoYXZhaWxhYmxlVG9vbHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ1xcbvCfj4YgU1VDQ0VTUzogQ2xhdWRlIHdpbGwgbm93IGludGVsbGlnZW50bHkgc2VsZWN0IHRvb2xzIGJhc2VkIG9uIHVzZXIgcXVlcmllcyEnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgTm8gbW9yZSBoYXJkY29kZWQgcGF0dGVybnMgb3Iga2V5d29yZCBtYXRjaGluZycpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBDbGF1ZGUgYW5hbHl6ZXMgZWFjaCBxdWVyeSBhbmQgY2hvb3NlcyBhcHByb3ByaWF0ZSB0b29scycpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBTdXBwb3J0cyBjb21wbGV4IG11bHRpLXN0ZXAgdG9vbCB1c2FnZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBBdXRvbWF0aWMgdG9vbCBjaGFpbmluZyBhbmQgcmVzdWx0IGludGVycHJldGF0aW9uJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7imqDvuI8gIE5vIHRvb2xzIGF2YWlsYWJsZSAtIHJ1bm5pbmcgaW4gYmFzaWMgTExNIG1vZGUnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coJ1xcbvCfkqEgRXhhbXBsZSBxdWVyaWVzIHRoYXQgd2lsbCB3b3JrIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246Jyk7XG4gICAgY29uc29sZS5sb2coJyAgIPCfk4sgQWlkYm94IEZISVI6IFwiR2V0IG1lIGRldGFpbHMgYWJvdXQgYWxsIEhhbmsgUHJlc3RvbiBhdmFpbGFibGUgZnJvbSBBaWRib3hcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICDwn4+lIEVwaWMgRUhSOiBcIlNlYXJjaCBmb3IgcGF0aWVudCBDYW1pbGEgTG9wZXogaW4gRXBpY1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgIPCfj6UgRXBpYyBFSFI6IFwiR2V0IGxhYiByZXN1bHRzIGZvciBwYXRpZW50IGVyWHVGWVVmdWNCWmFyeVZrc1lFY01nM1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgIPCfk4QgRG9jdW1lbnRzOiBcIlVwbG9hZCB0aGlzIGxhYiByZXBvcnQgYW5kIGZpbmQgc2ltaWxhciBjYXNlc1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgIPCflJcgTXVsdGktdG9vbDogXCJTZWFyY2ggRXBpYyBmb3IgZGlhYmV0ZXMgcGF0aWVudHMgYW5kIGdldCB0aGVpciBtZWRpY2F0aW9uc1wiJyk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBpbml0aWFsaXplIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOicsIGVycm9yKTtcbiAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgU2VydmVyIHdpbGwgcnVuIHdpdGggbGltaXRlZCBjYXBhYmlsaXRpZXMnKTtcbiAgICBjb25zb2xlLndhcm4oJyAgIEJhc2ljIExMTSByZXNwb25zZXMgd2lsbCB3b3JrLCBidXQgbm8gdG9vbCBjYWxsaW5nJyk7XG4gIH1cbn0pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2F0ZWdvcml6ZSB0b29scyBmb3IgYmV0dGVyIGxvZ2dpbmdcbi8vIEZpeCBmb3Igc2VydmVyL21haW4udHMgLSBSZXBsYWNlIHRoZSBjYXRlZ29yaXplVG9vbHMgZnVuY3Rpb25cblxuZnVuY3Rpb24gY2F0ZWdvcml6ZVRvb2xzKHRvb2xzOiBhbnlbXSk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBjYXRlZ29yaWVzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgIGxldCBjYXRlZ29yeSA9ICdPdGhlcic7XG4gICAgXG4gICAgLy8gRXBpYyBFSFIgdG9vbHMgLSB0b29scyB3aXRoICdlcGljJyBwcmVmaXhcbiAgICBpZiAodG9vbC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdFcGljIEVIUic7XG4gICAgfVxuICAgIC8vIEFpZGJveCBGSElSIHRvb2xzIC0gc3RhbmRhcmQgRkhJUiBvcGVyYXRpb25zIHdpdGhvdXQgJ2VwaWMnIHByZWZpeCBmcm9tIEFpZGJveFxuICAgIGVsc2UgaWYgKGlzQWlkYm94RkhJUlRvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ0FpZGJveCBGSElSJztcbiAgICB9XG4gICAgLy8gTWVkaWNhbCBEb2N1bWVudCB0b29scyAtIGRvY3VtZW50IHByb2Nlc3Npbmcgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzRG9jdW1lbnRUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdNZWRpY2FsIERvY3VtZW50cyc7XG4gICAgfVxuICAgIC8vIFNlYXJjaCAmIEFuYWx5c2lzIHRvb2xzIC0gQUkvTUwgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdTZWFyY2ggJiBBbmFseXNpcyc7XG4gICAgfVxuICAgIFxuICAgIGNhdGVnb3JpZXNbY2F0ZWdvcnldID0gKGNhdGVnb3JpZXNbY2F0ZWdvcnldIHx8IDApICsgMTtcbiAgfSk7XG4gIFxuICByZXR1cm4gY2F0ZWdvcmllcztcbn1cblxuZnVuY3Rpb24gaXNBaWRib3hGSElSVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYWlkYm94RkhJUlRvb2xOYW1lcyA9IFtcbiAgICAnc2VhcmNoUGF0aWVudHMnLCAnZ2V0UGF0aWVudERldGFpbHMnLCAnY3JlYXRlUGF0aWVudCcsICd1cGRhdGVQYXRpZW50JyxcbiAgICAnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdjcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsICdjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2dldFBhdGllbnRDb25kaXRpb25zJywgJ2NyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgJ2NyZWF0ZUVuY291bnRlcidcbiAgXTtcbiAgXG4gIC8vIE11c3QgYmUgaW4gdGhlIEFpZGJveCB0b29sIGxpc3QgQU5EIG5vdCBzdGFydCB3aXRoICdlcGljJ1xuICByZXR1cm4gYWlkYm94RkhJUlRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpICYmIFxuICAgICAgICAgIXRvb2wubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKTtcbn1cblxuZnVuY3Rpb24gaXNEb2N1bWVudFRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGRvY3VtZW50VG9vbE5hbWVzID0gW1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGRvY3VtZW50VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbmZ1bmN0aW9uIGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhbmFseXNpc1Rvb2xOYW1lcyA9IFtcbiAgICAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnZ2V0TWVkaWNhbEluc2lnaHRzJyxcbiAgICAnZXh0cmFjdE1lZGljYWxFbnRpdGllcycsICdzZW1hbnRpY1NlYXJjaExvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFuYWx5c2lzVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBnZXQgZW1vamkgZm9yIHRvb2wgY2F0ZWdvcmllc1xuZnVuY3Rpb24gZ2V0Q2F0ZWdvcnlFbW9qaShjYXRlZ29yeTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZW1vamlNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJ0VwaWMgRUhSJzogJ/Cfj6UnLFxuICAgICdBaWRib3ggRkhJUic6ICfwn5OLJyxcbiAgICAnTWVkaWNhbCBEb2N1bWVudHMnOiAn8J+ThCcsXG4gICAgJ1NlYXJjaCAmIEFuYWx5c2lzJzogJ/CflI0nLFxuICAgICdPdGhlcic6ICfwn5SnJ1xuICB9O1xuICBcbiAgcmV0dXJuIGVtb2ppTWFwW2NhdGVnb3J5XSB8fCAn8J+Upyc7XG59XG5cbi8vIEdyYWNlZnVsIHNodXRkb3duXG5wcm9jZXNzLm9uKCdTSUdJTlQnLCAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCdcXG7wn5uRIFNodXR0aW5nIGRvd24gc2VydmVyLi4uJyk7XG4gIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gIFxuICAvLyBDbGVhciBhbGwgY29udGV4dCBiZWZvcmUgc2h1dGRvd25cbiAgY29uc3QgeyBDb250ZXh0TWFuYWdlciB9ID0gcmVxdWlyZSgnL2ltcG9ydHMvYXBpL2NvbnRleHQvY29udGV4dE1hbmFnZXInKTtcbiAgQ29udGV4dE1hbmFnZXIuY2xlYXJBbGxDb250ZXh0cygpO1xuICBcbiAgbWNwTWFuYWdlci5zaHV0ZG93bigpLnRoZW4oKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCfwn5GLIFNlcnZlciBzaHV0ZG93biBjb21wbGV0ZScpO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIHNodXRkb3duOicsIGVycm9yKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH0pO1xufSk7XG5cbi8vIEhhbmRsZSB1bmNhdWdodCBlcnJvcnNcbnByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycm9yKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ1VuY2F1Z2h0IEV4Y2VwdGlvbjonLCBlcnJvcik7XG59KTtcblxucHJvY2Vzcy5vbigndW5oYW5kbGVkUmVqZWN0aW9uJywgKHJlYXNvbiwgcHJvbWlzZSkgPT4ge1xuICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgUmVqZWN0aW9uIGF0OicsIHByb21pc2UsICdyZWFzb246JywgcmVhc29uKTtcbn0pOyJdfQ==
