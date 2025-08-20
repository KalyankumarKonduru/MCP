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
          const mcpServerUrl = (settings === null || settings === void 0 ? void 0 : settings.MEDICAL_MCP_SERVER_URL) || process.env.MEDICAL_MCP_SERVER_URL || 'http://localhost:3005';
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
            const medicalHealth = await fetch('http://localhost:3005/health');
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsIm1lZGljYWxUb29sTmFtZXMiLCJhdmFpbGFibGVUb29sIiwiYXZhaWxhYmxlVG9vbE5hbWVzIiwiY2FsbEVwaWNUb29sIiwiZXBpYyIsImFpZGJveCIsIm1lZGljYWwiLCJlcGljSGVhbHRoIiwiYWlkYm94SGVhbHRoIiwibWVkaWNhbEhlYWx0aCIsInByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50IiwicHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudCIsIl9lcnJvciRtZXNzYWdlIiwiX2Vycm9yJG1lc3NhZ2UyIiwiX2Vycm9yJG1lc3NhZ2UzIiwiTk9ERV9FTlYiLCJxdWVyeUludGVudCIsImNvbnRleHRJbmZvIiwic3lzdGVtUHJvbXB0IiwiY29udmVyc2F0aW9uSGlzdG9yeSIsImZpbmFsUmVzcG9uc2UiLCJpdGVyYXRpb25zIiwibWF4SXRlcmF0aW9ucyIsIm1heFJldHJpZXMiLCJyZXRyeUNvdW50IiwiY3JlYXRlIiwibW9kZWwiLCJtYXhfdG9rZW5zIiwic3lzdGVtIiwidG9vbF9jaG9pY2UiLCJkZWxheSIsInBvdyIsIlByb21pc2UiLCJyZXNvbHZlIiwic2V0VGltZW91dCIsImhhc1Rvb2xVc2UiLCJhc3Npc3RhbnRSZXNwb25zZSIsImlucHV0IiwidG9vbFJlc3VsdCIsInRvb2xfdXNlX2lkIiwiZm9ybWF0VG9vbFJlc3VsdCIsImlzX2Vycm9yIiwiX3RoaXMkY29uZmlnIiwiZW5kcG9pbnQiLCJvendlbGxFbmRwb2ludCIsImF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24iLCJfdGhpcyRjb25maWcyIiwiX2RhdGEkY2hvaWNlcyIsIl9kYXRhJGNob2ljZXMkIiwicHJvbXB0IiwidGVtcGVyYXR1cmUiLCJzdHJlYW0iLCJkYXRhIiwiY2hvaWNlcyIsImNvbXBsZXRpb24iLCJwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQiLCJnZXRBdmFpbGFibGVUb29scyIsImlzVG9vbEF2YWlsYWJsZSIsInNvbWUiLCJnZXRNZWRpY2FsT3BlcmF0aW9ucyIsImdldEVwaWNPcGVyYXRpb25zIiwiZ2V0QWlkYm94T3BlcmF0aW9ucyIsInN3aXRjaFByb3ZpZGVyIiwidG9VcHBlckNhc2UiLCJnZXRDdXJyZW50UHJvdmlkZXIiLCJfdGhpcyRjb25maWczIiwiZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX2dsb2JhbCRNZXRlb3I0IiwiX2dsb2JhbCRNZXRlb3I0JHNldHRpIiwiYW50aHJvcGljS2V5IiwiQU5USFJPUElDX0FQSV9LRVkiLCJvendlbGxLZXkiLCJPWldFTExfQVBJX0tFWSIsInByb3ZpZGVycyIsImlzUmVhZHkiLCJnZXRDb25maWciLCJzaHV0ZG93biIsImNvbnRlbnRUeXBlIiwiaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UiLCJyZXNwb25zZVRleHQiLCJyZWplY3QiLCJfcmVzcG9uc2UkYm9keSIsInJlYWRlciIsImdldFJlYWRlciIsImRlY29kZXIiLCJUZXh0RGVjb2RlciIsImJ1ZmZlciIsInByb2Nlc3NDaHVuayIsImRvbmUiLCJ2YWx1ZSIsInJlYWQiLCJkZWNvZGUiLCJsaW5lcyIsInBvcCIsImxpbmUiLCJwYXJzZWQiLCJjYW5jZWwiLCJjYXRjaCIsInVwbG9hZERvY3VtZW50IiwiZmlsZSIsImZpbGVuYW1lIiwibWltZVR5cGUiLCJ0aXRsZSIsImZpbGVCdWZmZXIiLCJ0b1N0cmluZyIsImZpbGVUeXBlIiwic2VhcmNoRG9jdW1lbnRzIiwidGhyZXNob2xkIiwibGlzdERvY3VtZW50cyIsIm9mZnNldCIsImRvY3VtZW50SWQiLCJmaW5kU2ltaWxhckNhc2VzIiwiY3JpdGVyaWEiLCJhbmFseXplUGF0aWVudEhpc3RvcnkiLCJhbmFseXNpc1R5cGUiLCJkYXRlUmFuZ2UiLCJnZXRNZWRpY2FsSW5zaWdodHMiLCJleHRyYWN0VGV4dCIsIl9pZCIsImRvY3VtZW50cyIsInN1Y2Nlc3MiLCJleHRyYWN0ZWRUZXh0IiwiY29uZmlkZW5jZSIsInNlYXJjaEJ5RGlhZ25vc2lzIiwicGF0aWVudElkZW50aWZpZXIiLCJkaWFnbm9zaXNRdWVyeSIsInNlbWFudGljU2VhcmNoIiwiZ2V0UGF0aWVudFN1bW1hcnkiLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJleHRyYWN0QW5kVXBkYXRlQ29udGV4dCIsImV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UiLCJleHRyYWN0RGF0YVNvdXJjZXMiLCJzYW5pdGl6ZVBhdGllbnROYW1lIiwiY2hlY2siLCJNYXRjaCIsIm1ldGhvZHMiLCJtZXNzYWdlcy5pbnNlcnQiLCJtZXNzYWdlRGF0YSIsIlN0cmluZyIsIm1lc3NhZ2VJZCIsImluc2VydEFzeW5jIiwiJGluYyIsImNhbGwiLCJtY3AucHJvY2Vzc1F1ZXJ5IiwiTWF5YmUiLCJpc1NpbXVsYXRpb24iLCJtY3BNYW5hZ2VyIiwiX3Nlc3Npb24kbWV0YWRhdGEiLCJjb250ZXh0RGF0YSIsImNvbnZlcnNhdGlvbkNvbnRleHQiLCJtY3Auc3dpdGNoUHJvdmlkZXIiLCJtY3AuZ2V0Q3VycmVudFByb3ZpZGVyIiwibWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycyIsIl9NZXRlb3Ikc2V0dGluZ3MiLCJtY3AuZ2V0QXZhaWxhYmxlVG9vbHMiLCJtY3AuaGVhbHRoQ2hlY2siLCJzZXJ2ZXJzIiwibWVkaWNhbC51cGxvYWREb2N1bWVudCIsImZpbGVEYXRhIiwicGF0aWVudE5hbWUiLCJub3ciLCJfdGhpcyRjb25uZWN0aW9uIiwiZXN0aW1hdGVkRmlsZVNpemUiLCJyb3VuZCIsIkJ1ZmZlciIsInVwbG9hZGVkQnkiLCJ1c2VySWQiLCJ1cGxvYWREYXRlIiwidG9JU09TdHJpbmciLCIkYWRkVG9TZXQiLCJ1cGRhdGVFcnJvciIsIl9lcnJvciRtZXNzYWdlNCIsIl9lcnJvciRtZXNzYWdlNSIsIm1lZGljYWwucHJvY2Vzc0RvY3VtZW50IiwidGV4dEV4dHJhY3Rpb24iLCJkaWFnbm9zaXNDb3VudCIsIm1lZGljYXRpb25Db3VudCIsImxhYlJlc3VsdENvdW50IiwicGF0aWVudE1hdGNoIiwiJGVhY2giLCJkYXRhU291cmNlcyIsIm1lZGljYWxQYXR0ZXJucyIsInNvdXJjZXMiLCJ3b3JkIiwiY2hhckF0IiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3JpZXMiLCJjYXRlZ29yeSIsImlzU2VhcmNoQW5hbHlzaXNUb29sIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQUEsQ0FBT0MsTUFBRTtNQUFBQyxjQUE2QixFQUFBQSxDQUFBLEtBQUFBO0lBQU07SUFBQSxJQUFBQyxrQkFBdUI7SUFBQUgsTUFBQSxDQUFBSSxJQUFBO01BQUFELG1CQUFBRSxDQUFBO1FBQUFGLGtCQUFBLEdBQUFFLENBQUE7TUFBQTtJQUFBO0lBQUEsSUFBQUMsa0JBQUE7SUFBQU4sTUFBQSxDQUFBSSxJQUFBO01B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LE9BQU8sQ0FBQ3FCLEtBQUssQ0FBQyx3QkFBd0IsRUFBRUEsS0FBSyxDQUFDO1FBQzlDMkcsT0FBTyxDQUFDK1MsSUFBSSxDQUFDLENBQUMsQ0FBQztNQUNqQixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7SUFFRjtJQUNBL1MsT0FBTyxDQUFDNFMsRUFBRSxDQUFDLG1CQUFtQixFQUFHdlosS0FBSyxJQUFJO01BQ3hDckIsT0FBTyxDQUFDcUIsS0FBSyxDQUFDLHFCQUFxQixFQUFFQSxLQUFLLENBQUM7SUFDN0MsQ0FBQyxDQUFDO0lBRUYyRyxPQUFPLENBQUM0UyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQ0ksTUFBTSxFQUFFQyxPQUFPLEtBQUk7TUFDbkRqYixPQUFPLENBQUNxQixLQUFLLENBQUMseUJBQXlCLEVBQUU0WixPQUFPLEVBQUUsU0FBUyxFQUFFRCxNQUFNLENBQUM7SUFDdEUsQ0FBQyxDQUFDO0lBQUNqYyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9hcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24sIE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlcy9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udmVyc2F0aW9uQ29udGV4dCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICByZWNlbnRNZXNzYWdlczogTWVzc2FnZVtdO1xuICBwYXRpZW50Q29udGV4dD86IHN0cmluZztcbiAgZG9jdW1lbnRDb250ZXh0Pzogc3RyaW5nW107XG4gIG1lZGljYWxFbnRpdGllcz86IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PjtcbiAgbWF4Q29udGV4dExlbmd0aDogbnVtYmVyO1xuICB0b3RhbFRva2VuczogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBjb250ZXh0cyA9IG5ldyBNYXA8c3RyaW5nLCBDb252ZXJzYXRpb25Db250ZXh0PigpO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQ09OVEVYVF9MRU5HVEggPSA0MDAwOyAvLyBBZGp1c3QgYmFzZWQgb24gbW9kZWxcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX01FU1NBR0VTID0gMjA7XG4gIFxuICBzdGF0aWMgYXN5bmMgZ2V0Q29udGV4dChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29udmVyc2F0aW9uQ29udGV4dD4ge1xuICAgIGxldCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIC8vIExvYWQgY29udGV4dCBmcm9tIGRhdGFiYXNlXG4gICAgICBjb250ZXh0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGV4dEZyb21EQihzZXNzaW9uSWQpO1xuICAgICAgdGhpcy5jb250ZXh0cy5zZXQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIGxvYWRDb250ZXh0RnJvbURCKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb252ZXJzYXRpb25Db250ZXh0PiB7XG4gICAgLy8gTG9hZCByZWNlbnQgbWVzc2FnZXNcbiAgICBjb25zdCByZWNlbnRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQgfSxcbiAgICAgIHsgXG4gICAgICAgIHNvcnQ6IHsgdGltZXN0YW1wOiAtMSB9LCBcbiAgICAgICAgbGltaXQ6IHRoaXMuTUFYX01FU1NBR0VTIFxuICAgICAgfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIC8vIExvYWQgc2Vzc2lvbiBtZXRhZGF0YVxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgXG4gICAgY29uc3QgY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHJlY2VudE1lc3NhZ2VzOiByZWNlbnRNZXNzYWdlcy5yZXZlcnNlKCksXG4gICAgICBtYXhDb250ZXh0TGVuZ3RoOiB0aGlzLk1BWF9DT05URVhUX0xFTkdUSCxcbiAgICAgIHRvdGFsVG9rZW5zOiAwXG4gICAgfTtcbiAgICBcbiAgICAvLyBBZGQgbWV0YWRhdGEgZnJvbSBzZXNzaW9uXG4gICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhKSB7XG4gICAgICBjb250ZXh0LnBhdGllbnRDb250ZXh0ID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICBjb250ZXh0LmRvY3VtZW50Q29udGV4dCA9IHNlc3Npb24ubWV0YWRhdGEuZG9jdW1lbnRJZHM7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCBlbnRpdGllcyBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnRleHQubWVkaWNhbEVudGl0aWVzID0gdGhpcy5leHRyYWN0TWVkaWNhbEVudGl0aWVzKHJlY2VudE1lc3NhZ2VzKTtcbiAgICBcbiAgICAvLyBDYWxjdWxhdGUgdG9rZW4gdXNhZ2VcbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgXG4gICAgLy8gVHJpbSBpZiBuZWVkZWRcbiAgICB0aGlzLnRyaW1Db250ZXh0KGNvbnRleHQpO1xuICAgIFxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIFxuICBzdGF0aWMgYXN5bmMgdXBkYXRlQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgbmV3TWVzc2FnZTogTWVzc2FnZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICAvLyBBZGQgbmV3IG1lc3NhZ2VcbiAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnB1c2gobmV3TWVzc2FnZSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIG1lZGljYWwgZW50aXRpZXMgaWYgbWVzc2FnZSBjb250YWlucyB0aGVtXG4gICAgaWYgKG5ld01lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcbiAgICAgIGNvbnN0IGVudGl0aWVzID0gdGhpcy5leHRyYWN0RW50aXRpZXNGcm9tTWVzc2FnZShuZXdNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgaWYgKGVudGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29udGV4dC5tZWRpY2FsRW50aXRpZXMgPSBbXG4gICAgICAgICAgLi4uKGNvbnRleHQubWVkaWNhbEVudGl0aWVzIHx8IFtdKSxcbiAgICAgICAgICAuLi5lbnRpdGllc1xuICAgICAgICBdLnNsaWNlKC01MCk7IC8vIEtlZXAgbGFzdCA1MCBlbnRpdGllc1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBSZWNhbGN1bGF0ZSB0b2tlbnMgYW5kIHRyaW1cbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgdGhpcy50cmltQ29udGV4dChjb250ZXh0KTtcbiAgICBcbiAgICB0aGlzLmNvbnRleHRzLnNldChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICAgIFxuICAgIC8vIFBlcnNpc3QgaW1wb3J0YW50IGNvbnRleHQgYmFjayB0byBzZXNzaW9uXG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0Q29udGV4dChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyB0cmltQ29udGV4dChjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KSB7XG4gICAgd2hpbGUgKGNvbnRleHQudG90YWxUb2tlbnMgPiBjb250ZXh0Lm1heENvbnRleHRMZW5ndGggJiYgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggPiAyKSB7XG4gICAgICAvLyBSZW1vdmUgb2xkZXN0IG1lc3NhZ2VzLCBidXQga2VlcCBhdCBsZWFzdCAyXG4gICAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnNoaWZ0KCk7XG4gICAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgfVxuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBjYWxjdWxhdGVUb2tlbnMoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IG51bWJlciB7XG4gICAgLy8gUm91Z2ggZXN0aW1hdGlvbjogMSB0b2tlbiDiiYggNCBjaGFyYWN0ZXJzXG4gICAgbGV0IHRvdGFsQ2hhcnMgPSAwO1xuICAgIFxuICAgIC8vIENvdW50IG1lc3NhZ2UgY29udGVudFxuICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5yZWNlbnRNZXNzYWdlc1xuICAgICAgLm1hcChtc2cgPT4gbXNnLmNvbnRlbnQpXG4gICAgICAuam9pbignICcpLmxlbmd0aDtcbiAgICBcbiAgICAvLyBDb3VudCBtZXRhZGF0YVxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQucGF0aWVudENvbnRleHQubGVuZ3RoICsgMjA7IC8vIEluY2x1ZGUgbGFiZWxcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQuZG9jdW1lbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQuZG9jdW1lbnRDb250ZXh0LmpvaW4oJyAnKS5sZW5ndGggKyAzMDtcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQubWVkaWNhbEVudGl0aWVzKSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQubWVkaWNhbEVudGl0aWVzXG4gICAgICAgIC5tYXAoZSA9PiBgJHtlLnRleHR9ICgke2UubGFiZWx9KWApXG4gICAgICAgIC5qb2luKCcsICcpLmxlbmd0aDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIE1hdGguY2VpbCh0b3RhbENoYXJzIC8gNCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBidWlsZENvbnRleHRQcm9tcHQoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgLy8gQWRkIHBhdGllbnQgY29udGV4dFxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICBwYXJ0cy5wdXNoKGBDdXJyZW50IFBhdGllbnQ6ICR7Y29udGV4dC5wYXRpZW50Q29udGV4dH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIGRvY3VtZW50IGNvbnRleHRcbiAgICBpZiAoY29udGV4dC5kb2N1bWVudENvbnRleHQgJiYgY29udGV4dC5kb2N1bWVudENvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgcGFydHMucHVzaChgUmVsYXRlZCBEb2N1bWVudHM6ICR7Y29udGV4dC5kb2N1bWVudENvbnRleHQuc2xpY2UoMCwgNSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIG1lZGljYWwgZW50aXRpZXMgc3VtbWFyeVxuICAgIGlmIChjb250ZXh0Lm1lZGljYWxFbnRpdGllcyAmJiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBlbnRpdHlTdW1tYXJ5ID0gdGhpcy5zdW1tYXJpemVNZWRpY2FsRW50aXRpZXMoY29udGV4dC5tZWRpY2FsRW50aXRpZXMpO1xuICAgICAgcGFydHMucHVzaChgTWVkaWNhbCBDb250ZXh0OiAke2VudGl0eVN1bW1hcnl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGlmIChjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbiA9IGNvbnRleHQucmVjZW50TWVzc2FnZXNcbiAgICAgICAgLm1hcChtc2cgPT4gYCR7bXNnLnJvbGUgPT09ICd1c2VyJyA/ICdVc2VyJyA6ICdBc3Npc3RhbnQnfTogJHttc2cuY29udGVudH1gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICBcbiAgICAgIHBhcnRzLnB1c2goYFJlY2VudCBDb252ZXJzYXRpb246XFxuJHtjb252ZXJzYXRpb259YCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBwYXJ0cy5qb2luKCdcXG5cXG4nKTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgc3VtbWFyaXplTWVkaWNhbEVudGl0aWVzKGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4pOiBzdHJpbmcge1xuICAgIGNvbnN0IGdyb3VwZWQgPSBlbnRpdGllcy5yZWR1Y2UoKGFjYywgZW50aXR5KSA9PiB7XG4gICAgICBpZiAoIWFjY1tlbnRpdHkubGFiZWxdKSB7XG4gICAgICAgIGFjY1tlbnRpdHkubGFiZWxdID0gW107XG4gICAgICB9XG4gICAgICBhY2NbZW50aXR5LmxhYmVsXS5wdXNoKGVudGl0eS50ZXh0KTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nW10+KTtcbiAgICBcbiAgICBjb25zdCBzdW1tYXJ5ID0gT2JqZWN0LmVudHJpZXMoZ3JvdXBlZClcbiAgICAgIC5tYXAoKFtsYWJlbCwgdGV4dHNdKSA9PiB7XG4gICAgICAgIGNvbnN0IHVuaXF1ZSA9IFsuLi5uZXcgU2V0KHRleHRzKV0uc2xpY2UoMCwgNSk7XG4gICAgICAgIHJldHVybiBgJHtsYWJlbH06ICR7dW5pcXVlLmpvaW4oJywgJyl9YDtcbiAgICAgIH0pXG4gICAgICAuam9pbignOyAnKTtcbiAgICBcbiAgICByZXR1cm4gc3VtbWFyeTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyhtZXNzYWdlczogTWVzc2FnZVtdKTogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+IHtcbiAgICBjb25zdCBlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+ID0gW107XG4gICAgXG4gICAgLy8gU2ltcGxlIGV4dHJhY3Rpb24gLSBsb29rIGZvciBwYXR0ZXJuc1xuICAgIGNvbnN0IHBhdHRlcm5zID0ge1xuICAgICAgTUVESUNBVElPTjogL1xcYihtZWRpY2F0aW9ufG1lZGljaW5lfGRydWd8cHJlc2NyaXB0aW9uKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBDT05ESVRJT046IC9cXGIoZGlhZ25vc2lzfGNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBTWU1QVE9NOiAvXFxiKHN5bXB0b218Y29tcGxhaW4pOlxccyooW14sLl0rKS9naSxcbiAgICB9O1xuICAgIFxuICAgIG1lc3NhZ2VzLmZvckVhY2gobXNnID0+IHtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKS5mb3JFYWNoKChbbGFiZWwsIHBhdHRlcm5dKSA9PiB7XG4gICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhtc2cuY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICAgICAgZW50aXRpZXMucHVzaCh7XG4gICAgICAgICAgICB0ZXh0OiBtYXRjaFsyXS50cmltKCksXG4gICAgICAgICAgICBsYWJlbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gZW50aXRpZXM7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiB7XG4gICAgY29uc3QgZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiA9IFtdO1xuICAgIFxuICAgIC8vIExvb2sgZm9yIG1lZGljYWwgdGVybXMgaW4gdGhlIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0ge1xuICAgICAgTUVESUNBVElPTjogWydtZWRpY2F0aW9uJywgJ3ByZXNjcmliZWQnLCAnZG9zYWdlJywgJ21nJywgJ3RhYmxldHMnXSxcbiAgICAgIENPTkRJVElPTjogWydkaWFnbm9zaXMnLCAnY29uZGl0aW9uJywgJ3N5bmRyb21lJywgJ2Rpc2Vhc2UnXSxcbiAgICAgIFBST0NFRFVSRTogWydzdXJnZXJ5JywgJ3Byb2NlZHVyZScsICd0ZXN0JywgJ2V4YW1pbmF0aW9uJ10sXG4gICAgICBTWU1QVE9NOiBbJ3BhaW4nLCAnZmV2ZXInLCAnbmF1c2VhJywgJ2ZhdGlndWUnXVxuICAgIH07XG4gICAgXG4gICAgT2JqZWN0LmVudHJpZXMobWVkaWNhbFRlcm1zKS5mb3JFYWNoKChbbGFiZWwsIHRlcm1zXSkgPT4ge1xuICAgICAgdGVybXMuZm9yRWFjaCh0ZXJtID0+IHtcbiAgICAgICAgaWYgKGNvbnRlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHNlbnRlbmNlIGNvbnRhaW5pbmcgdGhlIHRlcm1cbiAgICAgICAgICBjb25zdCBzZW50ZW5jZXMgPSBjb250ZW50LnNwbGl0KC9bLiE/XS8pO1xuICAgICAgICAgIHNlbnRlbmNlcy5mb3JFYWNoKHNlbnRlbmNlID0+IHtcbiAgICAgICAgICAgIGlmIChzZW50ZW5jZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRlcm0pKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IHNlbnRlbmNlLnRyaW0oKS5zdWJzdHJpbmcoMCwgMTAwKTtcbiAgICAgICAgICAgICAgaWYgKGV4dHJhY3RlZCkge1xuICAgICAgICAgICAgICAgIGVudGl0aWVzLnB1c2goeyB0ZXh0OiBleHRyYWN0ZWQsIGxhYmVsIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiBlbnRpdGllcztcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgYXN5bmMgcGVyc2lzdENvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcsIGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAvLyBVcGRhdGUgc2Vzc2lvbiB3aXRoIGxhdGVzdCBjb250ZXh0IG1ldGFkYXRhXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgJHNldDoge1xuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogY29udGV4dC5wYXRpZW50Q29udGV4dCxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogY29udGV4dC5kb2N1bWVudENvbnRleHQsXG4gICAgICAgICdtZXRhZGF0YS5sYXN0RW50aXRpZXMnOiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcz8uc2xpY2UoLTEwKSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IGNvbnRleHQucmVjZW50TWVzc2FnZXNbY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggLSAxXT8uY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyBzZXNzaW9uSWQgfSksXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIFxuICBzdGF0aWMgY2xlYXJDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgdGhpcy5jb250ZXh0cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgfVxuICBcbiAgc3RhdGljIGNsZWFyQWxsQ29udGV4dHMoKSB7XG4gICAgdGhpcy5jb250ZXh0cy5jbGVhcigpO1xuICB9XG4gIFxuICBzdGF0aWMgZ2V0Q29udGV4dFN0YXRzKHNlc3Npb25JZDogc3RyaW5nKTogeyBzaXplOiBudW1iZXI7IG1lc3NhZ2VzOiBudW1iZXI7IHRva2VuczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzaXplOiB0aGlzLmNvbnRleHRzLnNpemUsXG4gICAgICBtZXNzYWdlczogY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGgsXG4gICAgICB0b2tlbnM6IGNvbnRleHQudG90YWxUb2tlbnNcbiAgICB9O1xuICB9XG59IiwiaW50ZXJmYWNlIE1DUFJlcXVlc3Qge1xuICBqc29ucnBjOiAnMi4wJztcbiAgbWV0aG9kOiBzdHJpbmc7XG4gIHBhcmFtczogYW55O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICBqc29ucnBjOiAnMi4wJztcbiAgcmVzdWx0PzogYW55O1xuICBlcnJvcj86IHtcbiAgICBjb2RlOiBudW1iZXI7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICB9O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQWlkYm94U2VydmVyQ29ubmVjdGlvbiB7XG4gIHByaXZhdGUgYmFzZVVybDogc3RyaW5nO1xuICBwcml2YXRlIHNlc3Npb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlcXVlc3RJZCA9IDE7XG5cbiAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMicpIHtcbiAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJyk7IC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaFxuICB9XG5cbiAgYXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGF0OiAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgIFxuICAgICAgLy8gVGVzdCBpZiBzZXJ2ZXIgaXMgcnVubmluZ1xuICAgICAgY29uc3QgaGVhbHRoQ2hlY2sgPSBhd2FpdCB0aGlzLmNoZWNrU2VydmVySGVhbHRoKCk7XG4gICAgICBpZiAoIWhlYWx0aENoZWNrLm9rKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IE1DUCBTZXJ2ZXIgbm90IHJlc3BvbmRpbmcgYXQgJHt0aGlzLmJhc2VVcmx9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXRpYWxpemUgdGhlIGNvbm5lY3Rpb25cbiAgICAgIGNvbnN0IGluaXRSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCdpbml0aWFsaXplJywge1xuICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgcm9vdHM6IHtcbiAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgIG5hbWU6ICdtZXRlb3ItYWlkYm94LWNsaWVudCcsXG4gICAgICAgICAgdmVyc2lvbjogJzEuMC4wJ1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc29sZS5sb2coJyBBaWRib3ggTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuXG4gICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcblxuICAgICAgLy8gVGVzdCBieSBsaXN0aW5nIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICBjb25zb2xlLmxvZyhgQWlkYm94IE1DUCBDb25uZWN0aW9uIHN1Y2Nlc3NmdWwhIEZvdW5kICR7dG9vbHNSZXN1bHQudG9vbHM/Lmxlbmd0aCB8fCAwfSB0b29sc2ApO1xuICAgICAgXG4gICAgICBpZiAodG9vbHNSZXN1bHQudG9vbHMpIHtcbiAgICAgICAgY29uc29sZS5sb2coJyBBdmFpbGFibGUgQWlkYm94IHRvb2xzOicpO1xuICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpbmRleCArIDF9LiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb259YCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBGYWlsZWQgdG8gY29ubmVjdCB0byBBaWRib3ggTUNQIFNlcnZlcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrU2VydmVySGVhbHRoKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vaGVhbHRoYCwge1xuICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApIC8vIDUgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICBjb25zb2xlLmxvZygnIEFpZGJveCBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmJhc2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWlkYm94IE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGlkID0gdGhpcy5yZXF1ZXN0SWQrKztcbiAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXMsXG4gICAgICBpZFxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBzZXNzaW9uIElEIGlmIHdlIGhhdmUgb25lXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgcmVxdWVzdCB0byBBaWRib3g6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudFxuICAgICAgY29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbWNwLXNlc3Npb24taWQnKTtcbiAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uSWQgPSByZXNwb25zZVNlc3Npb25JZDtcbiAgICAgICAgY29uc29sZS5sb2coJyBSZWNlaXZlZCBBaWRib3ggc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9LiBSZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogTUNQUmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggTUNQIGVycm9yICR7cmVzdWx0LmVycm9yLmNvZGV9OiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhgIEFpZGJveCByZXF1ZXN0ICR7bWV0aG9kfSBzdWNjZXNzZnVsYCk7XG4gICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCBBaWRib3ggcmVxdWVzdCBmYWlsZWQgZm9yIG1ldGhvZCAke21ldGhvZH06YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kTm90aWZpY2F0aW9uKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfTtcblxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGBOb3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWlkYm94IE1DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gIH1cblxuICBhc3luYyBjYWxsVG9vbChuYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWlkYm94IE1DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2NhbGwnLCB7XG4gICAgICBuYW1lLFxuICAgICAgYXJndW1lbnRzOiBhcmdzXG4gICAgfSk7XG4gIH1cblxuICBkaXNjb25uZWN0KCkge1xuICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBjb25zb2xlLmxvZygnIERpc2Nvbm5lY3RlZCBmcm9tIEFpZGJveCBNQ1AgU2VydmVyJyk7XG4gIH1cbn1cblxuLy8gQWlkYm94IEZISVIgb3BlcmF0aW9uc1xuZXhwb3J0IGludGVyZmFjZSBBaWRib3hGSElST3BlcmF0aW9ucyB7XG4gIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVQYXRpZW50KHBhdGllbnREYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIHVwZGF0ZVBhdGllbnQocGF0aWVudElkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlT2JzZXJ2YXRpb24ob2JzZXJ2YXRpb25EYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGdldFBhdGllbnRNZWRpY2F0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QobWVkaWNhdGlvbkRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZUNvbmRpdGlvbihjb25kaXRpb25EYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVFbmNvdW50ZXIoZW5jb3VudGVyRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQWlkYm94T3BlcmF0aW9ucyhjb25uZWN0aW9uOiBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uKTogQWlkYm94RkhJUk9wZXJhdGlvbnMge1xuICByZXR1cm4ge1xuICAgIGFzeW5jIHNlYXJjaFBhdGllbnRzKHF1ZXJ5OiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveFNlYXJjaFBhdGllbnRzJywgcXVlcnkpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50RGV0YWlscyhwYXRpZW50SWQ6IHN0cmluZykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudERldGFpbHMnLCB7IHBhdGllbnRJZCB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlUGF0aWVudChwYXRpZW50RGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hDcmVhdGVQYXRpZW50JywgcGF0aWVudERhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyB1cGRhdGVQYXRpZW50KHBhdGllbnRJZDogc3RyaW5nLCB1cGRhdGVzOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveFVwZGF0ZVBhdGllbnQnLCB7IHBhdGllbnRJZCwgLi4udXBkYXRlcyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveEdldFBhdGllbnRPYnNlcnZhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlT2JzZXJ2YXRpb24ob2JzZXJ2YXRpb25EYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZU9ic2VydmF0aW9uJywgb2JzZXJ2YXRpb25EYXRhKTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94R2V0UGF0aWVudE1lZGljYXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0KG1lZGljYXRpb25EYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JywgbWVkaWNhdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveEdldFBhdGllbnRDb25kaXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZUNvbmRpdGlvbihjb25kaXRpb25EYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZUNvbmRpdGlvbicsIGNvbmRpdGlvbkRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveEdldFBhdGllbnRFbmNvdW50ZXJzJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZUVuY291bnRlcihlbmNvdW50ZXJEYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveENyZWF0ZUVuY291bnRlcicsIGVuY291bnRlckRhdGEpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH1cbiAgfTtcbn0iLCJpbnRlcmZhY2UgTUNQUmVxdWVzdCB7XG4gICAganNvbnJwYzogJzIuMCc7XG4gICAgbWV0aG9kOiBzdHJpbmc7XG4gICAgcGFyYW1zOiBhbnk7XG4gICAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbiAgfVxuICBcbiAgaW50ZXJmYWNlIE1DUFJlc3BvbnNlIHtcbiAgICBqc29ucnBjOiAnMi4wJztcbiAgICByZXN1bHQ/OiBhbnk7XG4gICAgZXJyb3I/OiB7XG4gICAgICBjb2RlOiBudW1iZXI7XG4gICAgICBtZXNzYWdlOiBzdHJpbmc7XG4gICAgfTtcbiAgICBpZDogc3RyaW5nIHwgbnVtYmVyO1xuICB9XG4gIFxuICBleHBvcnQgY2xhc3MgRXBpY1NlcnZlckNvbm5lY3Rpb24ge1xuICAgIHByaXZhdGUgYmFzZVVybDogc3RyaW5nO1xuICAgIHByaXZhdGUgc2Vzc2lvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBwcml2YXRlIHJlcXVlc3RJZCA9IDE7XG4gIFxuICAgIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDMnKSB7XG4gICAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJyk7IC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaFxuICAgIH1cbiAgXG4gICAgYXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn4+lIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGF0OiAke3RoaXMuYmFzZVVybH1gKTtcbiAgICAgICAgXG4gICAgICAgIC8vIFRlc3QgaWYgc2VydmVyIGlzIHJ1bm5pbmdcbiAgICAgICAgY29uc3QgaGVhbHRoQ2hlY2sgPSBhd2FpdCB0aGlzLmNoZWNrU2VydmVySGVhbHRoKCk7XG4gICAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEVwaWMgTUNQIFNlcnZlciBub3QgcmVzcG9uZGluZyBhdCAke3RoaXMuYmFzZVVybH06ICR7aGVhbHRoQ2hlY2suZXJyb3J9YCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIC8vIEluaXRpYWxpemUgdGhlIGNvbm5lY3Rpb25cbiAgICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgICAgcHJvdG9jb2xWZXJzaW9uOiAnMjAyNC0xMS0wNScsXG4gICAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgICBsaXN0Q2hhbmdlZDogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGNsaWVudEluZm86IHtcbiAgICAgICAgICAgIG5hbWU6ICdtZXRlb3ItZXBpYy1jbGllbnQnLFxuICAgICAgICAgICAgdmVyc2lvbjogJzEuMC4wJ1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gIFxuICAgICAgICBjb25zb2xlLmxvZygnIEVwaWMgTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuICBcbiAgICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdpbml0aWFsaXplZCcsIHt9KTtcbiAgXG4gICAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2xpc3QnLCB7fSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgRXBpYyBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCcgQXZhaWxhYmxlIEVwaWMgdG9vbHM6Jyk7XG4gICAgICAgICAgdG9vbHNSZXN1bHQudG9vbHMuZm9yRWFjaCgodG9vbDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpbmRleCArIDF9LiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb259YCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignIEZhaWxlZCB0byBjb25uZWN0IHRvIEVwaWMgTUNQIFNlcnZlcjonLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja1NlcnZlckhlYWx0aCgpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApIC8vIDUgc2Vjb25kIHRpbWVvdXRcbiAgICAgICAgfSk7XG4gIFxuICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0VwaWMgTUNQIFNlcnZlciBoZWFsdGggY2hlY2sgcGFzc2VkOicsIGhlYWx0aCk7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgU2VydmVyIHJldHVybmVkICR7cmVzcG9uc2Uuc3RhdHVzfWAgfTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuYmFzZVVybCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgICB9XG4gIFxuICAgICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgICAgY29uc3QgcmVxdWVzdDogTUNQUmVxdWVzdCA9IHtcbiAgICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgcGFyYW1zLFxuICAgICAgICBpZFxuICAgICAgfTtcbiAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfTtcbiAgXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgICAgfVxuICBcbiAgICAgICAgY29uc29sZS5sb2coYCBTZW5kaW5nIHJlcXVlc3QgdG8gRXBpYyBNQ1A6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG4gIFxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcbiAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICAgIGlmIChyZXNwb25zZVNlc3Npb25JZCAmJiAhdGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCcgUmVjZWl2ZWQgRXBpYyBzZXNzaW9uIElEOicsIHRoaXMuc2Vzc2lvbklkKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9LiBSZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGNvbnN0IHJlc3VsdDogTUNQUmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gIFxuICAgICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcGljIE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICBcbiAgICAgICAgY29uc29sZS5sb2coYCBFcGljIHJlcXVlc3QgJHttZXRob2R9IHN1Y2Nlc3NmdWxgKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgRXBpYyByZXF1ZXN0IGZhaWxlZCBmb3IgbWV0aG9kICR7bWV0aG9kfTpgLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcHJpdmF0ZSBhc3luYyBzZW5kTm90aWZpY2F0aW9uKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgY29uc3Qgbm90aWZpY2F0aW9uID0ge1xuICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXJhbXNcbiAgICAgIH07XG4gIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9O1xuICBcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgICB9XG4gIFxuICAgICAgICBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICBoZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG5vdGlmaWNhdGlvbiksXG4gICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKVxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgRXBpYyBub3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICBcbiAgICBhc3luYyBsaXN0VG9vbHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgfVxuICBcbiAgICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgIH1cbiAgXG4gICAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgICB9XG4gIFxuICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2NhbGwnLCB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgICAgfSk7XG4gICAgfVxuICBcbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gICAgICBjb25zb2xlLmxvZygnIERpc2Nvbm5lY3RlZCBmcm9tIEVwaWMgTUNQIFNlcnZlcicpO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gRXBpYyBGSElSIG9wZXJhdGlvbnMgaW50ZXJmYWNlXG4gIGV4cG9ydCBpbnRlcmZhY2UgRXBpY0ZISVJPcGVyYXRpb25zIHtcbiAgICBzZWFyY2hQYXRpZW50cyhxdWVyeTogYW55KTogUHJvbWlzZTxhbnk+O1xuICAgIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGdldFBhdGllbnRPYnNlcnZhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gICAgZ2V0UGF0aWVudE1lZGljYXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICAgIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICAgIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICB9XG4gIFxuICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlRXBpY09wZXJhdGlvbnMoY29ubmVjdGlvbjogRXBpY1NlcnZlckNvbm5lY3Rpb24pOiBFcGljRkhJUk9wZXJhdGlvbnMge1xuICAgIHJldHVybiB7XG4gICAgICBhc3luYyBzZWFyY2hQYXRpZW50cyhxdWVyeTogYW55KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3NlYXJjaFBhdGllbnRzJywgcXVlcnkpO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9LFxuICBcbiAgICAgIGFzeW5jIGdldFBhdGllbnREZXRhaWxzKHBhdGllbnRJZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldFBhdGllbnREZXRhaWxzJywgeyBwYXRpZW50SWQgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudE9ic2VydmF0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9LFxuICBcbiAgICAgIGFzeW5jIGdldFBhdGllbnRNZWRpY2F0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldFBhdGllbnRDb25kaXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH0sXG4gIFxuICAgICAgYXN5bmMgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9O1xuICB9IiwiaW1wb3J0IEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgeyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbiwgTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucywgY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnMgfSBmcm9tICcuL21lZGljYWxTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEFpZGJveFNlcnZlckNvbm5lY3Rpb24sIEFpZGJveEZISVJPcGVyYXRpb25zLCBjcmVhdGVBaWRib3hPcGVyYXRpb25zIH0gZnJvbSAnLi9haWRib3hTZXJ2ZXJDb25uZWN0aW9uJztcbmltcG9ydCB7IEVwaWNTZXJ2ZXJDb25uZWN0aW9uLCBFcGljRkhJUk9wZXJhdGlvbnMsIGNyZWF0ZUVwaWNPcGVyYXRpb25zIH0gZnJvbSAnLi9lcGljU2VydmVyQ29ubmVjdGlvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTUNQQ2xpZW50Q29uZmlnIHtcbiAgcHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCc7XG4gIGFwaUtleTogc3RyaW5nO1xuICBvendlbGxFbmRwb2ludD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE1DUENsaWVudE1hbmFnZXIge1xuICBwcml2YXRlIGFudGhyb3BpYz86IEFudGhyb3BpYztcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgY29uZmlnPzogTUNQQ2xpZW50Q29uZmlnO1xuICBcbiAgLy8gTWVkaWNhbCBNQ1AgY29ubmVjdGlvbiAoU3RyZWFtYWJsZSBIVFRQKVxuICBwcml2YXRlIG1lZGljYWxDb25uZWN0aW9uPzogTWVkaWNhbFNlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgbWVkaWNhbE9wZXJhdGlvbnM/OiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zO1xuICBwcml2YXRlIGF2YWlsYWJsZVRvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIC8vIEFpZGJveCBNQ1AgY29ubmVjdGlvblxuICBwcml2YXRlIGFpZGJveENvbm5lY3Rpb24/OiBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIGFpZGJveE9wZXJhdGlvbnM/OiBBaWRib3hGSElST3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBhaWRib3hUb29sczogYW55W10gPSBbXTtcblxuICAvLyBFcGljIE1DUCBjb25uZWN0aW9uXG4gIHByaXZhdGUgZXBpY0Nvbm5lY3Rpb24/OiBFcGljU2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBlcGljT3BlcmF0aW9ucz86IEVwaWNGSElST3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBlcGljVG9vbHM6IGFueVtdID0gW107XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHt9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRJbnN0YW5jZSgpOiBNQ1BDbGllbnRNYW5hZ2VyIHtcbiAgICBpZiAoIU1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIE1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2UgPSBuZXcgTUNQQ2xpZW50TWFuYWdlcigpO1xuICAgIH1cbiAgICByZXR1cm4gTUNQQ2xpZW50TWFuYWdlci5pbnN0YW5jZTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbml0aWFsaXplKGNvbmZpZzogTUNQQ2xpZW50Q29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coJyBJbml0aWFsaXppbmcgTUNQIENsaWVudCB3aXRoIEludGVsbGlnZW50IFRvb2wgU2VsZWN0aW9uJyk7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICB0cnkge1xuICAgICAgaWYgKGNvbmZpZy5wcm92aWRlciA9PT0gJ2FudGhyb3BpYycpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0NyZWF0aW5nIEFudGhyb3BpYyBjbGllbnQgd2l0aCBuYXRpdmUgdG9vbCBjYWxsaW5nIHN1cHBvcnQuLi4nKTtcbiAgICAgICAgdGhpcy5hbnRocm9waWMgPSBuZXcgQW50aHJvcGljKHtcbiAgICAgICAgICBhcGlLZXk6IGNvbmZpZy5hcGlLZXksXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zb2xlLmxvZygnIEFudGhyb3BpYyBjbGllbnQgaW5pdGlhbGl6ZWQgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbicpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5sb2coYE1DUCBDbGllbnQgcmVhZHkgd2l0aCBwcm92aWRlcjogJHtjb25maWcucHJvdmlkZXJ9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBNQ1AgY2xpZW50OicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIENvbm5lY3QgdG8gbWVkaWNhbCBNQ1Agc2VydmVyIGFuZCBnZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvTWVkaWNhbFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICAgIGNvbnN0IG1jcFNlcnZlclVybCA9IHNldHRpbmdzPy5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDUnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gTWVkaWNhbCBNQ1AgU2VydmVyIGF0OiAke21jcFNlcnZlclVybH1gKTtcbiAgICAgIFxuICAgICAgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbiA9IG5ldyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbihtY3BTZXJ2ZXJVcmwpO1xuICAgICAgYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLm1lZGljYWxPcGVyYXRpb25zID0gY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnModGhpcy5tZWRpY2FsQ29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBhbGwgYXZhaWxhYmxlIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24ubGlzdFRvb2xzKCk7XG4gICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gdG9vbHNSZXN1bHQudG9vbHMgfHwgW107XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGVkIHdpdGggJHt0aGlzLmF2YWlsYWJsZVRvb2xzLmxlbmd0aH0gbWVkaWNhbCB0b29scyBhdmFpbGFibGVgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgTWVkaWNhbCB0b29sIG5hbWVzOiAke3RoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBNZWRpY2FsIE1DUCBTZXJ2ZXIgSFRUUCBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvQWlkYm94U2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgICAgY29uc3QgYWlkYm94U2VydmVyVXJsID0gc2V0dGluZ3M/LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuQUlEQk9YX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAyJztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGF0OiAke2FpZGJveFNlcnZlclVybH1gKTtcbiAgICAgIFxuICAgICAgdGhpcy5haWRib3hDb25uZWN0aW9uID0gbmV3IEFpZGJveFNlcnZlckNvbm5lY3Rpb24oYWlkYm94U2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLmFpZGJveE9wZXJhdGlvbnMgPSBjcmVhdGVBaWRib3hPcGVyYXRpb25zKHRoaXMuYWlkYm94Q29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBBaWRib3ggdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5haWRib3hDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5haWRib3hUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RlZCB0byBBaWRib3ggd2l0aCAke3RoaXMuYWlkYm94VG9vbHMubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgQWlkYm94IHRvb2wgbmFtZXM6ICR7dGhpcy5haWRib3hUb29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgICBcbiAgICAgIC8vIE1lcmdlIHdpdGggZXhpc3RpbmcgdG9vbHMsIGVuc3VyaW5nIHVuaXF1ZSBuYW1lc1xuICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRoaXMubWVyZ2VUb29sc1VuaXF1ZSh0aGlzLmF2YWlsYWJsZVRvb2xzLCB0aGlzLmFpZGJveFRvb2xzKTtcbiAgICAgIFxuICAgICAgdGhpcy5sb2dBdmFpbGFibGVUb29scygpO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBBaWRib3ggTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY29ubmVjdFRvRXBpY1NlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICAgIGNvbnN0IGVwaWNTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAzJztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEVwaWMgTUNQIFNlcnZlciBhdDogJHtlcGljU2VydmVyVXJsfWApO1xuICAgICAgXG4gICAgICB0aGlzLmVwaWNDb25uZWN0aW9uID0gbmV3IEVwaWNTZXJ2ZXJDb25uZWN0aW9uKGVwaWNTZXJ2ZXJVcmwpO1xuICAgICAgYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jb25uZWN0KCk7XG4gICAgICB0aGlzLmVwaWNPcGVyYXRpb25zID0gY3JlYXRlRXBpY09wZXJhdGlvbnModGhpcy5lcGljQ29ubmVjdGlvbik7XG4gICAgICBcbiAgICAgIC8vIEdldCBFcGljIHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24ubGlzdFRvb2xzKCk7XG4gICAgICB0aGlzLmVwaWNUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RlZCB0byBFcGljIHdpdGggJHt0aGlzLmVwaWNUb29scy5sZW5ndGh9IHRvb2xzIGF2YWlsYWJsZWApO1xuICAgICAgY29uc29sZS5sb2coYCBFcGljIHRvb2wgbmFtZXM6ICR7dGhpcy5lcGljVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5lcGljVG9vbHMpO1xuICAgICAgXG4gICAgICB0aGlzLmxvZ0F2YWlsYWJsZVRvb2xzKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBNZXJnZSB0b29scyBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgcHJpdmF0ZSBtZXJnZVRvb2xzVW5pcXVlKGV4aXN0aW5nVG9vbHM6IGFueVtdLCBuZXdUb29sczogYW55W10pOiBhbnlbXSB7XG4gICAgY29uc29sZS5sb2coYPCflKcgTWVyZ2luZyB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke25ld1Rvb2xzLmxlbmd0aH0gbmV3YCk7XG4gICAgXG4gICAgY29uc3QgdG9vbE5hbWVTZXQgPSBuZXcgU2V0KGV4aXN0aW5nVG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG4gICAgY29uc3QgdW5pcXVlTmV3VG9vbHMgPSBuZXdUb29scy5maWx0ZXIodG9vbCA9PiB7XG4gICAgICBpZiAodG9vbE5hbWVTZXQuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgRHVwbGljYXRlIHRvb2wgbmFtZSBmb3VuZDogJHt0b29sLm5hbWV9IC0gc2tpcHBpbmcgZHVwbGljYXRlYCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHRvb2xOYW1lU2V0LmFkZCh0b29sLm5hbWUpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgbWVyZ2VkVG9vbHMgPSBbLi4uZXhpc3RpbmdUb29scywgLi4udW5pcXVlTmV3VG9vbHNdO1xuICAgIGNvbnNvbGUubG9nKGAgTWVyZ2VkIHRvb2xzOiAke2V4aXN0aW5nVG9vbHMubGVuZ3RofSBleGlzdGluZyArICR7dW5pcXVlTmV3VG9vbHMubGVuZ3RofSBuZXcgPSAke21lcmdlZFRvb2xzLmxlbmd0aH0gdG90YWxgKTtcbiAgICBcbiAgICByZXR1cm4gbWVyZ2VkVG9vbHM7XG4gIH1cblxucHJpdmF0ZSBsb2dBdmFpbGFibGVUb29scygpOiB2b2lkIHtcbiAgY29uc29sZS5sb2coJ1xcbiBBdmFpbGFibGUgVG9vbHMgZm9yIEludGVsbGlnZW50IFNlbGVjdGlvbjonKTtcbiAgXG4gIC8vIFNlcGFyYXRlIHRvb2xzIGJ5IGFjdHVhbCBzb3VyY2UvdHlwZSwgbm90IGJ5IHBhdHRlcm4gbWF0Y2hpbmdcbiAgY29uc3QgZXBpY1Rvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0Lm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJylcbiAgKTtcbiAgXG4gIGNvbnN0IGFpZGJveFRvb2xzID0gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodCA9PiBcbiAgICB0aGlzLmlzQWlkYm94RkhJUlRvb2wodCkgJiYgIXQubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKVxuICApO1xuICBcbiAgY29uc3QgZG9jdW1lbnRUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdGhpcy5pc0RvY3VtZW50VG9vbCh0KVxuICApO1xuICBcbiAgY29uc3QgYW5hbHlzaXNUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdGhpcy5pc0FuYWx5c2lzVG9vbCh0KVxuICApO1xuICBcbiAgY29uc3Qgb3RoZXJUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgIWVwaWNUb29scy5pbmNsdWRlcyh0KSAmJiBcbiAgICAhYWlkYm94VG9vbHMuaW5jbHVkZXModCkgJiYgXG4gICAgIWRvY3VtZW50VG9vbHMuaW5jbHVkZXModCkgJiYgXG4gICAgIWFuYWx5c2lzVG9vbHMuaW5jbHVkZXModClcbiAgKTtcbiAgXG4gIGlmIChhaWRib3hUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJyBBaWRib3ggRkhJUiBUb29sczonKTtcbiAgICBhaWRib3hUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoZXBpY1Rvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygnIEVwaWMgRUhSIFRvb2xzOicpO1xuICAgIGVwaWNUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoZG9jdW1lbnRUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJyBEb2N1bWVudCBUb29sczonKTtcbiAgICBkb2N1bWVudFRvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChhbmFseXNpc1Rvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygnIFNlYXJjaCAmIEFuYWx5c2lzIFRvb2xzOicpO1xuICAgIGFuYWx5c2lzVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKG90aGVyVG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCcgT3RoZXIgVG9vbHM6Jyk7XG4gICAgb3RoZXJUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhgXFxuIENsYXVkZSB3aWxsIGludGVsbGlnZW50bHkgc2VsZWN0IGZyb20gJHt0aGlzLmF2YWlsYWJsZVRvb2xzLmxlbmd0aH0gdG90YWwgdG9vbHMgYmFzZWQgb24gdXNlciBxdWVyaWVzYCk7XG4gIFxuICAvLyBEZWJ1ZzogQ2hlY2sgZm9yIGR1cGxpY2F0ZXNcbiAgdGhpcy5kZWJ1Z1Rvb2xEdXBsaWNhdGVzKCk7XG59XG5cbi8vIEFkZCB0aGVzZSBoZWxwZXIgbWV0aG9kcyB0byBNQ1BDbGllbnRNYW5hZ2VyIGNsYXNzXG5wcml2YXRlIGlzQWlkYm94RkhJUlRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFpZGJveEZISVJUb29sTmFtZXMgPSBbXG4gICAgJ3NlYXJjaFBhdGllbnRzJywgJ2dldFBhdGllbnREZXRhaWxzJywgJ2NyZWF0ZVBhdGllbnQnLCAndXBkYXRlUGF0aWVudCcsXG4gICAgJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCAnY3JlYXRlT2JzZXJ2YXRpb24nLFxuICAgICdnZXRQYXRpZW50TWVkaWNhdGlvbnMnLCAnY3JlYXRlTWVkaWNhdGlvblJlcXVlc3QnLFxuICAgICdnZXRQYXRpZW50Q29uZGl0aW9ucycsICdjcmVhdGVDb25kaXRpb24nLFxuICAgICdnZXRQYXRpZW50RW5jb3VudGVycycsICdjcmVhdGVFbmNvdW50ZXInXG4gIF07XG4gIFxuICByZXR1cm4gYWlkYm94RkhJUlRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG5wcml2YXRlIGlzRG9jdW1lbnRUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBkb2N1bWVudFRvb2xOYW1lcyA9IFtcbiAgICAndXBsb2FkRG9jdW1lbnQnLCAnc2VhcmNoRG9jdW1lbnRzJywgJ2xpc3REb2N1bWVudHMnLFxuICAgICdjaHVua0FuZEVtYmVkRG9jdW1lbnQnLCAnZ2VuZXJhdGVFbWJlZGRpbmdMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBkb2N1bWVudFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG5wcml2YXRlIGlzQW5hbHlzaXNUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhbmFseXNpc1Rvb2xOYW1lcyA9IFtcbiAgICAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnZ2V0TWVkaWNhbEluc2lnaHRzJyxcbiAgICAnZXh0cmFjdE1lZGljYWxFbnRpdGllcycsICdzZW1hbnRpY1NlYXJjaExvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFuYWx5c2lzVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbiAgLy8gRGVidWcgbWV0aG9kIHRvIGlkZW50aWZ5IGR1cGxpY2F0ZSB0b29sc1xuICBwcml2YXRlIGRlYnVnVG9vbER1cGxpY2F0ZXMoKTogdm9pZCB7XG4gICAgY29uc3QgdG9vbE5hbWVzID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodCA9PiB0Lm5hbWUpO1xuICAgIGNvbnN0IG5hbWVDb3VudCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gICAgXG4gICAgdG9vbE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBuYW1lQ291bnQuc2V0KG5hbWUsIChuYW1lQ291bnQuZ2V0KG5hbWUpIHx8IDApICsgMSk7XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgZHVwbGljYXRlcyA9IEFycmF5LmZyb20obmFtZUNvdW50LmVudHJpZXMoKSlcbiAgICAgIC5maWx0ZXIoKFtuYW1lLCBjb3VudF0pID0+IGNvdW50ID4gMSk7XG4gICAgXG4gICAgaWYgKGR1cGxpY2F0ZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5lcnJvcignIERVUExJQ0FURSBUT09MIE5BTUVTIEZPVU5EOicpO1xuICAgICAgZHVwbGljYXRlcy5mb3JFYWNoKChbbmFtZSwgY291bnRdKSA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYCAg4oCiICR7bmFtZX06IGFwcGVhcnMgJHtjb3VudH0gdGltZXNgKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygn4pyFIEFsbCB0b29sIG5hbWVzIGFyZSB1bmlxdWUnKTtcbiAgICB9XG4gIH1cblxuICAvLyBGaWx0ZXIgdG9vbHMgYmFzZWQgb24gdXNlcidzIHNwZWNpZmllZCBkYXRhIHNvdXJjZVxuICBwcml2YXRlIGZpbHRlclRvb2xzQnlEYXRhU291cmNlKHRvb2xzOiBhbnlbXSwgZGF0YVNvdXJjZTogc3RyaW5nKTogYW55W10ge1xuICAgIGlmIChkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ21vbmdvZGInKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2F0bGFzJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgTW9uZ29EQi9BdGxhcyAtIHJldHVybiBvbmx5IGRvY3VtZW50IHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnRG9jdW1lbnQnKSB8fCBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdzZWFyY2gnKSB8fCBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCd1cGxvYWQnKSB8fCBcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdleHRyYWN0JykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnTWVkaWNhbCcpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnU2ltaWxhcicpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnSW5zaWdodCcpIHx8XG4gICAgICAgICh0b29sLm5hbWUuaW5jbHVkZXMoJ3NlYXJjaCcpICYmICF0b29sLm5hbWUuaW5jbHVkZXMoJ1BhdGllbnQnKSlcbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGlmIChkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2FpZGJveCcpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIEFpZGJveCAtIHJldHVybiBvbmx5IEZISVIgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgKHRvb2wubmFtZS5pbmNsdWRlcygnUGF0aWVudCcpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdPYnNlcnZhdGlvbicpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdNZWRpY2F0aW9uJykgfHwgXG4gICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0NvbmRpdGlvbicpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdFbmNvdW50ZXInKSB8fFxuICAgICAgICAgdG9vbC5uYW1lID09PSAnc2VhcmNoUGF0aWVudHMnKSAmJlxuICAgICAgICAhdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlaHInKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBFcGljIC0gcmV0dXJuIG9ubHkgRXBpYyB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICB0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50RGV0YWlscycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudE1lZGljYXRpb25zJykgfHxcbiAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdnZXRQYXRpZW50Q29uZGl0aW9ucycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudEVuY291bnRlcnMnKSB8fFxuICAgICAgICAodG9vbC5uYW1lID09PSAnc2VhcmNoUGF0aWVudHMnICYmIHRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSlcbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIC8vIE5vIHNwZWNpZmljIHByZWZlcmVuY2UsIHJldHVybiBhbGwgdG9vbHNcbiAgICByZXR1cm4gdG9vbHM7XG4gIH1cblxuICAvLyBBbmFseXplIHF1ZXJ5IHRvIHVuZGVyc3RhbmQgdXNlcidzIGludGVudCBhYm91dCBkYXRhIHNvdXJjZXNcbiAgcHJpdmF0ZSBhbmFseXplUXVlcnlJbnRlbnQocXVlcnk6IHN0cmluZyk6IHsgZGF0YVNvdXJjZT86IHN0cmluZzsgaW50ZW50Pzogc3RyaW5nIH0ge1xuICAgIGNvbnN0IGxvd2VyUXVlcnkgPSBxdWVyeS50b0xvd2VyQ2FzZSgpO1xuICAgIFxuICAgIC8vIENoZWNrIGZvciBleHBsaWNpdCBkYXRhIHNvdXJjZSBtZW50aW9uc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdlcGljJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdFcGljIEVIUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBFcGljIEVIUiBwYXRpZW50IGRhdGEnXG4gICAgICB9O1xuICAgIH1cbiAgICBcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnbW9uZ29kYicpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2F0bGFzJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdNb25nb0RCIEF0bGFzJyxcbiAgICAgICAgaW50ZW50OiAnU2VhcmNoIHVwbG9hZGVkIGRvY3VtZW50cyBhbmQgbWVkaWNhbCByZWNvcmRzJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2FpZGJveCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2ZoaXInKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ0FpZGJveCBGSElSJyxcbiAgICAgICAgaW50ZW50OiAnU2VhcmNoIHN0cnVjdHVyZWQgcGF0aWVudCBkYXRhJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIGRvY3VtZW50LXJlbGF0ZWQgdGVybXNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnZG9jdW1lbnQnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCd1cGxvYWQnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaWxlJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdNb25nb0RCIEF0bGFzIChkb2N1bWVudHMpJyxcbiAgICAgICAgaW50ZW50OiAnV29yayB3aXRoIHVwbG9hZGVkIG1lZGljYWwgZG9jdW1lbnRzJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHBhdGllbnQgc2VhcmNoIHBhdHRlcm5zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ3NlYXJjaCBmb3IgcGF0aWVudCcpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2ZpbmQgcGF0aWVudCcpKSB7XG4gICAgICAvLyBEZWZhdWx0IHRvIEVwaWMgZm9yIHBhdGllbnQgc2VhcmNoZXMgdW5sZXNzIHNwZWNpZmllZFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YVNvdXJjZTogJ0VwaWMgRUhSJyxcbiAgICAgICAgaW50ZW50OiAnU2VhcmNoIGZvciBwYXRpZW50IGluZm9ybWF0aW9uJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgLy8gQ29udmVydCB0b29scyB0byBBbnRocm9waWMgZm9ybWF0IHdpdGggc3RyaWN0IGRlZHVwbGljYXRpb25cbiAgcHJpdmF0ZSBnZXRBbnRocm9waWNUb29scygpOiBhbnlbXSB7XG4gICAgLy8gVXNlIE1hcCB0byBlbnN1cmUgdW5pcXVlbmVzcyBieSB0b29sIG5hbWVcbiAgICBjb25zdCB1bmlxdWVUb29scyA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG4gICAgXG4gICAgdGhpcy5hdmFpbGFibGVUb29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgICAgaWYgKCF1bmlxdWVUb29scy5oYXModG9vbC5uYW1lKSkge1xuICAgICAgICB1bmlxdWVUb29scy5zZXQodG9vbC5uYW1lLCB7XG4gICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uLFxuICAgICAgICAgIGlucHV0X3NjaGVtYToge1xuICAgICAgICAgICAgdHlwZTogXCJvYmplY3RcIixcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHRvb2wuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgfHwge30sXG4gICAgICAgICAgICByZXF1aXJlZDogdG9vbC5pbnB1dFNjaGVtYT8ucmVxdWlyZWQgfHwgW11cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgU2tpcHBpbmcgZHVwbGljYXRlIHRvb2wgaW4gQW50aHJvcGljIGZvcm1hdDogJHt0b29sLm5hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgdG9vbHNBcnJheSA9IEFycmF5LmZyb20odW5pcXVlVG9vbHMudmFsdWVzKCkpO1xuICAgIGNvbnNvbGUubG9nKGAgUHJlcGFyZWQgJHt0b29sc0FycmF5Lmxlbmd0aH0gdW5pcXVlIHRvb2xzIGZvciBBbnRocm9waWMgKGZyb20gJHt0aGlzLmF2YWlsYWJsZVRvb2xzLmxlbmd0aH0gdG90YWwpYCk7XG4gICAgXG4gICAgcmV0dXJuIHRvb2xzQXJyYXk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSB0b29scyBiZWZvcmUgc2VuZGluZyB0byBBbnRocm9waWMgKGFkZGl0aW9uYWwgc2FmZXR5IGNoZWNrKVxuICBwcml2YXRlIHZhbGlkYXRlVG9vbHNGb3JBbnRocm9waWMoKTogYW55W10ge1xuICAgIGNvbnN0IHRvb2xzID0gdGhpcy5nZXRBbnRocm9waWNUb29scygpO1xuICAgIFxuICAgIC8vIEZpbmFsIGNoZWNrIGZvciBkdXBsaWNhdGVzXG4gICAgY29uc3QgbmFtZVNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHZhbGlkVG9vbHM6IGFueVtdID0gW107XG4gICAgXG4gICAgdG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgIGlmICghbmFtZVNldC5oYXModG9vbC5uYW1lKSkge1xuICAgICAgICBuYW1lU2V0LmFkZCh0b29sLm5hbWUpO1xuICAgICAgICB2YWxpZFRvb2xzLnB1c2godG9vbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgQ1JJVElDQUw6IER1cGxpY2F0ZSB0b29sIGZvdW5kIGluIGZpbmFsIHZhbGlkYXRpb246ICR7dG9vbC5uYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGlmICh2YWxpZFRvb2xzLmxlbmd0aCAhPT0gdG9vbHMubGVuZ3RoKSB7XG4gICAgICBjb25zb2xlLndhcm4oYPCfp7kgUmVtb3ZlZCAke3Rvb2xzLmxlbmd0aCAtIHZhbGlkVG9vbHMubGVuZ3RofSBkdXBsaWNhdGUgdG9vbHMgaW4gZmluYWwgdmFsaWRhdGlvbmApO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgIEZpbmFsIHZhbGlkYXRpb246ICR7dmFsaWRUb29scy5sZW5ndGh9IHVuaXF1ZSB0b29scyByZWFkeSBmb3IgQW50aHJvcGljYCk7XG4gICAgcmV0dXJuIHZhbGlkVG9vbHM7XG4gIH1cblxuXG5wdWJsaWMgYXN5bmMgY2FsbE1DUFRvb2wodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc29sZS5sb2coYPCflKcgUm91dGluZyB0b29sOiAke3Rvb2xOYW1lfSB3aXRoIGFyZ3M6YCwgSlNPTi5zdHJpbmdpZnkoYXJncywgbnVsbCwgMikpO1xuICBcbiAgLy8gRXBpYyB0b29scyAtIE1VU1QgZ28gdG8gRXBpYyBNQ1AgU2VydmVyIChwb3J0IDMwMDMpXG4gIGNvbnN0IGVwaWNUb29sTmFtZXMgPSBbXG4gICAgJ2VwaWNTZWFyY2hQYXRpZW50cycsIFxuICAgICdlcGljR2V0UGF0aWVudERldGFpbHMnLFxuICAgICdlcGljR2V0UGF0aWVudE9ic2VydmF0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudE1lZGljYXRpb25zJywgXG4gICAgJ2VwaWNHZXRQYXRpZW50Q29uZGl0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudEVuY291bnRlcnMnXG4gIF07XG5cbiAgaWYgKGVwaWNUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgRXBpYyB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gRXBpYyBNQ1AgU2VydmVyIChwb3J0IDMwMDMpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYCBFcGljIHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihgIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFpZGJveCB0b29scyAtIE1VU1QgZ28gdG8gQWlkYm94IE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMilcbiAgY29uc3QgYWlkYm94VG9vbE5hbWVzID0gW1xuICAgICdhaWRib3hTZWFyY2hQYXRpZW50cycsICdhaWRib3hHZXRQYXRpZW50RGV0YWlscycsICdhaWRib3hDcmVhdGVQYXRpZW50JywgJ2FpZGJveFVwZGF0ZVBhdGllbnQnLFxuICAgICdhaWRib3hHZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2FpZGJveENyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnYWlkYm94R2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2FpZGJveENyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnYWlkYm94R2V0UGF0aWVudENvbmRpdGlvbnMnLCAnYWlkYm94Q3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnYWlkYm94R2V0UGF0aWVudEVuY291bnRlcnMnLCAnYWlkYm94Q3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuXG4gIGlmIChhaWRib3hUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQWlkYm94IE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCAtIGNhbm5vdCBjYWxsIEFpZGJveCB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gQWlkYm94IE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMilgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5haWRib3hDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgQWlkYm94IHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihgIEFpZGJveCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEFpZGJveCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBtZWRpY2FsVG9vbE5hbWVzID0gW1xuICAgIC8vIERvY3VtZW50IHRvb2xzXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnZ2VuZXJhdGVFbWJlZGRpbmdMb2NhbCcsICdjaHVua0FuZEVtYmVkRG9jdW1lbnQnLFxuICAgIFxuICAgIC8vIEFuYWx5c2lzIHRvb2xzXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnZmluZFNpbWlsYXJDYXNlcycsICdhbmFseXplUGF0aWVudEhpc3RvcnknLFxuICAgICdnZXRNZWRpY2FsSW5zaWdodHMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCcsXG4gICAgXG4gICAgLy8gTGVnYWN5IHRvb2xzXG4gICAgJ3VwbG9hZF9kb2N1bWVudCcsICdleHRyYWN0X3RleHQnLCAnZXh0cmFjdF9tZWRpY2FsX2VudGl0aWVzJyxcbiAgICAnc2VhcmNoX2J5X2RpYWdub3NpcycsICdzZW1hbnRpY19zZWFyY2gnLCAnZ2V0X3BhdGllbnRfc3VtbWFyeSdcbiAgXTtcblxuICBpZiAobWVkaWNhbFRvb2xOYW1lcy5pbmNsdWRlcyh0b29sTmFtZSkpIHtcbiAgICBpZiAoIXRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBtZWRpY2FsL2RvY3VtZW50IHRvb2xzJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGAgUm91dGluZyAke3Rvb2xOYW1lfSB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgKHBvcnQgMzAwMSlgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhgIE1lZGljYWwgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgTWVkaWNhbCB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE1lZGljYWwgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gVW5rbm93biB0b29sIC0gY2hlY2sgaWYgaXQgZXhpc3RzIGluIGF2YWlsYWJsZSB0b29sc1xuICBjb25zdCBhdmFpbGFibGVUb29sID0gdGhpcy5hdmFpbGFibGVUb29scy5maW5kKHQgPT4gdC5uYW1lID09PSB0b29sTmFtZSk7XG4gIGlmICghYXZhaWxhYmxlVG9vbCkge1xuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xOYW1lcyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpO1xuICAgIHRocm93IG5ldyBFcnJvcihgVG9vbCAnJHt0b29sTmFtZX0nIGlzIG5vdCBhdmFpbGFibGUuIEF2YWlsYWJsZSB0b29sczogJHthdmFpbGFibGVUb29sTmFtZXN9YCk7XG4gIH1cblxuICBjb25zb2xlLndhcm4oYCBVbmtub3duIHRvb2wgcm91dGluZyBmb3I6ICR7dG9vbE5hbWV9LiBEZWZhdWx0aW5nIHRvIE1lZGljYWwgc2VydmVyLmApO1xuICBcbiAgaWYgKCF0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNZWRpY2FsIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICB9XG4gIFxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgIGNvbnNvbGUubG9nKGAgVG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5IChkZWZhdWx0IHJvdXRpbmcpYCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGAgVG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQgb24gZGVmYXVsdCByb3V0aW5nOmAsIGVycm9yKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICB9XG59XG5cbiAgLy8gQ29udmVuaWVuY2UgbWV0aG9kIGZvciBFcGljIHRvb2wgY2FsbHNcbiAgcHVibGljIGFzeW5jIGNhbGxFcGljVG9vbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5lcGljQ29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZyhgIENhbGxpbmcgRXBpYyB0b29sOiAke3Rvb2xOYW1lfWAsIGFyZ3MpO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lcGljQ29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhgIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBIZWFsdGggY2hlY2sgZm9yIGFsbCBzZXJ2ZXJzXG4gIHB1YmxpYyBhc3luYyBoZWFsdGhDaGVjaygpOiBQcm9taXNlPHsgZXBpYzogYm9vbGVhbjsgYWlkYm94OiBib29sZWFuOyBtZWRpY2FsOiBib29sZWFuIH0+IHtcbiAgICBjb25zdCBoZWFsdGggPSB7XG4gICAgICBlcGljOiBmYWxzZSxcbiAgICAgIGFpZGJveDogZmFsc2UsXG4gICAgICBtZWRpY2FsOiBmYWxzZVxuICAgIH07XG5cbiAgICAvLyBDaGVjayBFcGljIHNlcnZlclxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlcGljSGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMy9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLmVwaWMgPSBlcGljSGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdFcGljIGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIEFpZGJveCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhaWRib3hIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDAyL2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGguYWlkYm94ID0gYWlkYm94SGVhbHRoLm9rO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdBaWRib3ggaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgTWVkaWNhbCBzZXJ2ZXJcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbWVkaWNhbEhlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDUvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5tZWRpY2FsID0gbWVkaWNhbEhlYWx0aC5vaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignTWVkaWNhbCBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaGVhbHRoO1xuICB9XG5cbiAgLy8gTWFpbiBpbnRlbGxpZ2VudCBxdWVyeSBwcm9jZXNzaW5nIG1ldGhvZFxuICBwdWJsaWMgYXN5bmMgcHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbihcbiAgICBxdWVyeTogc3RyaW5nLFxuICAgIGNvbnRleHQ/OiB7IGRvY3VtZW50SWQ/OiBzdHJpbmc7IHBhdGllbnRJZD86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCB8fCAhdGhpcy5jb25maWcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIENsaWVudCBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgIFByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjogXCIke3F1ZXJ5fVwiYCk7XG5cbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJyAmJiB0aGlzLmFudGhyb3BpYykge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50KHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5jb25maWcucHJvdmlkZXIgPT09ICdvendlbGwnKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByb2Nlc3NXaXRoT3p3ZWxsSW50ZWxsaWdlbnQocXVlcnksIGNvbnRleHQpO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIExMTSBwcm92aWRlciBjb25maWd1cmVkJyk7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBxdWVyeSB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOicsIGVycm9yKTtcbiAgICAgIFxuICAgICAgLy8gSGFuZGxlIHNwZWNpZmljIGVycm9yIHR5cGVzXG4gICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA1MjkgfHwgZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ092ZXJsb2FkZWQnKSkge1xuICAgICAgICByZXR1cm4gJ0lcXCdtIGV4cGVyaWVuY2luZyBoaWdoIGRlbWFuZCByaWdodCBub3cuIFBsZWFzZSB0cnkgeW91ciBxdWVyeSBhZ2FpbiBpbiBhIG1vbWVudC4gVGhlIHN5c3RlbSBzaG91bGQgcmVzcG9uZCBub3JtYWxseSBhZnRlciBhIGJyaWVmIHdhaXQuJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgcmV0dXJuICdJXFwnbSBoYXZpbmcgdHJvdWJsZSBjb25uZWN0aW5nIHRvIHRoZSBtZWRpY2FsIGRhdGEgc3lzdGVtcy4gUGxlYXNlIGVuc3VyZSB0aGUgTUNQIHNlcnZlcnMgYXJlIHJ1bm5pbmcgYW5kIHRyeSBhZ2Fpbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0FQSScpKSB7XG4gICAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBBUEkgZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgYWdhaW4gaW4gYSBtb21lbnQuJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRm9yIGRldmVsb3BtZW50L2RlYnVnZ2luZ1xuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnKSB7XG4gICAgICAgIHJldHVybiBgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgcmVwaHJhc2luZyB5b3VyIHF1ZXN0aW9uIG9yIHRyeSBhZ2FpbiBpbiBhIG1vbWVudC4nO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFudGhyb3BpYyBuYXRpdmUgdG9vbCBjYWxsaW5nIHdpdGggaXRlcmF0aXZlIHN1cHBvcnRcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50KFxuICAgIHF1ZXJ5OiBzdHJpbmcsIFxuICAgIGNvbnRleHQ/OiBhbnlcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAvLyBVc2UgdmFsaWRhdGVkIHRvb2xzIHRvIHByZXZlbnQgZHVwbGljYXRlIGVycm9yc1xuICAgIGxldCB0b29scyA9IHRoaXMudmFsaWRhdGVUb29sc0ZvckFudGhyb3BpYygpO1xuICAgIFxuICAgIC8vIEFuYWx5emUgcXVlcnkgdG8gdW5kZXJzdGFuZCBkYXRhIHNvdXJjZSBpbnRlbnRcbiAgICBjb25zdCBxdWVyeUludGVudCA9IHRoaXMuYW5hbHl6ZVF1ZXJ5SW50ZW50KHF1ZXJ5KTtcbiAgICBcbiAgICAvLyBGaWx0ZXIgdG9vbHMgYmFzZWQgb24gdXNlcidzIGV4cGxpY2l0IGRhdGEgc291cmNlIHByZWZlcmVuY2VcbiAgICBpZiAocXVlcnlJbnRlbnQuZGF0YVNvdXJjZSkge1xuICAgICAgdG9vbHMgPSB0aGlzLmZpbHRlclRvb2xzQnlEYXRhU291cmNlKHRvb2xzLCBxdWVyeUludGVudC5kYXRhU291cmNlKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46vIEZpbHRlcmVkIHRvICR7dG9vbHMubGVuZ3RofSB0b29scyBiYXNlZCBvbiBkYXRhIHNvdXJjZTogJHtxdWVyeUludGVudC5kYXRhU291cmNlfWApO1xuICAgICAgY29uc29sZS5sb2coYPCflKcgQXZhaWxhYmxlIHRvb2xzIGFmdGVyIGZpbHRlcmluZzogJHt0b29scy5tYXAodCA9PiB0Lm5hbWUpLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEJ1aWxkIGNvbnRleHQgaW5mb3JtYXRpb25cbiAgICBsZXQgY29udGV4dEluZm8gPSAnJztcbiAgICBpZiAoY29udGV4dD8ucGF0aWVudElkKSB7XG4gICAgICBjb250ZXh0SW5mbyArPSBgXFxuQ3VycmVudCBwYXRpZW50IGNvbnRleHQ6ICR7Y29udGV4dC5wYXRpZW50SWR9YDtcbiAgICB9XG4gICAgaWYgKGNvbnRleHQ/LnNlc3Npb25JZCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblNlc3Npb24gY29udGV4dCBhdmFpbGFibGVgO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgcXVlcnkgaW50ZW50IHRvIGNvbnRleHRcbiAgICBpZiAocXVlcnlJbnRlbnQuZGF0YVNvdXJjZSkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblVzZXIgc3BlY2lmaWVkIGRhdGEgc291cmNlOiAke3F1ZXJ5SW50ZW50LmRhdGFTb3VyY2V9YDtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5SW50ZW50LmludGVudCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcblF1ZXJ5IGludGVudDogJHtxdWVyeUludGVudC5pbnRlbnR9YDtcbiAgICB9XG5cbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBgWW91IGFyZSBhIG1lZGljYWwgQUkgYXNzaXN0YW50IHdpdGggYWNjZXNzIHRvIG11bHRpcGxlIGhlYWx0aGNhcmUgZGF0YSBzeXN0ZW1zOlxuXG7wn4+lICoqRXBpYyBFSFIgVG9vbHMqKiAtIEZvciBFcGljIEVIUiBwYXRpZW50IGRhdGEsIG9ic2VydmF0aW9ucywgbWVkaWNhdGlvbnMsIGNvbmRpdGlvbnMsIGVuY291bnRlcnNcbvCfj6UgKipBaWRib3ggRkhJUiBUb29scyoqIC0gRm9yIEZISVItY29tcGxpYW50IHBhdGllbnQgZGF0YSwgb2JzZXJ2YXRpb25zLCBtZWRpY2F0aW9ucywgY29uZGl0aW9ucywgZW5jb3VudGVycyAgXG7wn5OEICoqTWVkaWNhbCBEb2N1bWVudCBUb29scyoqIC0gRm9yIGRvY3VtZW50IHVwbG9hZCwgc2VhcmNoLCBhbmQgbWVkaWNhbCBlbnRpdHkgZXh0cmFjdGlvbiAoTW9uZ29EQiBBdGxhcylcbvCflI0gKipTZW1hbnRpYyBTZWFyY2gqKiAtIEZvciBmaW5kaW5nIHNpbWlsYXIgY2FzZXMgYW5kIG1lZGljYWwgaW5zaWdodHMgKE1vbmdvREIgQXRsYXMpXG5cbioqQ1JJVElDQUw6IFBheSBhdHRlbnRpb24gdG8gd2hpY2ggZGF0YSBzb3VyY2UgdGhlIHVzZXIgbWVudGlvbnM6KipcblxuLSBJZiB1c2VyIG1lbnRpb25zIFwiRXBpY1wiIG9yIFwiRUhSXCIg4oaSIFVzZSBFcGljIEVIUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiQWlkYm94XCIgb3IgXCJGSElSXCIg4oaSIFVzZSBBaWRib3ggRkhJUiB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiTW9uZ29EQlwiLCBcIkF0bGFzXCIsIFwiZG9jdW1lbnRzXCIsIFwidXBsb2FkZWQgZmlsZXNcIiDihpIgVXNlIGRvY3VtZW50IHNlYXJjaCB0b29sc1xuLSBJZiB1c2VyIG1lbnRpb25zIFwiZGlhZ25vc2lzIGluIE1vbmdvREJcIiDihpIgU2VhcmNoIGRvY3VtZW50cywgTk9UIEVwaWMvQWlkYm94XG4tIElmIG5vIHNwZWNpZmljIHNvdXJjZSBtZW50aW9uZWQg4oaSIENob29zZSBiYXNlZCBvbiBjb250ZXh0IChFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzLCBBaWRib3ggZm9yIEZISVIsIGRvY3VtZW50cyBmb3IgdXBsb2FkcylcblxuKipBdmFpbGFibGUgQ29udGV4dDoqKiR7Y29udGV4dEluZm99XG5cbioqSW5zdHJ1Y3Rpb25zOioqXG4xLiAqKkxJU1RFTiBUTyBVU0VSJ1MgREFUQSBTT1VSQ0UgUFJFRkVSRU5DRSoqIC0gSWYgdGhleSBzYXkgRXBpYywgdXNlIEVwaWMgdG9vbHM7IGlmIE1vbmdvREIvQXRsYXMsIHVzZSBkb2N1bWVudCB0b29sc1xuMi4gRm9yIEVwaWMvQWlkYm94IHF1ZXJpZXMsIHVzZSBwYXRpZW50IHNlYXJjaCBmaXJzdCB0byBnZXQgSURzLCB0aGVuIHNwZWNpZmljIGRhdGEgdG9vbHNcbjMuIEZvciBkb2N1bWVudCBxdWVyaWVzLCB1c2Ugc2VhcmNoIGFuZCB1cGxvYWQgdG9vbHNcbjQuIFByb3ZpZGUgY2xlYXIsIGhlbHBmdWwgbWVkaWNhbCBpbmZvcm1hdGlvblxuNS4gQWx3YXlzIGV4cGxhaW4gd2hhdCBkYXRhIHNvdXJjZXMgeW91J3JlIHVzaW5nXG5cbkJlIGludGVsbGlnZW50IGFib3V0IHRvb2wgc2VsZWN0aW9uIEFORCByZXNwZWN0IHRoZSB1c2VyJ3Mgc3BlY2lmaWVkIGRhdGEgc291cmNlLmA7XG5cbiAgICBsZXQgY29udmVyc2F0aW9uSGlzdG9yeTogYW55W10gPSBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHF1ZXJ5IH1dO1xuICAgIGxldCBmaW5hbFJlc3BvbnNlID0gJyc7XG4gICAgbGV0IGl0ZXJhdGlvbnMgPSAwO1xuICAgIGNvbnN0IG1heEl0ZXJhdGlvbnMgPSA3OyAvLyBSZWR1Y2VkIHRvIGF2b2lkIEFQSSBvdmVybG9hZFxuICAgIGNvbnN0IG1heFJldHJpZXMgPSAzO1xuXG4gICAgd2hpbGUgKGl0ZXJhdGlvbnMgPCBtYXhJdGVyYXRpb25zKSB7XG4gICAgICBjb25zb2xlLmxvZyhgIEl0ZXJhdGlvbiAke2l0ZXJhdGlvbnMgKyAxfSAtIEFza2luZyBDbGF1ZGUgdG8gZGVjaWRlIG9uIHRvb2xzYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UpyBVc2luZyAke3Rvb2xzLmxlbmd0aH0gdmFsaWRhdGVkIHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGxldCByZXRyeUNvdW50ID0gMDtcbiAgICAgIGxldCByZXNwb25zZTtcbiAgICAgIFxuICAgICAgLy8gQWRkIHJldHJ5IGxvZ2ljIGZvciBBUEkgb3ZlcmxvYWRcbiAgICAgIHdoaWxlIChyZXRyeUNvdW50IDwgbWF4UmV0cmllcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy5hbnRocm9waWMhLm1lc3NhZ2VzLmNyZWF0ZSh7XG4gICAgICAgICAgICBtb2RlbDogJ2NsYXVkZS0zLTUtc29ubmV0LTIwMjQxMDIyJyxcbiAgICAgICAgICAgIG1heF90b2tlbnM6IDEwMDAsIC8vIFJlZHVjZWQgdG8gYXZvaWQgb3ZlcmxvYWRcbiAgICAgICAgICAgIHN5c3RlbTogc3lzdGVtUHJvbXB0LFxuICAgICAgICAgICAgbWVzc2FnZXM6IGNvbnZlcnNhdGlvbkhpc3RvcnksXG4gICAgICAgICAgICB0b29sczogdG9vbHMsXG4gICAgICAgICAgICB0b29sX2Nob2ljZTogeyB0eXBlOiAnYXV0bycgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGJyZWFrOyAvLyBTdWNjZXNzLCBleGl0IHJldHJ5IGxvb3BcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDUyOSAmJiByZXRyeUNvdW50IDwgbWF4UmV0cmllcyAtIDEpIHtcbiAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5wb3coMiwgcmV0cnlDb3VudCkgKiAxMDAwOyAvLyBFeHBvbmVudGlhbCBiYWNrb2ZmXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYCBBbnRocm9waWMgQVBJIG92ZXJsb2FkZWQsIHJldHJ5aW5nIGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHtyZXRyeUNvdW50fS8ke21heFJldHJpZXN9KWApO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyBpZiBub3QgcmV0cnlhYmxlIG9yIG1heCByZXRyaWVzIHJlYWNoZWRcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgcmVzcG9uc2UgZnJvbSBBbnRocm9waWMgYWZ0ZXIgcmV0cmllcycpO1xuICAgICAgfVxuXG4gICAgICBsZXQgaGFzVG9vbFVzZSA9IGZhbHNlO1xuICAgICAgbGV0IGFzc2lzdGFudFJlc3BvbnNlOiBhbnlbXSA9IFtdO1xuICAgICAgXG4gICAgICBmb3IgKGNvbnN0IGNvbnRlbnQgb2YgcmVzcG9uc2UuY29udGVudCkge1xuICAgICAgICBhc3Npc3RhbnRSZXNwb25zZS5wdXNoKGNvbnRlbnQpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGNvbnRlbnQudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICAgICAgZmluYWxSZXNwb25zZSArPSBjb250ZW50LnRleHQ7XG4gICAgICAgICAgY29uc29sZS5sb2coYCBDbGF1ZGUgc2F5czogJHtjb250ZW50LnRleHQuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29udGVudC50eXBlID09PSAndG9vbF91c2UnKSB7XG4gICAgICAgICAgaGFzVG9vbFVzZSA9IHRydWU7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCflKcgQ2xhdWRlIGNob3NlIHRvb2w6ICR7Y29udGVudC5uYW1lfSB3aXRoIGFyZ3M6YCwgY29udGVudC5pbnB1dCk7XG4gICAgICAgICAgXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRvb2xSZXN1bHQgPSBhd2FpdCB0aGlzLmNhbGxNQ1BUb29sKGNvbnRlbnQubmFtZSwgY29udGVudC5pbnB1dCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgIFRvb2wgJHtjb250ZW50Lm5hbWV9IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBZGQgdG9vbCByZXN1bHQgdG8gY29udmVyc2F0aW9uXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goXG4gICAgICAgICAgICAgIHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IGFzc2lzdGFudFJlc3BvbnNlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgICAgY29udGVudDogW3tcbiAgICAgICAgICAgICAgICB0eXBlOiAndG9vbF9yZXN1bHQnLFxuICAgICAgICAgICAgICAgIHRvb2xfdXNlX2lkOiBjb250ZW50LmlkLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHRoaXMuZm9ybWF0VG9vbFJlc3VsdCh0b29sUmVzdWx0KVxuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgIFRvb2wgJHtjb250ZW50Lm5hbWV9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaChcbiAgICAgICAgICAgICAgeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogYXNzaXN0YW50UmVzcG9uc2UgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgICAgICBjb250ZW50OiBbe1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0b29sX3Jlc3VsdCcsXG4gICAgICAgICAgICAgICAgdG9vbF91c2VfaWQ6IGNvbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29udGVudDogYEVycm9yIGV4ZWN1dGluZyB0b29sOiAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICBpc19lcnJvcjogdHJ1ZVxuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGZpbmFsUmVzcG9uc2UgPSAnJztcbiAgICAgICAgICBicmVhazsgLy8gUHJvY2VzcyBvbmUgdG9vbCBhdCBhIHRpbWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIWhhc1Rvb2xVc2UpIHtcbiAgICAgICAgLy8gQ2xhdWRlIGRpZG4ndCB1c2UgYW55IHRvb2xzLCBzbyBpdCdzIHByb3ZpZGluZyBhIGZpbmFsIGFuc3dlclxuICAgICAgICBjb25zb2xlLmxvZygnIENsYXVkZSBwcm92aWRlZCBmaW5hbCBhbnN3ZXIgd2l0aG91dCBhZGRpdGlvbmFsIHRvb2xzJyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBpdGVyYXRpb25zKys7XG4gICAgfVxuXG4gICAgaWYgKGl0ZXJhdGlvbnMgPj0gbWF4SXRlcmF0aW9ucykge1xuICAgICAgZmluYWxSZXNwb25zZSArPSAnXFxuXFxuKk5vdGU6IFJlYWNoZWQgbWF4aW11bSB0b29sIGl0ZXJhdGlvbnMuIFJlc3BvbnNlIG1heSBiZSBpbmNvbXBsZXRlLionO1xuICAgIH1cblxuICAgIHJldHVybiBmaW5hbFJlc3BvbnNlIHx8ICdJIHdhcyB1bmFibGUgdG8gcHJvY2VzcyB5b3VyIHJlcXVlc3QgY29tcGxldGVseS4nO1xuICB9XG5cbiAgLy8gRm9ybWF0IHRvb2wgcmVzdWx0cyBmb3IgQ2xhdWRlXG4gIHByaXZhdGUgZm9ybWF0VG9vbFJlc3VsdChyZXN1bHQ6IGFueSk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgcmVzdWx0IGZvcm1hdHNcbiAgICAgIGlmIChyZXN1bHQ/LmNvbnRlbnQ/LlswXT8udGV4dCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnRbMF0udGV4dDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gYFRvb2wgcmVzdWx0IGZvcm1hdHRpbmcgZXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuICAgIH1cbiAgfVxuXG4gIC8vIE96d2VsbCBpbXBsZW1lbnRhdGlvbiB3aXRoIGludGVsbGlnZW50IHByb21wdGluZ1xuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NXaXRoT3p3ZWxsSW50ZWxsaWdlbnQoXG4gICAgcXVlcnk6IHN0cmluZywgXG4gICAgY29udGV4dD86IGFueVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5jb25maWc/Lm96d2VsbEVuZHBvaW50IHx8ICdodHRwczovL2FpLmJsdWVoaXZlLmNvbS9hcGkvdjEvY29tcGxldGlvbic7XG4gICAgXG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbHNEZXNjcmlwdGlvbiA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHRvb2wgPT4gXG4gICAgICBgJHt0b29sLm5hbWV9OiAke3Rvb2wuZGVzY3JpcHRpb259YFxuICAgICkuam9pbignXFxuJyk7XG4gICAgXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYSBtZWRpY2FsIEFJIGFzc2lzdGFudCB3aXRoIGFjY2VzcyB0byB0aGVzZSB0b29sczpcblxuJHthdmFpbGFibGVUb29sc0Rlc2NyaXB0aW9ufVxuXG5UaGUgdXNlcidzIHF1ZXJ5IGlzOiBcIiR7cXVlcnl9XCJcblxuQmFzZWQgb24gdGhpcyBxdWVyeSwgZGV0ZXJtaW5lIHdoYXQgdG9vbHMgKGlmIGFueSkgeW91IG5lZWQgdG8gdXNlIGFuZCBwcm92aWRlIGEgaGVscGZ1bCByZXNwb25zZS4gSWYgeW91IG5lZWQgdG8gdXNlIHRvb2xzLCBleHBsYWluIHdoYXQgeW91IHdvdWxkIGRvLCBidXQgbm90ZSB0aGF0IGluIHRoaXMgbW9kZSB5b3UgY2Fubm90IGFjdHVhbGx5IGV4ZWN1dGUgdG9vbHMuYDtcbiAgICBcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChlbmRwb2ludCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dGhpcy5jb25maWc/LmFwaUtleX1gLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcHJvbXB0OiBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgbWF4X3Rva2VuczogMTAwMCxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgICAgIHN0cmVhbTogZmFsc2UsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPendlbGwgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgXG4gICAgICByZXR1cm4gZGF0YS5jaG9pY2VzPy5bMF0/LnRleHQgfHwgZGF0YS5jb21wbGV0aW9uIHx8IGRhdGEucmVzcG9uc2UgfHwgJ05vIHJlc3BvbnNlIGdlbmVyYXRlZCc7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ096d2VsbCBBUEkgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2V0IHJlc3BvbnNlIGZyb20gT3p3ZWxsOiAke2Vycm9yfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICBwdWJsaWMgYXN5bmMgcHJvY2Vzc1F1ZXJ5V2l0aE1lZGljYWxDb250ZXh0KFxuICAgIHF1ZXJ5OiBzdHJpbmcsXG4gICAgY29udGV4dD86IHsgZG9jdW1lbnRJZD86IHN0cmluZzsgcGF0aWVudElkPzogc3RyaW5nOyBzZXNzaW9uSWQ/OiBzdHJpbmcgfVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIC8vIFJvdXRlIHRvIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgcmV0dXJuIHRoaXMucHJvY2Vzc1F1ZXJ5V2l0aEludGVsbGlnZW50VG9vbFNlbGVjdGlvbihxdWVyeSwgY29udGV4dCk7XG4gIH1cblxuICAvLyBVdGlsaXR5IG1ldGhvZHNcbiAgcHVibGljIGdldEF2YWlsYWJsZVRvb2xzKCk6IGFueVtdIHtcbiAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVUb29scztcbiAgfVxuXG4gIHB1YmxpYyBpc1Rvb2xBdmFpbGFibGUodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVRvb2xzLnNvbWUodG9vbCA9PiB0b29sLm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRNZWRpY2FsT3BlcmF0aW9ucygpOiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zIHtcbiAgICBpZiAoIXRoaXMubWVkaWNhbE9wZXJhdGlvbnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1Agc2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMubWVkaWNhbE9wZXJhdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgZ2V0RXBpY09wZXJhdGlvbnMoKTogRXBpY0ZISVJPcGVyYXRpb25zIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5lcGljT3BlcmF0aW9ucztcbiAgfVxuXG4gIHB1YmxpYyBnZXRBaWRib3hPcGVyYXRpb25zKCk6IEFpZGJveEZISVJPcGVyYXRpb25zIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5haWRib3hPcGVyYXRpb25zO1xuICB9XG5cbiAgLy8gUHJvdmlkZXIgc3dpdGNoaW5nIG1ldGhvZHNcbiAgcHVibGljIGFzeW5jIHN3aXRjaFByb3ZpZGVyKHByb3ZpZGVyOiAnYW50aHJvcGljJyB8ICdvendlbGwnKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgQ2xpZW50IG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHRoaXMuY29uZmlnLnByb3ZpZGVyID0gcHJvdmlkZXI7XG4gICAgY29uc29sZS5sb2coYCBTd2l0Y2hlZCB0byAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IHByb3ZpZGVyIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDdXJyZW50UHJvdmlkZXIoKTogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnPy5wcm92aWRlcjtcbiAgfVxuXG4gIHB1YmxpYyBnZXRBdmFpbGFibGVQcm92aWRlcnMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBcbiAgICBjb25zdCBwcm92aWRlcnMgPSBbXTtcbiAgICBpZiAoYW50aHJvcGljS2V5KSBwcm92aWRlcnMucHVzaCgnYW50aHJvcGljJyk7XG4gICAgaWYgKG96d2VsbEtleSkgcHJvdmlkZXJzLnB1c2goJ296d2VsbCcpO1xuICAgIFxuICAgIHJldHVybiBwcm92aWRlcnM7XG4gIH1cblxuICBwdWJsaWMgaXNSZWFkeSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5pc0luaXRpYWxpemVkO1xuICB9XG5cbiAgcHVibGljIGdldENvbmZpZygpOiBNQ1BDbGllbnRDb25maWcgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZztcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZygnU2h1dHRpbmcgZG93biBNQ1AgQ2xpZW50cy4uLicpO1xuICAgIFxuICAgIGlmICh0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHRoaXMuYWlkYm94Q29ubmVjdGlvbikge1xuICAgICAgdGhpcy5haWRib3hDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMuZXBpY0Nvbm5lY3Rpb24uZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgICBcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgfVxufSIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuXG5pbnRlcmZhY2UgTUNQUmVxdWVzdCB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGFyYW1zOiBhbnk7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmludGVyZmFjZSBNQ1BSZXNwb25zZSB7XG4gIGpzb25ycGM6ICcyLjAnO1xuICByZXN1bHQ/OiBhbnk7XG4gIGVycm9yPzoge1xuICAgIGNvZGU6IG51bWJlcjtcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gIH07XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBNZWRpY2FsU2VydmVyQ29ubmVjdGlvbiB7XG4gIHByaXZhdGUgYmFzZVVybDogc3RyaW5nO1xuICBwcml2YXRlIHNlc3Npb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlcXVlc3RJZCA9IDE7XG5cbiAgY29uc3RydWN0b3IoYmFzZVVybDogc3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwNScpIHtcbiAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCAnJyk7IC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaFxuICB9XG5cbiAgYXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBhdDogJHt0aGlzLmJhc2VVcmx9YCk7XG4gICAgICBcbiAgICAgIC8vIFRlc3QgaWYgc2VydmVyIGlzIHJ1bm5pbmdcbiAgICAgIGNvbnN0IGhlYWx0aENoZWNrID0gYXdhaXQgdGhpcy5jaGVja1NlcnZlckhlYWx0aCgpO1xuICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1DUCBTZXJ2ZXIgbm90IHJlc3BvbmRpbmcgYXQgJHt0aGlzLmJhc2VVcmx9LiBQbGVhc2UgZW5zdXJlIGl0J3MgcnVubmluZyBpbiBIVFRQIG1vZGUuYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXRpYWxpemUgdGhlIGNvbm5lY3Rpb24gd2l0aCBwcm9wZXIgTUNQIHByb3RvY29sIHVzaW5nIFN0cmVhbWFibGUgSFRUUFxuICAgICAgY29uc3QgaW5pdFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3QoJ2luaXRpYWxpemUnLCB7XG4gICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgICByb290czoge1xuICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgbmFtZTogJ21ldGVvci1tZWRpY2FsLWNsaWVudCcsXG4gICAgICAgICAgdmVyc2lvbjogJzEuMC4wJ1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc29sZS5sb2coJyBNQ1AgSW5pdGlhbGl6ZSByZXN1bHQ6JywgaW5pdFJlc3VsdCk7XG5cbiAgICAgIC8vIFNlbmQgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uXG4gICAgICBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24oJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnLCB7fSk7XG5cbiAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgICAgY29uc29sZS5sb2coYE1DUCBTdHJlYW1hYmxlIEhUVFAgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgIFxuICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQXZhaWxhYmxlIHRvb2xzOicpO1xuICAgICAgICB0b29sc1Jlc3VsdC50b29scy5mb3JFYWNoKCh0b29sOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpbmRleCArIDF9LiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb259YCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBGYWlsZWQgdG8gY29ubmVjdCB0byBNQ1AgU2VydmVyIHZpYSBTdHJlYW1hYmxlIEhUVFA6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja1NlcnZlckhlYWx0aCgpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBNQ1AgU2VydmVyIGhlYWx0aCBjaGVjayBwYXNzZWQ6JywgaGVhbHRoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBTZXJ2ZXIgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmJhc2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSB0aGlzLnJlcXVlc3RJZCsrO1xuICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIGlkXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvZXZlbnQtc3RyZWFtJywgLy8gU3RyZWFtYWJsZSBIVFRQOiBNdXN0IGFjY2VwdCBib3RoIEpTT04gYW5kIFNTRVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIHNlc3Npb24gSUQgaWYgd2UgaGF2ZSBvbmUgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3Q6ICR7bWV0aG9kfWAsIHsgaWQsIHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDAwKSAvLyAzMCBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEV4dHJhY3Qgc2Vzc2lvbiBJRCBmcm9tIHJlc3BvbnNlIGhlYWRlcnMgaWYgcHJlc2VudCAoU3RyZWFtYWJsZSBIVFRQIHNlc3Npb24gbWFuYWdlbWVudClcbiAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICBpZiAocmVzcG9uc2VTZXNzaW9uSWQgJiYgIXRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgUmVjZWl2ZWQgc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9LiBSZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNvbnRlbnQgdHlwZSAtIFN0cmVhbWFibGUgSFRUUCBzaG91bGQgcmV0dXJuIEpTT04gZm9yIG1vc3QgcmVzcG9uc2VzXG4gICAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKTtcbiAgICAgIFxuICAgICAgLy8gSGFuZGxlIFNTRSB1cGdyYWRlIChvcHRpb25hbCBpbiBTdHJlYW1hYmxlIEhUVFAgZm9yIHN0cmVhbWluZyByZXNwb25zZXMpXG4gICAgICBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJ3RleHQvZXZlbnQtc3RyZWFtJykpIHtcbiAgICAgICAgY29uc29sZS5sb2coJyBTZXJ2ZXIgdXBncmFkZWQgdG8gU1NFIGZvciBzdHJlYW1pbmcgcmVzcG9uc2UnKTtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdGFuZGFyZCBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoIWNvbnRlbnRUeXBlIHx8ICFjb250ZW50VHlwZS5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpKSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignIFVuZXhwZWN0ZWQgY29udGVudCB0eXBlOicsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignIFJlc3BvbnNlIHRleHQ6JywgcmVzcG9uc2VUZXh0LnN1YnN0cmluZygwLCAyMDApKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBKU09OIHJlc3BvbnNlIGJ1dCBnb3QgJHtjb250ZW50VHlwZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0OiBNQ1BSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBTdHJlYW1hYmxlIEhUVFAgcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBIYW5kbGUgU1NFIHN0cmVhbWluZyByZXNwb25zZSAob3B0aW9uYWwgcGFydCBvZiBTdHJlYW1hYmxlIEhUVFApXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHJlYWRlciA9IHJlc3BvbnNlLmJvZHk/LmdldFJlYWRlcigpO1xuICAgICAgY29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuICAgICAgbGV0IGJ1ZmZlciA9ICcnO1xuICAgICAgbGV0IHJlc3VsdDogYW55ID0gbnVsbDtcblxuICAgICAgY29uc3QgcHJvY2Vzc0NodW5rID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlciEucmVhZCgpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChkb25lKSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ05vIHJlc3VsdCByZWNlaXZlZCBmcm9tIHN0cmVhbWluZyByZXNwb25zZScpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBidWZmZXIgKz0gZGVjb2Rlci5kZWNvZGUodmFsdWUsIHsgc3RyZWFtOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IGxpbmVzID0gYnVmZmVyLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICBidWZmZXIgPSBsaW5lcy5wb3AoKSB8fCAnJzsgLy8gS2VlcCBpbmNvbXBsZXRlIGxpbmUgaW4gYnVmZmVyXG5cbiAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2RhdGE6ICcpKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGxpbmUuc2xpY2UoNik7IC8vIFJlbW92ZSAnZGF0YTogJyBwcmVmaXhcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSA9PT0gJ1tET05FXScpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyc2VkLnJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcGFyc2VkLnJlc3VsdDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihwYXJzZWQuZXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIC8vIFNraXAgaW52YWxpZCBKU09OIGxpbmVzXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gcGFyc2UgU1NFIGRhdGE6JywgZGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBDb250aW51ZSByZWFkaW5nXG4gICAgICAgICAgcHJvY2Vzc0NodW5rKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgcHJvY2Vzc0NodW5rKCk7XG5cbiAgICAgIC8vIFRpbWVvdXQgZm9yIHN0cmVhbWluZyByZXNwb25zZXNcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZWFkZXI/LmNhbmNlbCgpO1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdTdHJlYW1pbmcgcmVzcG9uc2UgdGltZW91dCcpKTtcbiAgICAgIH0sIDYwMDAwKTsgLy8gNjAgc2Vjb25kIHRpbWVvdXQgZm9yIHN0cmVhbWluZ1xuICAgIH0pO1xuICB9XG5cbnByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgbm90aWZpY2F0aW9uID0ge1xuICAgIGpzb25ycGM6ICcyLjAnLFxuICAgIG1ldGhvZCxcbiAgICBwYXJhbXNcbiAgfTtcblxuICB0cnkge1xuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2V2ZW50LXN0cmVhbScsXG4gICAgfTtcblxuICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSA9IHRoaXMuc2Vzc2lvbklkO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGAgU2VuZGluZyBub3RpZmljYXRpb246ICR7bWV0aG9kfWAsIHsgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9KTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKVxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgY29uc29sZS5lcnJvcihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAtICR7ZXJyb3JUZXh0fWApO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBOb3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9IC0gJHtlcnJvclRleHR9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBzZW50IHN1Y2Nlc3NmdWxseWApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBOb3RpZmljYXRpb24gJHttZXRob2R9IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IHRvIHN0b3AgaW5pdGlhbGl6YXRpb24gaWYgbm90aWZpY2F0aW9uIGZhaWxzXG4gIH1cbn1cblxuICBhc3luYyBsaXN0VG9vbHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICB9XG5cbiAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBTZXJ2ZXIgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3QoJ3Rvb2xzL2NhbGwnLCB7XG4gICAgICBuYW1lLFxuICAgICAgYXJndW1lbnRzOiBhcmdzXG4gICAgfSk7XG4gIH1cblxuICBkaXNjb25uZWN0KCkge1xuICAgIC8vIEZvciBTdHJlYW1hYmxlIEhUVFAsIHdlIGNhbiBvcHRpb25hbGx5IHNlbmQgYSBERUxFVEUgcmVxdWVzdCB0byBjbGVhbiB1cCB0aGUgc2Vzc2lvblxuICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnREVMRVRFJyxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnbWNwLXNlc3Npb24taWQnOiB0aGlzLnNlc3Npb25JZCxcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgICAgICB9XG4gICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBJZ25vcmUgZXJyb3JzIG9uIGRpc2Nvbm5lY3RcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBJZ25vcmUgZXJyb3JzIG9uIGRpc2Nvbm5lY3RcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgIGNvbnNvbGUubG9nKCfwn5OLIERpc2Nvbm5lY3RlZCBmcm9tIE1DUCBTZXJ2ZXInKTtcbiAgfVxufVxuXG4vLyBNZWRpY2FsIG9wZXJhdGlvbnMgaW1wbGVtZW50YXRpb24gZm9yIFN0cmVhbWFibGUgSFRUUCB0cmFuc3BvcnRcbmV4cG9ydCBpbnRlcmZhY2UgTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHVwbG9hZERvY3VtZW50KGZpbGU6IEJ1ZmZlciwgZmlsZW5hbWU6IHN0cmluZywgbWltZVR5cGU6IHN0cmluZywgbWV0YWRhdGE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgc2VhcmNoRG9jdW1lbnRzKHF1ZXJ5OiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGxpc3REb2N1bWVudHMob3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZXh0cmFjdE1lZGljYWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcsIGRvY3VtZW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSk6IFByb21pc2U8YW55PjtcbiAgYW5hbHl6ZVBhdGllbnRIaXN0b3J5KHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dD86IGFueSk6IFByb21pc2U8YW55PjtcbiAgXG4gIC8vIExlZ2FjeSBtZXRob2RzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgc2VhcmNoQnlEaWFnbm9zaXMocGF0aWVudElkZW50aWZpZXI6IHN0cmluZywgZGlhZ25vc2lzUXVlcnk/OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgc2VtYW50aWNTZWFyY2gocXVlcnk6IHN0cmluZywgcGF0aWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWVkaWNhbE9wZXJhdGlvbnMoY29ubmVjdGlvbjogTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24pOiBNZWRpY2FsRG9jdW1lbnRPcGVyYXRpb25zIHtcbiAgcmV0dXJuIHtcbiAgICAvLyBOZXcgdG9vbCBtZXRob2RzIHVzaW5nIHRoZSBleGFjdCB0b29sIG5hbWVzIGZyb20geW91ciBzZXJ2ZXJcbiAgICBhc3luYyB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3VwbG9hZERvY3VtZW50Jywge1xuICAgICAgICB0aXRsZTogZmlsZW5hbWUsXG4gICAgICAgIGZpbGVCdWZmZXI6IGZpbGUudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIC4uLm1ldGFkYXRhLFxuICAgICAgICAgIGZpbGVUeXBlOiBtaW1lVHlwZS5zcGxpdCgnLycpWzFdIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBzaXplOiBmaWxlLmxlbmd0aFxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgdGhlIHJlc3VsdCBpZiBpdCdzIGluIHRoZSBjb250ZW50IGFycmF5IGZvcm1hdFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnc2VhcmNoRG9jdW1lbnRzJywge1xuICAgICAgICBxdWVyeSxcbiAgICAgICAgbGltaXQ6IG9wdGlvbnMubGltaXQgfHwgMTAsXG4gICAgICAgIHRocmVzaG9sZDogb3B0aW9ucy50aHJlc2hvbGQgfHwgMC43LFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGxpc3REb2N1bWVudHMob3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDIwLFxuICAgICAgICBvZmZzZXQ6IG9wdGlvbnMub2Zmc2V0IHx8IDAsXG4gICAgICAgIGZpbHRlcjogb3B0aW9ucy5maWx0ZXIgfHwge31cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcsIGRvY3VtZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCB7XG4gICAgICAgIHRleHQsXG4gICAgICAgIGRvY3VtZW50SWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZmluZFNpbWlsYXJDYXNlcyhjcml0ZXJpYTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdmaW5kU2ltaWxhckNhc2VzJywgY3JpdGVyaWEpO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgYW5hbHl6ZVBhdGllbnRIaXN0b3J5KHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYW5hbHl6ZVBhdGllbnRIaXN0b3J5Jywge1xuICAgICAgICBwYXRpZW50SWQsXG4gICAgICAgIGFuYWx5c2lzVHlwZTogb3B0aW9ucy5hbmFseXNpc1R5cGUgfHwgJ3N1bW1hcnknLFxuICAgICAgICBkYXRlUmFuZ2U6IG9wdGlvbnMuZGF0ZVJhbmdlXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldE1lZGljYWxJbnNpZ2h0cyhxdWVyeTogc3RyaW5nLCBjb250ZXh0OiBhbnkgPSB7fSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZ2V0TWVkaWNhbEluc2lnaHRzJywge1xuICAgICAgICBxdWVyeSxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgbGltaXQ6IGNvbnRleHQubGltaXQgfHwgNVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICAvLyBMZWdhY3kgY29tcGF0aWJpbGl0eSBtZXRob2RzXG4gICAgYXN5bmMgZXh0cmFjdFRleHQoZG9jdW1lbnRJZDogc3RyaW5nKSB7XG4gICAgICAvLyBUaGlzIG1pZ2h0IG5vdCBleGlzdCBhcyBhIHNlcGFyYXRlIHRvb2wsIHRyeSB0byBnZXQgZG9jdW1lbnQgY29udGVudFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnbGlzdERvY3VtZW50cycsIHtcbiAgICAgICAgZmlsdGVyOiB7IF9pZDogZG9jdW1lbnRJZCB9LFxuICAgICAgICBsaW1pdDogMVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgICBpZiAocGFyc2VkLmRvY3VtZW50cyAmJiBwYXJzZWQuZG9jdW1lbnRzWzBdKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICBleHRyYWN0ZWRUZXh0OiBwYXJzZWQuZG9jdW1lbnRzWzBdLmNvbnRlbnQsXG4gICAgICAgICAgICAgIGNvbmZpZGVuY2U6IDEwMFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBmYWxsYmFja1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGV4dCBleHRyYWN0aW9uIG5vdCBzdXBwb3J0ZWQgLSB1c2UgZG9jdW1lbnQgY29udGVudCBmcm9tIHVwbG9hZCByZXN1bHQnKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgc2VhcmNoQnlEaWFnbm9zaXMocGF0aWVudElkZW50aWZpZXI6IHN0cmluZywgZGlhZ25vc2lzUXVlcnk/OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VhcmNoRG9jdW1lbnRzKGRpYWdub3Npc1F1ZXJ5IHx8IHBhdGllbnRJZGVudGlmaWVyLCB7XG4gICAgICAgIGZpbHRlcjogeyBwYXRpZW50SWQ6IHBhdGllbnRJZGVudGlmaWVyIH0sXG4gICAgICAgIGxpbWl0OiAxMFxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZykge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2VhcmNoRG9jdW1lbnRzKHF1ZXJ5LCB7XG4gICAgICAgIGZpbHRlcjogcGF0aWVudElkID8geyBwYXRpZW50SWQgfSA6IHt9LFxuICAgICAgICBsaW1pdDogNVxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRTdW1tYXJ5KHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBhbmFseXNpc1R5cGU6ICdzdW1tYXJ5J1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufSIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGludGVyZmFjZSBNZXNzYWdlIHtcbiAgX2lkPzogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIHJvbGU6ICd1c2VyJyB8ICdhc3Npc3RhbnQnO1xuICB0aW1lc3RhbXA6IERhdGU7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgTWVzc2FnZXNDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb248TWVzc2FnZT4oJ21lc3NhZ2VzJyk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjaywgTWF0Y2ggfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uLCBNZXNzYWdlIH0gZnJvbSAnLi9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5pbXBvcnQgeyBNQ1BDbGllbnRNYW5hZ2VyIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21jcC9tY3BDbGllbnRNYW5hZ2VyJztcbmltcG9ydCB7IENvbnRleHRNYW5hZ2VyIH0gZnJvbSAnLi4vY29udGV4dC9jb250ZXh0TWFuYWdlcic7XG5cbi8vIE1ldGVvciBNZXRob2RzXG5NZXRlb3IubWV0aG9kcyh7XG4gIGFzeW5jICdtZXNzYWdlcy5pbnNlcnQnKG1lc3NhZ2VEYXRhOiBPbWl0PE1lc3NhZ2UsICdfaWQnPikge1xuICAgIGNoZWNrKG1lc3NhZ2VEYXRhLCB7XG4gICAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgICByb2xlOiBTdHJpbmcsXG4gICAgICB0aW1lc3RhbXA6IERhdGUsXG4gICAgICBzZXNzaW9uSWQ6IFN0cmluZ1xuICAgIH0pO1xuXG4gICAgY29uc3QgbWVzc2FnZUlkID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG1lc3NhZ2VEYXRhKTtcbiAgICBcbiAgICAvLyBVcGRhdGUgY29udGV4dCBpZiBzZXNzaW9uIGV4aXN0c1xuICAgIGlmIChtZXNzYWdlRGF0YS5zZXNzaW9uSWQpIHtcbiAgICAgIGF3YWl0IENvbnRleHRNYW5hZ2VyLnVwZGF0ZUNvbnRleHQobWVzc2FnZURhdGEuc2Vzc2lvbklkLCB7XG4gICAgICAgIC4uLm1lc3NhZ2VEYXRhLFxuICAgICAgICBfaWQ6IG1lc3NhZ2VJZFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSBzZXNzaW9uXG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkLCB7XG4gICAgICAgICRzZXQ6IHtcbiAgICAgICAgICBsYXN0TWVzc2FnZTogbWVzc2FnZURhdGEuY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSxcbiAgICAgICAgJGluYzogeyBtZXNzYWdlQ291bnQ6IDEgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEF1dG8tZ2VuZXJhdGUgdGl0bGUgYWZ0ZXIgZmlyc3QgdXNlciBtZXNzYWdlXG4gICAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhtZXNzYWdlRGF0YS5zZXNzaW9uSWQpO1xuICAgICAgaWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5tZXNzYWdlQ291bnQgPD0gMiAmJiBtZXNzYWdlRGF0YS5yb2xlID09PSAndXNlcicpIHtcbiAgICAgICAgTWV0ZW9yLnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIE1ldGVvci5jYWxsKCdzZXNzaW9ucy5nZW5lcmF0ZVRpdGxlJywgbWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgICAgfSwgMTAwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG1lc3NhZ2VJZDtcbiAgfSxcblxuICBhc3luYyAnbWNwLnByb2Nlc3NRdWVyeScocXVlcnk6IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgY2hlY2socXVlcnksIFN0cmluZyk7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBNYXRjaC5NYXliZShTdHJpbmcpKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHJldHVybiAnTUNQIENsaWVudCBpcyBub3QgcmVhZHkuIFBsZWFzZSBjaGVjayB5b3VyIEFQSSBjb25maWd1cmF0aW9uLic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgUHJvY2Vzc2luZyBxdWVyeSB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uOiBcIiR7cXVlcnl9XCJgKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEJ1aWxkIGNvbnRleHQgZm9yIHRoZSBxdWVyeVxuICAgICAgICBjb25zdCBjb250ZXh0OiBhbnkgPSB7IHNlc3Npb25JZCB9O1xuICAgICAgICBcbiAgICAgICAgaWYgKHNlc3Npb25JZCkge1xuICAgICAgICAgIC8vIEdldCBzZXNzaW9uIGNvbnRleHRcbiAgICAgICAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyhzZXNzaW9uSWQpO1xuICAgICAgICAgIGlmIChzZXNzaW9uPy5tZXRhZGF0YT8ucGF0aWVudElkKSB7XG4gICAgICAgICAgICBjb250ZXh0LnBhdGllbnRJZCA9IHNlc3Npb24ubWV0YWRhdGEucGF0aWVudElkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBHZXQgY29udmVyc2F0aW9uIGNvbnRleHRcbiAgICAgICAgICBjb25zdCBjb250ZXh0RGF0YSA9IGF3YWl0IENvbnRleHRNYW5hZ2VyLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbkNvbnRleHQgPSBjb250ZXh0RGF0YTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gTGV0IENsYXVkZSBpbnRlbGxpZ2VudGx5IGRlY2lkZSB3aGF0IHRvb2xzIHRvIHVzZSAoaW5jbHVkZXMgRXBpYyB0b29scylcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBtY3BNYW5hZ2VyLnByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24ocXVlcnksIGNvbnRleHQpO1xuICAgICAgICBcbiAgICAgICAgLy8gVXBkYXRlIGNvbnRleHQgYWZ0ZXIgcHJvY2Vzc2luZ1xuICAgICAgICBpZiAoc2Vzc2lvbklkKSB7XG4gICAgICAgICAgYXdhaXQgZXh0cmFjdEFuZFVwZGF0ZUNvbnRleHQocXVlcnksIHJlc3BvbnNlLCBzZXNzaW9uSWQpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdJbnRlbGxpZ2VudCBNQ1AgcHJvY2Vzc2luZyBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIFxuICAgICAgICAvLyBQcm92aWRlIGhlbHBmdWwgZXJyb3IgbWVzc2FnZXMgYmFzZWQgb24gdGhlIGVycm9yIHR5cGVcbiAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBjb25uZWN0ZWQnKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgbWVkaWNhbCBkYXRhIHN5c3RlbXMuIFBsZWFzZSBlbnN1cmUgdGhlIE1DUCBzZXJ2ZXJzIGFyZSBydW5uaW5nIGFuZCB0cnkgYWdhaW4uJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdFcGljIE1DUCBTZXJ2ZXInKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgRXBpYyBFSFIgc3lzdGVtLiBQbGVhc2UgZW5zdXJlIHRoZSBFcGljIE1DUCBzZXJ2ZXIgaXMgcnVubmluZyBhbmQgcHJvcGVybHkgY29uZmlndXJlZC4nO1xuICAgICAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0FpZGJveCcpKSB7XG4gICAgICAgICAgcmV0dXJuICdJXFwnbSBoYXZpbmcgdHJvdWJsZSBjb25uZWN0aW5nIHRvIHRoZSBBaWRib3ggRkhJUiBzeXN0ZW0uIFBsZWFzZSBlbnN1cmUgdGhlIEFpZGJveCBNQ1Agc2VydmVyIGlzIHJ1bm5pbmcgYW5kIHByb3Blcmx5IGNvbmZpZ3VyZWQuJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdBUEknKSkge1xuICAgICAgICAgIHJldHVybiAnSSBlbmNvdW50ZXJlZCBhbiBBUEkgZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgYWdhaW4gaW4gYSBtb21lbnQuJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gZXJyb3Igd2hpbGUgcHJvY2Vzc2luZyB5b3VyIHJlcXVlc3QuIFBsZWFzZSB0cnkgcmVwaHJhc2luZyB5b3VyIHF1ZXN0aW9uIG9yIGNvbnRhY3Qgc3VwcG9ydCBpZiB0aGUgaXNzdWUgcGVyc2lzdHMuJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ1NpbXVsYXRpb24gbW9kZSAtIG5vIGFjdHVhbCBwcm9jZXNzaW5nJztcbiAgfSxcblxuICBhc3luYyAnbWNwLnN3aXRjaFByb3ZpZGVyJyhwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJykge1xuICAgIGNoZWNrKHByb3ZpZGVyLCBTdHJpbmcpO1xuICAgIFxuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignbWNwLW5vdC1yZWFkeScsICdNQ1AgQ2xpZW50IGlzIG5vdCByZWFkeScpO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLnN3aXRjaFByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgcmV0dXJuIGBTd2l0Y2hlZCB0byAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IHByb3ZpZGVyIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignUHJvdmlkZXIgc3dpdGNoIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc3dpdGNoLWZhaWxlZCcsIGBGYWlsZWQgdG8gc3dpdGNoIHByb3ZpZGVyOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnUHJvdmlkZXIgc3dpdGNoZWQgKHNpbXVsYXRpb24gbW9kZSknO1xuICB9LFxuXG4gICdtY3AuZ2V0Q3VycmVudFByb3ZpZGVyJygpIHtcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRDdXJyZW50UHJvdmlkZXIoKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdhbnRocm9waWMnO1xuICB9LFxuXG4gICdtY3AuZ2V0QXZhaWxhYmxlUHJvdmlkZXJzJygpIHtcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0QXZhaWxhYmxlUHJvdmlkZXJzKCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEZhbGxiYWNrIGZvciBzaW11bGF0aW9uXG4gICAgY29uc3Qgc2V0dGluZ3MgPSBNZXRlb3Iuc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBcbiAgICBjb25zdCBwcm92aWRlcnMgPSBbXTtcbiAgICBpZiAoYW50aHJvcGljS2V5KSBwcm92aWRlcnMucHVzaCgnYW50aHJvcGljJyk7XG4gICAgaWYgKG96d2VsbEtleSkgcHJvdmlkZXJzLnB1c2goJ296d2VsbCcpO1xuICAgIFxuICAgIHJldHVybiBwcm92aWRlcnM7XG4gIH0sXG5cbiAgJ21jcC5nZXRBdmFpbGFibGVUb29scycoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVRvb2xzKCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBbXTtcbiAgfSxcblxuICAvLyBTZXJ2ZXIgaGVhbHRoIGNoZWNrIG1ldGhvZCAtIGluY2x1ZGVzIEVwaWNcbiAgYXN5bmMgJ21jcC5oZWFsdGhDaGVjaycoKSB7XG4gICAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgICAgbWVzc2FnZTogJ0FsbCBzeXN0ZW1zIG9wZXJhdGlvbmFsIChzaW11bGF0aW9uIG1vZGUpJyxcbiAgICAgICAgc2VydmVyczoge1xuICAgICAgICAgIGVwaWM6ICdzaW11bGF0ZWQnLFxuICAgICAgICAgIGFpZGJveDogJ3NpbXVsYXRlZCcsXG4gICAgICAgICAgbWVkaWNhbDogJ3NpbXVsYXRlZCdcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgIFxuICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogJ01DUCBDbGllbnQgbm90IHJlYWR5JyxcbiAgICAgICAgc2VydmVyczoge31cbiAgICAgIH07XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IG1jcE1hbmFnZXIuaGVhbHRoQ2hlY2soKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgICBtZXNzYWdlOiAnSGVhbHRoIGNoZWNrIGNvbXBsZXRlZCcsXG4gICAgICAgIHNlcnZlcnM6IHtcbiAgICAgICAgICBlcGljOiBoZWFsdGguZXBpYyA/ICdoZWFsdGh5JyA6ICd1bmF2YWlsYWJsZScsXG4gICAgICAgICAgYWlkYm94OiBoZWFsdGguYWlkYm94ID8gJ2hlYWx0aHknIDogJ3VuYXZhaWxhYmxlJ1xuICAgICAgICB9LFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKClcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogYEhlYWx0aCBjaGVjayBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZX1gLFxuICAgICAgICBzZXJ2ZXJzOiB7fSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpXG4gICAgICB9O1xuICAgIH1cbiAgfSxcblxuICAvLyBNZWRpY2FsIGRvY3VtZW50IG1ldGhvZHMgKGV4aXN0aW5nKVxuYXN5bmMgJ21lZGljYWwudXBsb2FkRG9jdW1lbnQnKGZpbGVEYXRhOiB7XG4gIGZpbGVuYW1lOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgbWltZVR5cGU6IHN0cmluZztcbiAgcGF0aWVudE5hbWU/OiBzdHJpbmc7XG4gIHNlc3Npb25JZD86IHN0cmluZztcbn0pIHtcbiAgY2hlY2soZmlsZURhdGEsIHtcbiAgICBmaWxlbmFtZTogU3RyaW5nLFxuICAgIGNvbnRlbnQ6IFN0cmluZyxcbiAgICBtaW1lVHlwZTogU3RyaW5nLFxuICAgIHBhdGllbnROYW1lOiBNYXRjaC5NYXliZShTdHJpbmcpLFxuICAgIHNlc3Npb25JZDogTWF0Y2guTWF5YmUoU3RyaW5nKVxuICB9KTtcblxuICBjb25zb2xlLmxvZyhgICBVcGxvYWQgcmVxdWVzdCBmb3I6ICR7ZmlsZURhdGEuZmlsZW5hbWV9ICgke2ZpbGVEYXRhLm1pbWVUeXBlfSlgKTtcbiAgY29uc29sZS5sb2coYCBDb250ZW50IHNpemU6ICR7ZmlsZURhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cbiAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgY29uc29sZS5sb2coJyBTaW11bGF0aW9uIG1vZGUgLSByZXR1cm5pbmcgbW9jayBkb2N1bWVudCBJRCcpO1xuICAgIHJldHVybiB7IFxuICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICBkb2N1bWVudElkOiAnc2ltLScgKyBEYXRlLm5vdygpLFxuICAgICAgbWVzc2FnZTogJ0RvY3VtZW50IHVwbG9hZGVkIChzaW11bGF0aW9uIG1vZGUpJ1xuICAgIH07XG4gIH1cblxuICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICBcbiAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBNQ1AgQ2xpZW50IG5vdCByZWFkeScpO1xuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTWVkaWNhbCBkb2N1bWVudCBzeXN0ZW0gaXMgbm90IGF2YWlsYWJsZS4gUGxlYXNlIGNvbnRhY3QgYWRtaW5pc3RyYXRvci4nKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gVmFsaWRhdGUgYmFzZTY0IGNvbnRlbnRcbiAgICBpZiAoIWZpbGVEYXRhLmNvbnRlbnQgfHwgZmlsZURhdGEuY29udGVudC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsZSBjb250ZW50IGlzIGVtcHR5Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZmlsZSBzaXplIChiYXNlNjQgZW5jb2RlZCwgc28gYWN0dWFsIGZpbGUgaXMgfjc1JSBvZiB0aGlzKVxuICAgIGNvbnN0IGVzdGltYXRlZEZpbGVTaXplID0gKGZpbGVEYXRhLmNvbnRlbnQubGVuZ3RoICogMykgLyA0O1xuICAgIGlmIChlc3RpbWF0ZWRGaWxlU2l6ZSA+IDEwICogMTAyNCAqIDEwMjQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmlsZSB0b28gbGFyZ2UgKG1heCAxME1CKScpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGAgRXN0aW1hdGVkIGZpbGUgc2l6ZTogJHtNYXRoLnJvdW5kKGVzdGltYXRlZEZpbGVTaXplIC8gMTAyNCl9S0JgKTtcblxuICAgIGNvbnN0IG1lZGljYWwgPSBtY3BNYW5hZ2VyLmdldE1lZGljYWxPcGVyYXRpb25zKCk7XG4gICAgXG4gICAgLy8gQ29udmVydCBiYXNlNjQgYmFjayB0byBidWZmZXIgZm9yIE1DUCBzZXJ2ZXJcbiAgICBjb25zdCBmaWxlQnVmZmVyID0gQnVmZmVyLmZyb20oZmlsZURhdGEuY29udGVudCwgJ2Jhc2U2NCcpO1xuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1lZGljYWwudXBsb2FkRG9jdW1lbnQoXG4gICAgICBmaWxlQnVmZmVyLFxuICAgICAgZmlsZURhdGEuZmlsZW5hbWUsXG4gICAgICBmaWxlRGF0YS5taW1lVHlwZSxcbiAgICAgIHtcbiAgICAgICAgcGF0aWVudE5hbWU6IGZpbGVEYXRhLnBhdGllbnROYW1lIHx8ICdVbmtub3duIFBhdGllbnQnLFxuICAgICAgICBzZXNzaW9uSWQ6IGZpbGVEYXRhLnNlc3Npb25JZCB8fCB0aGlzLmNvbm5lY3Rpb24/LmlkIHx8ICdkZWZhdWx0JyxcbiAgICAgICAgdXBsb2FkZWRCeTogdGhpcy51c2VySWQgfHwgJ2Fub255bW91cycsXG4gICAgICAgIHVwbG9hZERhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBNQ1AgdXBsb2FkIHN1Y2Nlc3NmdWw6JywgcmVzdWx0KTtcbiAgICBcbiAgICAvLyBVcGRhdGUgc2Vzc2lvbiBtZXRhZGF0YSBpZiB3ZSBoYXZlIHNlc3Npb24gSURcbiAgICBpZiAoZmlsZURhdGEuc2Vzc2lvbklkICYmIHJlc3VsdC5kb2N1bWVudElkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoZmlsZURhdGEuc2Vzc2lvbklkLCB7XG4gICAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgICAnbWV0YWRhdGEuZG9jdW1lbnRJZHMnOiByZXN1bHQuZG9jdW1lbnRJZFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgJ21ldGFkYXRhLnBhdGllbnRJZCc6IGZpbGVEYXRhLnBhdGllbnROYW1lIHx8ICdVbmtub3duIFBhdGllbnQnLFxuICAgICAgICAgICAgJ21ldGFkYXRhLmxhc3RVcGxvYWQnOiBuZXcgRGF0ZSgpXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc29sZS5sb2coJyBTZXNzaW9uIG1ldGFkYXRhIHVwZGF0ZWQnKTtcbiAgICAgIH0gY2F0Y2ggKHVwZGF0ZUVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignIEZhaWxlZCB0byB1cGRhdGUgc2Vzc2lvbiBtZXRhZGF0YTonLCB1cGRhdGVFcnJvcik7XG4gICAgICAgIC8vIERvbid0IGZhaWwgdGhlIHdob2xlIG9wZXJhdGlvbiBmb3IgdGhpc1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICAgIFxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgY29uc29sZS5lcnJvcignIERvY3VtZW50IHVwbG9hZCBlcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8gUHJvdmlkZSBzcGVjaWZpYyBlcnJvciBtZXNzYWdlc1xuICAgIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnbm90IGNvbm5lY3RlZCcpIHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdFQ09OTlJFRlVTRUQnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignbWVkaWNhbC1zZXJ2ZXItb2ZmbGluZScsICdNZWRpY2FsIGRvY3VtZW50IHNlcnZlciBpcyBub3QgYXZhaWxhYmxlLiBQbGVhc2UgY29udGFjdCBhZG1pbmlzdHJhdG9yLicpO1xuICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ0ZpbGUgdG9vIGxhcmdlJykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ2ZpbGUtdG9vLWxhcmdlJywgJ0ZpbGUgaXMgdG9vIGxhcmdlLiBNYXhpbXVtIHNpemUgaXMgMTBNQi4nKTtcbiAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdJbnZhbGlkIGZpbGUgdHlwZScpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdpbnZhbGlkLWZpbGUtdHlwZScsICdJbnZhbGlkIGZpbGUgdHlwZS4gUGxlYXNlIHVzZSBQREYgb3IgaW1hZ2UgZmlsZXMgb25seS4nKTtcbiAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3VwbG9hZC10aW1lb3V0JywgJ1VwbG9hZCB0aW1lZCBvdXQuIFBsZWFzZSB0cnkgYWdhaW4gd2l0aCBhIHNtYWxsZXIgZmlsZS4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcigndXBsb2FkLWZhaWxlZCcsIGBVcGxvYWQgZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxufSxcblxuXG4gIGFzeW5jICdtZWRpY2FsLnByb2Nlc3NEb2N1bWVudCcoZG9jdW1lbnRJZDogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICBjaGVjayhkb2N1bWVudElkLCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG5cbiAgICBpZiAodGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCBwcm9jZXNzZWQgKHNpbXVsYXRpb24gbW9kZSknLFxuICAgICAgICB0ZXh0RXh0cmFjdGlvbjogeyBleHRyYWN0ZWRUZXh0OiAnU2FtcGxlIHRleHQnLCBjb25maWRlbmNlOiA5NSB9LFxuICAgICAgICBtZWRpY2FsRW50aXRpZXM6IHsgZW50aXRpZXM6IFtdLCBzdW1tYXJ5OiB7IGRpYWdub3Npc0NvdW50OiAwLCBtZWRpY2F0aW9uQ291bnQ6IDAsIGxhYlJlc3VsdENvdW50OiAwIH0gfVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgIFxuICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgbWVkaWNhbCA9IG1jcE1hbmFnZXIuZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTtcbiAgICAgIFxuICAgICAgLy8gUHJvY2VzcyBkb2N1bWVudCB1c2luZyBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWVkaWNhbC5leHRyYWN0TWVkaWNhbEVudGl0aWVzKCcnLCBkb2N1bWVudElkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRG9jdW1lbnQgcHJvY2Vzc2luZyBlcnJvcjonLCBlcnJvcik7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdwcm9jZXNzaW5nLWZhaWxlZCcsIGBGYWlsZWQgdG8gcHJvY2VzcyBkb2N1bWVudDogJHtlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cbn0pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZXh0cmFjdCBhbmQgdXBkYXRlIGNvbnRleHRcbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KFxuICBxdWVyeTogc3RyaW5nLCBcbiAgcmVzcG9uc2U6IHN0cmluZywgXG4gIHNlc3Npb25JZDogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHBhdGllbnQgbmFtZSBmcm9tIHF1ZXJ5XG4gICAgY29uc3QgcGF0aWVudE1hdGNoID0gcXVlcnkubWF0Y2goLyg/OnBhdGllbnR8Zm9yKVxccysoW0EtWl1bYS16XSsoPzpcXHMrW0EtWl1bYS16XSspPykvaSk7XG4gICAgaWYgKHBhdGllbnRNYXRjaCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7ICdtZXRhZGF0YS5wYXRpZW50SWQnOiBwYXRpZW50TWF0Y2hbMV0gfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCB0ZXJtcyBmcm9tIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZSk7XG4gICAgaWYgKG1lZGljYWxUZXJtcy5sZW5ndGggPiAwKSB7XG4gICAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoc2Vzc2lvbklkLCB7XG4gICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICdtZXRhZGF0YS50YWdzJzogeyAkZWFjaDogbWVkaWNhbFRlcm1zIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICAgIGNvbnN0IGRhdGFTb3VyY2VzID0gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlKTtcbiAgICBpZiAoZGF0YVNvdXJjZXMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAnbWV0YWRhdGEuZGF0YVNvdXJjZXMnOiB7ICRlYWNoOiBkYXRhU291cmNlcyB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjb250ZXh0OicsIGVycm9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0TWVkaWNhbFRlcm1zRnJvbVJlc3BvbnNlKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IG1lZGljYWxQYXR0ZXJucyA9IFtcbiAgICAvXFxiKD86ZGlhZ25vc2VkIHdpdGh8ZGlhZ25vc2lzIG9mKVxccysoW14sLl0rKS9naSxcbiAgICAvXFxiKD86cHJlc2NyaWJlZHxtZWRpY2F0aW9uKVxccysoW14sLl0rKS9naSxcbiAgICAvXFxiKD86dHJlYXRtZW50IGZvcnx0cmVhdGluZylcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OmNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2lcbiAgXTtcbiAgXG4gIGNvbnN0IHRlcm1zID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICBtZWRpY2FsUGF0dGVybnMuZm9yRWFjaChwYXR0ZXJuID0+IHtcbiAgICBsZXQgbWF0Y2g7XG4gICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhyZXNwb25zZSkpICE9PSBudWxsKSB7XG4gICAgICBpZiAobWF0Y2hbMV0pIHtcbiAgICAgICAgdGVybXMuYWRkKG1hdGNoWzFdLnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBcbiAgcmV0dXJuIEFycmF5LmZyb20odGVybXMpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdERhdGFTb3VyY2VzKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgXG4gIC8vIERldGVjdCBkYXRhIHNvdXJjZXMgbWVudGlvbmVkIGluIHJlc3BvbnNlXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnQWlkYm94IEZISVInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlaHInKSkge1xuICAgIHNvdXJjZXMuYWRkKCdFcGljIEVIUicpO1xuICB9XG4gIFxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZG9jdW1lbnQnKSB8fCByZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd1cGxvYWRlZCcpKSB7XG4gICAgc291cmNlcy5hZGQoJ01lZGljYWwgRG9jdW1lbnRzJyk7XG4gIH1cbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHNvdXJjZXMpO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIHNhbml0aXplIHBhdGllbnQgbmFtZXMgKHVzZWQgYnkgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24pXG5mdW5jdGlvbiBzYW5pdGl6ZVBhdGllbnROYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBuYW1lXG4gICAgLnRyaW0oKVxuICAgIC5yZXBsYWNlKC9bXmEtekEtWlxcc10vZywgJycpIC8vIFJlbW92ZSBzcGVjaWFsIGNoYXJhY3RlcnNcbiAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpIC8vIE5vcm1hbGl6ZSB3aGl0ZXNwYWNlXG4gICAgLnNwbGl0KCcgJylcbiAgICAubWFwKHdvcmQgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAuam9pbignICcpO1xufVxuXG4vLyBFeHBvcnQgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHRlc3RpbmcgYW5kIHJldXNlXG5leHBvcnQge1xuICBleHRyYWN0QW5kVXBkYXRlQ29udGV4dCxcbiAgZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZSxcbiAgZXh0cmFjdERhdGFTb3VyY2VzLFxuICBzYW5pdGl6ZVBhdGllbnROYW1lXG59OyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi9tZXNzYWdlcyc7XG5cbk1ldGVvci5wdWJsaXNoKCdtZXNzYWdlcycsIGZ1bmN0aW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgcmV0dXJuIE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKHsgc2Vzc2lvbklkIH0pO1xufSk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBjaGVjaywgTWF0Y2ggfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uLCBDaGF0U2Vzc2lvbiB9IGZyb20gJy4vc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vbWVzc2FnZXMvbWVzc2FnZXMnO1xuXG5NZXRlb3IubWV0aG9kcyh7XG4gIGFzeW5jICdzZXNzaW9ucy5jcmVhdGUnKHRpdGxlPzogc3RyaW5nLCBtZXRhZGF0YT86IGFueSkge1xuICAgIGNoZWNrKHRpdGxlLCBNYXRjaC5NYXliZShTdHJpbmcpKTtcbiAgICBjaGVjayhtZXRhZGF0YSwgTWF0Y2guTWF5YmUoT2JqZWN0KSk7XG5cbiAgICBjb25zdCBzZXNzaW9uOiBPbWl0PENoYXRTZXNzaW9uLCAnX2lkJz4gPSB7XG4gICAgICB0aXRsZTogdGl0bGUgfHwgJ05ldyBDaGF0JyxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgbWVzc2FnZUNvdW50OiAwLFxuICAgICAgaXNBY3RpdmU6IHRydWUsXG4gICAgICBtZXRhZGF0YTogbWV0YWRhdGEgfHwge31cbiAgICB9O1xuICAgIFxuICAgIC8vIERlYWN0aXZhdGUgb3RoZXIgc2Vzc2lvbnMgZm9yIHRoaXMgdXNlclxuICAgIGlmICh0aGlzLnVzZXJJZCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgICB7IHVzZXJJZDogdGhpcy51c2VySWQsIGlzQWN0aXZlOiB0cnVlIH0sXG4gICAgICAgIHsgJHNldDogeyBpc0FjdGl2ZTogZmFsc2UgfSB9LFxuICAgICAgICB7IG11bHRpOiB0cnVlIH1cbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHNlc3Npb25JZCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhzZXNzaW9uKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIENyZWF0ZWQgbmV3IHNlc3Npb246ICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIHJldHVybiBzZXNzaW9uSWQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMubGlzdCcobGltaXQgPSAyMCwgb2Zmc2V0ID0gMCkge1xuICAgIGNoZWNrKGxpbWl0LCBNYXRjaC5JbnRlZ2VyKTtcbiAgICBjaGVjayhvZmZzZXQsIE1hdGNoLkludGVnZXIpO1xuICAgIFxuICAgIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgdXNlcklkIH0sXG4gICAgICB7IFxuICAgICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICAgIGxpbWl0LFxuICAgICAgICBza2lwOiBvZmZzZXRcbiAgICAgIH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBjb25zdCB0b3RhbCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyh7IHVzZXJJZCB9KTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbnMsXG4gICAgICB0b3RhbCxcbiAgICAgIGhhc01vcmU6IG9mZnNldCArIGxpbWl0IDwgdG90YWxcbiAgICB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmdldCcoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBzZXNzaW9uO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnVwZGF0ZScoc2Vzc2lvbklkOiBzdHJpbmcsIHVwZGF0ZXM6IFBhcnRpYWw8Q2hhdFNlc3Npb24+KSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIGNoZWNrKHVwZGF0ZXMsIE9iamVjdCk7XG4gICAgXG4gICAgLy8gUmVtb3ZlIGZpZWxkcyB0aGF0IHNob3VsZG4ndCBiZSB1cGRhdGVkIGRpcmVjdGx5XG4gICAgZGVsZXRlIHVwZGF0ZXMuX2lkO1xuICAgIGRlbGV0ZSB1cGRhdGVzLnVzZXJJZDtcbiAgICBkZWxldGUgdXBkYXRlcy5jcmVhdGVkQXQ7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBcbiAgICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgICAgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgLi4udXBkYXRlcywgXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpIFxuICAgICAgICB9IFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5kZWxldGUnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIC8vIFZlcmlmeSBvd25lcnNoaXBcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyh7XG4gICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgIH0pO1xuICAgIFxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc2Vzc2lvbi1ub3QtZm91bmQnLCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRGVsZXRlIGFsbCBhc3NvY2lhdGVkIG1lc3NhZ2VzXG4gICAgY29uc3QgZGVsZXRlZE1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHsgc2Vzc2lvbklkIH0pO1xuICAgIGNvbnNvbGUubG9nKGDwn5eR77iPIERlbGV0ZWQgJHtkZWxldGVkTWVzc2FnZXN9IG1lc3NhZ2VzIGZyb20gc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICAvLyBEZWxldGUgdGhlIHNlc3Npb25cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24ucmVtb3ZlQXN5bmMoc2Vzc2lvbklkKTtcbiAgICBjb25zb2xlLmxvZyhg8J+Xke+4jyBEZWxldGVkIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgcmV0dXJuIHsgc2Vzc2lvbjogcmVzdWx0LCBtZXNzYWdlczogZGVsZXRlZE1lc3NhZ2VzIH07XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuc2V0QWN0aXZlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICAgIFxuICAgIC8vIERlYWN0aXZhdGUgYWxsIG90aGVyIHNlc3Npb25zXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyB1c2VySWQsIGlzQWN0aXZlOiB0cnVlIH0sXG4gICAgICB7ICRzZXQ6IHsgaXNBY3RpdmU6IGZhbHNlIH0gfSxcbiAgICAgIHsgbXVsdGk6IHRydWUgfVxuICAgICk7XG4gICAgXG4gICAgLy8gQWN0aXZhdGUgdGhpcyBzZXNzaW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBfaWQ6IHNlc3Npb25JZCwgdXNlcklkIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIGlzQWN0aXZlOiB0cnVlLFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgICB9IFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5nZW5lcmF0ZVRpdGxlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICAvLyBHZXQgZmlyc3QgZmV3IG1lc3NhZ2VzXG4gICAgY29uc3QgbWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgc2Vzc2lvbklkLCByb2xlOiAndXNlcicgfSxcbiAgICAgIHsgbGltaXQ6IDMsIHNvcnQ6IHsgdGltZXN0YW1wOiAxIH0gfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIGlmIChtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBVc2UgZmlyc3QgdXNlciBtZXNzYWdlIGFzIGJhc2lzIGZvciB0aXRsZVxuICAgICAgY29uc3QgZmlyc3RVc2VyTWVzc2FnZSA9IG1lc3NhZ2VzWzBdO1xuICAgICAgaWYgKGZpcnN0VXNlck1lc3NhZ2UpIHtcbiAgICAgICAgLy8gQ2xlYW4gdXAgdGhlIG1lc3NhZ2UgZm9yIGEgYmV0dGVyIHRpdGxlXG4gICAgICAgIGxldCB0aXRsZSA9IGZpcnN0VXNlck1lc3NhZ2UuY29udGVudFxuICAgICAgICAgIC5yZXBsYWNlKC9eKHNlYXJjaCBmb3J8ZmluZHxsb29rIGZvcnxzaG93IG1lKVxccysvaSwgJycpIC8vIFJlbW92ZSBjb21tb24gcHJlZml4ZXNcbiAgICAgICAgICAucmVwbGFjZSgvWz8hLl0kLywgJycpIC8vIFJlbW92ZSBlbmRpbmcgcHVuY3R1YXRpb25cbiAgICAgICAgICAudHJpbSgpO1xuICAgICAgICBcbiAgICAgICAgLy8gTGltaXQgbGVuZ3RoXG4gICAgICAgIGlmICh0aXRsZS5sZW5ndGggPiA1MCkge1xuICAgICAgICAgIHRpdGxlID0gdGl0bGUuc3Vic3RyaW5nKDAsIDUwKS50cmltKCkgKyAnLi4uJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ2FwaXRhbGl6ZSBmaXJzdCBsZXR0ZXJcbiAgICAgICAgdGl0bGUgPSB0aXRsZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHRpdGxlLnNsaWNlKDEpO1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgICB0aXRsZSxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gdGl0bGU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnVwZGF0ZU1ldGFkYXRhJyhzZXNzaW9uSWQ6IHN0cmluZywgbWV0YWRhdGE6IGFueSkge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBjaGVjayhtZXRhZGF0YSwgT2JqZWN0KTtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24udXBkYXRlQXN5bmMoXG4gICAgICB7IFxuICAgICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgICB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZXhwb3J0JyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmRPbmVBc3luYyh7XG4gICAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgIH0pO1xuICAgIFxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignc2Vzc2lvbi1ub3QtZm91bmQnLCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWVzc2FnZXMgPSBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZChcbiAgICAgIHsgc2Vzc2lvbklkIH0sXG4gICAgICB7IHNvcnQ6IHsgdGltZXN0YW1wOiAxIH0gfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzZXNzaW9uLFxuICAgICAgbWVzc2FnZXMsXG4gICAgICBleHBvcnRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdmVyc2lvbjogJzEuMCdcbiAgICB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmltcG9ydCcoZGF0YTogYW55KSB7XG4gICAgY2hlY2soZGF0YSwge1xuICAgICAgc2Vzc2lvbjogT2JqZWN0LFxuICAgICAgbWVzc2FnZXM6IEFycmF5LFxuICAgICAgdmVyc2lvbjogU3RyaW5nXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQ3JlYXRlIG5ldyBzZXNzaW9uIGJhc2VkIG9uIGltcG9ydGVkIGRhdGFcbiAgICBjb25zdCBuZXdTZXNzaW9uOiBPbWl0PENoYXRTZXNzaW9uLCAnX2lkJz4gPSB7XG4gICAgICAuLi5kYXRhLnNlc3Npb24sXG4gICAgICB0aXRsZTogYFtJbXBvcnRlZF0gJHtkYXRhLnNlc3Npb24udGl0bGV9YCxcbiAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgaXNBY3RpdmU6IHRydWVcbiAgICB9O1xuICAgIFxuICAgIGRlbGV0ZSAobmV3U2Vzc2lvbiBhcyBhbnkpLl9pZDtcbiAgICBcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMobmV3U2Vzc2lvbik7XG4gICAgXG4gICAgLy8gSW1wb3J0IG1lc3NhZ2VzIHdpdGggbmV3IHNlc3Npb25JZFxuICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiBkYXRhLm1lc3NhZ2VzKSB7XG4gICAgICBjb25zdCBuZXdNZXNzYWdlID0ge1xuICAgICAgICAuLi5tZXNzYWdlLFxuICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUobWVzc2FnZS50aW1lc3RhbXApXG4gICAgICB9O1xuICAgICAgZGVsZXRlIG5ld01lc3NhZ2UuX2lkO1xuICAgICAgXG4gICAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMobmV3TWVzc2FnZSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBzZXNzaW9uSWQ7XG4gIH1cbn0pOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2sgfSBmcm9tICdtZXRlb3IvY2hlY2snO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi9zZXNzaW9ucyc7XG5cbi8vIFB1Ymxpc2ggdXNlcidzIHNlc3Npb25zIGxpc3Rcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9ucy5saXN0JywgZnVuY3Rpb24obGltaXQgPSAyMCkge1xuICBjaGVjayhsaW1pdCwgTnVtYmVyKTtcbiAgXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgeyB1c2VySWQgfSxcbiAgICB7IFxuICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgbGltaXQsXG4gICAgICBmaWVsZHM6IHsgXG4gICAgICAgIHRpdGxlOiAxLCBcbiAgICAgICAgdXBkYXRlZEF0OiAxLCBcbiAgICAgICAgbWVzc2FnZUNvdW50OiAxLCBcbiAgICAgICAgbGFzdE1lc3NhZ2U6IDEsXG4gICAgICAgIGlzQWN0aXZlOiAxLFxuICAgICAgICBjcmVhdGVkQXQ6IDEsXG4gICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiAxLFxuICAgICAgICAnbWV0YWRhdGEuZG9jdW1lbnRJZHMnOiAxXG4gICAgICB9XG4gICAgfVxuICApO1xufSk7XG5cbi8vIFB1Ymxpc2ggc2luZ2xlIHNlc3Npb24gZGV0YWlsc1xuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb24uZGV0YWlscycsIGZ1bmN0aW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7IFxuICAgIF9pZDogc2Vzc2lvbklkLFxuICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICB9KTtcbn0pO1xuXG4vLyBQdWJsaXNoIGFjdGl2ZSBzZXNzaW9uXG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbi5hY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7IFxuICAgIHVzZXJJZCxcbiAgICBpc0FjdGl2ZTogdHJ1ZVxuICB9LCB7XG4gICAgbGltaXQ6IDFcbiAgfSk7XG59KTtcblxuLy8gUHVibGlzaCByZWNlbnQgc2Vzc2lvbnMgd2l0aCBtZXNzYWdlIHByZXZpZXdcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9ucy5yZWNlbnQnLCBmdW5jdGlvbihsaW1pdCA9IDUpIHtcbiAgY2hlY2sobGltaXQsIE51bWJlcik7XG4gIFxuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgIHsgdXNlcklkIH0sXG4gICAgeyBcbiAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgIGxpbWl0LFxuICAgICAgZmllbGRzOiB7XG4gICAgICAgIHRpdGxlOiAxLFxuICAgICAgICBsYXN0TWVzc2FnZTogMSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiAxLFxuICAgICAgICB1cGRhdGVkQXQ6IDEsXG4gICAgICAgIGlzQWN0aXZlOiAxXG4gICAgICB9XG4gICAgfVxuICApO1xufSk7IiwiaW1wb3J0IHsgTW9uZ28gfSBmcm9tICdtZXRlb3IvbW9uZ28nO1xuXG5leHBvcnQgaW50ZXJmYWNlIENoYXRTZXNzaW9uIHtcbiAgX2lkPzogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICB1c2VySWQ/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdDogRGF0ZTtcbiAgdXBkYXRlZEF0OiBEYXRlO1xuICBsYXN0TWVzc2FnZT86IHN0cmluZztcbiAgbWVzc2FnZUNvdW50OiBudW1iZXI7XG4gIGlzQWN0aXZlOiBib29sZWFuO1xuICBtZXRhZGF0YT86IHtcbiAgICBwYXRpZW50SWQ/OiBzdHJpbmc7XG4gICAgZG9jdW1lbnRJZHM/OiBzdHJpbmdbXTtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgbW9kZWw/OiBzdHJpbmc7XG4gICAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBTZXNzaW9uc0NvbGxlY3Rpb24gPSBuZXcgTW9uZ28uQ29sbGVjdGlvbjxDaGF0U2Vzc2lvbj4oJ3Nlc3Npb25zJyk7IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTWVzc2FnZXNDb2xsZWN0aW9uIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21lc3NhZ2VzJztcblxuTWV0ZW9yLnN0YXJ0dXAoYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnIFNldHRpbmcgdXAgc2Vzc2lvbiBtYW5hZ2VtZW50Li4uJyk7XG4gIFxuICAvLyBDcmVhdGUgaW5kZXhlcyBmb3IgYmV0dGVyIHBlcmZvcm1hbmNlXG4gIHRyeSB7XG4gICAgLy8gU2Vzc2lvbnMgaW5kZXhlc1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgdXNlcklkOiAxLCB1cGRhdGVkQXQ6IC0xIH0pO1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgaXNBY3RpdmU6IDEgfSk7XG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBjcmVhdGVkQXQ6IC0xIH0pO1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgJ21ldGFkYXRhLnBhdGllbnRJZCc6IDEgfSk7XG4gICAgXG4gICAgLy8gTWVzc2FnZXMgaW5kZXhlc1xuICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgc2Vzc2lvbklkOiAxLCB0aW1lc3RhbXA6IDEgfSk7XG4gICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmNyZWF0ZUluZGV4QXN5bmMoeyBzZXNzaW9uSWQ6IDEsIHJvbGU6IDEgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBEYXRhYmFzZSBpbmRleGVzIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignIEVycm9yIGNyZWF0aW5nIGluZGV4ZXM6JywgZXJyb3IpO1xuICB9XG4gIFxuICAvLyBDbGVhbnVwIG9sZCBzZXNzaW9ucyAob3B0aW9uYWwgLSByZW1vdmUgc2Vzc2lvbnMgb2xkZXIgdGhhbiAzMCBkYXlzKVxuICBjb25zdCB0aGlydHlEYXlzQWdvID0gbmV3IERhdGUoKTtcbiAgdGhpcnR5RGF5c0Fnby5zZXREYXRlKHRoaXJ0eURheXNBZ28uZ2V0RGF0ZSgpIC0gMzApO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zdCBvbGRTZXNzaW9ucyA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKHtcbiAgICAgIHVwZGF0ZWRBdDogeyAkbHQ6IHRoaXJ0eURheXNBZ28gfVxuICAgIH0pLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBpZiAob2xkU2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYPCfp7kgRm91bmQgJHtvbGRTZXNzaW9ucy5sZW5ndGh9IG9sZCBzZXNzaW9ucyB0byBjbGVhbiB1cGApO1xuICAgICAgXG4gICAgICBmb3IgKGNvbnN0IHNlc3Npb24gb2Ygb2xkU2Vzc2lvbnMpIHtcbiAgICAgICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHsgc2Vzc2lvbklkOiBzZXNzaW9uLl9pZCB9KTtcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHNlc3Npb24uX2lkKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coJyBPbGQgc2Vzc2lvbnMgY2xlYW5lZCB1cCcpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgRXJyb3IgY2xlYW5pbmcgdXAgb2xkIHNlc3Npb25zOicsIGVycm9yKTtcbiAgfVxuICBcbiAgLy8gTG9nIHNlc3Npb24gc3RhdGlzdGljc1xuICB0cnkge1xuICAgIGNvbnN0IHRvdGFsU2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoKTtcbiAgICBjb25zdCB0b3RhbE1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKCk7XG4gICAgY29uc3QgYWN0aXZlU2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyBpc0FjdGl2ZTogdHJ1ZSB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnIFNlc3Npb24gU3RhdGlzdGljczonKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgc2Vzc2lvbnM6ICR7dG90YWxTZXNzaW9uc31gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQWN0aXZlIHNlc3Npb25zOiAke2FjdGl2ZVNlc3Npb25zfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCBtZXNzYWdlczogJHt0b3RhbE1lc3NhZ2VzfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBFcnJvciBnZXR0aW5nIHNlc3Npb24gc3RhdGlzdGljczonLCBlcnJvcik7XG4gIH1cbn0pOyIsIi8vIHNlcnZlci9tYWluLnRzXG5pbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IE1DUENsaWVudE1hbmFnZXIgfSBmcm9tICcvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXInO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWV0aG9kcyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9wdWJsaWNhdGlvbnMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcyc7XG5pbXBvcnQgJy9pbXBvcnRzL2FwaS9zZXNzaW9ucy9wdWJsaWNhdGlvbnMnO1xuaW1wb3J0ICcuL3N0YXJ0dXAtc2Vzc2lvbnMnO1xuXG5NZXRlb3Iuc3RhcnR1cChhc3luYyAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCcgU3RhcnRpbmcgTUNQIFBpbG90IHNlcnZlciB3aXRoIEludGVsbGlnZW50IFRvb2wgU2VsZWN0aW9uLi4uJyk7XG4gIFxuICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBHZXQgQVBJIGtleXNcbiAgICBjb25zdCBzZXR0aW5ncyA9IE1ldGVvci5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICBjb25zdCBhbnRocm9waWNLZXkgPSBzZXR0aW5ncz8uQU5USFJPUElDX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk7XG4gICAgY29uc3Qgb3p3ZWxsS2V5ID0gc2V0dGluZ3M/Lk9aV0VMTF9BUElfS0VZIHx8IHByb2Nlc3MuZW52Lk9aV0VMTF9BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEVuZHBvaW50ID0gc2V0dGluZ3M/Lk9aV0VMTF9FTkRQT0lOVCB8fCBwcm9jZXNzLmVudi5PWldFTExfRU5EUE9JTlQ7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBBUEkgS2V5IFN0YXR1czonKTtcbiAgICBjb25zb2xlLmxvZygnICBBbnRocm9waWMga2V5IGZvdW5kOicsICEhYW50aHJvcGljS2V5LCBhbnRocm9waWNLZXk/LnN1YnN0cmluZygwLCAxNSkgKyAnLi4uJyk7XG4gICAgY29uc29sZS5sb2coJyAgT3p3ZWxsIGtleSBmb3VuZDonLCAhIW96d2VsbEtleSwgb3p3ZWxsS2V5Py5zdWJzdHJpbmcoMCwgMTUpICsgJy4uLicpO1xuICAgIGNvbnNvbGUubG9nKCcgIE96d2VsbCBlbmRwb2ludDonLCBvendlbGxFbmRwb2ludCk7XG4gICAgXG4gICAgaWYgKCFhbnRocm9waWNLZXkgJiYgIW96d2VsbEtleSkge1xuICAgICAgY29uc29sZS53YXJuKCcgIE5vIEFQSSBrZXkgZm91bmQgZm9yIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIERldGVybWluZSBkZWZhdWx0IHByb3ZpZGVyIChwcmVmZXIgQW50aHJvcGljIGZvciBiZXR0ZXIgdG9vbCBjYWxsaW5nLCBmYWxsYmFjayB0byBPendlbGwpXG4gICAgbGV0IHByb3ZpZGVyOiAnYW50aHJvcGljJyB8ICdvendlbGwnO1xuICAgIGxldCBhcGlLZXk6IHN0cmluZztcblxuICAgIGlmIChhbnRocm9waWNLZXkpIHtcbiAgICAgIHByb3ZpZGVyID0gJ2FudGhyb3BpYyc7XG4gICAgICBhcGlLZXkgPSBhbnRocm9waWNLZXk7XG4gICAgfSBlbHNlIGlmIChvendlbGxLZXkpIHtcbiAgICAgIHByb3ZpZGVyID0gJ296d2VsbCc7XG4gICAgICBhcGlLZXkgPSBvendlbGxLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybignICBObyB2YWxpZCBBUEkga2V5cyBmb3VuZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgbWFpbiBNQ1AgY2xpZW50IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25cbiAgICBhd2FpdCBtY3BNYW5hZ2VyLmluaXRpYWxpemUoe1xuICAgICAgcHJvdmlkZXIsXG4gICAgICBhcGlLZXksXG4gICAgICBvendlbGxFbmRwb2ludCxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnIE1DUCBDbGllbnQgaW5pdGlhbGl6ZWQgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbicpO1xuICAgIGNvbnNvbGUubG9nKGAgTUNQIFVzaW5nICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX0gYXMgdGhlIEFJIHByb3ZpZGVyIGZvciBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbmApO1xuICAgIGNvbnNvbGUubG9nKCcgTUNQIFNlc3Npb24gbWFuYWdlbWVudCBlbmFibGVkIHdpdGggQXRsYXMgTW9uZ29EQicpO1xuICAgIFxuICAgIC8vIFNob3cgcHJvdmlkZXIgY2FwYWJpbGl0aWVzXG4gICAgaWYgKGFudGhyb3BpY0tleSAmJiBvendlbGxLZXkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCcgTUNQIEJvdGggcHJvdmlkZXJzIGF2YWlsYWJsZSAtIHlvdSBjYW4gc3dpdGNoIGJldHdlZW4gdGhlbSBpbiB0aGUgY2hhdCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgIE1DUCBBbnRocm9waWM6IEFkdmFuY2VkIHRvb2wgY2FsbGluZyB3aXRoIENsYXVkZSBtb2RlbHMgKHJlY29tbWVuZGVkKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIE1DUCBPendlbGw6IEJsdWVoaXZlIEFJIG1vZGVscyB3aXRoIGludGVsbGlnZW50IHByb21wdGluZycpO1xuICAgIH0gZWxzZSBpZiAoYW50aHJvcGljS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZygnIE1DUCBBbnRocm9waWMgcHJvdmlkZXIgd2l0aCBuYXRpdmUgdG9vbCBjYWxsaW5nIHN1cHBvcnQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYCBNQ1AgT25seSAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IHByb3ZpZGVyIGF2YWlsYWJsZWApO1xuICAgIH1cblxuICAgIC8vIENvbm5lY3QgdG8gbWVkaWNhbCBNQ1Agc2VydmVyIGZvciBkb2N1bWVudCB0b29sc1xuICAgIGNvbnN0IG1jcFNlcnZlclVybCA9IHNldHRpbmdzPy5NRURJQ0FMX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDUnO1xuICAgIFxuICAgIGlmIChtY3BTZXJ2ZXJVcmwgJiYgbWNwU2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gTWVkaWNhbCBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb01lZGljYWxTZXJ2ZXIoKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBNZWRpY2FsIGRvY3VtZW50IHRvb2xzIGRpc2NvdmVyZWQgYW5kIHJlYWR5IGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24nKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignICBNZWRpY2FsIE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgIERvY3VtZW50IHByb2Nlc3NpbmcgdG9vbHMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgTWVkaWNhbCBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIEFpZGJveCBNQ1Agc2VydmVyIGZvciBGSElSIHRvb2xzXG4gICAgY29uc3QgYWlkYm94U2VydmVyVXJsID0gc2V0dGluZ3M/LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDInO1xuICAgIFxuICAgIGlmIChhaWRib3hTZXJ2ZXJVcmwgJiYgYWlkYm94U2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gQWlkYm94IE1DUCBTZXJ2ZXIgZm9yIGludGVsbGlnZW50IEZISVIgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9BaWRib3hTZXJ2ZXIoKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBBaWRib3ggRkhJUiB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgQWlkYm94IE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpOyAgXG4gICAgICAgIGNvbnNvbGUud2FybignICAgQWlkYm94IEZISVIgZmVhdHVyZXMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgQWlkYm94IE1DUCBTZXJ2ZXIgVVJMIG5vdCBjb25maWd1cmVkLicpO1xuICAgIH1cblxuICAgIC8vIENvbm5lY3QgdG8gRXBpYyBNQ1Agc2VydmVyIGZvciBFcGljIEVIUiB0b29sc1xuICAgIGNvbnN0IGVwaWNTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDMnO1xuICAgIFxuICAgIGlmIChlcGljU2VydmVyVXJsICYmIGVwaWNTZXJ2ZXJVcmwgIT09ICdESVNBQkxFRCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgZm9yIGludGVsbGlnZW50IEVIUiB0b29sIGRpc2NvdmVyeS4uLmApO1xuICAgICAgICBhd2FpdCBtY3BNYW5hZ2VyLmNvbm5lY3RUb0VwaWNTZXJ2ZXIoKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBFcGljIEVIUiB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgRXBpYyBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBFcGljIEVIUiBmZWF0dXJlcyB3aWxsIGJlIHVuYXZhaWxhYmxlIGZvciBpbnRlbGxpZ2VudCBzZWxlY3Rpb24uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybignICBFcGljIE1DUCBTZXJ2ZXIgVVJMIG5vdCBjb25maWd1cmVkLicpO1xuICAgIH1cbiAgICBcbiAgICAvLyBMb2cgZmluYWwgc3RhdHVzXG4gICAgY29uc3QgYXZhaWxhYmxlVG9vbHMgPSBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVRvb2xzKCk7XG4gICAgY29uc29sZS5sb2coYFxcbiBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbiBTdGF0dXM6YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIHRvb2xzIGF2YWlsYWJsZTogJHthdmFpbGFibGVUb29scy5sZW5ndGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgICBBSSBQcm92aWRlcjogJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb29sIHNlbGVjdGlvbiBtZXRob2Q6ICR7cHJvdmlkZXIgPT09ICdhbnRocm9waWMnID8gJ05hdGl2ZSBDbGF1ZGUgdG9vbCBjYWxsaW5nJyA6ICdJbnRlbGxpZ2VudCBwcm9tcHRpbmcnfWApO1xuICAgIFxuICAgIC8vIExvZyBhdmFpbGFibGUgdG9vbCBjYXRlZ29yaWVzXG4gICAgaWYgKGF2YWlsYWJsZVRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHRvb2xDYXRlZ29yaWVzID0gY2F0ZWdvcml6ZVRvb2xzKGF2YWlsYWJsZVRvb2xzKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7wn5SnIEF2YWlsYWJsZSBUb29sIENhdGVnb3JpZXM6Jyk7XG4gICAgICAvLyBPYmplY3QuZW50cmllcyh0b29sQ2F0ZWdvcmllcykuZm9yRWFjaCgoW2NhdGVnb3J5LCBjb3VudF0pID0+IHtcbiAgICAgIC8vIGNvbnNvbGUubG9nKGAgICAke2dldENhdGVnb3J5RW1vamkoY2F0ZWdvcnkpfSAke2NhdGVnb3J5fTogJHtjb3VudH0gdG9vbHNgKTtcbiAgICAgIC8vIH0pO1xuICAgIH1cbiAgXG4gICAgaWYgKGF2YWlsYWJsZVRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG4gU1VDQ0VTUzogQ2xhdWRlIHdpbGwgbm93IGludGVsbGlnZW50bHkgc2VsZWN0IHRvb2xzIGJhc2VkIG9uIHVzZXIgcXVlcmllcyEnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgTm8gbW9yZSBoYXJkY29kZWQgcGF0dGVybnMgb3Iga2V5d29yZCBtYXRjaGluZycpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBDbGF1ZGUgYW5hbHl6ZXMgZWFjaCBxdWVyeSBhbmQgY2hvb3NlcyBhcHByb3ByaWF0ZSB0b29scycpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBTdXBwb3J0cyBjb21wbGV4IG11bHRpLXN0ZXAgdG9vbCB1c2FnZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgIOKAoiBBdXRvbWF0aWMgdG9vbCBjaGFpbmluZyBhbmQgcmVzdWx0IGludGVycHJldGF0aW9uJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG4gIE5vIHRvb2xzIGF2YWlsYWJsZSAtIHJ1bm5pbmcgaW4gYmFzaWMgTExNIG1vZGUnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coJ1xcbiBFeGFtcGxlIHF1ZXJpZXMgdGhhdCB3aWxsIHdvcmsgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjonKTtcbiAgICBjb25zb2xlLmxvZygnICAgIEFpZGJveCBGSElSOiBcIkdldCBtZSBkZXRhaWxzIGFib3V0IGFsbCBIYW5rIFByZXN0b24gYXZhaWxhYmxlIGZyb20gQWlkYm94XCInKTtcbiAgICBjb25zb2xlLmxvZygnICAgIEVwaWMgRUhSOiBcIlNlYXJjaCBmb3IgcGF0aWVudCBDYW1pbGEgTG9wZXogaW4gRXBpY1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgICBFcGljIEVIUjogXCJHZXQgbGFiIHJlc3VsdHMgZm9yIHBhdGllbnQgZXJYdUZZVWZ1Y0JaYXJ5VmtzWUVjTWczXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAgIERvY3VtZW50czogXCJVcGxvYWQgdGhpcyBsYWIgcmVwb3J0IGFuZCBmaW5kIHNpbWlsYXIgY2FzZXNcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICBNdWx0aS10b29sOiBcIlNlYXJjaCBFcGljIGZvciBkaWFiZXRlcyBwYXRpZW50cyBhbmQgZ2V0IHRoZWlyIG1lZGljYXRpb25zXCInKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjonLCBlcnJvcik7XG4gICAgY29uc29sZS53YXJuKCdTZXJ2ZXIgd2lsbCBydW4gd2l0aCBsaW1pdGVkIGNhcGFiaWxpdGllcycpO1xuICAgIGNvbnNvbGUud2FybignQmFzaWMgTExNIHJlc3BvbnNlcyB3aWxsIHdvcmssIGJ1dCBubyB0b29sIGNhbGxpbmcnKTtcbiAgfVxufSk7XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBjYXRlZ29yaXplIHRvb2xzIGZvciBiZXR0ZXIgbG9nZ2luZ1xuLy8gRml4IGZvciBzZXJ2ZXIvbWFpbi50cyAtIFJlcGxhY2UgdGhlIGNhdGVnb3JpemVUb29scyBmdW5jdGlvblxuXG5mdW5jdGlvbiBjYXRlZ29yaXplVG9vbHModG9vbHM6IGFueVtdKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGNvbnN0IGNhdGVnb3JpZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgXG4gIHRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgbGV0IGNhdGVnb3J5ID0gJ090aGVyJztcbiAgICBcbiAgICAvLyBFcGljIEVIUiB0b29scyAtIHRvb2xzIHdpdGggJ2VwaWMnIHByZWZpeFxuICAgIGlmICh0b29sLm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJykpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ0VwaWMgRUhSJztcbiAgICB9XG4gICAgLy8gQWlkYm94IEZISVIgdG9vbHMgLSBzdGFuZGFyZCBGSElSIG9wZXJhdGlvbnMgd2l0aG91dCAnZXBpYycgcHJlZml4IGZyb20gQWlkYm94XG4gICAgZWxzZSBpZiAoaXNBaWRib3hGSElSVG9vbCh0b29sKSkge1xuICAgICAgY2F0ZWdvcnkgPSAnQWlkYm94IEZISVInO1xuICAgIH1cbiAgICAvLyBNZWRpY2FsIERvY3VtZW50IHRvb2xzIC0gZG9jdW1lbnQgcHJvY2Vzc2luZyBvcGVyYXRpb25zXG4gICAgZWxzZSBpZiAoaXNEb2N1bWVudFRvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ01lZGljYWwgRG9jdW1lbnRzJztcbiAgICB9XG4gICAgLy8gU2VhcmNoICYgQW5hbHlzaXMgdG9vbHMgLSBBSS9NTCBvcGVyYXRpb25zXG4gICAgZWxzZSBpZiAoaXNTZWFyY2hBbmFseXNpc1Rvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ1NlYXJjaCAmIEFuYWx5c2lzJztcbiAgICB9XG4gICAgXG4gICAgY2F0ZWdvcmllc1tjYXRlZ29yeV0gPSAoY2F0ZWdvcmllc1tjYXRlZ29yeV0gfHwgMCkgKyAxO1xuICB9KTtcbiAgXG4gIHJldHVybiBjYXRlZ29yaWVzO1xufVxuXG5mdW5jdGlvbiBpc0FpZGJveEZISVJUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhaWRib3hGSElSVG9vbE5hbWVzID0gW1xuICAgICdzZWFyY2hQYXRpZW50cycsICdnZXRQYXRpZW50RGV0YWlscycsICdjcmVhdGVQYXRpZW50JywgJ3VwZGF0ZVBhdGllbnQnLFxuICAgICdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2NyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2NyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuICBcbiAgLy8gTXVzdCBiZSBpbiB0aGUgQWlkYm94IHRvb2wgbGlzdCBBTkQgbm90IHN0YXJ0IHdpdGggJ2VwaWMnXG4gIHJldHVybiBhaWRib3hGSElSVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSkgJiYgXG4gICAgICAgICAhdG9vbC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpO1xufVxuXG5mdW5jdGlvbiBpc0RvY3VtZW50VG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgZG9jdW1lbnRUb29sTmFtZXMgPSBbXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnY2h1bmtBbmRFbWJlZERvY3VtZW50JywgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gZG9jdW1lbnRUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuZnVuY3Rpb24gaXNTZWFyY2hBbmFseXNpc1Rvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGFuYWx5c2lzVG9vbE5hbWVzID0gW1xuICAgICdhbmFseXplUGF0aWVudEhpc3RvcnknLCAnZmluZFNpbWlsYXJDYXNlcycsICdnZXRNZWRpY2FsSW5zaWdodHMnLFxuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gYW5hbHlzaXNUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGdldCBlbW9qaSBmb3IgdG9vbCBjYXRlZ29yaWVzXG4vLyBmdW5jdGlvbiBnZXRDYXRlZ29yeUVtb2ppKGNhdGVnb3J5OiBzdHJpbmcpOiBzdHJpbmcge1xuLy8gICBjb25zdCBlbW9qaU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbi8vICAgICAnRXBpYyBFSFInOiAn8J+PpScsXG4vLyAgICAgJ0FpZGJveCBGSElSJzogJ/Cfk4snLFxuLy8gICAgICdNZWRpY2FsIERvY3VtZW50cyc6ICfwn5OEJyxcbi8vICAgICAnU2VhcmNoICYgQW5hbHlzaXMnOiAn8J+UjScsXG4vLyAgICAgJ090aGVyJzogJ/CflKcnXG4vLyAgIH07XG4gIFxuLy8gICByZXR1cm4gZW1vamlNYXBbY2F0ZWdvcnldIHx8ICfwn5SnJztcbi8vIH1cblxuLy8gR3JhY2VmdWwgc2h1dGRvd25cbnByb2Nlc3Mub24oJ1NJR0lOVCcsICgpID0+IHtcbiAgY29uc29sZS5sb2coJ1xcbiBTaHV0dGluZyBkb3duIHNlcnZlci4uLicpO1xuICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICBcbiAgLy8gQ2xlYXIgYWxsIGNvbnRleHQgYmVmb3JlIHNodXRkb3duXG4gIGNvbnN0IHsgQ29udGV4dE1hbmFnZXIgfSA9IHJlcXVpcmUoJy9pbXBvcnRzL2FwaS9jb250ZXh0L2NvbnRleHRNYW5hZ2VyJyk7XG4gIENvbnRleHRNYW5hZ2VyLmNsZWFyQWxsQ29udGV4dHMoKTtcbiAgXG4gIG1jcE1hbmFnZXIuc2h1dGRvd24oKS50aGVuKCgpID0+IHtcbiAgICBjb25zb2xlLmxvZygnIFNlcnZlciBzaHV0ZG93biBjb21wbGV0ZScpO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIHNodXRkb3duOicsIGVycm9yKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH0pO1xufSk7XG5cbi8vIEhhbmRsZSB1bmNhdWdodCBlcnJvcnNcbnByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycm9yKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ1VuY2F1Z2h0IEV4Y2VwdGlvbjonLCBlcnJvcik7XG59KTtcblxucHJvY2Vzcy5vbigndW5oYW5kbGVkUmVqZWN0aW9uJywgKHJlYXNvbiwgcHJvbWlzZSkgPT4ge1xuICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgUmVqZWN0aW9uIGF0OicsIHByb21pc2UsICdyZWFzb246JywgcmVhc29uKTtcbn0pOyJdfQ==
