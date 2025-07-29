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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlci50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL2FpZGJveFNlcnZlckNvbm5lY3Rpb24udHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9lcGljU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWNwL21jcENsaWVudE1hbmFnZXIudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21jcC9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbi50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWVzc2FnZXMvbWVzc2FnZXMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21lc3NhZ2VzL3B1YmxpY2F0aW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvbWV0aG9kcy50cyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zLnRzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9zZXNzaW9ucy9zZXNzaW9ucy50cyIsIm1ldGVvcjovL/CfkrthcHAvc2VydmVyL3N0YXJ0dXAtc2Vzc2lvbnMudHMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLnRzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkNvbnRleHRNYW5hZ2VyIiwiTWVzc2FnZXNDb2xsZWN0aW9uIiwibGluayIsInYiLCJTZXNzaW9uc0NvbGxlY3Rpb24iLCJfX3JlaWZ5V2FpdEZvckRlcHNfXyIsImdldENvbnRleHQiLCJzZXNzaW9uSWQiLCJjb250ZXh0IiwiY29udGV4dHMiLCJnZXQiLCJsb2FkQ29udGV4dEZyb21EQiIsInNldCIsInJlY2VudE1lc3NhZ2VzIiwiZmluZCIsInNvcnQiLCJ0aW1lc3RhbXAiLCJsaW1pdCIsIk1BWF9NRVNTQUdFUyIsImZldGNoQXN5bmMiLCJzZXNzaW9uIiwiZmluZE9uZUFzeW5jIiwicmV2ZXJzZSIsIm1heENvbnRleHRMZW5ndGgiLCJNQVhfQ09OVEVYVF9MRU5HVEgiLCJ0b3RhbFRva2VucyIsIm1ldGFkYXRhIiwicGF0aWVudENvbnRleHQiLCJwYXRpZW50SWQiLCJkb2N1bWVudENvbnRleHQiLCJkb2N1bWVudElkcyIsIm1lZGljYWxFbnRpdGllcyIsImV4dHJhY3RNZWRpY2FsRW50aXRpZXMiLCJjYWxjdWxhdGVUb2tlbnMiLCJ0cmltQ29udGV4dCIsInVwZGF0ZUNvbnRleHQiLCJuZXdNZXNzYWdlIiwicHVzaCIsInJvbGUiLCJlbnRpdGllcyIsImV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlIiwiY29udGVudCIsImxlbmd0aCIsInNsaWNlIiwicGVyc2lzdENvbnRleHQiLCJzaGlmdCIsInRvdGFsQ2hhcnMiLCJtYXAiLCJtc2ciLCJqb2luIiwiZSIsImNvbmNhdCIsInRleHQiLCJsYWJlbCIsIk1hdGgiLCJjZWlsIiwiYnVpbGRDb250ZXh0UHJvbXB0IiwicGFydHMiLCJlbnRpdHlTdW1tYXJ5Iiwic3VtbWFyaXplTWVkaWNhbEVudGl0aWVzIiwiY29udmVyc2F0aW9uIiwiZ3JvdXBlZCIsInJlZHVjZSIsImFjYyIsImVudGl0eSIsInN1bW1hcnkiLCJPYmplY3QiLCJlbnRyaWVzIiwiX3JlZiIsInRleHRzIiwidW5pcXVlIiwiU2V0IiwibWVzc2FnZXMiLCJwYXR0ZXJucyIsIk1FRElDQVRJT04iLCJDT05ESVRJT04iLCJTWU1QVE9NIiwiZm9yRWFjaCIsIl9yZWYyIiwicGF0dGVybiIsIm1hdGNoIiwiZXhlYyIsInRyaW0iLCJtZWRpY2FsVGVybXMiLCJQUk9DRURVUkUiLCJfcmVmMyIsInRlcm1zIiwidGVybSIsInRvTG93ZXJDYXNlIiwiaW5jbHVkZXMiLCJzZW50ZW5jZXMiLCJzcGxpdCIsInNlbnRlbmNlIiwiZXh0cmFjdGVkIiwic3Vic3RyaW5nIiwiX2NvbnRleHQkbWVkaWNhbEVudGl0IiwiX2NvbnRleHQkcmVjZW50TWVzc2FnIiwidXBkYXRlQXN5bmMiLCIkc2V0IiwibGFzdE1lc3NhZ2UiLCJtZXNzYWdlQ291bnQiLCJjb3VudERvY3VtZW50cyIsInVwZGF0ZWRBdCIsIkRhdGUiLCJjbGVhckNvbnRleHQiLCJkZWxldGUiLCJjbGVhckFsbENvbnRleHRzIiwiY2xlYXIiLCJnZXRDb250ZXh0U3RhdHMiLCJzaXplIiwidG9rZW5zIiwiTWFwIiwiX19yZWlmeV9hc3luY19yZXN1bHRfXyIsIl9yZWlmeUVycm9yIiwic2VsZiIsImFzeW5jIiwiX29iamVjdFNwcmVhZCIsImRlZmF1bHQiLCJBaWRib3hTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlQWlkYm94T3BlcmF0aW9ucyIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImFyZ3VtZW50cyIsInVuZGVmaW5lZCIsImlzSW5pdGlhbGl6ZWQiLCJyZXF1ZXN0SWQiLCJyZXBsYWNlIiwiY29ubmVjdCIsIl90b29sc1Jlc3VsdCR0b29scyIsImNvbnNvbGUiLCJsb2ciLCJoZWFsdGhDaGVjayIsImNoZWNrU2VydmVySGVhbHRoIiwib2siLCJFcnJvciIsImluaXRSZXN1bHQiLCJzZW5kUmVxdWVzdCIsInByb3RvY29sVmVyc2lvbiIsImNhcGFiaWxpdGllcyIsInJvb3RzIiwibGlzdENoYW5nZWQiLCJjbGllbnRJbmZvIiwibmFtZSIsInZlcnNpb24iLCJzZW5kTm90aWZpY2F0aW9uIiwidG9vbHNSZXN1bHQiLCJ0b29scyIsInRvb2wiLCJpbmRleCIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsInNpZ25hbCIsIkFib3J0U2lnbmFsIiwidGltZW91dCIsImhlYWx0aCIsImpzb24iLCJzdGF0dXMiLCJtZXNzYWdlIiwicGFyYW1zIiwiaWQiLCJyZXF1ZXN0IiwianNvbnJwYyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2VTZXNzaW9uSWQiLCJlcnJvclRleHQiLCJzdGF0dXNUZXh0IiwicmVzdWx0IiwiY29kZSIsIm5vdGlmaWNhdGlvbiIsIndhcm4iLCJsaXN0VG9vbHMiLCJjYWxsVG9vbCIsImFyZ3MiLCJkaXNjb25uZWN0IiwiY29ubmVjdGlvbiIsInNlYXJjaFBhdGllbnRzIiwicXVlcnkiLCJfcmVzdWx0JGNvbnRlbnQiLCJfcmVzdWx0JGNvbnRlbnQkIiwicGFyc2UiLCJnZXRQYXRpZW50RGV0YWlscyIsIl9yZXN1bHQkY29udGVudDIiLCJfcmVzdWx0JGNvbnRlbnQyJCIsImNyZWF0ZVBhdGllbnQiLCJwYXRpZW50RGF0YSIsIl9yZXN1bHQkY29udGVudDMiLCJfcmVzdWx0JGNvbnRlbnQzJCIsInVwZGF0ZVBhdGllbnQiLCJ1cGRhdGVzIiwiX3Jlc3VsdCRjb250ZW50NCIsIl9yZXN1bHQkY29udGVudDQkIiwiZ2V0UGF0aWVudE9ic2VydmF0aW9ucyIsIl9yZXN1bHQkY29udGVudDUiLCJfcmVzdWx0JGNvbnRlbnQ1JCIsIm9wdGlvbnMiLCJjcmVhdGVPYnNlcnZhdGlvbiIsIm9ic2VydmF0aW9uRGF0YSIsIl9yZXN1bHQkY29udGVudDYiLCJfcmVzdWx0JGNvbnRlbnQ2JCIsImdldFBhdGllbnRNZWRpY2F0aW9ucyIsIl9yZXN1bHQkY29udGVudDciLCJfcmVzdWx0JGNvbnRlbnQ3JCIsImNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0IiwibWVkaWNhdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQ4IiwiX3Jlc3VsdCRjb250ZW50OCQiLCJnZXRQYXRpZW50Q29uZGl0aW9ucyIsIl9yZXN1bHQkY29udGVudDkiLCJfcmVzdWx0JGNvbnRlbnQ5JCIsImNyZWF0ZUNvbmRpdGlvbiIsImNvbmRpdGlvbkRhdGEiLCJfcmVzdWx0JGNvbnRlbnQwIiwiX3Jlc3VsdCRjb250ZW50MCQiLCJnZXRQYXRpZW50RW5jb3VudGVycyIsIl9yZXN1bHQkY29udGVudDEiLCJfcmVzdWx0JGNvbnRlbnQxJCIsImNyZWF0ZUVuY291bnRlciIsImVuY291bnRlckRhdGEiLCJfcmVzdWx0JGNvbnRlbnQxMCIsIl9yZXN1bHQkY29udGVudDEwJCIsIkVwaWNTZXJ2ZXJDb25uZWN0aW9uIiwiY3JlYXRlRXBpY09wZXJhdGlvbnMiLCJNQ1BDbGllbnRNYW5hZ2VyIiwiQW50aHJvcGljIiwiTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24iLCJjcmVhdGVNZWRpY2FsT3BlcmF0aW9ucyIsImFudGhyb3BpYyIsImNvbmZpZyIsIm1lZGljYWxDb25uZWN0aW9uIiwibWVkaWNhbE9wZXJhdGlvbnMiLCJhdmFpbGFibGVUb29scyIsImFpZGJveENvbm5lY3Rpb24iLCJhaWRib3hPcGVyYXRpb25zIiwiYWlkYm94VG9vbHMiLCJlcGljQ29ubmVjdGlvbiIsImVwaWNPcGVyYXRpb25zIiwiZXBpY1Rvb2xzIiwiZ2V0SW5zdGFuY2UiLCJpbnN0YW5jZSIsImluaXRpYWxpemUiLCJwcm92aWRlciIsImFwaUtleSIsImNvbm5lY3RUb01lZGljYWxTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvciIsIl9nbG9iYWwkTWV0ZW9yJHNldHRpbiIsInNldHRpbmdzIiwiZ2xvYmFsIiwiTWV0ZW9yIiwicHJpdmF0ZSIsIm1jcFNlcnZlclVybCIsIk1FRElDQUxfTUNQX1NFUlZFUl9VUkwiLCJwcm9jZXNzIiwiZW52IiwidCIsImNvbm5lY3RUb0FpZGJveFNlcnZlciIsIl9nbG9iYWwkTWV0ZW9yMiIsIl9nbG9iYWwkTWV0ZW9yMiRzZXR0aSIsImFpZGJveFNlcnZlclVybCIsIkFJREJPWF9NQ1BfU0VSVkVSX1VSTCIsIm1lcmdlVG9vbHNVbmlxdWUiLCJsb2dBdmFpbGFibGVUb29scyIsImNvbm5lY3RUb0VwaWNTZXJ2ZXIiLCJfZ2xvYmFsJE1ldGVvcjMiLCJfZ2xvYmFsJE1ldGVvcjMkc2V0dGkiLCJlcGljU2VydmVyVXJsIiwiRVBJQ19NQ1BfU0VSVkVSX1VSTCIsImV4aXN0aW5nVG9vbHMiLCJuZXdUb29scyIsInRvb2xOYW1lU2V0IiwidW5pcXVlTmV3VG9vbHMiLCJmaWx0ZXIiLCJoYXMiLCJhZGQiLCJtZXJnZWRUb29scyIsInN0YXJ0c1dpdGgiLCJpc0FpZGJveEZISVJUb29sIiwiZG9jdW1lbnRUb29scyIsImlzRG9jdW1lbnRUb29sIiwiYW5hbHlzaXNUb29scyIsImlzQW5hbHlzaXNUb29sIiwib3RoZXJUb29scyIsIl90b29sJGRlc2NyaXB0aW9uIiwiX3Rvb2wkZGVzY3JpcHRpb24yIiwiX3Rvb2wkZGVzY3JpcHRpb24zIiwiX3Rvb2wkZGVzY3JpcHRpb240IiwiX3Rvb2wkZGVzY3JpcHRpb241IiwiZGVidWdUb29sRHVwbGljYXRlcyIsImFpZGJveEZISVJUb29sTmFtZXMiLCJkb2N1bWVudFRvb2xOYW1lcyIsImFuYWx5c2lzVG9vbE5hbWVzIiwidG9vbE5hbWVzIiwibmFtZUNvdW50IiwiZHVwbGljYXRlcyIsIkFycmF5IiwiZnJvbSIsImNvdW50IiwiZmlsdGVyVG9vbHNCeURhdGFTb3VyY2UiLCJkYXRhU291cmNlIiwiX3Rvb2wkZGVzY3JpcHRpb242IiwiX3Rvb2wkZGVzY3JpcHRpb243IiwiX3Rvb2wkZGVzY3JpcHRpb244IiwiYW5hbHl6ZVF1ZXJ5SW50ZW50IiwibG93ZXJRdWVyeSIsImludGVudCIsImdldEFudGhyb3BpY1Rvb2xzIiwidW5pcXVlVG9vbHMiLCJfdG9vbCRpbnB1dFNjaGVtYSIsIl90b29sJGlucHV0U2NoZW1hMiIsImlucHV0X3NjaGVtYSIsInR5cGUiLCJwcm9wZXJ0aWVzIiwiaW5wdXRTY2hlbWEiLCJyZXF1aXJlZCIsInRvb2xzQXJyYXkiLCJ2YWx1ZXMiLCJ2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljIiwibmFtZVNldCIsInZhbGlkVG9vbHMiLCJjYWxsTUNQVG9vbCIsInRvb2xOYW1lIiwiZXBpY1Rvb2xOYW1lcyIsImFpZGJveFRvb2xOYW1lcyIsIm1lZGljYWxUb29sTmFtZXMiLCJhdmFpbGFibGVUb29sIiwiYXZhaWxhYmxlVG9vbE5hbWVzIiwiY2FsbEVwaWNUb29sIiwiZXBpYyIsImFpZGJveCIsIm1lZGljYWwiLCJlcGljSGVhbHRoIiwiYWlkYm94SGVhbHRoIiwibWVkaWNhbEhlYWx0aCIsInByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24iLCJwcm9jZXNzV2l0aEFudGhyb3BpY0ludGVsbGlnZW50IiwicHJvY2Vzc1dpdGhPendlbGxJbnRlbGxpZ2VudCIsIl9lcnJvciRtZXNzYWdlIiwiX2Vycm9yJG1lc3NhZ2UyIiwiX2Vycm9yJG1lc3NhZ2UzIiwiTk9ERV9FTlYiLCJxdWVyeUludGVudCIsImNvbnRleHRJbmZvIiwic3lzdGVtUHJvbXB0IiwiY29udmVyc2F0aW9uSGlzdG9yeSIsImZpbmFsUmVzcG9uc2UiLCJpdGVyYXRpb25zIiwibWF4SXRlcmF0aW9ucyIsIm1heFJldHJpZXMiLCJyZXRyeUNvdW50IiwiY3JlYXRlIiwibW9kZWwiLCJtYXhfdG9rZW5zIiwic3lzdGVtIiwidG9vbF9jaG9pY2UiLCJkZWxheSIsInBvdyIsIlByb21pc2UiLCJyZXNvbHZlIiwic2V0VGltZW91dCIsImhhc1Rvb2xVc2UiLCJhc3Npc3RhbnRSZXNwb25zZSIsImlucHV0IiwidG9vbFJlc3VsdCIsInRvb2xfdXNlX2lkIiwiZm9ybWF0VG9vbFJlc3VsdCIsImlzX2Vycm9yIiwiX3RoaXMkY29uZmlnIiwiZW5kcG9pbnQiLCJvendlbGxFbmRwb2ludCIsImF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24iLCJfdGhpcyRjb25maWcyIiwiX2RhdGEkY2hvaWNlcyIsIl9kYXRhJGNob2ljZXMkIiwicHJvbXB0IiwidGVtcGVyYXR1cmUiLCJzdHJlYW0iLCJkYXRhIiwiY2hvaWNlcyIsImNvbXBsZXRpb24iLCJwcm9jZXNzUXVlcnlXaXRoTWVkaWNhbENvbnRleHQiLCJnZXRBdmFpbGFibGVUb29scyIsImlzVG9vbEF2YWlsYWJsZSIsInNvbWUiLCJnZXRNZWRpY2FsT3BlcmF0aW9ucyIsImdldEVwaWNPcGVyYXRpb25zIiwiZ2V0QWlkYm94T3BlcmF0aW9ucyIsInN3aXRjaFByb3ZpZGVyIiwidG9VcHBlckNhc2UiLCJnZXRDdXJyZW50UHJvdmlkZXIiLCJfdGhpcyRjb25maWczIiwiZ2V0QXZhaWxhYmxlUHJvdmlkZXJzIiwiX2dsb2JhbCRNZXRlb3I0IiwiX2dsb2JhbCRNZXRlb3I0JHNldHRpIiwiYW50aHJvcGljS2V5IiwiQU5USFJPUElDX0FQSV9LRVkiLCJvendlbGxLZXkiLCJPWldFTExfQVBJX0tFWSIsInByb3ZpZGVycyIsImlzUmVhZHkiLCJnZXRDb25maWciLCJzaHV0ZG93biIsImNvbnRlbnRUeXBlIiwiaGFuZGxlU3RyZWFtaW5nUmVzcG9uc2UiLCJyZXNwb25zZVRleHQiLCJyZWplY3QiLCJfcmVzcG9uc2UkYm9keSIsInJlYWRlciIsImdldFJlYWRlciIsImRlY29kZXIiLCJUZXh0RGVjb2RlciIsImJ1ZmZlciIsInByb2Nlc3NDaHVuayIsImRvbmUiLCJ2YWx1ZSIsInJlYWQiLCJkZWNvZGUiLCJsaW5lcyIsInBvcCIsImxpbmUiLCJwYXJzZWQiLCJjYW5jZWwiLCJjYXRjaCIsInVwbG9hZERvY3VtZW50IiwiZmlsZSIsImZpbGVuYW1lIiwibWltZVR5cGUiLCJ0aXRsZSIsImZpbGVCdWZmZXIiLCJ0b1N0cmluZyIsImZpbGVUeXBlIiwic2VhcmNoRG9jdW1lbnRzIiwidGhyZXNob2xkIiwibGlzdERvY3VtZW50cyIsIm9mZnNldCIsImRvY3VtZW50SWQiLCJmaW5kU2ltaWxhckNhc2VzIiwiY3JpdGVyaWEiLCJhbmFseXplUGF0aWVudEhpc3RvcnkiLCJhbmFseXNpc1R5cGUiLCJkYXRlUmFuZ2UiLCJnZXRNZWRpY2FsSW5zaWdodHMiLCJleHRyYWN0VGV4dCIsIl9pZCIsImRvY3VtZW50cyIsInN1Y2Nlc3MiLCJleHRyYWN0ZWRUZXh0IiwiY29uZmlkZW5jZSIsInNlYXJjaEJ5RGlhZ25vc2lzIiwicGF0aWVudElkZW50aWZpZXIiLCJkaWFnbm9zaXNRdWVyeSIsInNlbWFudGljU2VhcmNoIiwiZ2V0UGF0aWVudFN1bW1hcnkiLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJleHRyYWN0QW5kVXBkYXRlQ29udGV4dCIsImV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UiLCJleHRyYWN0RGF0YVNvdXJjZXMiLCJzYW5pdGl6ZVBhdGllbnROYW1lIiwiY2hlY2siLCJNYXRjaCIsIm1ldGhvZHMiLCJtZXNzYWdlcy5pbnNlcnQiLCJtZXNzYWdlRGF0YSIsIlN0cmluZyIsIm1lc3NhZ2VJZCIsImluc2VydEFzeW5jIiwiJGluYyIsImNhbGwiLCJtY3AucHJvY2Vzc1F1ZXJ5IiwiTWF5YmUiLCJpc1NpbXVsYXRpb24iLCJtY3BNYW5hZ2VyIiwiX3Nlc3Npb24kbWV0YWRhdGEiLCJjb250ZXh0RGF0YSIsImNvbnZlcnNhdGlvbkNvbnRleHQiLCJtY3Auc3dpdGNoUHJvdmlkZXIiLCJtY3AuZ2V0Q3VycmVudFByb3ZpZGVyIiwibWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycyIsIl9NZXRlb3Ikc2V0dGluZ3MiLCJtY3AuZ2V0QXZhaWxhYmxlVG9vbHMiLCJtY3AuaGVhbHRoQ2hlY2siLCJzZXJ2ZXJzIiwibWVkaWNhbC51cGxvYWREb2N1bWVudCIsImZpbGVEYXRhIiwicGF0aWVudE5hbWUiLCJub3ciLCJfdGhpcyRjb25uZWN0aW9uIiwiZXN0aW1hdGVkRmlsZVNpemUiLCJyb3VuZCIsIkJ1ZmZlciIsInVwbG9hZGVkQnkiLCJ1c2VySWQiLCJ1cGxvYWREYXRlIiwidG9JU09TdHJpbmciLCIkYWRkVG9TZXQiLCJ1cGRhdGVFcnJvciIsIl9lcnJvciRtZXNzYWdlNCIsIl9lcnJvciRtZXNzYWdlNSIsIm1lZGljYWwucHJvY2Vzc0RvY3VtZW50IiwidGV4dEV4dHJhY3Rpb24iLCJkaWFnbm9zaXNDb3VudCIsIm1lZGljYXRpb25Db3VudCIsImxhYlJlc3VsdENvdW50IiwicGF0aWVudE1hdGNoIiwiJGVhY2giLCJkYXRhU291cmNlcyIsIm1lZGljYWxQYXR0ZXJucyIsInNvdXJjZXMiLCJ3b3JkIiwiY2hhckF0IiwicHVibGlzaCIsInNlc3Npb25zLmNyZWF0ZSIsImNyZWF0ZWRBdCIsImlzQWN0aXZlIiwibXVsdGkiLCJzZXNzaW9ucy5saXN0IiwiSW50ZWdlciIsInNlc3Npb25zIiwic2tpcCIsInRvdGFsIiwiaGFzTW9yZSIsInNlc3Npb25zLmdldCIsInNlc3Npb25zLnVwZGF0ZSIsInNlc3Npb25zLmRlbGV0ZSIsImRlbGV0ZWRNZXNzYWdlcyIsInJlbW92ZUFzeW5jIiwic2Vzc2lvbnMuc2V0QWN0aXZlIiwic2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZSIsImZpcnN0VXNlck1lc3NhZ2UiLCJzZXNzaW9ucy51cGRhdGVNZXRhZGF0YSIsInNlc3Npb25zLmV4cG9ydCIsImV4cG9ydGVkQXQiLCJzZXNzaW9ucy5pbXBvcnQiLCJuZXdTZXNzaW9uIiwiTnVtYmVyIiwiZmllbGRzIiwic3RhcnR1cCIsImNyZWF0ZUluZGV4QXN5bmMiLCJ0aGlydHlEYXlzQWdvIiwic2V0RGF0ZSIsImdldERhdGUiLCJvbGRTZXNzaW9ucyIsIiRsdCIsInRvdGFsU2Vzc2lvbnMiLCJ0b3RhbE1lc3NhZ2VzIiwiYWN0aXZlU2Vzc2lvbnMiLCJPWldFTExfRU5EUE9JTlQiLCJ0b29sQ2F0ZWdvcmllcyIsImNhdGVnb3JpemVUb29scyIsImNhdGVnb3JpZXMiLCJjYXRlZ29yeSIsImlzU2VhcmNoQW5hbHlzaXNUb29sIiwib24iLCJyZXF1aXJlIiwidGhlbiIsImV4aXQiLCJyZWFzb24iLCJwcm9taXNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBQUFBLE1BQUEsQ0FBT0MsTUFBRTtNQUFBQyxjQUE2QixFQUFBQSxDQUFBLEtBQUFBO0lBQU07SUFBQSxJQUFBQyxrQkFBdUI7SUFBQUgsTUFBQSxDQUFBSSxJQUFBO01BQUFELG1CQUFBRSxDQUFBO1FBQUFGLGtCQUFBLEdBQUFFLENBQUE7TUFBQTtJQUFBO0lBQUEsSUFBQUMsa0JBQUE7SUFBQU4sTUFBQSxDQUFBSSxJQUFBO01B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LE9BQU8sQ0FBQ3FCLEtBQUssQ0FBQyx3QkFBd0IsRUFBRUEsS0FBSyxDQUFDO1FBQzlDMkcsT0FBTyxDQUFDK1MsSUFBSSxDQUFDLENBQUMsQ0FBQztNQUNqQixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7SUFFRjtJQUNBL1MsT0FBTyxDQUFDNFMsRUFBRSxDQUFDLG1CQUFtQixFQUFHdlosS0FBSyxJQUFJO01BQ3hDckIsT0FBTyxDQUFDcUIsS0FBSyxDQUFDLHFCQUFxQixFQUFFQSxLQUFLLENBQUM7SUFDN0MsQ0FBQyxDQUFDO0lBRUYyRyxPQUFPLENBQUM0UyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQ0ksTUFBTSxFQUFFQyxPQUFPLEtBQUk7TUFDbkRqYixPQUFPLENBQUNxQixLQUFLLENBQUMseUJBQXlCLEVBQUU0WixPQUFPLEVBQUUsU0FBUyxFQUFFRCxNQUFNLENBQUM7SUFDdEUsQ0FBQyxDQUFDO0lBQUNqYyxzQkFBQTtFQUFBLFNBQUFDLFdBQUE7SUFBQSxPQUFBRCxzQkFBQSxDQUFBQyxXQUFBO0VBQUE7RUFBQUQsc0JBQUE7QUFBQTtFQUFBRSxJQUFBO0VBQUFDLEtBQUE7QUFBQSxHIiwiZmlsZSI6Ii9hcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlc0NvbGxlY3Rpb24sIE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlcy9tZXNzYWdlcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9zZXNzaW9ucy9zZXNzaW9ucyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udmVyc2F0aW9uQ29udGV4dCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICByZWNlbnRNZXNzYWdlczogTWVzc2FnZVtdO1xuICBwYXRpZW50Q29udGV4dD86IHN0cmluZztcbiAgZG9jdW1lbnRDb250ZXh0Pzogc3RyaW5nW107XG4gIG1lZGljYWxFbnRpdGllcz86IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PjtcbiAgbWF4Q29udGV4dExlbmd0aDogbnVtYmVyO1xuICB0b3RhbFRva2VuczogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1hbmFnZXIge1xuICBwcml2YXRlIHN0YXRpYyBjb250ZXh0cyA9IG5ldyBNYXA8c3RyaW5nLCBDb252ZXJzYXRpb25Db250ZXh0PigpO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQ09OVEVYVF9MRU5HVEggPSA0MDAwOyAvLyBBZGp1c3QgYmFzZWQgb24gbW9kZWxcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX01FU1NBR0VTID0gMjA7XG4gIFxuICBzdGF0aWMgYXN5bmMgZ2V0Q29udGV4dChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29udmVyc2F0aW9uQ29udGV4dD4ge1xuICAgIGxldCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIC8vIExvYWQgY29udGV4dCBmcm9tIGRhdGFiYXNlXG4gICAgICBjb250ZXh0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGV4dEZyb21EQihzZXNzaW9uSWQpO1xuICAgICAgdGhpcy5jb250ZXh0cy5zZXQoc2Vzc2lvbklkLCBjb250ZXh0KTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIGxvYWRDb250ZXh0RnJvbURCKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb252ZXJzYXRpb25Db250ZXh0PiB7XG4gICAgLy8gTG9hZCByZWNlbnQgbWVzc2FnZXNcbiAgICBjb25zdCByZWNlbnRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5maW5kKFxuICAgICAgeyBzZXNzaW9uSWQgfSxcbiAgICAgIHsgXG4gICAgICAgIHNvcnQ6IHsgdGltZXN0YW1wOiAtMSB9LCBcbiAgICAgICAgbGltaXQ6IHRoaXMuTUFYX01FU1NBR0VTIFxuICAgICAgfVxuICAgICkuZmV0Y2hBc3luYygpO1xuICAgIFxuICAgIC8vIExvYWQgc2Vzc2lvbiBtZXRhZGF0YVxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgXG4gICAgY29uc3QgY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHJlY2VudE1lc3NhZ2VzOiByZWNlbnRNZXNzYWdlcy5yZXZlcnNlKCksXG4gICAgICBtYXhDb250ZXh0TGVuZ3RoOiB0aGlzLk1BWF9DT05URVhUX0xFTkdUSCxcbiAgICAgIHRvdGFsVG9rZW5zOiAwXG4gICAgfTtcbiAgICBcbiAgICAvLyBBZGQgbWV0YWRhdGEgZnJvbSBzZXNzaW9uXG4gICAgaWYgKHNlc3Npb24/Lm1ldGFkYXRhKSB7XG4gICAgICBjb250ZXh0LnBhdGllbnRDb250ZXh0ID0gc2Vzc2lvbi5tZXRhZGF0YS5wYXRpZW50SWQ7XG4gICAgICBjb250ZXh0LmRvY3VtZW50Q29udGV4dCA9IHNlc3Npb24ubWV0YWRhdGEuZG9jdW1lbnRJZHM7XG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWVkaWNhbCBlbnRpdGllcyBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnRleHQubWVkaWNhbEVudGl0aWVzID0gdGhpcy5leHRyYWN0TWVkaWNhbEVudGl0aWVzKHJlY2VudE1lc3NhZ2VzKTtcbiAgICBcbiAgICAvLyBDYWxjdWxhdGUgdG9rZW4gdXNhZ2VcbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgXG4gICAgLy8gVHJpbSBpZiBuZWVkZWRcbiAgICB0aGlzLnRyaW1Db250ZXh0KGNvbnRleHQpO1xuICAgIFxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIFxuICBzdGF0aWMgYXN5bmMgdXBkYXRlQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgbmV3TWVzc2FnZTogTWVzc2FnZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLmdldENvbnRleHQoc2Vzc2lvbklkKTtcbiAgICBcbiAgICAvLyBBZGQgbmV3IG1lc3NhZ2VcbiAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnB1c2gobmV3TWVzc2FnZSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIG1lZGljYWwgZW50aXRpZXMgaWYgbWVzc2FnZSBjb250YWlucyB0aGVtXG4gICAgaWYgKG5ld01lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcbiAgICAgIGNvbnN0IGVudGl0aWVzID0gdGhpcy5leHRyYWN0RW50aXRpZXNGcm9tTWVzc2FnZShuZXdNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgaWYgKGVudGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29udGV4dC5tZWRpY2FsRW50aXRpZXMgPSBbXG4gICAgICAgICAgLi4uKGNvbnRleHQubWVkaWNhbEVudGl0aWVzIHx8IFtdKSxcbiAgICAgICAgICAuLi5lbnRpdGllc1xuICAgICAgICBdLnNsaWNlKC01MCk7IC8vIEtlZXAgbGFzdCA1MCBlbnRpdGllc1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBSZWNhbGN1bGF0ZSB0b2tlbnMgYW5kIHRyaW1cbiAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgdGhpcy50cmltQ29udGV4dChjb250ZXh0KTtcbiAgICBcbiAgICB0aGlzLmNvbnRleHRzLnNldChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICAgIFxuICAgIC8vIFBlcnNpc3QgaW1wb3J0YW50IGNvbnRleHQgYmFjayB0byBzZXNzaW9uXG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0Q29udGV4dChzZXNzaW9uSWQsIGNvbnRleHQpO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyB0cmltQ29udGV4dChjb250ZXh0OiBDb252ZXJzYXRpb25Db250ZXh0KSB7XG4gICAgd2hpbGUgKGNvbnRleHQudG90YWxUb2tlbnMgPiBjb250ZXh0Lm1heENvbnRleHRMZW5ndGggJiYgY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggPiAyKSB7XG4gICAgICAvLyBSZW1vdmUgb2xkZXN0IG1lc3NhZ2VzLCBidXQga2VlcCBhdCBsZWFzdCAyXG4gICAgICBjb250ZXh0LnJlY2VudE1lc3NhZ2VzLnNoaWZ0KCk7XG4gICAgICBjb250ZXh0LnRvdGFsVG9rZW5zID0gdGhpcy5jYWxjdWxhdGVUb2tlbnMoY29udGV4dCk7XG4gICAgfVxuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBjYWxjdWxhdGVUb2tlbnMoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IG51bWJlciB7XG4gICAgLy8gUm91Z2ggZXN0aW1hdGlvbjogMSB0b2tlbiDiiYggNCBjaGFyYWN0ZXJzXG4gICAgbGV0IHRvdGFsQ2hhcnMgPSAwO1xuICAgIFxuICAgIC8vIENvdW50IG1lc3NhZ2UgY29udGVudFxuICAgIHRvdGFsQ2hhcnMgKz0gY29udGV4dC5yZWNlbnRNZXNzYWdlc1xuICAgICAgLm1hcChtc2cgPT4gbXNnLmNvbnRlbnQpXG4gICAgICAuam9pbignICcpLmxlbmd0aDtcbiAgICBcbiAgICAvLyBDb3VudCBtZXRhZGF0YVxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQucGF0aWVudENvbnRleHQubGVuZ3RoICsgMjA7IC8vIEluY2x1ZGUgbGFiZWxcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQuZG9jdW1lbnRDb250ZXh0KSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQuZG9jdW1lbnRDb250ZXh0LmpvaW4oJyAnKS5sZW5ndGggKyAzMDtcbiAgICB9XG4gICAgXG4gICAgaWYgKGNvbnRleHQubWVkaWNhbEVudGl0aWVzKSB7XG4gICAgICB0b3RhbENoYXJzICs9IGNvbnRleHQubWVkaWNhbEVudGl0aWVzXG4gICAgICAgIC5tYXAoZSA9PiBgJHtlLnRleHR9ICgke2UubGFiZWx9KWApXG4gICAgICAgIC5qb2luKCcsICcpLmxlbmd0aDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIE1hdGguY2VpbCh0b3RhbENoYXJzIC8gNCk7XG4gIH1cbiAgXG4gIHN0YXRpYyBidWlsZENvbnRleHRQcm9tcHQoY29udGV4dDogQ29udmVyc2F0aW9uQ29udGV4dCk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgLy8gQWRkIHBhdGllbnQgY29udGV4dFxuICAgIGlmIChjb250ZXh0LnBhdGllbnRDb250ZXh0KSB7XG4gICAgICBwYXJ0cy5wdXNoKGBDdXJyZW50IFBhdGllbnQ6ICR7Y29udGV4dC5wYXRpZW50Q29udGV4dH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIGRvY3VtZW50IGNvbnRleHRcbiAgICBpZiAoY29udGV4dC5kb2N1bWVudENvbnRleHQgJiYgY29udGV4dC5kb2N1bWVudENvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgcGFydHMucHVzaChgUmVsYXRlZCBEb2N1bWVudHM6ICR7Y29udGV4dC5kb2N1bWVudENvbnRleHQuc2xpY2UoMCwgNSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIG1lZGljYWwgZW50aXRpZXMgc3VtbWFyeVxuICAgIGlmIChjb250ZXh0Lm1lZGljYWxFbnRpdGllcyAmJiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBlbnRpdHlTdW1tYXJ5ID0gdGhpcy5zdW1tYXJpemVNZWRpY2FsRW50aXRpZXMoY29udGV4dC5tZWRpY2FsRW50aXRpZXMpO1xuICAgICAgcGFydHMucHVzaChgTWVkaWNhbCBDb250ZXh0OiAke2VudGl0eVN1bW1hcnl9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGlmIChjb250ZXh0LnJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbiA9IGNvbnRleHQucmVjZW50TWVzc2FnZXNcbiAgICAgICAgLm1hcChtc2cgPT4gYCR7bXNnLnJvbGUgPT09ICd1c2VyJyA/ICdVc2VyJyA6ICdBc3Npc3RhbnQnfTogJHttc2cuY29udGVudH1gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICBcbiAgICAgIHBhcnRzLnB1c2goYFJlY2VudCBDb252ZXJzYXRpb246XFxuJHtjb252ZXJzYXRpb259YCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBwYXJ0cy5qb2luKCdcXG5cXG4nKTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgc3VtbWFyaXplTWVkaWNhbEVudGl0aWVzKGVudGl0aWVzOiBBcnJheTx7dGV4dDogc3RyaW5nLCBsYWJlbDogc3RyaW5nfT4pOiBzdHJpbmcge1xuICAgIGNvbnN0IGdyb3VwZWQgPSBlbnRpdGllcy5yZWR1Y2UoKGFjYywgZW50aXR5KSA9PiB7XG4gICAgICBpZiAoIWFjY1tlbnRpdHkubGFiZWxdKSB7XG4gICAgICAgIGFjY1tlbnRpdHkubGFiZWxdID0gW107XG4gICAgICB9XG4gICAgICBhY2NbZW50aXR5LmxhYmVsXS5wdXNoKGVudGl0eS50ZXh0KTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nW10+KTtcbiAgICBcbiAgICBjb25zdCBzdW1tYXJ5ID0gT2JqZWN0LmVudHJpZXMoZ3JvdXBlZClcbiAgICAgIC5tYXAoKFtsYWJlbCwgdGV4dHNdKSA9PiB7XG4gICAgICAgIGNvbnN0IHVuaXF1ZSA9IFsuLi5uZXcgU2V0KHRleHRzKV0uc2xpY2UoMCwgNSk7XG4gICAgICAgIHJldHVybiBgJHtsYWJlbH06ICR7dW5pcXVlLmpvaW4oJywgJyl9YDtcbiAgICAgIH0pXG4gICAgICAuam9pbignOyAnKTtcbiAgICBcbiAgICByZXR1cm4gc3VtbWFyeTtcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgZXh0cmFjdE1lZGljYWxFbnRpdGllcyhtZXNzYWdlczogTWVzc2FnZVtdKTogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+IHtcbiAgICBjb25zdCBlbnRpdGllczogQXJyYXk8e3RleHQ6IHN0cmluZywgbGFiZWw6IHN0cmluZ30+ID0gW107XG4gICAgXG4gICAgLy8gU2ltcGxlIGV4dHJhY3Rpb24gLSBsb29rIGZvciBwYXR0ZXJuc1xuICAgIGNvbnN0IHBhdHRlcm5zID0ge1xuICAgICAgTUVESUNBVElPTjogL1xcYihtZWRpY2F0aW9ufG1lZGljaW5lfGRydWd8cHJlc2NyaXB0aW9uKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBDT05ESVRJT046IC9cXGIoZGlhZ25vc2lzfGNvbmRpdGlvbnxkaXNlYXNlKTpcXHMqKFteLC5dKykvZ2ksXG4gICAgICBTWU1QVE9NOiAvXFxiKHN5bXB0b218Y29tcGxhaW4pOlxccyooW14sLl0rKS9naSxcbiAgICB9O1xuICAgIFxuICAgIG1lc3NhZ2VzLmZvckVhY2gobXNnID0+IHtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKS5mb3JFYWNoKChbbGFiZWwsIHBhdHRlcm5dKSA9PiB7XG4gICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHBhdHRlcm4uZXhlYyhtc2cuY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICAgICAgZW50aXRpZXMucHVzaCh7XG4gICAgICAgICAgICB0ZXh0OiBtYXRjaFsyXS50cmltKCksXG4gICAgICAgICAgICBsYWJlbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gZW50aXRpZXM7XG4gIH1cbiAgXG4gIHByaXZhdGUgc3RhdGljIGV4dHJhY3RFbnRpdGllc0Zyb21NZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiB7XG4gICAgY29uc3QgZW50aXRpZXM6IEFycmF5PHt0ZXh0OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmd9PiA9IFtdO1xuICAgIFxuICAgIC8vIExvb2sgZm9yIG1lZGljYWwgdGVybXMgaW4gdGhlIHJlc3BvbnNlXG4gICAgY29uc3QgbWVkaWNhbFRlcm1zID0ge1xuICAgICAgTUVESUNBVElPTjogWydtZWRpY2F0aW9uJywgJ3ByZXNjcmliZWQnLCAnZG9zYWdlJywgJ21nJywgJ3RhYmxldHMnXSxcbiAgICAgIENPTkRJVElPTjogWydkaWFnbm9zaXMnLCAnY29uZGl0aW9uJywgJ3N5bmRyb21lJywgJ2Rpc2Vhc2UnXSxcbiAgICAgIFBST0NFRFVSRTogWydzdXJnZXJ5JywgJ3Byb2NlZHVyZScsICd0ZXN0JywgJ2V4YW1pbmF0aW9uJ10sXG4gICAgICBTWU1QVE9NOiBbJ3BhaW4nLCAnZmV2ZXInLCAnbmF1c2VhJywgJ2ZhdGlndWUnXVxuICAgIH07XG4gICAgXG4gICAgT2JqZWN0LmVudHJpZXMobWVkaWNhbFRlcm1zKS5mb3JFYWNoKChbbGFiZWwsIHRlcm1zXSkgPT4ge1xuICAgICAgdGVybXMuZm9yRWFjaCh0ZXJtID0+IHtcbiAgICAgICAgaWYgKGNvbnRlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHNlbnRlbmNlIGNvbnRhaW5pbmcgdGhlIHRlcm1cbiAgICAgICAgICBjb25zdCBzZW50ZW5jZXMgPSBjb250ZW50LnNwbGl0KC9bLiE/XS8pO1xuICAgICAgICAgIHNlbnRlbmNlcy5mb3JFYWNoKHNlbnRlbmNlID0+IHtcbiAgICAgICAgICAgIGlmIChzZW50ZW5jZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRlcm0pKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZCA9IHNlbnRlbmNlLnRyaW0oKS5zdWJzdHJpbmcoMCwgMTAwKTtcbiAgICAgICAgICAgICAgaWYgKGV4dHJhY3RlZCkge1xuICAgICAgICAgICAgICAgIGVudGl0aWVzLnB1c2goeyB0ZXh0OiBleHRyYWN0ZWQsIGxhYmVsIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiBlbnRpdGllcztcbiAgfVxuICBcbiAgcHJpdmF0ZSBzdGF0aWMgYXN5bmMgcGVyc2lzdENvbnRleHQoc2Vzc2lvbklkOiBzdHJpbmcsIGNvbnRleHQ6IENvbnZlcnNhdGlvbkNvbnRleHQpIHtcbiAgICAvLyBVcGRhdGUgc2Vzc2lvbiB3aXRoIGxhdGVzdCBjb250ZXh0IG1ldGFkYXRhXG4gICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgJHNldDoge1xuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogY29udGV4dC5wYXRpZW50Q29udGV4dCxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogY29udGV4dC5kb2N1bWVudENvbnRleHQsXG4gICAgICAgICdtZXRhZGF0YS5sYXN0RW50aXRpZXMnOiBjb250ZXh0Lm1lZGljYWxFbnRpdGllcz8uc2xpY2UoLTEwKSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IGNvbnRleHQucmVjZW50TWVzc2FnZXNbY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGggLSAxXT8uY29udGVudC5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgbWVzc2FnZUNvdW50OiBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyBzZXNzaW9uSWQgfSksXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIFxuICBzdGF0aWMgY2xlYXJDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgdGhpcy5jb250ZXh0cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgfVxuICBcbiAgc3RhdGljIGNsZWFyQWxsQ29udGV4dHMoKSB7XG4gICAgdGhpcy5jb250ZXh0cy5jbGVhcigpO1xuICB9XG4gIFxuICBzdGF0aWMgZ2V0Q29udGV4dFN0YXRzKHNlc3Npb25JZDogc3RyaW5nKTogeyBzaXplOiBudW1iZXI7IG1lc3NhZ2VzOiBudW1iZXI7IHRva2VuczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5jb250ZXh0cy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzaXplOiB0aGlzLmNvbnRleHRzLnNpemUsXG4gICAgICBtZXNzYWdlczogY29udGV4dC5yZWNlbnRNZXNzYWdlcy5sZW5ndGgsXG4gICAgICB0b2tlbnM6IGNvbnRleHQudG90YWxUb2tlbnNcbiAgICB9O1xuICB9XG59IiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5cbmludGVyZmFjZSBNQ1BSZXF1ZXN0IHtcbiAganNvbnJwYzogJzIuMCc7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXJhbXM6IGFueTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIE1DUFJlc3BvbnNlIHtcbiAganNvbnJwYzogJzIuMCc7XG4gIHJlc3VsdD86IGFueTtcbiAgZXJyb3I/OiB7XG4gICAgY29kZTogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgfTtcbiAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEFpZGJveFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDInKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBBaWRib3ggTUNQIFNlcnZlciBhdDogJHt0aGlzLmJhc2VVcmx9YCk7XG4gICAgICBcbiAgICAgIC8vIFRlc3QgaWYgc2VydmVyIGlzIHJ1bm5pbmdcbiAgICAgIGNvbnN0IGhlYWx0aENoZWNrID0gYXdhaXQgdGhpcy5jaGVja1NlcnZlckhlYWx0aCgpO1xuICAgICAgaWYgKCFoZWFsdGhDaGVjay5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFpZGJveCBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0aWFsaXplIHRoZSBjb25uZWN0aW9uXG4gICAgICBjb25zdCBpbml0UmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHtcbiAgICAgICAgcHJvdG9jb2xWZXJzaW9uOiAnMjAyNC0xMS0wNScsXG4gICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgIHJvb3RzOiB7XG4gICAgICAgICAgICBsaXN0Q2hhbmdlZDogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNsaWVudEluZm86IHtcbiAgICAgICAgICBuYW1lOiAnbWV0ZW9yLWFpZGJveC1jbGllbnQnLFxuICAgICAgICAgIHZlcnNpb246ICcxLjAuMCdcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IE1DUCBJbml0aWFsaXplIHJlc3VsdDonLCBpbml0UmVzdWx0KTtcblxuICAgICAgLy8gU2VuZCBpbml0aWFsaXplZCBub3RpZmljYXRpb25cbiAgICAgIGF3YWl0IHRoaXMuc2VuZE5vdGlmaWNhdGlvbignaW5pdGlhbGl6ZWQnLCB7fSk7XG5cbiAgICAgIC8vIFRlc3QgYnkgbGlzdGluZyB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgICAgY29uc29sZS5sb2coYEFpZGJveCBNQ1AgQ29ubmVjdGlvbiBzdWNjZXNzZnVsISBGb3VuZCAke3Rvb2xzUmVzdWx0LnRvb2xzPy5sZW5ndGggfHwgMH0gdG9vbHNgKTtcbiAgICAgIFxuICAgICAgaWYgKHRvb2xzUmVzdWx0LnRvb2xzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQXZhaWxhYmxlIEFpZGJveCB0b29sczonKTtcbiAgICAgICAgdG9vbHNSZXN1bHQudG9vbHMuZm9yRWFjaCgodG9vbDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGNvbm5lY3QgdG8gQWlkYm94IE1DUCBTZXJ2ZXI6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja1NlcnZlckhlYWx0aCgpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L2hlYWx0aGAsIHtcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGhlYWx0aCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgY29uc29sZS5sb2coJyBBaWRib3ggTUNQIFNlcnZlciBoZWFsdGggY2hlY2sgcGFzc2VkOicsIGhlYWx0aCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgU2VydmVyIHJldHVybmVkICR7cmVzcG9uc2Uuc3RhdHVzfWAgfTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBpZCA9IHRoaXMucmVxdWVzdElkKys7XG4gICAgY29uc3QgcmVxdWVzdDogTUNQUmVxdWVzdCA9IHtcbiAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGFyYW1zLFxuICAgICAgaWRcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgc2Vzc2lvbiBJRCBpZiB3ZSBoYXZlIG9uZVxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBTZW5kaW5nIHJlcXVlc3QgdG8gQWlkYm94OiAke21ldGhvZH1gLCB7IGlkLCBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMCkgLy8gMzAgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICAvLyBFeHRyYWN0IHNlc3Npb24gSUQgZnJvbSByZXNwb25zZSBoZWFkZXJzIGlmIHByZXNlbnRcbiAgICAgIGNvbnN0IHJlc3BvbnNlU2Vzc2lvbklkID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ21jcC1zZXNzaW9uLWlkJyk7XG4gICAgICBpZiAocmVzcG9uc2VTZXNzaW9uSWQgJiYgIXRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbklkID0gcmVzcG9uc2VTZXNzaW9uSWQ7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgUmVjZWl2ZWQgQWlkYm94IHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWlkYm94IE1DUCBlcnJvciAke3Jlc3VsdC5lcnJvci5jb2RlfTogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBBaWRib3ggcmVxdWVzdCAke21ldGhvZH0gc3VjY2Vzc2Z1bGApO1xuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAgQWlkYm94IHJlcXVlc3QgZmFpbGVkIGZvciBtZXRob2QgJHttZXRob2R9OmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBub3RpZmljYXRpb24gPSB7XG4gICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIHBhcmFtc1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxpc3RUb29scygpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICB9XG5cbiAgYXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICB0aGlzLnNlc3Npb25JZCA9IG51bGw7XG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gICAgY29uc29sZS5sb2coJyBEaXNjb25uZWN0ZWQgZnJvbSBBaWRib3ggTUNQIFNlcnZlcicpO1xuICB9XG59XG5cbi8vIEFpZGJveCBGSElSIG9wZXJhdGlvbnNcbmV4cG9ydCBpbnRlcmZhY2UgQWlkYm94RkhJUk9wZXJhdGlvbnMge1xuICBzZWFyY2hQYXRpZW50cyhxdWVyeTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50RGV0YWlscyhwYXRpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlUGF0aWVudChwYXRpZW50RGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICB1cGRhdGVQYXRpZW50KHBhdGllbnRJZDogc3RyaW5nLCB1cGRhdGVzOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGdldFBhdGllbnRPYnNlcnZhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZU9ic2VydmF0aW9uKG9ic2VydmF0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGNyZWF0ZU1lZGljYXRpb25SZXF1ZXN0KG1lZGljYXRpb25EYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBjcmVhdGVDb25kaXRpb24oY29uZGl0aW9uRGF0YTogYW55KTogUHJvbWlzZTxhbnk+O1xuICBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgY3JlYXRlRW5jb3VudGVyKGVuY291bnRlckRhdGE6IGFueSk6IFByb21pc2U8YW55Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFpZGJveE9wZXJhdGlvbnMoY29ubmVjdGlvbjogQWlkYm94U2VydmVyQ29ubmVjdGlvbik6IEFpZGJveEZISVJPcGVyYXRpb25zIHtcbiAgcmV0dXJuIHtcbiAgICBhc3luYyBzZWFyY2hQYXRpZW50cyhxdWVyeTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hTZWFyY2hQYXRpZW50cycsIHF1ZXJ5KTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0UGF0aWVudERldGFpbHMocGF0aWVudElkOiBzdHJpbmcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveEdldFBhdGllbnREZXRhaWxzJywgeyBwYXRpZW50SWQgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZVBhdGllbnQocGF0aWVudERhdGE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnYWlkYm94Q3JlYXRlUGF0aWVudCcsIHBhdGllbnREYXRhKTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgdXBkYXRlUGF0aWVudChwYXRpZW50SWQ6IHN0cmluZywgdXBkYXRlczogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hVcGRhdGVQYXRpZW50JywgeyBwYXRpZW50SWQsIC4uLnVwZGF0ZXMgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRPYnNlcnZhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgeyBwYXRpZW50SWQsIC4uLm9wdGlvbnMgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZU9ic2VydmF0aW9uKG9ic2VydmF0aW9uRGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hDcmVhdGVPYnNlcnZhdGlvbicsIG9ic2VydmF0aW9uRGF0YSk7XG4gICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGdldFBhdGllbnRNZWRpY2F0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FpZGJveEdldFBhdGllbnRNZWRpY2F0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdChtZWRpY2F0aW9uRGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hDcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsIG1lZGljYXRpb25EYXRhKTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0UGF0aWVudENvbmRpdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50Q29uZGl0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVDb25kaXRpb24oY29uZGl0aW9uRGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hDcmVhdGVDb25kaXRpb24nLCBjb25kaXRpb25EYXRhKTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0UGF0aWVudEVuY291bnRlcnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hHZXRQYXRpZW50RW5jb3VudGVycycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVFbmNvdW50ZXIoZW5jb3VudGVyRGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdhaWRib3hDcmVhdGVFbmNvdW50ZXInLCBlbmNvdW50ZXJEYXRhKTtcbiAgICAgIHJldHVybiByZXN1bHQuY29udGVudD8uWzBdPy50ZXh0ID8gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KSA6IHJlc3VsdDtcbiAgICB9XG4gIH07XG59IiwiaW50ZXJmYWNlIE1DUFJlcXVlc3Qge1xuICAgIGpzb25ycGM6ICcyLjAnO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIHBhcmFtczogYW55O1xuICAgIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIH1cbiAgXG4gIGludGVyZmFjZSBNQ1BSZXNwb25zZSB7XG4gICAganNvbnJwYzogJzIuMCc7XG4gICAgcmVzdWx0PzogYW55O1xuICAgIGVycm9yPzoge1xuICAgICAgY29kZTogbnVtYmVyO1xuICAgICAgbWVzc2FnZTogc3RyaW5nO1xuICAgIH07XG4gICAgaWQ6IHN0cmluZyB8IG51bWJlcjtcbiAgfVxuICBcbiAgZXhwb3J0IGNsYXNzIEVwaWNTZXJ2ZXJDb25uZWN0aW9uIHtcbiAgICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgICBwcml2YXRlIHNlc3Npb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gICAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuICBcbiAgICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcgPSAnaHR0cDovL2xvY2FsaG9zdDozMDAzJykge1xuICAgICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgICB9XG4gIFxuICAgIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PpSBDb25uZWN0aW5nIHRvIEVwaWMgTUNQIFNlcnZlciBhdDogJHt0aGlzLmJhc2VVcmx9YCk7XG4gICAgICAgIFxuICAgICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICAgIGNvbnN0IGhlYWx0aENoZWNrID0gYXdhaXQgdGhpcy5jaGVja1NlcnZlckhlYWx0aCgpO1xuICAgICAgICBpZiAoIWhlYWx0aENoZWNrLm9rKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcGljIE1DUCBTZXJ2ZXIgbm90IHJlc3BvbmRpbmcgYXQgJHt0aGlzLmJhc2VVcmx9OiAke2hlYWx0aENoZWNrLmVycm9yfWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICAvLyBJbml0aWFsaXplIHRoZSBjb25uZWN0aW9uXG4gICAgICAgIGNvbnN0IGluaXRSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCdpbml0aWFsaXplJywge1xuICAgICAgICAgIHByb3RvY29sVmVyc2lvbjogJzIwMjQtMTEtMDUnLFxuICAgICAgICAgIGNhcGFiaWxpdGllczoge1xuICAgICAgICAgICAgcm9vdHM6IHtcbiAgICAgICAgICAgICAgbGlzdENoYW5nZWQ6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBjbGllbnRJbmZvOiB7XG4gICAgICAgICAgICBuYW1lOiAnbWV0ZW9yLWVwaWMtY2xpZW50JyxcbiAgICAgICAgICAgIHZlcnNpb246ICcxLjAuMCdcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgY29uc29sZS5sb2coJyBFcGljIE1DUCBJbml0aWFsaXplIHJlc3VsdDonLCBpbml0UmVzdWx0KTtcbiAgXG4gICAgICAgIC8vIFNlbmQgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uXG4gICAgICAgIGF3YWl0IHRoaXMuc2VuZE5vdGlmaWNhdGlvbignaW5pdGlhbGl6ZWQnLCB7fSk7XG4gIFxuICAgICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9saXN0Jywge30pO1xuICAgICAgICBjb25zb2xlLmxvZyhgIEVwaWMgTUNQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICAgIFxuICAgICAgICBpZiAodG9vbHNSZXN1bHQudG9vbHMpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnIEF2YWlsYWJsZSBFcGljIHRvb2xzOicpO1xuICAgICAgICAgIHRvb2xzUmVzdWx0LnRvb2xzLmZvckVhY2goKHRvb2w6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gIFxuICAgICAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyBGYWlsZWQgdG8gY29ubmVjdCB0byBFcGljIE1DUCBTZXJ2ZXI6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vaGVhbHRoYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSAvLyA1IHNlY29uZCB0aW1lb3V0XG4gICAgICAgIH0pO1xuICBcbiAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdFcGljIE1DUCBTZXJ2ZXIgaGVhbHRoIGNoZWNrIHBhc3NlZDonLCBoZWFsdGgpO1xuICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYFNlcnZlciByZXR1cm5lZCAke3Jlc3BvbnNlLnN0YXR1c31gIH07XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgICAgaWYgKCF0aGlzLmJhc2VVcmwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgICAgfVxuICBcbiAgICAgIGNvbnN0IGlkID0gdGhpcy5yZXF1ZXN0SWQrKztcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IE1DUFJlcXVlc3QgPSB7XG4gICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIHBhcmFtcyxcbiAgICAgICAgaWRcbiAgICAgIH07XG4gIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH07XG4gIFxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgICAgICBoZWFkZXJzWydtY3Atc2Vzc2lvbi1pZCddID0gdGhpcy5zZXNzaW9uSWQ7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKGAgU2VuZGluZyByZXF1ZXN0IHRvIEVwaWMgTUNQOiAke21ldGhvZH1gLCB7IGlkLCBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH0pO1xuICBcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmJhc2VVcmx9L21jcGAsIHtcbiAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICBoZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3QpLFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMCkgLy8gMzAgc2Vjb25kIHRpbWVvdXRcbiAgICAgICAgfSk7XG4gIFxuICAgICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgICBpZiAocmVzcG9uc2VTZXNzaW9uSWQgJiYgIXRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgdGhpcy5zZXNzaW9uSWQgPSByZXNwb25zZVNlc3Npb25JZDtcbiAgICAgICAgICBjb25zb2xlLmxvZygnIFJlY2VpdmVkIEVwaWMgc2Vzc2lvbiBJRDonLCB0aGlzLnNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgICB9XG4gIFxuICAgICAgICBjb25zdCByZXN1bHQ6IE1DUFJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICBcbiAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGNvbnNvbGUubG9nKGAgRXBpYyByZXF1ZXN0ICR7bWV0aG9kfSBzdWNjZXNzZnVsYCk7XG4gICAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgIEVwaWMgcmVxdWVzdCBmYWlsZWQgZm9yIG1ldGhvZCAke21ldGhvZH06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHByaXZhdGUgYXN5bmMgc2VuZE5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgcGFyYW1zXG4gICAgICB9O1xuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfTtcbiAgXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgICAgfVxuICBcbiAgICAgICAgYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9tY3BgLCB7XG4gICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShub3RpZmljYXRpb24pLFxuICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEVwaWMgbm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgXG4gICAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VwaWMgTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIH1cbiAgXG4gICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICB9XG4gIFxuICAgIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIGlmICghdGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgfVxuICBcbiAgICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgICBuYW1lLFxuICAgICAgICBhcmd1bWVudHM6IGFyZ3NcbiAgICAgIH0pO1xuICAgIH1cbiAgXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICAgIHRoaXMuaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgY29uc29sZS5sb2coJyBEaXNjb25uZWN0ZWQgZnJvbSBFcGljIE1DUCBTZXJ2ZXInKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEVwaWMgRkhJUiBvcGVyYXRpb25zIGludGVyZmFjZVxuICBleHBvcnQgaW50ZXJmYWNlIEVwaWNGSElST3BlcmF0aW9ucyB7XG4gICAgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50RGV0YWlscyhwYXRpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50T2JzZXJ2YXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICAgIGdldFBhdGllbnRNZWRpY2F0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50Q29uZGl0aW9ucyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgICBnZXRQYXRpZW50RW5jb3VudGVycyhwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUVwaWNPcGVyYXRpb25zKGNvbm5lY3Rpb246IEVwaWNTZXJ2ZXJDb25uZWN0aW9uKTogRXBpY0ZISVJPcGVyYXRpb25zIHtcbiAgICByZXR1cm4ge1xuICAgICAgYXN5bmMgc2VhcmNoUGF0aWVudHMocXVlcnk6IGFueSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdzZWFyY2hQYXRpZW50cycsIHF1ZXJ5KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50RGV0YWlscyhwYXRpZW50SWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50RGV0YWlscycsIHsgcGF0aWVudElkIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9LFxuICBcbiAgICAgIGFzeW5jIGdldFBhdGllbnRPYnNlcnZhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCB7IHBhdGllbnRJZCwgLi4ub3B0aW9ucyB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50Py5bMF0/LnRleHQgPyBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpIDogcmVzdWx0O1xuICAgICAgfSxcbiAgXG4gICAgICBhc3luYyBnZXRQYXRpZW50TWVkaWNhdGlvbnMocGF0aWVudElkOiBzdHJpbmcsIG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9LFxuICBcbiAgICAgIGFzeW5jIGdldFBhdGllbnRDb25kaXRpb25zKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50Q29uZGl0aW9ucycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9LFxuICBcbiAgICAgIGFzeW5jIGdldFBhdGllbnRFbmNvdW50ZXJzKHBhdGllbnRJZDogc3RyaW5nLCBvcHRpb25zOiBhbnkgPSB7fSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdnZXRQYXRpZW50RW5jb3VudGVycycsIHsgcGF0aWVudElkLCAuLi5vcHRpb25zIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNvbnRlbnQ/LlswXT8udGV4dCA/IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCkgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgfTtcbiAgfSIsImltcG9ydCBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHsgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24sIE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMsIGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zIH0gZnJvbSAnLi9tZWRpY2FsU2VydmVyQ29ubmVjdGlvbic7XG5pbXBvcnQgeyBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uLCBBaWRib3hGSElST3BlcmF0aW9ucywgY3JlYXRlQWlkYm94T3BlcmF0aW9ucyB9IGZyb20gJy4vYWlkYm94U2VydmVyQ29ubmVjdGlvbic7XG5pbXBvcnQgeyBFcGljU2VydmVyQ29ubmVjdGlvbiwgRXBpY0ZISVJPcGVyYXRpb25zLCBjcmVhdGVFcGljT3BlcmF0aW9ucyB9IGZyb20gJy4vZXBpY1NlcnZlckNvbm5lY3Rpb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1DUENsaWVudENvbmZpZyB7XG4gIHByb3ZpZGVyOiAnYW50aHJvcGljJyB8ICdvendlbGwnO1xuICBhcGlLZXk6IHN0cmluZztcbiAgb3p3ZWxsRW5kcG9pbnQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBNQ1BDbGllbnRNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBhbnRocm9waWM/OiBBbnRocm9waWM7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIGNvbmZpZz86IE1DUENsaWVudENvbmZpZztcbiAgXG4gIC8vIE1lZGljYWwgTUNQIGNvbm5lY3Rpb24gKFN0cmVhbWFibGUgSFRUUClcbiAgcHJpdmF0ZSBtZWRpY2FsQ29ubmVjdGlvbj86IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIG1lZGljYWxPcGVyYXRpb25zPzogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucztcbiAgcHJpdmF0ZSBhdmFpbGFibGVUb29sczogYW55W10gPSBbXTtcblxuICAvLyBBaWRib3ggTUNQIGNvbm5lY3Rpb25cbiAgcHJpdmF0ZSBhaWRib3hDb25uZWN0aW9uPzogQWlkYm94U2VydmVyQ29ubmVjdGlvbjtcbiAgcHJpdmF0ZSBhaWRib3hPcGVyYXRpb25zPzogQWlkYm94RkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgYWlkYm94VG9vbHM6IGFueVtdID0gW107XG5cbiAgLy8gRXBpYyBNQ1AgY29ubmVjdGlvblxuICBwcml2YXRlIGVwaWNDb25uZWN0aW9uPzogRXBpY1NlcnZlckNvbm5lY3Rpb247XG4gIHByaXZhdGUgZXBpY09wZXJhdGlvbnM/OiBFcGljRkhJUk9wZXJhdGlvbnM7XG4gIHByaXZhdGUgZXBpY1Rvb2xzOiBhbnlbXSA9IFtdO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7fVxuXG4gIHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogTUNQQ2xpZW50TWFuYWdlciB7XG4gICAgaWYgKCFNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlKSB7XG4gICAgICBNQ1BDbGllbnRNYW5hZ2VyLmluc3RhbmNlID0gbmV3IE1DUENsaWVudE1hbmFnZXIoKTtcbiAgICB9XG4gICAgcmV0dXJuIE1DUENsaWVudE1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZShjb25maWc6IE1DUENsaWVudENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKCcgSW5pdGlhbGl6aW5nIE1DUCBDbGllbnQgd2l0aCBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbicpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmIChjb25maWcucHJvdmlkZXIgPT09ICdhbnRocm9waWMnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdDcmVhdGluZyBBbnRocm9waWMgY2xpZW50IHdpdGggbmF0aXZlIHRvb2wgY2FsbGluZyBzdXBwb3J0Li4uJyk7XG4gICAgICAgIHRoaXMuYW50aHJvcGljID0gbmV3IEFudGhyb3BpYyh7XG4gICAgICAgICAgYXBpS2V5OiBjb25maWcuYXBpS2V5LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc29sZS5sb2coJyBBbnRocm9waWMgY2xpZW50IGluaXRpYWxpemVkIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24nKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUubG9nKGBNQ1AgQ2xpZW50IHJlYWR5IHdpdGggcHJvdmlkZXI6ICR7Y29uZmlnLnByb3ZpZGVyfWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGluaXRpYWxpemUgTUNQIGNsaWVudDonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyBDb25uZWN0IHRvIG1lZGljYWwgTUNQIHNlcnZlciBhbmQgZ2V0IGFsbCBhdmFpbGFibGUgdG9vbHNcbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb01lZGljYWxTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBtY3BTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDA1JztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBhdDogJHttY3BTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMubWVkaWNhbENvbm5lY3Rpb24gPSBuZXcgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24obWNwU2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5tZWRpY2FsT3BlcmF0aW9ucyA9IGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKHRoaXMubWVkaWNhbENvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgYWxsIGF2YWlsYWJsZSB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRvb2xzUmVzdWx0LnRvb2xzIHx8IFtdO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RlZCB3aXRoICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IG1lZGljYWwgdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhgIE1lZGljYWwgdG9vbCBuYW1lczogJHt0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgTWVkaWNhbCBNQ1AgU2VydmVyIEhUVFAgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb0FpZGJveFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSAoZ2xvYmFsIGFzIGFueSkuTWV0ZW9yPy5zZXR0aW5ncz8ucHJpdmF0ZTtcbiAgICAgIGNvbnN0IGFpZGJveFNlcnZlclVybCA9IHNldHRpbmdzPy5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkFJREJPWF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMic7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBBaWRib3ggTUNQIFNlcnZlciBhdDogJHthaWRib3hTZXJ2ZXJVcmx9YCk7XG4gICAgICBcbiAgICAgIHRoaXMuYWlkYm94Q29ubmVjdGlvbiA9IG5ldyBBaWRib3hTZXJ2ZXJDb25uZWN0aW9uKGFpZGJveFNlcnZlclVybCk7XG4gICAgICBhd2FpdCB0aGlzLmFpZGJveENvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5haWRib3hPcGVyYXRpb25zID0gY3JlYXRlQWlkYm94T3BlcmF0aW9ucyh0aGlzLmFpZGJveENvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgQWlkYm94IHRvb2xzXG4gICAgICBjb25zdCB0b29sc1Jlc3VsdCA9IGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5saXN0VG9vbHMoKTtcbiAgICAgIHRoaXMuYWlkYm94VG9vbHMgPSB0b29sc1Jlc3VsdC50b29scyB8fCBbXTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0ZWQgdG8gQWlkYm94IHdpdGggJHt0aGlzLmFpZGJveFRvb2xzLmxlbmd0aH0gdG9vbHMgYXZhaWxhYmxlYCk7XG4gICAgICBjb25zb2xlLmxvZyhgIEFpZGJveCB0b29sIG5hbWVzOiAke3RoaXMuYWlkYm94VG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICAvLyBNZXJnZSB3aXRoIGV4aXN0aW5nIHRvb2xzLCBlbnN1cmluZyB1bmlxdWUgbmFtZXNcbiAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMgPSB0aGlzLm1lcmdlVG9vbHNVbmlxdWUodGhpcy5hdmFpbGFibGVUb29scywgdGhpcy5haWRib3hUb29scyk7XG4gICAgICBcbiAgICAgIHRoaXMubG9nQXZhaWxhYmxlVG9vbHMoKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgQWlkYm94IE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGNvbm5lY3RUb0VwaWNTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gKGdsb2JhbCBhcyBhbnkpLk1ldGVvcj8uc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgICBjb25zdCBlcGljU2VydmVyVXJsID0gc2V0dGluZ3M/LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5FUElDX01DUF9TRVJWRVJfVVJMIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMyc7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBFcGljIE1DUCBTZXJ2ZXIgYXQ6ICR7ZXBpY1NlcnZlclVybH1gKTtcbiAgICAgIFxuICAgICAgdGhpcy5lcGljQ29ubmVjdGlvbiA9IG5ldyBFcGljU2VydmVyQ29ubmVjdGlvbihlcGljU2VydmVyVXJsKTtcbiAgICAgIGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24uY29ubmVjdCgpO1xuICAgICAgdGhpcy5lcGljT3BlcmF0aW9ucyA9IGNyZWF0ZUVwaWNPcGVyYXRpb25zKHRoaXMuZXBpY0Nvbm5lY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBHZXQgRXBpYyB0b29sc1xuICAgICAgY29uc3QgdG9vbHNSZXN1bHQgPSBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmxpc3RUb29scygpO1xuICAgICAgdGhpcy5lcGljVG9vbHMgPSB0b29sc1Jlc3VsdC50b29scyB8fCBbXTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0ZWQgdG8gRXBpYyB3aXRoICR7dGhpcy5lcGljVG9vbHMubGVuZ3RofSB0b29scyBhdmFpbGFibGVgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgRXBpYyB0b29sIG5hbWVzOiAke3RoaXMuZXBpY1Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKX1gKTtcbiAgICAgIFxuICAgICAgLy8gTWVyZ2Ugd2l0aCBleGlzdGluZyB0b29scywgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gdGhpcy5tZXJnZVRvb2xzVW5pcXVlKHRoaXMuYXZhaWxhYmxlVG9vbHMsIHRoaXMuZXBpY1Rvb2xzKTtcbiAgICAgIFxuICAgICAgdGhpcy5sb2dBdmFpbGFibGVUb29scygpO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBFcGljIE1DUCBTZXJ2ZXIgY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVyZ2UgdG9vbHMgZW5zdXJpbmcgdW5pcXVlIG5hbWVzXG4gIHByaXZhdGUgbWVyZ2VUb29sc1VuaXF1ZShleGlzdGluZ1Rvb2xzOiBhbnlbXSwgbmV3VG9vbHM6IGFueVtdKTogYW55W10ge1xuICAgIGNvbnNvbGUubG9nKGDwn5SnIE1lcmdpbmcgdG9vbHM6ICR7ZXhpc3RpbmdUb29scy5sZW5ndGh9IGV4aXN0aW5nICsgJHtuZXdUb29scy5sZW5ndGh9IG5ld2ApO1xuICAgIFxuICAgIGNvbnN0IHRvb2xOYW1lU2V0ID0gbmV3IFNldChleGlzdGluZ1Rvb2xzLm1hcCh0b29sID0+IHRvb2wubmFtZSkpO1xuICAgIGNvbnN0IHVuaXF1ZU5ld1Rvb2xzID0gbmV3VG9vbHMuZmlsdGVyKHRvb2wgPT4ge1xuICAgICAgaWYgKHRvb2xOYW1lU2V0Lmhhcyh0b29sLm5hbWUpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgIER1cGxpY2F0ZSB0b29sIG5hbWUgZm91bmQ6ICR7dG9vbC5uYW1lfSAtIHNraXBwaW5nIGR1cGxpY2F0ZWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICB0b29sTmFtZVNldC5hZGQodG9vbC5uYW1lKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IG1lcmdlZFRvb2xzID0gWy4uLmV4aXN0aW5nVG9vbHMsIC4uLnVuaXF1ZU5ld1Rvb2xzXTtcbiAgICBjb25zb2xlLmxvZyhgIE1lcmdlZCB0b29sczogJHtleGlzdGluZ1Rvb2xzLmxlbmd0aH0gZXhpc3RpbmcgKyAke3VuaXF1ZU5ld1Rvb2xzLmxlbmd0aH0gbmV3ID0gJHttZXJnZWRUb29scy5sZW5ndGh9IHRvdGFsYCk7XG4gICAgXG4gICAgcmV0dXJuIG1lcmdlZFRvb2xzO1xuICB9XG5cbnByaXZhdGUgbG9nQXZhaWxhYmxlVG9vbHMoKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKCdcXG4gQXZhaWxhYmxlIFRvb2xzIGZvciBJbnRlbGxpZ2VudCBTZWxlY3Rpb246Jyk7XG4gIFxuICAvLyBTZXBhcmF0ZSB0b29scyBieSBhY3R1YWwgc291cmNlL3R5cGUsIG5vdCBieSBwYXR0ZXJuIG1hdGNoaW5nXG4gIGNvbnN0IGVwaWNUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpXG4gICk7XG4gIFxuICBjb25zdCBhaWRib3hUb29scyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmlsdGVyKHQgPT4gXG4gICAgdGhpcy5pc0FpZGJveEZISVJUb29sKHQpICYmICF0Lm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdlcGljJylcbiAgKTtcbiAgXG4gIGNvbnN0IGRvY3VtZW50VG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNEb2N1bWVudFRvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IGFuYWx5c2lzVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgIHRoaXMuaXNBbmFseXNpc1Rvb2wodClcbiAgKTtcbiAgXG4gIGNvbnN0IG90aGVyVG9vbHMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLmZpbHRlcih0ID0+IFxuICAgICFlcGljVG9vbHMuaW5jbHVkZXModCkgJiYgXG4gICAgIWFpZGJveFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFkb2N1bWVudFRvb2xzLmluY2x1ZGVzKHQpICYmIFxuICAgICFhbmFseXNpc1Rvb2xzLmluY2x1ZGVzKHQpXG4gICk7XG4gIFxuICBpZiAoYWlkYm94VG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IEZISVIgVG9vbHM6Jyk7XG4gICAgYWlkYm94VG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKGVwaWNUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJyBFcGljIEVIUiBUb29sczonKTtcbiAgICBlcGljVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgaWYgKGRvY3VtZW50VG9vbHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCcgRG9jdW1lbnQgVG9vbHM6Jyk7XG4gICAgZG9jdW1lbnRUb29scy5mb3JFYWNoKHRvb2wgPT4gY29uc29sZS5sb2coYCAgIOKAoiAke3Rvb2wubmFtZX0gLSAke3Rvb2wuZGVzY3JpcHRpb24/LnN1YnN0cmluZygwLCA2MCl9Li4uYCkpO1xuICB9XG4gIFxuICBpZiAoYW5hbHlzaXNUb29scy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5sb2coJyBTZWFyY2ggJiBBbmFseXNpcyBUb29sczonKTtcbiAgICBhbmFseXNpc1Rvb2xzLmZvckVhY2godG9vbCA9PiBjb25zb2xlLmxvZyhgICAg4oCiICR7dG9vbC5uYW1lfSAtICR7dG9vbC5kZXNjcmlwdGlvbj8uc3Vic3RyaW5nKDAsIDYwKX0uLi5gKSk7XG4gIH1cbiAgXG4gIGlmIChvdGhlclRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLmxvZygnIE90aGVyIFRvb2xzOicpO1xuICAgIG90aGVyVG9vbHMuZm9yRWFjaCh0b29sID0+IGNvbnNvbGUubG9nKGAgICDigKIgJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9uPy5zdWJzdHJpbmcoMCwgNjApfS4uLmApKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYFxcbiBDbGF1ZGUgd2lsbCBpbnRlbGxpZ2VudGx5IHNlbGVjdCBmcm9tICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IHRvdGFsIHRvb2xzIGJhc2VkIG9uIHVzZXIgcXVlcmllc2ApO1xuICBcbiAgLy8gRGVidWc6IENoZWNrIGZvciBkdXBsaWNhdGVzXG4gIHRoaXMuZGVidWdUb29sRHVwbGljYXRlcygpO1xufVxuXG4vLyBBZGQgdGhlc2UgaGVscGVyIG1ldGhvZHMgdG8gTUNQQ2xpZW50TWFuYWdlciBjbGFzc1xucHJpdmF0ZSBpc0FpZGJveEZISVJUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhaWRib3hGSElSVG9vbE5hbWVzID0gW1xuICAgICdzZWFyY2hQYXRpZW50cycsICdnZXRQYXRpZW50RGV0YWlscycsICdjcmVhdGVQYXRpZW50JywgJ3VwZGF0ZVBhdGllbnQnLFxuICAgICdnZXRQYXRpZW50T2JzZXJ2YXRpb25zJywgJ2NyZWF0ZU9ic2VydmF0aW9uJyxcbiAgICAnZ2V0UGF0aWVudE1lZGljYXRpb25zJywgJ2NyZWF0ZU1lZGljYXRpb25SZXF1ZXN0JyxcbiAgICAnZ2V0UGF0aWVudENvbmRpdGlvbnMnLCAnY3JlYXRlQ29uZGl0aW9uJyxcbiAgICAnZ2V0UGF0aWVudEVuY291bnRlcnMnLCAnY3JlYXRlRW5jb3VudGVyJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFpZGJveEZISVJUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0RvY3VtZW50VG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgZG9jdW1lbnRUb29sTmFtZXMgPSBbXG4gICAgJ3VwbG9hZERvY3VtZW50JywgJ3NlYXJjaERvY3VtZW50cycsICdsaXN0RG9jdW1lbnRzJyxcbiAgICAnY2h1bmtBbmRFbWJlZERvY3VtZW50JywgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnXG4gIF07XG4gIFxuICByZXR1cm4gZG9jdW1lbnRUb29sTmFtZXMuaW5jbHVkZXModG9vbC5uYW1lKTtcbn1cblxucHJpdmF0ZSBpc0FuYWx5c2lzVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYW5hbHlzaXNUb29sTmFtZXMgPSBbXG4gICAgJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsICdmaW5kU2ltaWxhckNhc2VzJywgJ2dldE1lZGljYWxJbnNpZ2h0cycsXG4gICAgJ2V4dHJhY3RNZWRpY2FsRW50aXRpZXMnLCAnc2VtYW50aWNTZWFyY2hMb2NhbCdcbiAgXTtcbiAgXG4gIHJldHVybiBhbmFseXNpc1Rvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpO1xufVxuXG4gIC8vIERlYnVnIG1ldGhvZCB0byBpZGVudGlmeSBkdXBsaWNhdGUgdG9vbHNcbiAgcHJpdmF0ZSBkZWJ1Z1Rvb2xEdXBsaWNhdGVzKCk6IHZvaWQge1xuICAgIGNvbnN0IHRvb2xOYW1lcyA9IHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gdC5uYW1lKTtcbiAgICBjb25zdCBuYW1lQ291bnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAgIFxuICAgIHRvb2xOYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgbmFtZUNvdW50LnNldChuYW1lLCAobmFtZUNvdW50LmdldChuYW1lKSB8fCAwKSArIDEpO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGR1cGxpY2F0ZXMgPSBBcnJheS5mcm9tKG5hbWVDb3VudC5lbnRyaWVzKCkpXG4gICAgICAuZmlsdGVyKChbbmFtZSwgY291bnRdKSA9PiBjb3VudCA+IDEpO1xuICAgIFxuICAgIGlmIChkdXBsaWNhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyBEVVBMSUNBVEUgVE9PTCBOQU1FUyBGT1VORDonKTtcbiAgICAgIGR1cGxpY2F0ZXMuZm9yRWFjaCgoW25hbWUsIGNvdW50XSkgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgIOKAoiAke25hbWV9OiBhcHBlYXJzICR7Y291bnR9IHRpbWVzYCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgdG9vbCBuYW1lcyBhcmUgdW5pcXVlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBzcGVjaWZpZWQgZGF0YSBzb3VyY2VcbiAgcHJpdmF0ZSBmaWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29sczogYW55W10sIGRhdGFTb3VyY2U6IHN0cmluZyk6IGFueVtdIHtcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtb25nb2RiJykgfHwgZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICAvLyBVc2VyIHdhbnRzIE1vbmdvREIvQXRsYXMgLSByZXR1cm4gb25seSBkb2N1bWVudCB0b29sc1xuICAgICAgcmV0dXJuIHRvb2xzLmZpbHRlcih0b29sID0+IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0RvY3VtZW50JykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnc2VhcmNoJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygndXBsb2FkJykgfHwgXG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZXh0cmFjdCcpIHx8IFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ01lZGljYWwnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ1NpbWlsYXInKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ0luc2lnaHQnKSB8fFxuICAgICAgICAodG9vbC5uYW1lLmluY2x1ZGVzKCdzZWFyY2gnKSAmJiAhdG9vbC5uYW1lLmluY2x1ZGVzKCdQYXRpZW50JykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBpZiAoZGF0YVNvdXJjZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhaWRib3gnKSB8fCBkYXRhU291cmNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2ZoaXInKSkge1xuICAgICAgLy8gVXNlciB3YW50cyBBaWRib3ggLSByZXR1cm4gb25seSBGSElSIHRvb2xzXG4gICAgICByZXR1cm4gdG9vbHMuZmlsdGVyKHRvb2wgPT4gXG4gICAgICAgICh0b29sLm5hbWUuaW5jbHVkZXMoJ1BhdGllbnQnKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnT2JzZXJ2YXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnTWVkaWNhdGlvbicpIHx8IFxuICAgICAgICAgdG9vbC5uYW1lLmluY2x1ZGVzKCdDb25kaXRpb24nKSB8fCBcbiAgICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnRW5jb3VudGVyJykgfHxcbiAgICAgICAgIHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJykgJiZcbiAgICAgICAgIXRvb2wuZGVzY3JpcHRpb24/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VwaWMnKVxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8IGRhdGFTb3VyY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICAgIC8vIFVzZXIgd2FudHMgRXBpYyAtIHJldHVybiBvbmx5IEVwaWMgdG9vbHNcbiAgICAgIHJldHVybiB0b29scy5maWx0ZXIodG9vbCA9PiBcbiAgICAgICAgdG9vbC5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXBpYycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudERldGFpbHMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRPYnNlcnZhdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRNZWRpY2F0aW9ucycpIHx8XG4gICAgICAgIHRvb2wubmFtZS5pbmNsdWRlcygnZ2V0UGF0aWVudENvbmRpdGlvbnMnKSB8fFxuICAgICAgICB0b29sLm5hbWUuaW5jbHVkZXMoJ2dldFBhdGllbnRFbmNvdW50ZXJzJykgfHxcbiAgICAgICAgKHRvb2wubmFtZSA9PT0gJ3NlYXJjaFBhdGllbnRzJyAmJiB0b29sLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykpXG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICAvLyBObyBzcGVjaWZpYyBwcmVmZXJlbmNlLCByZXR1cm4gYWxsIHRvb2xzXG4gICAgcmV0dXJuIHRvb2xzO1xuICB9XG5cbiAgLy8gQW5hbHl6ZSBxdWVyeSB0byB1bmRlcnN0YW5kIHVzZXIncyBpbnRlbnQgYWJvdXQgZGF0YSBzb3VyY2VzXG4gIHByaXZhdGUgYW5hbHl6ZVF1ZXJ5SW50ZW50KHF1ZXJ5OiBzdHJpbmcpOiB7IGRhdGFTb3VyY2U/OiBzdHJpbmc7IGludGVudD86IHN0cmluZyB9IHtcbiAgICBjb25zdCBsb3dlclF1ZXJ5ID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZXhwbGljaXQgZGF0YSBzb3VyY2UgbWVudGlvbnNcbiAgICBpZiAobG93ZXJRdWVyeS5pbmNsdWRlcygnZXBpYycpIHx8IGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2VocicpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnRXBpYyBFSFInLFxuICAgICAgICBpbnRlbnQ6ICdTZWFyY2ggRXBpYyBFSFIgcGF0aWVudCBkYXRhJ1xuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ21vbmdvZGInKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhdGxhcycpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcycsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCB1cGxvYWRlZCBkb2N1bWVudHMgYW5kIG1lZGljYWwgcmVjb3JkcydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdhaWRib3gnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaGlyJykpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdBaWRib3ggRkhJUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBzdHJ1Y3R1cmVkIHBhdGllbnQgZGF0YSdcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBkb2N1bWVudC1yZWxhdGVkIHRlcm1zXG4gICAgaWYgKGxvd2VyUXVlcnkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygndXBsb2FkJykgfHwgbG93ZXJRdWVyeS5pbmNsdWRlcygnZmlsZScpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkYXRhU291cmNlOiAnTW9uZ29EQiBBdGxhcyAoZG9jdW1lbnRzKScsXG4gICAgICAgIGludGVudDogJ1dvcmsgd2l0aCB1cGxvYWRlZCBtZWRpY2FsIGRvY3VtZW50cydcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBwYXRpZW50IHNlYXJjaCBwYXR0ZXJuc1xuICAgIGlmIChsb3dlclF1ZXJ5LmluY2x1ZGVzKCdzZWFyY2ggZm9yIHBhdGllbnQnKSB8fCBsb3dlclF1ZXJ5LmluY2x1ZGVzKCdmaW5kIHBhdGllbnQnKSkge1xuICAgICAgLy8gRGVmYXVsdCB0byBFcGljIGZvciBwYXRpZW50IHNlYXJjaGVzIHVubGVzcyBzcGVjaWZpZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFTb3VyY2U6ICdFcGljIEVIUicsXG4gICAgICAgIGludGVudDogJ1NlYXJjaCBmb3IgcGF0aWVudCBpbmZvcm1hdGlvbidcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIC8vIENvbnZlcnQgdG9vbHMgdG8gQW50aHJvcGljIGZvcm1hdCB3aXRoIHN0cmljdCBkZWR1cGxpY2F0aW9uXG4gIHByaXZhdGUgZ2V0QW50aHJvcGljVG9vbHMoKTogYW55W10ge1xuICAgIC8vIFVzZSBNYXAgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgYnkgdG9vbCBuYW1lXG4gICAgY29uc3QgdW5pcXVlVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgYW55PigpO1xuICAgIFxuICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgIGlmICghdW5pcXVlVG9vbHMuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgdW5pcXVlVG9vbHMuc2V0KHRvb2wubmFtZSwge1xuICAgICAgICAgIG5hbWU6IHRvb2wubmFtZSxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcbiAgICAgICAgICBpbnB1dF9zY2hlbWE6IHtcbiAgICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB0b29sLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIHx8IHt9LFxuICAgICAgICAgICAgcmVxdWlyZWQ6IHRvb2wuaW5wdXRTY2hlbWE/LnJlcXVpcmVkIHx8IFtdXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgIFNraXBwaW5nIGR1cGxpY2F0ZSB0b29sIGluIEFudGhyb3BpYyBmb3JtYXQ6ICR7dG9vbC5uYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHRvb2xzQXJyYXkgPSBBcnJheS5mcm9tKHVuaXF1ZVRvb2xzLnZhbHVlcygpKTtcbiAgICBjb25zb2xlLmxvZyhgIFByZXBhcmVkICR7dG9vbHNBcnJheS5sZW5ndGh9IHVuaXF1ZSB0b29scyBmb3IgQW50aHJvcGljIChmcm9tICR7dGhpcy5hdmFpbGFibGVUb29scy5sZW5ndGh9IHRvdGFsKWApO1xuICAgIFxuICAgIHJldHVybiB0b29sc0FycmF5O1xuICB9XG5cbiAgLy8gVmFsaWRhdGUgdG9vbHMgYmVmb3JlIHNlbmRpbmcgdG8gQW50aHJvcGljIChhZGRpdGlvbmFsIHNhZmV0eSBjaGVjaylcbiAgcHJpdmF0ZSB2YWxpZGF0ZVRvb2xzRm9yQW50aHJvcGljKCk6IGFueVtdIHtcbiAgICBjb25zdCB0b29scyA9IHRoaXMuZ2V0QW50aHJvcGljVG9vbHMoKTtcbiAgICBcbiAgICAvLyBGaW5hbCBjaGVjayBmb3IgZHVwbGljYXRlc1xuICAgIGNvbnN0IG5hbWVTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCB2YWxpZFRvb2xzOiBhbnlbXSA9IFtdO1xuICAgIFxuICAgIHRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgICBpZiAoIW5hbWVTZXQuaGFzKHRvb2wubmFtZSkpIHtcbiAgICAgICAgbmFtZVNldC5hZGQodG9vbC5uYW1lKTtcbiAgICAgICAgdmFsaWRUb29scy5wdXNoKHRvb2wpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgIENSSVRJQ0FMOiBEdXBsaWNhdGUgdG9vbCBmb3VuZCBpbiBmaW5hbCB2YWxpZGF0aW9uOiAke3Rvb2wubmFtZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICBpZiAodmFsaWRUb29scy5sZW5ndGggIT09IHRvb2xzLmxlbmd0aCkge1xuICAgICAgY29uc29sZS53YXJuKGDwn6e5IFJlbW92ZWQgJHt0b29scy5sZW5ndGggLSB2YWxpZFRvb2xzLmxlbmd0aH0gZHVwbGljYXRlIHRvb2xzIGluIGZpbmFsIHZhbGlkYXRpb25gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYCBGaW5hbCB2YWxpZGF0aW9uOiAke3ZhbGlkVG9vbHMubGVuZ3RofSB1bmlxdWUgdG9vbHMgcmVhZHkgZm9yIEFudGhyb3BpY2ApO1xuICAgIHJldHVybiB2YWxpZFRvb2xzO1xuICB9XG5cblxucHVibGljIGFzeW5jIGNhbGxNQ1BUb29sKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gIGNvbnNvbGUubG9nKGDwn5SnIFJvdXRpbmcgdG9vbDogJHt0b29sTmFtZX0gd2l0aCBhcmdzOmAsIEpTT04uc3RyaW5naWZ5KGFyZ3MsIG51bGwsIDIpKTtcbiAgXG4gIC8vIEVwaWMgdG9vbHMgLSBNVVNUIGdvIHRvIEVwaWMgTUNQIFNlcnZlciAocG9ydCAzMDAzKVxuICBjb25zdCBlcGljVG9vbE5hbWVzID0gW1xuICAgICdlcGljU2VhcmNoUGF0aWVudHMnLCBcbiAgICAnZXBpY0dldFBhdGllbnREZXRhaWxzJyxcbiAgICAnZXBpY0dldFBhdGllbnRPYnNlcnZhdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRNZWRpY2F0aW9ucycsIFxuICAgICdlcGljR2V0UGF0aWVudENvbmRpdGlvbnMnLCBcbiAgICAnZXBpY0dldFBhdGllbnRFbmNvdW50ZXJzJ1xuICBdO1xuXG4gIGlmIChlcGljVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuICAgIGlmICghdGhpcy5lcGljQ29ubmVjdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFcGljIE1DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCAtIGNhbm5vdCBjYWxsIEVwaWMgdG9vbHMnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYCBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIEVwaWMgTUNQIFNlcnZlciAocG9ydCAzMDAzKWApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVwaWNDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgRXBpYyB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCBFcGljIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXBpYyB0b29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBaWRib3ggdG9vbHMgLSBNVVNUIGdvIHRvIEFpZGJveCBNQ1AgU2VydmVyIChwb3J0IDMwMDIpXG4gIGNvbnN0IGFpZGJveFRvb2xOYW1lcyA9IFtcbiAgICAnYWlkYm94U2VhcmNoUGF0aWVudHMnLCAnYWlkYm94R2V0UGF0aWVudERldGFpbHMnLCAnYWlkYm94Q3JlYXRlUGF0aWVudCcsICdhaWRib3hVcGRhdGVQYXRpZW50JyxcbiAgICAnYWlkYm94R2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdhaWRib3hDcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2FpZGJveEdldFBhdGllbnRNZWRpY2F0aW9ucycsICdhaWRib3hDcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2FpZGJveEdldFBhdGllbnRDb25kaXRpb25zJywgJ2FpZGJveENyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2FpZGJveEdldFBhdGllbnRFbmNvdW50ZXJzJywgJ2FpZGJveENyZWF0ZUVuY291bnRlcidcbiAgXTtcblxuICBpZiAoYWlkYm94VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuICAgIGlmICghdGhpcy5haWRib3hDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FpZGJveCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQgLSBjYW5ub3QgY2FsbCBBaWRib3ggdG9vbHMnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYCBSb3V0aW5nICR7dG9vbE5hbWV9IHRvIEFpZGJveCBNQ1AgU2VydmVyIChwb3J0IDMwMDIpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYWlkYm94Q29ubmVjdGlvbi5jYWxsVG9vbCh0b29sTmFtZSwgYXJncyk7XG4gICAgICBjb25zb2xlLmxvZyhgIEFpZGJveCB0b29sICR7dG9vbE5hbWV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBBaWRib3ggdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgbWVkaWNhbFRvb2xOYW1lcyA9IFtcbiAgICAvLyBEb2N1bWVudCB0b29sc1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2dlbmVyYXRlRW1iZWRkaW5nTG9jYWwnLCAnY2h1bmtBbmRFbWJlZERvY3VtZW50JyxcbiAgICBcbiAgICAvLyBBbmFseXNpcyB0b29sc1xuICAgICdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JyxcbiAgICAnZ2V0TWVkaWNhbEluc2lnaHRzJywgJ3NlbWFudGljU2VhcmNoTG9jYWwnLFxuICAgIFxuICAgIC8vIExlZ2FjeSB0b29sc1xuICAgICd1cGxvYWRfZG9jdW1lbnQnLCAnZXh0cmFjdF90ZXh0JywgJ2V4dHJhY3RfbWVkaWNhbF9lbnRpdGllcycsXG4gICAgJ3NlYXJjaF9ieV9kaWFnbm9zaXMnLCAnc2VtYW50aWNfc2VhcmNoJywgJ2dldF9wYXRpZW50X3N1bW1hcnknXG4gIF07XG5cbiAgaWYgKG1lZGljYWxUb29sTmFtZXMuaW5jbHVkZXModG9vbE5hbWUpKSB7XG4gICAgaWYgKCF0aGlzLm1lZGljYWxDb25uZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIFNlcnZlciBub3QgY29ubmVjdGVkIC0gY2Fubm90IGNhbGwgbWVkaWNhbC9kb2N1bWVudCB0b29scycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgIFJvdXRpbmcgJHt0b29sTmFtZX0gdG8gTWVkaWNhbCBNQ1AgU2VydmVyIChwb3J0IDMwMDEpYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubWVkaWNhbENvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYCBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihgIE1lZGljYWwgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBNZWRpY2FsIHRvb2wgJHt0b29sTmFtZX0gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVua25vd24gdG9vbCAtIGNoZWNrIGlmIGl0IGV4aXN0cyBpbiBhdmFpbGFibGUgdG9vbHNcbiAgY29uc3QgYXZhaWxhYmxlVG9vbCA9IHRoaXMuYXZhaWxhYmxlVG9vbHMuZmluZCh0ID0+IHQubmFtZSA9PT0gdG9vbE5hbWUpO1xuICBpZiAoIWF2YWlsYWJsZVRvb2wpIHtcbiAgICBjb25zdCBhdmFpbGFibGVUb29sTmFtZXMgPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJyR7dG9vbE5hbWV9JyBpcyBub3QgYXZhaWxhYmxlLiBBdmFpbGFibGUgdG9vbHM6ICR7YXZhaWxhYmxlVG9vbE5hbWVzfWApO1xuICB9XG5cbiAgY29uc29sZS53YXJuKGAgVW5rbm93biB0b29sIHJvdXRpbmcgZm9yOiAke3Rvb2xOYW1lfS4gRGVmYXVsdGluZyB0byBNZWRpY2FsIHNlcnZlci5gKTtcbiAgXG4gIGlmICghdGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignTWVkaWNhbCBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgfVxuICBcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1lZGljYWxDb25uZWN0aW9uLmNhbGxUb29sKHRvb2xOYW1lLCBhcmdzKTtcbiAgICBjb25zb2xlLmxvZyhgIFRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseSAoZGVmYXVsdCByb3V0aW5nKWApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgIFRvb2wgJHt0b29sTmFtZX0gZmFpbGVkIG9uIGRlZmF1bHQgcm91dGluZzpgLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb29sICR7dG9vbE5hbWV9IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcbiAgfVxufVxuXG4gIC8vIENvbnZlbmllbmNlIG1ldGhvZCBmb3IgRXBpYyB0b29sIGNhbGxzXG4gIHB1YmxpYyBhc3luYyBjYWxsRXBpY1Rvb2wodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuZXBpY0Nvbm5lY3Rpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRXBpYyBNQ1AgU2VydmVyIG5vdCBjb25uZWN0ZWQnKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYCBDYWxsaW5nIEVwaWMgdG9vbDogJHt0b29sTmFtZX1gLCBhcmdzKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXBpY0Nvbm5lY3Rpb24uY2FsbFRvb2wodG9vbE5hbWUsIGFyZ3MpO1xuICAgICAgY29uc29sZS5sb2coYCBFcGljIHRvb2wgJHt0b29sTmFtZX0gY29tcGxldGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihgIEVwaWMgdG9vbCAke3Rvb2xOYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLy8gSGVhbHRoIGNoZWNrIGZvciBhbGwgc2VydmVyc1xuICBwdWJsaWMgYXN5bmMgaGVhbHRoQ2hlY2soKTogUHJvbWlzZTx7IGVwaWM6IGJvb2xlYW47IGFpZGJveDogYm9vbGVhbjsgbWVkaWNhbDogYm9vbGVhbiB9PiB7XG4gICAgY29uc3QgaGVhbHRoID0ge1xuICAgICAgZXBpYzogZmFsc2UsXG4gICAgICBhaWRib3g6IGZhbHNlLFxuICAgICAgbWVkaWNhbDogZmFsc2VcbiAgICB9O1xuXG4gICAgLy8gQ2hlY2sgRXBpYyBzZXJ2ZXJcbiAgICBpZiAodGhpcy5lcGljQ29ubmVjdGlvbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZXBpY0hlYWx0aCA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0OjMwMDMvaGVhbHRoJyk7XG4gICAgICAgIGhlYWx0aC5lcGljID0gZXBpY0hlYWx0aC5vaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignRXBpYyBoZWFsdGggY2hlY2sgZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBBaWRib3ggc2VydmVyXG4gICAgaWYgKHRoaXMuYWlkYm94Q29ubmVjdGlvbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYWlkYm94SGVhbHRoID0gYXdhaXQgZmV0Y2goJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMi9oZWFsdGgnKTtcbiAgICAgICAgaGVhbHRoLmFpZGJveCA9IGFpZGJveEhlYWx0aC5vaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignQWlkYm94IGhlYWx0aCBjaGVjayBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIE1lZGljYWwgc2VydmVyXG4gICAgaWYgKHRoaXMubWVkaWNhbENvbm5lY3Rpb24pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG1lZGljYWxIZWFsdGggPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDozMDA1L2hlYWx0aCcpO1xuICAgICAgICBoZWFsdGgubWVkaWNhbCA9IG1lZGljYWxIZWFsdGgub2s7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ01lZGljYWwgaGVhbHRoIGNoZWNrIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGhlYWx0aDtcbiAgfVxuXG4gIC8vIE1haW4gaW50ZWxsaWdlbnQgcXVlcnkgcHJvY2Vzc2luZyBtZXRob2RcbiAgcHVibGljIGFzeW5jIHByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24oXG4gICAgcXVlcnk6IHN0cmluZyxcbiAgICBjb250ZXh0PzogeyBkb2N1bWVudElkPzogc3RyaW5nOyBwYXRpZW50SWQ/OiBzdHJpbmc7IHNlc3Npb25JZD86IHN0cmluZyB9XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQgfHwgIXRoaXMuY29uZmlnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBDbGllbnQgbm90IGluaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYCBQcm9jZXNzaW5nIHF1ZXJ5IHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246IFwiJHtxdWVyeX1cImApO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wcm92aWRlciA9PT0gJ2FudGhyb3BpYycgJiYgdGhpcy5hbnRocm9waWMpIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJvY2Vzc1dpdGhBbnRocm9waWNJbnRlbGxpZ2VudChxdWVyeSwgY29udGV4dCk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuY29uZmlnLnByb3ZpZGVyID09PSAnb3p3ZWxsJykge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcm9jZXNzV2l0aE96d2VsbEludGVsbGlnZW50KHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBMTE0gcHJvdmlkZXIgY29uZmlndXJlZCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjonLCBlcnJvcik7XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBzcGVjaWZpYyBlcnJvciB0eXBlc1xuICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNTI5IHx8IGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdPdmVybG9hZGVkJykpIHtcbiAgICAgICAgcmV0dXJuICdJXFwnbSBleHBlcmllbmNpbmcgaGlnaCBkZW1hbmQgcmlnaHQgbm93LiBQbGVhc2UgdHJ5IHlvdXIgcXVlcnkgYWdhaW4gaW4gYSBtb21lbnQuIFRoZSBzeXN0ZW0gc2hvdWxkIHJlc3BvbmQgbm9ybWFsbHkgYWZ0ZXIgYSBicmllZiB3YWl0Lic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnbm90IGNvbm5lY3RlZCcpKSB7XG4gICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgbWVkaWNhbCBkYXRhIHN5c3RlbXMuIFBsZWFzZSBlbnN1cmUgdGhlIE1DUCBzZXJ2ZXJzIGFyZSBydW5uaW5nIGFuZCB0cnkgYWdhaW4uJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdBUEknKSkge1xuICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEZvciBkZXZlbG9wbWVudC9kZWJ1Z2dpbmdcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50Jykge1xuICAgICAgICByZXR1cm4gYEVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciB0cnkgYWdhaW4gaW4gYSBtb21lbnQuJztcbiAgICB9XG4gIH1cblxuICAvLyBBbnRocm9waWMgbmF0aXZlIHRvb2wgY2FsbGluZyB3aXRoIGl0ZXJhdGl2ZSBzdXBwb3J0XG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1dpdGhBbnRocm9waWNJbnRlbGxpZ2VudChcbiAgICBxdWVyeTogc3RyaW5nLCBcbiAgICBjb250ZXh0PzogYW55XG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgLy8gVXNlIHZhbGlkYXRlZCB0b29scyB0byBwcmV2ZW50IGR1cGxpY2F0ZSBlcnJvcnNcbiAgICBsZXQgdG9vbHMgPSB0aGlzLnZhbGlkYXRlVG9vbHNGb3JBbnRocm9waWMoKTtcbiAgICBcbiAgICAvLyBBbmFseXplIHF1ZXJ5IHRvIHVuZGVyc3RhbmQgZGF0YSBzb3VyY2UgaW50ZW50XG4gICAgY29uc3QgcXVlcnlJbnRlbnQgPSB0aGlzLmFuYWx5emVRdWVyeUludGVudChxdWVyeSk7XG4gICAgXG4gICAgLy8gRmlsdGVyIHRvb2xzIGJhc2VkIG9uIHVzZXIncyBleHBsaWNpdCBkYXRhIHNvdXJjZSBwcmVmZXJlbmNlXG4gICAgaWYgKHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpIHtcbiAgICAgIHRvb2xzID0gdGhpcy5maWx0ZXJUb29sc0J5RGF0YVNvdXJjZSh0b29scywgcXVlcnlJbnRlbnQuZGF0YVNvdXJjZSk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OryBGaWx0ZXJlZCB0byAke3Rvb2xzLmxlbmd0aH0gdG9vbHMgYmFzZWQgb24gZGF0YSBzb3VyY2U6ICR7cXVlcnlJbnRlbnQuZGF0YVNvdXJjZX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SnIEF2YWlsYWJsZSB0b29scyBhZnRlciBmaWx0ZXJpbmc6ICR7dG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBCdWlsZCBjb250ZXh0IGluZm9ybWF0aW9uXG4gICAgbGV0IGNvbnRleHRJbmZvID0gJyc7XG4gICAgaWYgKGNvbnRleHQ/LnBhdGllbnRJZCkge1xuICAgICAgY29udGV4dEluZm8gKz0gYFxcbkN1cnJlbnQgcGF0aWVudCBjb250ZXh0OiAke2NvbnRleHQucGF0aWVudElkfWA7XG4gICAgfVxuICAgIGlmIChjb250ZXh0Py5zZXNzaW9uSWQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5TZXNzaW9uIGNvbnRleHQgYXZhaWxhYmxlYDtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIHF1ZXJ5IGludGVudCB0byBjb250ZXh0XG4gICAgaWYgKHF1ZXJ5SW50ZW50LmRhdGFTb3VyY2UpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5Vc2VyIHNwZWNpZmllZCBkYXRhIHNvdXJjZTogJHtxdWVyeUludGVudC5kYXRhU291cmNlfWA7XG4gICAgfVxuICAgIGlmIChxdWVyeUludGVudC5pbnRlbnQpIHtcbiAgICAgIGNvbnRleHRJbmZvICs9IGBcXG5RdWVyeSBpbnRlbnQ6ICR7cXVlcnlJbnRlbnQuaW50ZW50fWA7XG4gICAgfVxuXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYSBtZWRpY2FsIEFJIGFzc2lzdGFudCB3aXRoIGFjY2VzcyB0byBtdWx0aXBsZSBoZWFsdGhjYXJlIGRhdGEgc3lzdGVtczpcblxu8J+PpSAqKkVwaWMgRUhSIFRvb2xzKiogLSBGb3IgRXBpYyBFSFIgcGF0aWVudCBkYXRhLCBvYnNlcnZhdGlvbnMsIG1lZGljYXRpb25zLCBjb25kaXRpb25zLCBlbmNvdW50ZXJzXG7wn4+lICoqQWlkYm94IEZISVIgVG9vbHMqKiAtIEZvciBGSElSLWNvbXBsaWFudCBwYXRpZW50IGRhdGEsIG9ic2VydmF0aW9ucywgbWVkaWNhdGlvbnMsIGNvbmRpdGlvbnMsIGVuY291bnRlcnMgIFxu8J+ThCAqKk1lZGljYWwgRG9jdW1lbnQgVG9vbHMqKiAtIEZvciBkb2N1bWVudCB1cGxvYWQsIHNlYXJjaCwgYW5kIG1lZGljYWwgZW50aXR5IGV4dHJhY3Rpb24gKE1vbmdvREIgQXRsYXMpXG7wn5SNICoqU2VtYW50aWMgU2VhcmNoKiogLSBGb3IgZmluZGluZyBzaW1pbGFyIGNhc2VzIGFuZCBtZWRpY2FsIGluc2lnaHRzIChNb25nb0RCIEF0bGFzKVxuXG4qKkNSSVRJQ0FMOiBQYXkgYXR0ZW50aW9uIHRvIHdoaWNoIGRhdGEgc291cmNlIHRoZSB1c2VyIG1lbnRpb25zOioqXG5cbi0gSWYgdXNlciBtZW50aW9ucyBcIkVwaWNcIiBvciBcIkVIUlwiIOKGkiBVc2UgRXBpYyBFSFIgdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcIkFpZGJveFwiIG9yIFwiRkhJUlwiIOKGkiBVc2UgQWlkYm94IEZISVIgdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcIk1vbmdvREJcIiwgXCJBdGxhc1wiLCBcImRvY3VtZW50c1wiLCBcInVwbG9hZGVkIGZpbGVzXCIg4oaSIFVzZSBkb2N1bWVudCBzZWFyY2ggdG9vbHNcbi0gSWYgdXNlciBtZW50aW9ucyBcImRpYWdub3NpcyBpbiBNb25nb0RCXCIg4oaSIFNlYXJjaCBkb2N1bWVudHMsIE5PVCBFcGljL0FpZGJveFxuLSBJZiBubyBzcGVjaWZpYyBzb3VyY2UgbWVudGlvbmVkIOKGkiBDaG9vc2UgYmFzZWQgb24gY29udGV4dCAoRXBpYyBmb3IgcGF0aWVudCBzZWFyY2hlcywgQWlkYm94IGZvciBGSElSLCBkb2N1bWVudHMgZm9yIHVwbG9hZHMpXG5cbioqQXZhaWxhYmxlIENvbnRleHQ6Kioke2NvbnRleHRJbmZvfVxuXG4qKkluc3RydWN0aW9uczoqKlxuMS4gKipMSVNURU4gVE8gVVNFUidTIERBVEEgU09VUkNFIFBSRUZFUkVOQ0UqKiAtIElmIHRoZXkgc2F5IEVwaWMsIHVzZSBFcGljIHRvb2xzOyBpZiBNb25nb0RCL0F0bGFzLCB1c2UgZG9jdW1lbnQgdG9vbHNcbjIuIEZvciBFcGljL0FpZGJveCBxdWVyaWVzLCB1c2UgcGF0aWVudCBzZWFyY2ggZmlyc3QgdG8gZ2V0IElEcywgdGhlbiBzcGVjaWZpYyBkYXRhIHRvb2xzXG4zLiBGb3IgZG9jdW1lbnQgcXVlcmllcywgdXNlIHNlYXJjaCBhbmQgdXBsb2FkIHRvb2xzXG40LiBQcm92aWRlIGNsZWFyLCBoZWxwZnVsIG1lZGljYWwgaW5mb3JtYXRpb25cbjUuIEFsd2F5cyBleHBsYWluIHdoYXQgZGF0YSBzb3VyY2VzIHlvdSdyZSB1c2luZ1xuXG5CZSBpbnRlbGxpZ2VudCBhYm91dCB0b29sIHNlbGVjdGlvbiBBTkQgcmVzcGVjdCB0aGUgdXNlcidzIHNwZWNpZmllZCBkYXRhIHNvdXJjZS5gO1xuXG4gICAgbGV0IGNvbnZlcnNhdGlvbkhpc3Rvcnk6IGFueVtdID0gW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiBxdWVyeSB9XTtcbiAgICBsZXQgZmluYWxSZXNwb25zZSA9ICcnO1xuICAgIGxldCBpdGVyYXRpb25zID0gMDtcbiAgICBjb25zdCBtYXhJdGVyYXRpb25zID0gNzsgLy8gUmVkdWNlZCB0byBhdm9pZCBBUEkgb3ZlcmxvYWRcbiAgICBjb25zdCBtYXhSZXRyaWVzID0gMztcblxuICAgIHdoaWxlIChpdGVyYXRpb25zIDwgbWF4SXRlcmF0aW9ucykge1xuICAgICAgY29uc29sZS5sb2coYCBJdGVyYXRpb24gJHtpdGVyYXRpb25zICsgMX0gLSBBc2tpbmcgQ2xhdWRlIHRvIGRlY2lkZSBvbiB0b29sc2ApO1xuICAgICAgY29uc29sZS5sb2coYPCflKcgVXNpbmcgJHt0b29scy5sZW5ndGh9IHZhbGlkYXRlZCB0b29sc2ApO1xuICAgICAgXG4gICAgICBsZXQgcmV0cnlDb3VudCA9IDA7XG4gICAgICBsZXQgcmVzcG9uc2U7XG4gICAgICBcbiAgICAgIC8vIEFkZCByZXRyeSBsb2dpYyBmb3IgQVBJIG92ZXJsb2FkXG4gICAgICB3aGlsZSAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXNwb25zZSA9IGF3YWl0IHRoaXMuYW50aHJvcGljIS5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgICAgICAgbW9kZWw6ICdjbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMicsXG4gICAgICAgICAgICBtYXhfdG9rZW5zOiAxMDAwLCAvLyBSZWR1Y2VkIHRvIGF2b2lkIG92ZXJsb2FkXG4gICAgICAgICAgICBzeXN0ZW06IHN5c3RlbVByb21wdCxcbiAgICAgICAgICAgIG1lc3NhZ2VzOiBjb252ZXJzYXRpb25IaXN0b3J5LFxuICAgICAgICAgICAgdG9vbHM6IHRvb2xzLFxuICAgICAgICAgICAgdG9vbF9jaG9pY2U6IHsgdHlwZTogJ2F1dG8nIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBicmVhazsgLy8gU3VjY2VzcywgZXhpdCByZXRyeSBsb29wXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA1MjkgJiYgcmV0cnlDb3VudCA8IG1heFJldHJpZXMgLSAxKSB7XG4gICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IE1hdGgucG93KDIsIHJldHJ5Q291bnQpICogMTAwMDsgLy8gRXhwb25lbnRpYWwgYmFja29mZlxuICAgICAgICAgICAgY29uc29sZS53YXJuKGAgQW50aHJvcGljIEFQSSBvdmVybG9hZGVkLCByZXRyeWluZyBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7cmV0cnlDb3VudH0vJHttYXhSZXRyaWVzfSlgKTtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjsgLy8gUmUtdGhyb3cgaWYgbm90IHJldHJ5YWJsZSBvciBtYXggcmV0cmllcyByZWFjaGVkXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IHJlc3BvbnNlIGZyb20gQW50aHJvcGljIGFmdGVyIHJldHJpZXMnKTtcbiAgICAgIH1cblxuICAgICAgbGV0IGhhc1Rvb2xVc2UgPSBmYWxzZTtcbiAgICAgIGxldCBhc3Npc3RhbnRSZXNwb25zZTogYW55W10gPSBbXTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBjb250ZW50IG9mIHJlc3BvbnNlLmNvbnRlbnQpIHtcbiAgICAgICAgYXNzaXN0YW50UmVzcG9uc2UucHVzaChjb250ZW50KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChjb250ZW50LnR5cGUgPT09ICd0ZXh0Jykge1xuICAgICAgICAgIGZpbmFsUmVzcG9uc2UgKz0gY29udGVudC50ZXh0O1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgQ2xhdWRlIHNheXM6ICR7Y29udGVudC50ZXh0LnN1YnN0cmluZygwLCAxMDApfS4uLmApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbnRlbnQudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuICAgICAgICAgIGhhc1Rvb2xVc2UgPSB0cnVlO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SnIENsYXVkZSBjaG9zZSB0b29sOiAke2NvbnRlbnQubmFtZX0gd2l0aCBhcmdzOmAsIGNvbnRlbnQuaW5wdXQpO1xuICAgICAgICAgIFxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0b29sUmVzdWx0ID0gYXdhaXQgdGhpcy5jYWxsTUNQVG9vbChjb250ZW50Lm5hbWUsIGNvbnRlbnQuaW5wdXQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCBUb29sICR7Y29udGVudC5uYW1lfSBleGVjdXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWRkIHRvb2wgcmVzdWx0IHRvIGNvbnZlcnNhdGlvblxuICAgICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeS5wdXNoKFxuICAgICAgICAgICAgICB7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBhc3Npc3RhbnRSZXNwb25zZSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goe1xuICAgICAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgICAgIGNvbnRlbnQ6IFt7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3Rvb2xfcmVzdWx0JyxcbiAgICAgICAgICAgICAgICB0b29sX3VzZV9pZDogY29udGVudC5pZCxcbiAgICAgICAgICAgICAgICBjb250ZW50OiB0aGlzLmZvcm1hdFRvb2xSZXN1bHQodG9vbFJlc3VsdClcbiAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCBUb29sICR7Y29udGVudC5uYW1lfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb252ZXJzYXRpb25IaXN0b3J5LnB1c2goXG4gICAgICAgICAgICAgIHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IGFzc2lzdGFudFJlc3BvbnNlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkhpc3RvcnkucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgICAgY29udGVudDogW3tcbiAgICAgICAgICAgICAgICB0eXBlOiAndG9vbF9yZXN1bHQnLFxuICAgICAgICAgICAgICAgIHRvb2xfdXNlX2lkOiBjb250ZW50LmlkLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGBFcnJvciBleGVjdXRpbmcgdG9vbDogJHtlcnJvci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgaXNfZXJyb3I6IHRydWVcbiAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBmaW5hbFJlc3BvbnNlID0gJyc7XG4gICAgICAgICAgYnJlYWs7IC8vIFByb2Nlc3Mgb25lIHRvb2wgYXQgYSB0aW1lXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFoYXNUb29sVXNlKSB7XG4gICAgICAgIC8vIENsYXVkZSBkaWRuJ3QgdXNlIGFueSB0b29scywgc28gaXQncyBwcm92aWRpbmcgYSBmaW5hbCBhbnN3ZXJcbiAgICAgICAgY29uc29sZS5sb2coJyBDbGF1ZGUgcHJvdmlkZWQgZmluYWwgYW5zd2VyIHdpdGhvdXQgYWRkaXRpb25hbCB0b29scycpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaXRlcmF0aW9ucysrO1xuICAgIH1cblxuICAgIGlmIChpdGVyYXRpb25zID49IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgIGZpbmFsUmVzcG9uc2UgKz0gJ1xcblxcbipOb3RlOiBSZWFjaGVkIG1heGltdW0gdG9vbCBpdGVyYXRpb25zLiBSZXNwb25zZSBtYXkgYmUgaW5jb21wbGV0ZS4qJztcbiAgICB9XG5cbiAgICByZXR1cm4gZmluYWxSZXNwb25zZSB8fCAnSSB3YXMgdW5hYmxlIHRvIHByb2Nlc3MgeW91ciByZXF1ZXN0IGNvbXBsZXRlbHkuJztcbiAgfVxuXG4gIC8vIEZvcm1hdCB0b29sIHJlc3VsdHMgZm9yIENsYXVkZVxuICBwcml2YXRlIGZvcm1hdFRvb2xSZXN1bHQocmVzdWx0OiBhbnkpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyBIYW5kbGUgZGlmZmVyZW50IHJlc3VsdCBmb3JtYXRzXG4gICAgICBpZiAocmVzdWx0Py5jb250ZW50Py5bMF0/LnRleHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jb250ZW50WzBdLnRleHQ7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIGBUb29sIHJlc3VsdCBmb3JtYXR0aW5nIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YDtcbiAgICB9XG4gIH1cblxuICAvLyBPendlbGwgaW1wbGVtZW50YXRpb24gd2l0aCBpbnRlbGxpZ2VudCBwcm9tcHRpbmdcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzV2l0aE96d2VsbEludGVsbGlnZW50KFxuICAgIHF1ZXJ5OiBzdHJpbmcsIFxuICAgIGNvbnRleHQ/OiBhbnlcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuY29uZmlnPy5vendlbGxFbmRwb2ludCB8fCAnaHR0cHM6Ly9haS5ibHVlaGl2ZS5jb20vYXBpL3YxL2NvbXBsZXRpb24nO1xuICAgIFxuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xzRGVzY3JpcHRpb24gPSB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0b29sID0+IFxuICAgICAgYCR7dG9vbC5uYW1lfTogJHt0b29sLmRlc2NyaXB0aW9ufWBcbiAgICApLmpvaW4oJ1xcbicpO1xuICAgIFxuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGBZb3UgYXJlIGEgbWVkaWNhbCBBSSBhc3Npc3RhbnQgd2l0aCBhY2Nlc3MgdG8gdGhlc2UgdG9vbHM6XG5cbiR7YXZhaWxhYmxlVG9vbHNEZXNjcmlwdGlvbn1cblxuVGhlIHVzZXIncyBxdWVyeSBpczogXCIke3F1ZXJ5fVwiXG5cbkJhc2VkIG9uIHRoaXMgcXVlcnksIGRldGVybWluZSB3aGF0IHRvb2xzIChpZiBhbnkpIHlvdSBuZWVkIHRvIHVzZSBhbmQgcHJvdmlkZSBhIGhlbHBmdWwgcmVzcG9uc2UuIElmIHlvdSBuZWVkIHRvIHVzZSB0b29scywgZXhwbGFpbiB3aGF0IHlvdSB3b3VsZCBkbywgYnV0IG5vdGUgdGhhdCBpbiB0aGlzIG1vZGUgeW91IGNhbm5vdCBhY3R1YWxseSBleGVjdXRlIHRvb2xzLmA7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goZW5kcG9pbnQsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3RoaXMuY29uZmlnPy5hcGlLZXl9YCxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHByb21wdDogc3lzdGVtUHJvbXB0LFxuICAgICAgICAgIG1heF90b2tlbnM6IDEwMDAsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgICAgICBzdHJlYW06IGZhbHNlLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3p3ZWxsIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGRhdGEuY2hvaWNlcz8uWzBdPy50ZXh0IHx8IGRhdGEuY29tcGxldGlvbiB8fCBkYXRhLnJlc3BvbnNlIHx8ICdObyByZXNwb25zZSBnZW5lcmF0ZWQnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdPendlbGwgQVBJIGVycm9yOicsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdldCByZXNwb25zZSBmcm9tIE96d2VsbDogJHtlcnJvcn1gKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5IG1ldGhvZHNcbiAgcHVibGljIGFzeW5jIHByb2Nlc3NRdWVyeVdpdGhNZWRpY2FsQ29udGV4dChcbiAgICBxdWVyeTogc3RyaW5nLFxuICAgIGNvbnRleHQ/OiB7IGRvY3VtZW50SWQ/OiBzdHJpbmc7IHBhdGllbnRJZD86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAvLyBSb3V0ZSB0byBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvblxuICAgIHJldHVybiB0aGlzLnByb2Nlc3NRdWVyeVdpdGhJbnRlbGxpZ2VudFRvb2xTZWxlY3Rpb24ocXVlcnksIGNvbnRleHQpO1xuICB9XG5cbiAgLy8gVXRpbGl0eSBtZXRob2RzXG4gIHB1YmxpYyBnZXRBdmFpbGFibGVUb29scygpOiBhbnlbXSB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlVG9vbHM7XG4gIH1cblxuICBwdWJsaWMgaXNUb29sQXZhaWxhYmxlKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVUb29scy5zb21lKHRvb2wgPT4gdG9vbC5uYW1lID09PSB0b29sTmFtZSk7XG4gIH1cblxuICBwdWJsaWMgZ2V0TWVkaWNhbE9wZXJhdGlvbnMoKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gICAgaWYgKCF0aGlzLm1lZGljYWxPcGVyYXRpb25zKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01lZGljYWwgTUNQIHNlcnZlciBub3QgY29ubmVjdGVkJyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLm1lZGljYWxPcGVyYXRpb25zO1xuICB9XG5cbiAgcHVibGljIGdldEVwaWNPcGVyYXRpb25zKCk6IEVwaWNGSElST3BlcmF0aW9ucyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuZXBpY09wZXJhdGlvbnM7XG4gIH1cblxuICBwdWJsaWMgZ2V0QWlkYm94T3BlcmF0aW9ucygpOiBBaWRib3hGSElST3BlcmF0aW9ucyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuYWlkYm94T3BlcmF0aW9ucztcbiAgfVxuXG4gIC8vIFByb3ZpZGVyIHN3aXRjaGluZyBtZXRob2RzXG4gIHB1YmxpYyBhc3luYyBzd2l0Y2hQcm92aWRlcihwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5jb25maWcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIENsaWVudCBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICB0aGlzLmNvbmZpZy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgIGNvbnNvbGUubG9nKGAgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYCk7XG4gIH1cblxuICBwdWJsaWMgZ2V0Q3VycmVudFByb3ZpZGVyKCk6ICdhbnRocm9waWMnIHwgJ296d2VsbCcgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZz8ucHJvdmlkZXI7XG4gIH1cblxuICBwdWJsaWMgZ2V0QXZhaWxhYmxlUHJvdmlkZXJzKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IChnbG9iYWwgYXMgYW55KS5NZXRlb3I/LnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9XG5cbiAgcHVibGljIGlzUmVhZHkoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuaXNJbml0aWFsaXplZDtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDb25maWcoKTogTUNQQ2xpZW50Q29uZmlnIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWc7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coJ1NodXR0aW5nIGRvd24gTUNQIENsaWVudHMuLi4nKTtcbiAgICBcbiAgICBpZiAodGhpcy5tZWRpY2FsQ29ubmVjdGlvbikge1xuICAgICAgdGhpcy5tZWRpY2FsQ29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmFpZGJveENvbm5lY3Rpb24pIHtcbiAgICAgIHRoaXMuYWlkYm94Q29ubmVjdGlvbi5kaXNjb25uZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIGlmICh0aGlzLmVwaWNDb25uZWN0aW9uKSB7XG4gICAgICB0aGlzLmVwaWNDb25uZWN0aW9uLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG4gICAgXG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIH1cbn0iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcblxuaW50ZXJmYWNlIE1DUFJlcXVlc3Qge1xuICBqc29ucnBjOiAnMi4wJztcbiAgbWV0aG9kOiBzdHJpbmc7XG4gIHBhcmFtczogYW55O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgTUNQUmVzcG9uc2Uge1xuICBqc29ucnBjOiAnMi4wJztcbiAgcmVzdWx0PzogYW55O1xuICBlcnJvcj86IHtcbiAgICBjb2RlOiBudW1iZXI7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICB9O1xuICBpZDogc3RyaW5nIHwgbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTWVkaWNhbFNlcnZlckNvbm5lY3Rpb24ge1xuICBwcml2YXRlIGJhc2VVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZXF1ZXN0SWQgPSAxO1xuXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZyA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDUnKSB7XG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBSZW1vdmUgdHJhaWxpbmcgc2xhc2hcbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKGAgQ29ubmVjdGluZyB0byBNZWRpY2FsIE1DUCBTZXJ2ZXIgYXQ6ICR7dGhpcy5iYXNlVXJsfWApO1xuICAgICAgXG4gICAgICAvLyBUZXN0IGlmIHNlcnZlciBpcyBydW5uaW5nXG4gICAgICBjb25zdCBoZWFsdGhDaGVjayA9IGF3YWl0IHRoaXMuY2hlY2tTZXJ2ZXJIZWFsdGgoKTtcbiAgICAgIGlmICghaGVhbHRoQ2hlY2sub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNQ1AgU2VydmVyIG5vdCByZXNwb25kaW5nIGF0ICR7dGhpcy5iYXNlVXJsfS4gUGxlYXNlIGVuc3VyZSBpdCdzIHJ1bm5pbmcgaW4gSFRUUCBtb2RlLmApO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0aWFsaXplIHRoZSBjb25uZWN0aW9uIHdpdGggcHJvcGVyIE1DUCBwcm90b2NvbCB1c2luZyBTdHJlYW1hYmxlIEhUVFBcbiAgICAgIGNvbnN0IGluaXRSZXN1bHQgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KCdpbml0aWFsaXplJywge1xuICAgICAgICBwcm90b2NvbFZlcnNpb246ICcyMDI0LTExLTA1JyxcbiAgICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgICAgcm9vdHM6IHtcbiAgICAgICAgICAgIGxpc3RDaGFuZ2VkOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY2xpZW50SW5mbzoge1xuICAgICAgICAgIG5hbWU6ICdtZXRlb3ItbWVkaWNhbC1jbGllbnQnLFxuICAgICAgICAgIHZlcnNpb246ICcxLjAuMCdcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCcgTUNQIEluaXRpYWxpemUgcmVzdWx0OicsIGluaXRSZXN1bHQpO1xuXG4gICAgICAvLyBTZW5kIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvblxuICAgICAgYXdhaXQgdGhpcy5zZW5kTm90aWZpY2F0aW9uKCdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJywge30pO1xuXG4gICAgICAvLyBUZXN0IGJ5IGxpc3RpbmcgdG9vbHNcbiAgICAgIGNvbnN0IHRvb2xzUmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgICAgIGNvbnNvbGUubG9nKGBNQ1AgU3RyZWFtYWJsZSBIVFRQIENvbm5lY3Rpb24gc3VjY2Vzc2Z1bCEgRm91bmQgJHt0b29sc1Jlc3VsdC50b29scz8ubGVuZ3RoIHx8IDB9IHRvb2xzYCk7XG4gICAgICBcbiAgICAgIGlmICh0b29sc1Jlc3VsdC50b29scykge1xuICAgICAgICBjb25zb2xlLmxvZygnIEF2YWlsYWJsZSB0b29sczonKTtcbiAgICAgICAgdG9vbHNSZXN1bHQudG9vbHMuZm9yRWFjaCgodG9vbDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aW5kZXggKyAxfS4gJHt0b29sLm5hbWV9IC0gJHt0b29sLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCcgRmFpbGVkIHRvIGNvbm5lY3QgdG8gTUNQIFNlcnZlciB2aWEgU3RyZWFtYWJsZSBIVFRQOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tTZXJ2ZXJIZWFsdGgoKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5iYXNlVXJsfS9oZWFsdGhgLCB7XG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCkgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgTUNQIFNlcnZlciBoZWFsdGggY2hlY2sgcGFzc2VkOicsIGhlYWx0aCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgU2VydmVyIHJldHVybmVkICR7cmVzcG9uc2Uuc3RhdHVzfWAgfTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5iYXNlVXJsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBTZXJ2ZXIgbm90IGNvbm5lY3RlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGlkID0gdGhpcy5yZXF1ZXN0SWQrKztcbiAgICBjb25zdCByZXF1ZXN0OiBNQ1BSZXF1ZXN0ID0ge1xuICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICBtZXRob2QsXG4gICAgICBwYXJhbXMsXG4gICAgICBpZFxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2V2ZW50LXN0cmVhbScsIC8vIFN0cmVhbWFibGUgSFRUUDogTXVzdCBhY2NlcHQgYm90aCBKU09OIGFuZCBTU0VcbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBzZXNzaW9uIElEIGlmIHdlIGhhdmUgb25lIChTdHJlYW1hYmxlIEhUVFAgc2Vzc2lvbiBtYW5hZ2VtZW50KVxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbklkKSB7XG4gICAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYCBTZW5kaW5nIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0OiAke21ldGhvZH1gLCB7IGlkLCBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgaGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdCksXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgzMDAwMCkgLy8gMzAgc2Vjb25kIHRpbWVvdXRcbiAgICAgIH0pO1xuXG4gICAgICAvLyBFeHRyYWN0IHNlc3Npb24gSUQgZnJvbSByZXNwb25zZSBoZWFkZXJzIGlmIHByZXNlbnQgKFN0cmVhbWFibGUgSFRUUCBzZXNzaW9uIG1hbmFnZW1lbnQpXG4gICAgICBjb25zdCByZXNwb25zZVNlc3Npb25JZCA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdtY3Atc2Vzc2lvbi1pZCcpO1xuICAgICAgaWYgKHJlc3BvbnNlU2Vzc2lvbklkICYmICF0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICB0aGlzLnNlc3Npb25JZCA9IHJlc3BvbnNlU2Vzc2lvbklkO1xuICAgICAgICBjb25zb2xlLmxvZygnIFJlY2VpdmVkIHNlc3Npb24gSUQ6JywgdGhpcy5zZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4gUmVzcG9uc2U6ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBjb250ZW50IHR5cGUgLSBTdHJlYW1hYmxlIEhUVFAgc2hvdWxkIHJldHVybiBKU09OIGZvciBtb3N0IHJlc3BvbnNlc1xuICAgICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk7XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBTU0UgdXBncmFkZSAob3B0aW9uYWwgaW4gU3RyZWFtYWJsZSBIVFRQIGZvciBzdHJlYW1pbmcgcmVzcG9uc2VzKVxuICAgICAgaWYgKGNvbnRlbnRUeXBlICYmIGNvbnRlbnRUeXBlLmluY2x1ZGVzKCd0ZXh0L2V2ZW50LXN0cmVhbScpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgU2VydmVyIHVwZ3JhZGVkIHRvIFNTRSBmb3Igc3RyZWFtaW5nIHJlc3BvbnNlJyk7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZVN0cmVhbWluZ1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RhbmRhcmQgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKCFjb250ZW50VHlwZSB8fCAhY29udGVudFR5cGUuaW5jbHVkZXMoJ2FwcGxpY2F0aW9uL2pzb24nKSkge1xuICAgICAgICBjb25zdCByZXNwb25zZVRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyBVbmV4cGVjdGVkIGNvbnRlbnQgdHlwZTonLCBjb250ZW50VHlwZSk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyBSZXNwb25zZSB0ZXh0OicsIHJlc3BvbnNlVGV4dC5zdWJzdHJpbmcoMCwgMjAwKSk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgSlNPTiByZXNwb25zZSBidXQgZ290ICR7Y29udGVudFR5cGV9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogTUNQUmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNQ1AgZXJyb3IgJHtyZXN1bHQuZXJyb3IuY29kZX06ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGAgU3RyZWFtYWJsZSBIVFRQIHJlcXVlc3QgJHttZXRob2R9IHN1Y2Nlc3NmdWxgKTtcbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcihgIFN0cmVhbWFibGUgSFRUUCByZXF1ZXN0IGZhaWxlZCBmb3IgbWV0aG9kICR7bWV0aG9kfTpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVN0cmVhbWluZ1Jlc3BvbnNlKHJlc3BvbnNlOiBSZXNwb25zZSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gSGFuZGxlIFNTRSBzdHJlYW1pbmcgcmVzcG9uc2UgKG9wdGlvbmFsIHBhcnQgb2YgU3RyZWFtYWJsZSBIVFRQKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCByZWFkZXIgPSByZXNwb25zZS5ib2R5Py5nZXRSZWFkZXIoKTtcbiAgICAgIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcbiAgICAgIGxldCBidWZmZXIgPSAnJztcbiAgICAgIGxldCByZXN1bHQ6IGFueSA9IG51bGw7XG5cbiAgICAgIGNvbnN0IHByb2Nlc3NDaHVuayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGRvbmUsIHZhbHVlIH0gPSBhd2FpdCByZWFkZXIhLnJlYWQoKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdObyByZXN1bHQgcmVjZWl2ZWQgZnJvbSBzdHJlYW1pbmcgcmVzcG9uc2UnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYnVmZmVyICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcbiAgICAgICAgICBjb25zdCBsaW5lcyA9IGJ1ZmZlci5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgYnVmZmVyID0gbGluZXMucG9wKCkgfHwgJyc7IC8vIEtlZXAgaW5jb21wbGV0ZSBsaW5lIGluIGJ1ZmZlclxuXG4gICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICBpZiAobGluZS5zdGFydHNXaXRoKCdkYXRhOiAnKSkge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBsaW5lLnNsaWNlKDYpOyAvLyBSZW1vdmUgJ2RhdGE6ICcgcHJlZml4XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEgPT09ICdbRE9ORV0nKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcnNlZC5yZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnNlZC5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJzZWQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IocGFyc2VkLmVycm9yLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGludmFsaWQgSlNPTiBsaW5lc1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIHBhcnNlIFNTRSBkYXRhOicsIGRhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQ29udGludWUgcmVhZGluZ1xuICAgICAgICAgIHByb2Nlc3NDaHVuaygpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIHByb2Nlc3NDaHVuaygpO1xuXG4gICAgICAvLyBUaW1lb3V0IGZvciBzdHJlYW1pbmcgcmVzcG9uc2VzXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcmVhZGVyPy5jYW5jZWwoKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignU3RyZWFtaW5nIHJlc3BvbnNlIHRpbWVvdXQnKSk7XG4gICAgICB9LCA2MDAwMCk7IC8vIDYwIHNlY29uZCB0aW1lb3V0IGZvciBzdHJlYW1pbmdcbiAgICB9KTtcbiAgfVxuXG5wcml2YXRlIGFzeW5jIHNlbmROb3RpZmljYXRpb24obWV0aG9kOiBzdHJpbmcsIHBhcmFtczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IG5vdGlmaWNhdGlvbiA9IHtcbiAgICBqc29ucnBjOiAnMi4wJyxcbiAgICBtZXRob2QsXG4gICAgcGFyYW1zXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbiwgdGV4dC9ldmVudC1zdHJlYW0nLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIGhlYWRlcnNbJ21jcC1zZXNzaW9uLWlkJ10gPSB0aGlzLnNlc3Npb25JZDtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgIFNlbmRpbmcgbm90aWZpY2F0aW9uOiAke21ldGhvZH1gLCB7IHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkobm90aWZpY2F0aW9uKSxcbiAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCgxMDAwMClcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYE5vdGlmaWNhdGlvbiAke21ldGhvZH0gZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gLSAke2Vycm9yVGV4dH1gKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAtICR7ZXJyb3JUZXh0fWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgIE5vdGlmaWNhdGlvbiAke21ldGhvZH0gc2VudCBzdWNjZXNzZnVsbHlgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgTm90aWZpY2F0aW9uICR7bWV0aG9kfSBmYWlsZWQ6YCwgZXJyb3IpO1xuICAgIHRocm93IGVycm9yOyAvLyBSZS10aHJvdyB0byBzdG9wIGluaXRpYWxpemF0aW9uIGlmIG5vdGlmaWNhdGlvbiBmYWlsc1xuICB9XG59XG5cbiAgYXN5bmMgbGlzdFRvb2xzKCk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCF0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTUNQIFNlcnZlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdCgndG9vbHMvbGlzdCcsIHt9KTtcbiAgfVxuXG4gIGFzeW5jIGNhbGxUb29sKG5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNQ1AgU2VydmVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0KCd0b29scy9jYWxsJywge1xuICAgICAgbmFtZSxcbiAgICAgIGFyZ3VtZW50czogYXJnc1xuICAgIH0pO1xuICB9XG5cbiAgZGlzY29ubmVjdCgpIHtcbiAgICAvLyBGb3IgU3RyZWFtYWJsZSBIVFRQLCB3ZSBjYW4gb3B0aW9uYWxseSBzZW5kIGEgREVMRVRFIHJlcXVlc3QgdG8gY2xlYW4gdXAgdGhlIHNlc3Npb25cbiAgICBpZiAodGhpcy5zZXNzaW9uSWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZldGNoKGAke3RoaXMuYmFzZVVybH0vbWNwYCwge1xuICAgICAgICAgIG1ldGhvZDogJ0RFTEVURScsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ21jcC1zZXNzaW9uLWlkJzogdGhpcy5zZXNzaW9uSWQsXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyBvbiBkaXNjb25uZWN0XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHRoaXMuc2Vzc2lvbklkID0gbnVsbDtcbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICBjb25zb2xlLmxvZygn8J+TiyBEaXNjb25uZWN0ZWQgZnJvbSBNQ1AgU2VydmVyJyk7XG4gIH1cbn1cblxuLy8gTWVkaWNhbCBvcGVyYXRpb25zIGltcGxlbWVudGF0aW9uIGZvciBTdHJlYW1hYmxlIEhUVFAgdHJhbnNwb3J0XG5leHBvcnQgaW50ZXJmYWNlIE1lZGljYWxEb2N1bWVudE9wZXJhdGlvbnMge1xuICB1cGxvYWREb2N1bWVudChmaWxlOiBCdWZmZXIsIGZpbGVuYW1lOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBvcHRpb25zPzogYW55KTogUHJvbWlzZTxhbnk+O1xuICBsaXN0RG9jdW1lbnRzKG9wdGlvbnM/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICBmaW5kU2ltaWxhckNhc2VzKGNyaXRlcmlhOiBhbnkpOiBQcm9taXNlPGFueT47XG4gIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9ucz86IGFueSk6IFByb21pc2U8YW55PjtcbiAgZ2V0TWVkaWNhbEluc2lnaHRzKHF1ZXJ5OiBzdHJpbmcsIGNvbnRleHQ/OiBhbnkpOiBQcm9taXNlPGFueT47XG4gIFxuICAvLyBMZWdhY3kgbWV0aG9kcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBleHRyYWN0VGV4dChkb2N1bWVudElkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gIHNlbWFudGljU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIHBhdGllbnRJZD86IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgZ2V0UGF0aWVudFN1bW1hcnkocGF0aWVudElkZW50aWZpZXI6IHN0cmluZyk6IFByb21pc2U8YW55Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1lZGljYWxPcGVyYXRpb25zKGNvbm5lY3Rpb246IE1lZGljYWxTZXJ2ZXJDb25uZWN0aW9uKTogTWVkaWNhbERvY3VtZW50T3BlcmF0aW9ucyB7XG4gIHJldHVybiB7XG4gICAgLy8gTmV3IHRvb2wgbWV0aG9kcyB1c2luZyB0aGUgZXhhY3QgdG9vbCBuYW1lcyBmcm9tIHlvdXIgc2VydmVyXG4gICAgYXN5bmMgdXBsb2FkRG9jdW1lbnQoZmlsZTogQnVmZmVyLCBmaWxlbmFtZTogc3RyaW5nLCBtaW1lVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogYW55KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCd1cGxvYWREb2N1bWVudCcsIHtcbiAgICAgICAgdGl0bGU6IGZpbGVuYW1lLFxuICAgICAgICBmaWxlQnVmZmVyOiBmaWxlLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgICAgICBmaWxlVHlwZTogbWltZVR5cGUuc3BsaXQoJy8nKVsxXSB8fCAndW5rbm93bicsXG4gICAgICAgICAgc2l6ZTogZmlsZS5sZW5ndGhcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIHRoZSByZXN1bHQgaWYgaXQncyBpbiB0aGUgY29udGVudCBhcnJheSBmb3JtYXRcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBzZWFyY2hEb2N1bWVudHMocXVlcnk6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ3NlYXJjaERvY3VtZW50cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGxpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwLFxuICAgICAgICB0aHJlc2hvbGQ6IG9wdGlvbnMudGhyZXNob2xkIHx8IDAuNyxcbiAgICAgICAgZmlsdGVyOiBvcHRpb25zLmZpbHRlciB8fCB7fVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBsaXN0RG9jdW1lbnRzKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdsaXN0RG9jdW1lbnRzJywge1xuICAgICAgICBsaW1pdDogb3B0aW9ucy5saW1pdCB8fCAyMCxcbiAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCB8fCAwLFxuICAgICAgICBmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyIHx8IHt9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGV4dHJhY3RNZWRpY2FsRW50aXRpZXModGV4dDogc3RyaW5nLCBkb2N1bWVudElkPzogc3RyaW5nKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLmNhbGxUb29sKCdleHRyYWN0TWVkaWNhbEVudGl0aWVzJywge1xuICAgICAgICB0ZXh0LFxuICAgICAgICBkb2N1bWVudElkXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGZpbmRTaW1pbGFyQ2FzZXMoY3JpdGVyaWE6IGFueSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jYWxsVG9vbCgnZmluZFNpbWlsYXJDYXNlcycsIGNyaXRlcmlhKTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5jb250ZW50ICYmIHJlc3VsdC5jb250ZW50WzBdICYmIHJlc3VsdC5jb250ZW50WzBdLnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQuY29udGVudFswXS50ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGFzeW5jIGFuYWx5emVQYXRpZW50SGlzdG9yeShwYXRpZW50SWQ6IHN0cmluZywgb3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2FuYWx5emVQYXRpZW50SGlzdG9yeScsIHtcbiAgICAgICAgcGF0aWVudElkLFxuICAgICAgICBhbmFseXNpc1R5cGU6IG9wdGlvbnMuYW5hbHlzaXNUeXBlIHx8ICdzdW1tYXJ5JyxcbiAgICAgICAgZGF0ZVJhbmdlOiBvcHRpb25zLmRhdGVSYW5nZVxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuY29udGVudCAmJiByZXN1bHQuY29udGVudFswXSAmJiByZXN1bHQuY29udGVudFswXS50ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRNZWRpY2FsSW5zaWdodHMocXVlcnk6IHN0cmluZywgY29udGV4dDogYW55ID0ge30pIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2dldE1lZGljYWxJbnNpZ2h0cycsIHtcbiAgICAgICAgcXVlcnksXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGxpbWl0OiBjb250ZXh0LmxpbWl0IHx8IDVcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgLy8gTGVnYWN5IGNvbXBhdGliaWxpdHkgbWV0aG9kc1xuICAgIGFzeW5jIGV4dHJhY3RUZXh0KGRvY3VtZW50SWQ6IHN0cmluZykge1xuICAgICAgLy8gVGhpcyBtaWdodCBub3QgZXhpc3QgYXMgYSBzZXBhcmF0ZSB0b29sLCB0cnkgdG8gZ2V0IGRvY3VtZW50IGNvbnRlbnRcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uY2FsbFRvb2woJ2xpc3REb2N1bWVudHMnLCB7XG4gICAgICAgIGZpbHRlcjogeyBfaWQ6IGRvY3VtZW50SWQgfSxcbiAgICAgICAgbGltaXQ6IDFcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LmNvbnRlbnQgJiYgcmVzdWx0LmNvbnRlbnRbMF0gJiYgcmVzdWx0LmNvbnRlbnRbMF0udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzdWx0LmNvbnRlbnRbMF0udGV4dCk7XG4gICAgICAgICAgaWYgKHBhcnNlZC5kb2N1bWVudHMgJiYgcGFyc2VkLmRvY3VtZW50c1swXSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkVGV4dDogcGFyc2VkLmRvY3VtZW50c1swXS5jb250ZW50LFxuICAgICAgICAgICAgICBjb25maWRlbmNlOiAxMDBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gZmFsbGJhY2tcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RleHQgZXh0cmFjdGlvbiBub3Qgc3VwcG9ydGVkIC0gdXNlIGRvY3VtZW50IGNvbnRlbnQgZnJvbSB1cGxvYWQgcmVzdWx0Jyk7XG4gICAgfSxcblxuICAgIGFzeW5jIHNlYXJjaEJ5RGlhZ25vc2lzKHBhdGllbnRJZGVudGlmaWVyOiBzdHJpbmcsIGRpYWdub3Npc1F1ZXJ5Pzogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhkaWFnbm9zaXNRdWVyeSB8fCBwYXRpZW50SWRlbnRpZmllciwge1xuICAgICAgICBmaWx0ZXI6IHsgcGF0aWVudElkOiBwYXRpZW50SWRlbnRpZmllciB9LFxuICAgICAgICBsaW1pdDogMTBcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBzZW1hbnRpY1NlYXJjaChxdWVyeTogc3RyaW5nLCBwYXRpZW50SWQ/OiBzdHJpbmcpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNlYXJjaERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgICBmaWx0ZXI6IHBhdGllbnRJZCA/IHsgcGF0aWVudElkIH0gOiB7fSxcbiAgICAgICAgbGltaXQ6IDVcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXRQYXRpZW50U3VtbWFyeShwYXRpZW50SWRlbnRpZmllcjogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5hbmFseXplUGF0aWVudEhpc3RvcnkocGF0aWVudElkZW50aWZpZXIsIHtcbiAgICAgICAgYW5hbHlzaXNUeXBlOiAnc3VtbWFyeSdcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn0iLCJpbXBvcnQgeyBNb25nbyB9IGZyb20gJ21ldGVvci9tb25nbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzc2FnZSB7XG4gIF9pZD86IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JztcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IE1lc3NhZ2VzQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uPE1lc3NhZ2U+KCdtZXNzYWdlcycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiwgTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vc2Vzc2lvbnMvc2Vzc2lvbnMnO1xuaW1wb3J0IHsgTUNQQ2xpZW50TWFuYWdlciB9IGZyb20gJy9pbXBvcnRzL2FwaS9tY3AvbWNwQ2xpZW50TWFuYWdlcic7XG5pbXBvcnQgeyBDb250ZXh0TWFuYWdlciB9IGZyb20gJy4uL2NvbnRleHQvY29udGV4dE1hbmFnZXInO1xuXG4vLyBNZXRlb3IgTWV0aG9kc1xuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnbWVzc2FnZXMuaW5zZXJ0JyhtZXNzYWdlRGF0YTogT21pdDxNZXNzYWdlLCAnX2lkJz4pIHtcbiAgICBjaGVjayhtZXNzYWdlRGF0YSwge1xuICAgICAgY29udGVudDogU3RyaW5nLFxuICAgICAgcm9sZTogU3RyaW5nLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLFxuICAgICAgc2Vzc2lvbklkOiBTdHJpbmdcbiAgICB9KTtcblxuICAgIGNvbnN0IG1lc3NhZ2VJZCA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5pbnNlcnRBc3luYyhtZXNzYWdlRGF0YSk7XG4gICAgXG4gICAgLy8gVXBkYXRlIGNvbnRleHQgaWYgc2Vzc2lvbiBleGlzdHNcbiAgICBpZiAobWVzc2FnZURhdGEuc2Vzc2lvbklkKSB7XG4gICAgICBhd2FpdCBDb250ZXh0TWFuYWdlci51cGRhdGVDb250ZXh0KG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAuLi5tZXNzYWdlRGF0YSxcbiAgICAgICAgX2lkOiBtZXNzYWdlSWRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgc2Vzc2lvblxuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKG1lc3NhZ2VEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgbGFzdE1lc3NhZ2U6IG1lc3NhZ2VEYXRhLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMCksXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0sXG4gICAgICAgICRpbmM6IHsgbWVzc2FnZUNvdW50OiAxIH1cbiAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBBdXRvLWdlbmVyYXRlIHRpdGxlIGFmdGVyIGZpcnN0IHVzZXIgbWVzc2FnZVxuICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMobWVzc2FnZURhdGEuc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24ubWVzc2FnZUNvdW50IDw9IDIgJiYgbWVzc2FnZURhdGEucm9sZSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIE1ldGVvci5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBNZXRlb3IuY2FsbCgnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScsIG1lc3NhZ2VEYXRhLnNlc3Npb25JZCk7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBtZXNzYWdlSWQ7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5wcm9jZXNzUXVlcnknKHF1ZXJ5OiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIGNoZWNrKHF1ZXJ5LCBTdHJpbmcpO1xuICAgIGNoZWNrKHNlc3Npb25JZCwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgXG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5LiBQbGVhc2UgY2hlY2sgeW91ciBBUEkgY29uZmlndXJhdGlvbi4nO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIFByb2Nlc3NpbmcgcXVlcnkgd2l0aCBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbjogXCIke3F1ZXJ5fVwiYCk7XG4gICAgICAgIFxuICAgICAgICAvLyBCdWlsZCBjb250ZXh0IGZvciB0aGUgcXVlcnlcbiAgICAgICAgY29uc3QgY29udGV4dDogYW55ID0geyBzZXNzaW9uSWQgfTtcbiAgICAgICAgXG4gICAgICAgIGlmIChzZXNzaW9uSWQpIHtcbiAgICAgICAgICAvLyBHZXQgc2Vzc2lvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoc2Vzc2lvbklkKTtcbiAgICAgICAgICBpZiAoc2Vzc2lvbj8ubWV0YWRhdGE/LnBhdGllbnRJZCkge1xuICAgICAgICAgICAgY29udGV4dC5wYXRpZW50SWQgPSBzZXNzaW9uLm1ldGFkYXRhLnBhdGllbnRJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gR2V0IGNvbnZlcnNhdGlvbiBjb250ZXh0XG4gICAgICAgICAgY29uc3QgY29udGV4dERhdGEgPSBhd2FpdCBDb250ZXh0TWFuYWdlci5nZXRDb250ZXh0KHNlc3Npb25JZCk7XG4gICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25Db250ZXh0ID0gY29udGV4dERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExldCBDbGF1ZGUgaW50ZWxsaWdlbnRseSBkZWNpZGUgd2hhdCB0b29scyB0byB1c2UgKGluY2x1ZGVzIEVwaWMgdG9vbHMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbWNwTWFuYWdlci5wcm9jZXNzUXVlcnlXaXRoSW50ZWxsaWdlbnRUb29sU2VsZWN0aW9uKHF1ZXJ5LCBjb250ZXh0KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFVwZGF0ZSBjb250ZXh0IGFmdGVyIHByb2Nlc3NpbmdcbiAgICAgICAgaWYgKHNlc3Npb25JZCkge1xuICAgICAgICAgIGF3YWl0IGV4dHJhY3RBbmRVcGRhdGVDb250ZXh0KHF1ZXJ5LCByZXNwb25zZSwgc2Vzc2lvbklkKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignSW50ZWxsaWdlbnQgTUNQIHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBcbiAgICAgICAgLy8gUHJvdmlkZSBoZWxwZnVsIGVycm9yIG1lc3NhZ2VzIGJhc2VkIG9uIHRoZSBlcnJvciB0eXBlXG4gICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgY29ubmVjdGVkJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIG1lZGljYWwgZGF0YSBzeXN0ZW1zLiBQbGVhc2UgZW5zdXJlIHRoZSBNQ1Agc2VydmVycyBhcmUgcnVubmluZyBhbmQgdHJ5IGFnYWluLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXBpYyBNQ1AgU2VydmVyJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0lcXCdtIGhhdmluZyB0cm91YmxlIGNvbm5lY3RpbmcgdG8gdGhlIEVwaWMgRUhSIHN5c3RlbS4gUGxlYXNlIGVuc3VyZSB0aGUgRXBpYyBNQ1Agc2VydmVyIGlzIHJ1bm5pbmcgYW5kIHByb3Blcmx5IGNvbmZpZ3VyZWQuJztcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdBaWRib3gnKSkge1xuICAgICAgICAgIHJldHVybiAnSVxcJ20gaGF2aW5nIHRyb3VibGUgY29ubmVjdGluZyB0byB0aGUgQWlkYm94IEZISVIgc3lzdGVtLiBQbGVhc2UgZW5zdXJlIHRoZSBBaWRib3ggTUNQIHNlcnZlciBpcyBydW5uaW5nIGFuZCBwcm9wZXJseSBjb25maWd1cmVkLic7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQVBJJykpIHtcbiAgICAgICAgICByZXR1cm4gJ0kgZW5jb3VudGVyZWQgYW4gQVBJIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IGFnYWluIGluIGEgbW9tZW50Lic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICdJIGVuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LiBQbGVhc2UgdHJ5IHJlcGhyYXNpbmcgeW91ciBxdWVzdGlvbiBvciBjb250YWN0IHN1cHBvcnQgaWYgdGhlIGlzc3VlIHBlcnNpc3RzLic7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICdTaW11bGF0aW9uIG1vZGUgLSBubyBhY3R1YWwgcHJvY2Vzc2luZyc7XG4gIH0sXG5cbiAgYXN5bmMgJ21jcC5zd2l0Y2hQcm92aWRlcicocHJvdmlkZXI6ICdhbnRocm9waWMnIHwgJ296d2VsbCcpIHtcbiAgICBjaGVjayhwcm92aWRlciwgU3RyaW5nKTtcbiAgICBcbiAgICBpZiAoIXRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICBjb25zdCBtY3BNYW5hZ2VyID0gTUNQQ2xpZW50TWFuYWdlci5nZXRJbnN0YW5jZSgpO1xuICAgICAgXG4gICAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21jcC1ub3QtcmVhZHknLCAnTUNQIENsaWVudCBpcyBub3QgcmVhZHknKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5zd2l0Y2hQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIHJldHVybiBgU3dpdGNoZWQgdG8gJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uYDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Byb3ZpZGVyIHN3aXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3N3aXRjaC1mYWlsZWQnLCBgRmFpbGVkIHRvIHN3aXRjaCBwcm92aWRlcjogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJ1Byb3ZpZGVyIHN3aXRjaGVkIChzaW11bGF0aW9uIG1vZGUpJztcbiAgfSxcblxuICAnbWNwLmdldEN1cnJlbnRQcm92aWRlcicoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG1jcE1hbmFnZXIuZ2V0Q3VycmVudFByb3ZpZGVyKCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnYW50aHJvcGljJztcbiAgfSxcblxuICAnbWNwLmdldEF2YWlsYWJsZVByb3ZpZGVycycoKSB7XG4gICAgaWYgKCF0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICAgIFxuICAgICAgaWYgKCFtY3BNYW5hZ2VyLmlzUmVhZHkoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiBtY3BNYW5hZ2VyLmdldEF2YWlsYWJsZVByb3ZpZGVycygpO1xuICAgIH1cbiAgICBcbiAgICAvLyBGYWxsYmFjayBmb3Igc2ltdWxhdGlvblxuICAgIGNvbnN0IHNldHRpbmdzID0gTWV0ZW9yLnNldHRpbmdzPy5wcml2YXRlO1xuICAgIGNvbnN0IGFudGhyb3BpY0tleSA9IHNldHRpbmdzPy5BTlRIUk9QSUNfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxLZXkgPSBzZXR0aW5ncz8uT1pXRUxMX0FQSV9LRVkgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0FQSV9LRVk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlkZXJzID0gW107XG4gICAgaWYgKGFudGhyb3BpY0tleSkgcHJvdmlkZXJzLnB1c2goJ2FudGhyb3BpYycpO1xuICAgIGlmIChvendlbGxLZXkpIHByb3ZpZGVycy5wdXNoKCdvendlbGwnKTtcbiAgICBcbiAgICByZXR1cm4gcHJvdmlkZXJzO1xuICB9LFxuXG4gICdtY3AuZ2V0QXZhaWxhYmxlVG9vbHMnKCkge1xuICAgIGlmICghdGhpcy5pc1NpbXVsYXRpb24pIHtcbiAgICAgIGNvbnN0IG1jcE1hbmFnZXIgPSBNQ1BDbGllbnRNYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gICAgICBcbiAgICAgIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gW107XG4gIH0sXG5cbiAgLy8gU2VydmVyIGhlYWx0aCBjaGVjayBtZXRob2QgLSBpbmNsdWRlcyBFcGljXG4gIGFzeW5jICdtY3AuaGVhbHRoQ2hlY2snKCkge1xuICAgIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICAgIG1lc3NhZ2U6ICdBbGwgc3lzdGVtcyBvcGVyYXRpb25hbCAoc2ltdWxhdGlvbiBtb2RlKScsXG4gICAgICAgIHNlcnZlcnM6IHtcbiAgICAgICAgICBlcGljOiAnc2ltdWxhdGVkJyxcbiAgICAgICAgICBhaWRib3g6ICdzaW11bGF0ZWQnLFxuICAgICAgICAgIG1lZGljYWw6ICdzaW11bGF0ZWQnXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdNQ1AgQ2xpZW50IG5vdCByZWFkeScsXG4gICAgICAgIHNlcnZlcnM6IHt9XG4gICAgICB9O1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFsdGggPSBhd2FpdCBtY3BNYW5hZ2VyLmhlYWx0aENoZWNrKCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgICAgbWVzc2FnZTogJ0hlYWx0aCBjaGVjayBjb21wbGV0ZWQnLFxuICAgICAgICBzZXJ2ZXJzOiB7XG4gICAgICAgICAgZXBpYzogaGVhbHRoLmVwaWMgPyAnaGVhbHRoeScgOiAndW5hdmFpbGFibGUnLFxuICAgICAgICAgIGFpZGJveDogaGVhbHRoLmFpZGJveCA/ICdoZWFsdGh5JyA6ICd1bmF2YWlsYWJsZSdcbiAgICAgICAgfSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IGBIZWFsdGggY2hlY2sgZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICAgICAgc2VydmVyczoge30sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKVxuICAgICAgfTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gTWVkaWNhbCBkb2N1bWVudCBtZXRob2RzIChleGlzdGluZylcbmFzeW5jICdtZWRpY2FsLnVwbG9hZERvY3VtZW50JyhmaWxlRGF0YToge1xuICBmaWxlbmFtZTogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XG4gIHBhdGllbnROYW1lPzogc3RyaW5nO1xuICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG59KSB7XG4gIGNoZWNrKGZpbGVEYXRhLCB7XG4gICAgZmlsZW5hbWU6IFN0cmluZyxcbiAgICBjb250ZW50OiBTdHJpbmcsXG4gICAgbWltZVR5cGU6IFN0cmluZyxcbiAgICBwYXRpZW50TmFtZTogTWF0Y2guTWF5YmUoU3RyaW5nKSxcbiAgICBzZXNzaW9uSWQ6IE1hdGNoLk1heWJlKFN0cmluZylcbiAgfSk7XG5cbiAgY29uc29sZS5sb2coYCAgVXBsb2FkIHJlcXVlc3QgZm9yOiAke2ZpbGVEYXRhLmZpbGVuYW1lfSAoJHtmaWxlRGF0YS5taW1lVHlwZX0pYCk7XG4gIGNvbnNvbGUubG9nKGAgQ29udGVudCBzaXplOiAke2ZpbGVEYXRhLmNvbnRlbnQubGVuZ3RofSBjaGFyc2ApO1xuXG4gIGlmICh0aGlzLmlzU2ltdWxhdGlvbikge1xuICAgIGNvbnNvbGUubG9nKCcgU2ltdWxhdGlvbiBtb2RlIC0gcmV0dXJuaW5nIG1vY2sgZG9jdW1lbnQgSUQnKTtcbiAgICByZXR1cm4geyBcbiAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgZG9jdW1lbnRJZDogJ3NpbS0nICsgRGF0ZS5ub3coKSxcbiAgICAgIG1lc3NhZ2U6ICdEb2N1bWVudCB1cGxvYWRlZCAoc2ltdWxhdGlvbiBtb2RlKSdcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIGlmICghbWNwTWFuYWdlci5pc1JlYWR5KCkpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgTUNQIENsaWVudCBub3QgcmVhZHknKTtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01lZGljYWwgZG9jdW1lbnQgc3lzdGVtIGlzIG5vdCBhdmFpbGFibGUuIFBsZWFzZSBjb250YWN0IGFkbWluaXN0cmF0b3IuJyk7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFZhbGlkYXRlIGJhc2U2NCBjb250ZW50XG4gICAgaWYgKCFmaWxlRGF0YS5jb250ZW50IHx8IGZpbGVEYXRhLmNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgY29udGVudCBpcyBlbXB0eScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGZpbGUgc2l6ZSAoYmFzZTY0IGVuY29kZWQsIHNvIGFjdHVhbCBmaWxlIGlzIH43NSUgb2YgdGhpcylcbiAgICBjb25zdCBlc3RpbWF0ZWRGaWxlU2l6ZSA9IChmaWxlRGF0YS5jb250ZW50Lmxlbmd0aCAqIDMpIC8gNDtcbiAgICBpZiAoZXN0aW1hdGVkRmlsZVNpemUgPiAxMCAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGUgdG9vIGxhcmdlIChtYXggMTBNQiknKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgIEVzdGltYXRlZCBmaWxlIHNpemU6ICR7TWF0aC5yb3VuZChlc3RpbWF0ZWRGaWxlU2l6ZSAvIDEwMjQpfUtCYCk7XG5cbiAgICBjb25zdCBtZWRpY2FsID0gbWNwTWFuYWdlci5nZXRNZWRpY2FsT3BlcmF0aW9ucygpO1xuICAgIFxuICAgIC8vIENvbnZlcnQgYmFzZTY0IGJhY2sgdG8gYnVmZmVyIGZvciBNQ1Agc2VydmVyXG4gICAgY29uc3QgZmlsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGZpbGVEYXRhLmNvbnRlbnQsICdiYXNlNjQnKTtcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZWRpY2FsLnVwbG9hZERvY3VtZW50KFxuICAgICAgZmlsZUJ1ZmZlcixcbiAgICAgIGZpbGVEYXRhLmZpbGVuYW1lLFxuICAgICAgZmlsZURhdGEubWltZVR5cGUsXG4gICAgICB7XG4gICAgICAgIHBhdGllbnROYW1lOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgc2Vzc2lvbklkOiBmaWxlRGF0YS5zZXNzaW9uSWQgfHwgdGhpcy5jb25uZWN0aW9uPy5pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgIHVwbG9hZGVkQnk6IHRoaXMudXNlcklkIHx8ICdhbm9ueW1vdXMnLFxuICAgICAgICB1cGxvYWREYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgTUNQIHVwbG9hZCBzdWNjZXNzZnVsOicsIHJlc3VsdCk7XG4gICAgXG4gICAgLy8gVXBkYXRlIHNlc3Npb24gbWV0YWRhdGEgaWYgd2UgaGF2ZSBzZXNzaW9uIElEXG4gICAgaWYgKGZpbGVEYXRhLnNlc3Npb25JZCAmJiByZXN1bHQuZG9jdW1lbnRJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKGZpbGVEYXRhLnNlc3Npb25JZCwge1xuICAgICAgICAgICRhZGRUb1NldDoge1xuICAgICAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogcmVzdWx0LmRvY3VtZW50SWRcbiAgICAgICAgICB9LFxuICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICdtZXRhZGF0YS5wYXRpZW50SWQnOiBmaWxlRGF0YS5wYXRpZW50TmFtZSB8fCAnVW5rbm93biBQYXRpZW50JyxcbiAgICAgICAgICAgICdtZXRhZGF0YS5sYXN0VXBsb2FkJzogbmV3IERhdGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgU2Vzc2lvbiBtZXRhZGF0YSB1cGRhdGVkJyk7XG4gICAgICB9IGNhdGNoICh1cGRhdGVFcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyBGYWlsZWQgdG8gdXBkYXRlIHNlc3Npb24gbWV0YWRhdGE6JywgdXBkYXRlRXJyb3IpO1xuICAgICAgICAvLyBEb24ndCBmYWlsIHRoZSB3aG9sZSBvcGVyYXRpb24gZm9yIHRoaXNcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBEb2N1bWVudCB1cGxvYWQgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFByb3ZpZGUgc3BlY2lmaWMgZXJyb3IgbWVzc2FnZXNcbiAgICBpZiAoZXJyb3IubWVzc2FnZT8uaW5jbHVkZXMoJ25vdCBjb25uZWN0ZWQnKSB8fCBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnRUNPTk5SRUZVU0VEJykpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ21lZGljYWwtc2VydmVyLW9mZmxpbmUnLCAnTWVkaWNhbCBkb2N1bWVudCBzZXJ2ZXIgaXMgbm90IGF2YWlsYWJsZS4gUGxlYXNlIGNvbnRhY3QgYWRtaW5pc3RyYXRvci4nKTtcbiAgICB9IGVsc2UgaWYgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdGaWxlIHRvbyBsYXJnZScpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdmaWxlLXRvby1sYXJnZScsICdGaWxlIGlzIHRvbyBsYXJnZS4gTWF4aW11bSBzaXplIGlzIDEwTUIuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnSW52YWxpZCBmaWxlIHR5cGUnKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignaW52YWxpZC1maWxlLXR5cGUnLCAnSW52YWxpZCBmaWxlIHR5cGUuIFBsZWFzZSB1c2UgUERGIG9yIGltYWdlIGZpbGVzIG9ubHkuJyk7XG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygndGltZW91dCcpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCd1cGxvYWQtdGltZW91dCcsICdVcGxvYWQgdGltZWQgb3V0LiBQbGVhc2UgdHJ5IGFnYWluIHdpdGggYSBzbWFsbGVyIGZpbGUuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3VwbG9hZC1mYWlsZWQnLCBgVXBsb2FkIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJ31gKTtcbiAgICB9XG4gIH1cbn0sXG5cblxuICBhc3luYyAnbWVkaWNhbC5wcm9jZXNzRG9jdW1lbnQnKGRvY3VtZW50SWQ6IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgY2hlY2soZG9jdW1lbnRJZCwgU3RyaW5nKTtcbiAgICBjaGVjayhzZXNzaW9uSWQsIE1hdGNoLk1heWJlKFN0cmluZykpO1xuXG4gICAgaWYgKHRoaXMuaXNTaW11bGF0aW9uKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnRG9jdW1lbnQgcHJvY2Vzc2VkIChzaW11bGF0aW9uIG1vZGUpJyxcbiAgICAgICAgdGV4dEV4dHJhY3Rpb246IHsgZXh0cmFjdGVkVGV4dDogJ1NhbXBsZSB0ZXh0JywgY29uZmlkZW5jZTogOTUgfSxcbiAgICAgICAgbWVkaWNhbEVudGl0aWVzOiB7IGVudGl0aWVzOiBbXSwgc3VtbWFyeTogeyBkaWFnbm9zaXNDb3VudDogMCwgbWVkaWNhdGlvbkNvdW50OiAwLCBsYWJSZXN1bHRDb3VudDogMCB9IH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgICBcbiAgICBpZiAoIW1jcE1hbmFnZXIuaXNSZWFkeSgpKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdtY3Atbm90LXJlYWR5JywgJ01DUCBDbGllbnQgaXMgbm90IHJlYWR5Jyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1lZGljYWwgPSBtY3BNYW5hZ2VyLmdldE1lZGljYWxPcGVyYXRpb25zKCk7XG4gICAgICBcbiAgICAgIC8vIFByb2Nlc3MgZG9jdW1lbnQgdXNpbmcgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1lZGljYWwuZXh0cmFjdE1lZGljYWxFbnRpdGllcygnJywgZG9jdW1lbnRJZCk7XG4gICAgICBcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignIERvY3VtZW50IHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcigncHJvY2Vzc2luZy1mYWlsZWQnLCBgRmFpbGVkIHRvIHByb2Nlc3MgZG9jdW1lbnQ6ICR7ZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgfVxuICB9XG59KTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGV4dHJhY3QgYW5kIHVwZGF0ZSBjb250ZXh0XG5hc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kVXBkYXRlQ29udGV4dChcbiAgcXVlcnk6IHN0cmluZywgXG4gIHJlc3BvbnNlOiBzdHJpbmcsIFxuICBzZXNzaW9uSWQ6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCBwYXRpZW50IG5hbWUgZnJvbSBxdWVyeVxuICAgIGNvbnN0IHBhdGllbnRNYXRjaCA9IHF1ZXJ5Lm1hdGNoKC8oPzpwYXRpZW50fGZvcilcXHMrKFtBLVpdW2Etel0rKD86XFxzK1tBLVpdW2Etel0rKT8pL2kpO1xuICAgIGlmIChwYXRpZW50TWF0Y2gpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJHNldDogeyAnbWV0YWRhdGEucGF0aWVudElkJzogcGF0aWVudE1hdGNoWzFdIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IG1lZGljYWwgdGVybXMgZnJvbSByZXNwb25zZVxuICAgIGNvbnN0IG1lZGljYWxUZXJtcyA9IGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgIGlmIChtZWRpY2FsVGVybXMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKHNlc3Npb25JZCwge1xuICAgICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgICAnbWV0YWRhdGEudGFncyc6IHsgJGVhY2g6IG1lZGljYWxUZXJtcyB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBFeHRyYWN0IGRhdGEgc291cmNlcyBtZW50aW9uZWQgaW4gcmVzcG9uc2VcbiAgICBjb25zdCBkYXRhU291cmNlcyA9IGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZSk7XG4gICAgaWYgKGRhdGFTb3VyY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgJGFkZFRvU2V0OiB7XG4gICAgICAgICAgJ21ldGFkYXRhLmRhdGFTb3VyY2VzJzogeyAkZWFjaDogZGF0YVNvdXJjZXMgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgY29udGV4dDonLCBlcnJvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdE1lZGljYWxUZXJtc0Zyb21SZXNwb25zZShyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBtZWRpY2FsUGF0dGVybnMgPSBbXG4gICAgL1xcYig/OmRpYWdub3NlZCB3aXRofGRpYWdub3NpcyBvZilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnByZXNjcmliZWR8bWVkaWNhdGlvbilcXHMrKFteLC5dKykvZ2ksXG4gICAgL1xcYig/OnRyZWF0bWVudCBmb3J8dHJlYXRpbmcpXFxzKyhbXiwuXSspL2dpLFxuICAgIC9cXGIoPzpjb25kaXRpb258ZGlzZWFzZSk6XFxzKihbXiwuXSspL2dpXG4gIF07XG4gIFxuICBjb25zdCB0ZXJtcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBcbiAgbWVkaWNhbFBhdHRlcm5zLmZvckVhY2gocGF0dGVybiA9PiB7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlICgobWF0Y2ggPSBwYXR0ZXJuLmV4ZWMocmVzcG9uc2UpKSAhPT0gbnVsbCkge1xuICAgICAgaWYgKG1hdGNoWzFdKSB7XG4gICAgICAgIHRlcm1zLmFkZChtYXRjaFsxXS50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgXG4gIHJldHVybiBBcnJheS5mcm9tKHRlcm1zKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3REYXRhU291cmNlcyhyZXNwb25zZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICAvLyBEZXRlY3QgZGF0YSBzb3VyY2VzIG1lbnRpb25lZCBpbiByZXNwb25zZVxuICBpZiAocmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWlkYm94JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZmhpcicpKSB7XG4gICAgc291cmNlcy5hZGQoJ0FpZGJveCBGSElSJyk7XG4gIH1cbiAgXG4gIGlmIChyZXNwb25zZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcGljJykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZWhyJykpIHtcbiAgICBzb3VyY2VzLmFkZCgnRXBpYyBFSFInKTtcbiAgfVxuICBcbiAgaWYgKHJlc3BvbnNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2RvY3VtZW50JykgfHwgcmVzcG9uc2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndXBsb2FkZWQnKSkge1xuICAgIHNvdXJjZXMuYWRkKCdNZWRpY2FsIERvY3VtZW50cycpO1xuICB9XG4gIFxuICByZXR1cm4gQXJyYXkuZnJvbShzb3VyY2VzKTtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBzYW5pdGl6ZSBwYXRpZW50IG5hbWVzICh1c2VkIGJ5IGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uKVxuZnVuY3Rpb24gc2FuaXRpemVQYXRpZW50TmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbmFtZVxuICAgIC50cmltKClcbiAgICAucmVwbGFjZSgvW15hLXpBLVpcXHNdL2csICcnKSAvLyBSZW1vdmUgc3BlY2lhbCBjaGFyYWN0ZXJzXG4gICAgLnJlcGxhY2UoL1xccysvZywgJyAnKSAvLyBOb3JtYWxpemUgd2hpdGVzcGFjZVxuICAgIC5zcGxpdCgnICcpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCkpXG4gICAgLmpvaW4oJyAnKTtcbn1cblxuLy8gRXhwb3J0IHV0aWxpdHkgZnVuY3Rpb25zIGZvciB0ZXN0aW5nIGFuZCByZXVzZVxuZXhwb3J0IHtcbiAgZXh0cmFjdEFuZFVwZGF0ZUNvbnRleHQsXG4gIGV4dHJhY3RNZWRpY2FsVGVybXNGcm9tUmVzcG9uc2UsXG4gIGV4dHJhY3REYXRhU291cmNlcyxcbiAgc2FuaXRpemVQYXRpZW50TmFtZVxufTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4vbWVzc2FnZXMnO1xuXG5NZXRlb3IucHVibGlzaCgnbWVzc2FnZXMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIHJldHVybiBNZXNzYWdlc0NvbGxlY3Rpb24uZmluZCh7IHNlc3Npb25JZCB9KTtcbn0pOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgY2hlY2ssIE1hdGNoIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiwgQ2hhdFNlc3Npb24gfSBmcm9tICcuL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy4uL21lc3NhZ2VzL21lc3NhZ2VzJztcblxuTWV0ZW9yLm1ldGhvZHMoe1xuICBhc3luYyAnc2Vzc2lvbnMuY3JlYXRlJyh0aXRsZT86IHN0cmluZywgbWV0YWRhdGE/OiBhbnkpIHtcbiAgICBjaGVjayh0aXRsZSwgTWF0Y2guTWF5YmUoU3RyaW5nKSk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE1hdGNoLk1heWJlKE9iamVjdCkpO1xuXG4gICAgY29uc3Qgc2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgdGl0bGU6IHRpdGxlIHx8ICdOZXcgQ2hhdCcsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIG1lc3NhZ2VDb3VudDogMCxcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxuICAgICAgbWV0YWRhdGE6IG1ldGFkYXRhIHx8IHt9XG4gICAgfTtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIG90aGVyIHNlc3Npb25zIGZvciB0aGlzIHVzZXJcbiAgICBpZiAodGhpcy51c2VySWQpIHtcbiAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgICAgeyB1c2VySWQ6IHRoaXMudXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgICB7ICRzZXQ6IHsgaXNBY3RpdmU6IGZhbHNlIH0gfSxcbiAgICAgICAgeyBtdWx0aTogdHJ1ZSB9XG4gICAgICApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uaW5zZXJ0QXN5bmMoc2Vzc2lvbik7XG4gICAgY29uc29sZS5sb2coYOKchSBDcmVhdGVkIG5ldyBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKTtcbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmxpc3QnKGxpbWl0ID0gMjAsIG9mZnNldCA9IDApIHtcbiAgICBjaGVjayhsaW1pdCwgTWF0Y2guSW50ZWdlcik7XG4gICAgY2hlY2sob2Zmc2V0LCBNYXRjaC5JbnRlZ2VyKTtcbiAgICBcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgc29ydDogeyB1cGRhdGVkQXQ6IC0xIH0sIFxuICAgICAgICBsaW1pdCxcbiAgICAgICAgc2tpcDogb2Zmc2V0XG4gICAgICB9XG4gICAgKS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgY29uc3QgdG90YWwgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoeyB1c2VySWQgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlc3Npb25zLFxuICAgICAgdG90YWwsXG4gICAgICBoYXNNb3JlOiBvZmZzZXQgKyBsaW1pdCA8IHRvdGFsXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5nZXQnKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY2hlY2soc2Vzc2lvbklkLCBTdHJpbmcpO1xuICAgIFxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZE9uZUFzeW5jKHtcbiAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgdXNlcklkOiB0aGlzLnVzZXJJZCB8fCBudWxsXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdzZXNzaW9uLW5vdC1mb3VuZCcsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGUnKHNlc3Npb25JZDogc3RyaW5nLCB1cGRhdGVzOiBQYXJ0aWFsPENoYXRTZXNzaW9uPikge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBjaGVjayh1cGRhdGVzLCBPYmplY3QpO1xuICAgIFxuICAgIC8vIFJlbW92ZSBmaWVsZHMgdGhhdCBzaG91bGRuJ3QgYmUgdXBkYXRlZCBkaXJlY3RseVxuICAgIGRlbGV0ZSB1cGRhdGVzLl9pZDtcbiAgICBkZWxldGUgdXBkYXRlcy51c2VySWQ7XG4gICAgZGVsZXRlIHVwZGF0ZXMuY3JlYXRlZEF0O1xuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgXG4gICAgICAgIF9pZDogc2Vzc2lvbklkLFxuICAgICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICAgIH0sXG4gICAgICB7IFxuICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgIC4uLnVwZGF0ZXMsIFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSBcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZGVsZXRlJyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNoZWNrKHNlc3Npb25JZCwgU3RyaW5nKTtcbiAgICBcbiAgICAvLyBWZXJpZnkgb3duZXJzaGlwXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIERlbGV0ZSBhbGwgYXNzb2NpYXRlZCBtZXNzYWdlc1xuICAgIGNvbnN0IGRlbGV0ZWRNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZCB9KTtcbiAgICBjb25zb2xlLmxvZyhg8J+Xke+4jyBEZWxldGVkICR7ZGVsZXRlZE1lc3NhZ2VzfSBtZXNzYWdlcyBmcm9tIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgXG4gICAgLy8gRGVsZXRlIHRoZSBzZXNzaW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnJlbW92ZUFzeW5jKHNlc3Npb25JZCk7XG4gICAgY29uc29sZS5sb2coYPCfl5HvuI8gRGVsZXRlZCBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgIFxuICAgIHJldHVybiB7IHNlc3Npb246IHJlc3VsdCwgbWVzc2FnZXM6IGRlbGV0ZWRNZXNzYWdlcyB9O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLnNldEFjdGl2ZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgICBcbiAgICAvLyBEZWFjdGl2YXRlIGFsbCBvdGhlciBzZXNzaW9uc1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgdXNlcklkLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuICAgICAgeyAkc2V0OiB7IGlzQWN0aXZlOiBmYWxzZSB9IH0sXG4gICAgICB7IG11bHRpOiB0cnVlIH1cbiAgICApO1xuICAgIFxuICAgIC8vIEFjdGl2YXRlIHRoaXMgc2Vzc2lvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhcbiAgICAgIHsgX2lkOiBzZXNzaW9uSWQsIHVzZXJJZCB9LFxuICAgICAgeyBcbiAgICAgICAgJHNldDogeyBcbiAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgfSBcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG4gIFxuICBhc3luYyAnc2Vzc2lvbnMuZ2VuZXJhdGVUaXRsZScoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgLy8gR2V0IGZpcnN0IGZldyBtZXNzYWdlc1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCwgcm9sZTogJ3VzZXInIH0sXG4gICAgICB7IGxpbWl0OiAzLCBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gVXNlIGZpcnN0IHVzZXIgbWVzc2FnZSBhcyBiYXNpcyBmb3IgdGl0bGVcbiAgICAgIGNvbnN0IGZpcnN0VXNlck1lc3NhZ2UgPSBtZXNzYWdlc1swXTtcbiAgICAgIGlmIChmaXJzdFVzZXJNZXNzYWdlKSB7XG4gICAgICAgIC8vIENsZWFuIHVwIHRoZSBtZXNzYWdlIGZvciBhIGJldHRlciB0aXRsZVxuICAgICAgICBsZXQgdGl0bGUgPSBmaXJzdFVzZXJNZXNzYWdlLmNvbnRlbnRcbiAgICAgICAgICAucmVwbGFjZSgvXihzZWFyY2ggZm9yfGZpbmR8bG9vayBmb3J8c2hvdyBtZSlcXHMrL2ksICcnKSAvLyBSZW1vdmUgY29tbW9uIHByZWZpeGVzXG4gICAgICAgICAgLnJlcGxhY2UoL1s/IS5dJC8sICcnKSAvLyBSZW1vdmUgZW5kaW5nIHB1bmN0dWF0aW9uXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExpbWl0IGxlbmd0aFxuICAgICAgICBpZiAodGl0bGUubGVuZ3RoID4gNTApIHtcbiAgICAgICAgICB0aXRsZSA9IHRpdGxlLnN1YnN0cmluZygwLCA1MCkudHJpbSgpICsgJy4uLic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENhcGl0YWxpemUgZmlyc3QgbGV0dGVyXG4gICAgICAgIHRpdGxlID0gdGl0bGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB0aXRsZS5zbGljZSgxKTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi51cGRhdGVBc3luYyhzZXNzaW9uSWQsIHtcbiAgICAgICAgICAkc2V0OiB7IFxuICAgICAgICAgICAgdGl0bGUsXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRpdGxlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy51cGRhdGVNZXRhZGF0YScoc2Vzc2lvbklkOiBzdHJpbmcsIG1ldGFkYXRhOiBhbnkpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgY2hlY2sobWV0YWRhdGEsIE9iamVjdCk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLnVwZGF0ZUFzeW5jKFxuICAgICAgeyBcbiAgICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogdGhpcy51c2VySWQgfHwgbnVsbFxuICAgICAgfSxcbiAgICAgIHsgXG4gICAgICAgICRzZXQ6IHsgXG4gICAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICAgIH0gXG4gICAgICB9XG4gICAgKTtcbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuICBcbiAgYXN5bmMgJ3Nlc3Npb25zLmV4cG9ydCcoc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5maW5kT25lQXN5bmMoe1xuICAgICAgX2lkOiBzZXNzaW9uSWQsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ3Nlc3Npb24tbm90LWZvdW5kJywgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmZpbmQoXG4gICAgICB7IHNlc3Npb25JZCB9LFxuICAgICAgeyBzb3J0OiB7IHRpbWVzdGFtcDogMSB9IH1cbiAgICApLmZldGNoQXN5bmMoKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbixcbiAgICAgIG1lc3NhZ2VzLFxuICAgICAgZXhwb3J0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHZlcnNpb246ICcxLjAnXG4gICAgfTtcbiAgfSxcbiAgXG4gIGFzeW5jICdzZXNzaW9ucy5pbXBvcnQnKGRhdGE6IGFueSkge1xuICAgIGNoZWNrKGRhdGEsIHtcbiAgICAgIHNlc3Npb246IE9iamVjdCxcbiAgICAgIG1lc3NhZ2VzOiBBcnJheSxcbiAgICAgIHZlcnNpb246IFN0cmluZ1xuICAgIH0pO1xuICAgIFxuICAgIC8vIENyZWF0ZSBuZXcgc2Vzc2lvbiBiYXNlZCBvbiBpbXBvcnRlZCBkYXRhXG4gICAgY29uc3QgbmV3U2Vzc2lvbjogT21pdDxDaGF0U2Vzc2lvbiwgJ19pZCc+ID0ge1xuICAgICAgLi4uZGF0YS5zZXNzaW9uLFxuICAgICAgdGl0bGU6IGBbSW1wb3J0ZWRdICR7ZGF0YS5zZXNzaW9uLnRpdGxlfWAsXG4gICAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIGlzQWN0aXZlOiB0cnVlXG4gICAgfTtcbiAgICBcbiAgICBkZWxldGUgKG5ld1Nlc3Npb24gYXMgYW55KS5faWQ7XG4gICAgXG4gICAgY29uc3Qgc2Vzc2lvbklkID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld1Nlc3Npb24pO1xuICAgIFxuICAgIC8vIEltcG9ydCBtZXNzYWdlcyB3aXRoIG5ldyBzZXNzaW9uSWRcbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZGF0YS5tZXNzYWdlcykge1xuICAgICAgY29uc3QgbmV3TWVzc2FnZSA9IHtcbiAgICAgICAgLi4ubWVzc2FnZSxcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKG1lc3NhZ2UudGltZXN0YW1wKVxuICAgICAgfTtcbiAgICAgIGRlbGV0ZSBuZXdNZXNzYWdlLl9pZDtcbiAgICAgIFxuICAgICAgYXdhaXQgTWVzc2FnZXNDb2xsZWN0aW9uLmluc2VydEFzeW5jKG5ld01lc3NhZ2UpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc2Vzc2lvbklkO1xuICB9XG59KTsiLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IGNoZWNrIH0gZnJvbSAnbWV0ZW9yL2NoZWNrJztcbmltcG9ydCB7IFNlc3Npb25zQ29sbGVjdGlvbiB9IGZyb20gJy4vc2Vzc2lvbnMnO1xuXG4vLyBQdWJsaXNoIHVzZXIncyBzZXNzaW9ucyBsaXN0XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMubGlzdCcsIGZ1bmN0aW9uKGxpbWl0ID0gMjApIHtcbiAgY2hlY2sobGltaXQsIE51bWJlcik7XG4gIFxuICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCB8fCBudWxsO1xuICBcbiAgcmV0dXJuIFNlc3Npb25zQ29sbGVjdGlvbi5maW5kKFxuICAgIHsgdXNlcklkIH0sXG4gICAgeyBcbiAgICAgIHNvcnQ6IHsgdXBkYXRlZEF0OiAtMSB9LCBcbiAgICAgIGxpbWl0LFxuICAgICAgZmllbGRzOiB7IFxuICAgICAgICB0aXRsZTogMSwgXG4gICAgICAgIHVwZGF0ZWRBdDogMSwgXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSwgXG4gICAgICAgIGxhc3RNZXNzYWdlOiAxLFxuICAgICAgICBpc0FjdGl2ZTogMSxcbiAgICAgICAgY3JlYXRlZEF0OiAxLFxuICAgICAgICAnbWV0YWRhdGEucGF0aWVudElkJzogMSxcbiAgICAgICAgJ21ldGFkYXRhLmRvY3VtZW50SWRzJzogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pO1xuXG4vLyBQdWJsaXNoIHNpbmdsZSBzZXNzaW9uIGRldGFpbHNcbk1ldGVvci5wdWJsaXNoKCdzZXNzaW9uLmRldGFpbHMnLCBmdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICBjaGVjayhzZXNzaW9uSWQsIFN0cmluZyk7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICBfaWQ6IHNlc3Npb25JZCxcbiAgICB1c2VySWQ6IHRoaXMudXNlcklkIHx8IG51bGxcbiAgfSk7XG59KTtcblxuLy8gUHVibGlzaCBhY3RpdmUgc2Vzc2lvblxuTWV0ZW9yLnB1Ymxpc2goJ3Nlc3Npb24uYWN0aXZlJywgZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMudXNlcklkIHx8IG51bGw7XG4gIFxuICByZXR1cm4gU2Vzc2lvbnNDb2xsZWN0aW9uLmZpbmQoeyBcbiAgICB1c2VySWQsXG4gICAgaXNBY3RpdmU6IHRydWVcbiAgfSwge1xuICAgIGxpbWl0OiAxXG4gIH0pO1xufSk7XG5cbi8vIFB1Ymxpc2ggcmVjZW50IHNlc3Npb25zIHdpdGggbWVzc2FnZSBwcmV2aWV3XG5NZXRlb3IucHVibGlzaCgnc2Vzc2lvbnMucmVjZW50JywgZnVuY3Rpb24obGltaXQgPSA1KSB7XG4gIGNoZWNrKGxpbWl0LCBOdW1iZXIpO1xuICBcbiAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQgfHwgbnVsbDtcbiAgXG4gIHJldHVybiBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZChcbiAgICB7IHVzZXJJZCB9LFxuICAgIHsgXG4gICAgICBzb3J0OiB7IHVwZGF0ZWRBdDogLTEgfSwgXG4gICAgICBsaW1pdCxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICB0aXRsZTogMSxcbiAgICAgICAgbGFzdE1lc3NhZ2U6IDEsXG4gICAgICAgIG1lc3NhZ2VDb3VudDogMSxcbiAgICAgICAgdXBkYXRlZEF0OiAxLFxuICAgICAgICBpc0FjdGl2ZTogMVxuICAgICAgfVxuICAgIH1cbiAgKTtcbn0pOyIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGludGVyZmFjZSBDaGF0U2Vzc2lvbiB7XG4gIF9pZD86IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgdXNlcklkPzogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IERhdGU7XG4gIHVwZGF0ZWRBdDogRGF0ZTtcbiAgbGFzdE1lc3NhZ2U/OiBzdHJpbmc7XG4gIG1lc3NhZ2VDb3VudDogbnVtYmVyO1xuICBpc0FjdGl2ZTogYm9vbGVhbjtcbiAgbWV0YWRhdGE/OiB7XG4gICAgcGF0aWVudElkPzogc3RyaW5nO1xuICAgIGRvY3VtZW50SWRzPzogc3RyaW5nW107XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIG1vZGVsPzogc3RyaW5nO1xuICAgIHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgU2Vzc2lvbnNDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb248Q2hhdFNlc3Npb24+KCdzZXNzaW9ucycpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgU2Vzc2lvbnNDb2xsZWN0aW9uIH0gZnJvbSAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL3Nlc3Npb25zJztcbmltcG9ydCB7IE1lc3NhZ2VzQ29sbGVjdGlvbiB9IGZyb20gJy9pbXBvcnRzL2FwaS9tZXNzYWdlcy9tZXNzYWdlcyc7XG5cbk1ldGVvci5zdGFydHVwKGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJyBTZXR0aW5nIHVwIHNlc3Npb24gbWFuYWdlbWVudC4uLicpO1xuICBcbiAgLy8gQ3JlYXRlIGluZGV4ZXMgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxuICB0cnkge1xuICAgIC8vIFNlc3Npb25zIGluZGV4ZXNcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHVzZXJJZDogMSwgdXBkYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IGlzQWN0aXZlOiAxIH0pO1xuICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgY3JlYXRlZEF0OiAtMSB9KTtcbiAgICBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7ICdtZXRhZGF0YS5wYXRpZW50SWQnOiAxIH0pO1xuICAgIFxuICAgIC8vIE1lc3NhZ2VzIGluZGV4ZXNcbiAgICBhd2FpdCBNZXNzYWdlc0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhBc3luYyh7IHNlc3Npb25JZDogMSwgdGltZXN0YW1wOiAxIH0pO1xuICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jcmVhdGVJbmRleEFzeW5jKHsgc2Vzc2lvbklkOiAxLCByb2xlOiAxIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgRGF0YWJhc2UgaW5kZXhlcyBjcmVhdGVkIHN1Y2Nlc3NmdWxseScpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJyBFcnJvciBjcmVhdGluZyBpbmRleGVzOicsIGVycm9yKTtcbiAgfVxuICBcbiAgLy8gQ2xlYW51cCBvbGQgc2Vzc2lvbnMgKG9wdGlvbmFsIC0gcmVtb3ZlIHNlc3Npb25zIG9sZGVyIHRoYW4gMzAgZGF5cylcbiAgY29uc3QgdGhpcnR5RGF5c0FnbyA9IG5ldyBEYXRlKCk7XG4gIHRoaXJ0eURheXNBZ28uc2V0RGF0ZSh0aGlydHlEYXlzQWdvLmdldERhdGUoKSAtIDMwKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc3Qgb2xkU2Vzc2lvbnMgPSBhd2FpdCBTZXNzaW9uc0NvbGxlY3Rpb24uZmluZCh7XG4gICAgICB1cGRhdGVkQXQ6IHsgJGx0OiB0aGlydHlEYXlzQWdvIH1cbiAgICB9KS5mZXRjaEFzeW5jKCk7XG4gICAgXG4gICAgaWYgKG9sZFNlc3Npb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn6e5IEZvdW5kICR7b2xkU2Vzc2lvbnMubGVuZ3RofSBvbGQgc2Vzc2lvbnMgdG8gY2xlYW4gdXBgKTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIG9sZFNlc3Npb25zKSB7XG4gICAgICAgIGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5yZW1vdmVBc3luYyh7IHNlc3Npb25JZDogc2Vzc2lvbi5faWQgfSk7XG4gICAgICAgIGF3YWl0IFNlc3Npb25zQ29sbGVjdGlvbi5yZW1vdmVBc3luYyhzZXNzaW9uLl9pZCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKCcgT2xkIHNlc3Npb25zIGNsZWFuZWQgdXAnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignIEVycm9yIGNsZWFuaW5nIHVwIG9sZCBzZXNzaW9uczonLCBlcnJvcik7XG4gIH1cbiAgXG4gIC8vIExvZyBzZXNzaW9uIHN0YXRpc3RpY3NcbiAgdHJ5IHtcbiAgICBjb25zdCB0b3RhbFNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKCk7XG4gICAgY29uc3QgdG90YWxNZXNzYWdlcyA9IGF3YWl0IE1lc3NhZ2VzQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cygpO1xuICAgIGNvbnN0IGFjdGl2ZVNlc3Npb25zID0gYXdhaXQgU2Vzc2lvbnNDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHsgaXNBY3RpdmU6IHRydWUgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBTZXNzaW9uIFN0YXRpc3RpY3M6Jyk7XG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIHNlc3Npb25zOiAke3RvdGFsU2Vzc2lvbnN9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIEFjdGl2ZSBzZXNzaW9uczogJHthY3RpdmVTZXNzaW9uc31gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgbWVzc2FnZXM6ICR7dG90YWxNZXNzYWdlc31gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCcgRXJyb3IgZ2V0dGluZyBzZXNzaW9uIHN0YXRpc3RpY3M6JywgZXJyb3IpO1xuICB9XG59KTsiLCIvLyBzZXJ2ZXIvbWFpbi50c1xuaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcic7XG5pbXBvcnQgeyBNQ1BDbGllbnRNYW5hZ2VyIH0gZnJvbSAnL2ltcG9ydHMvYXBpL21jcC9tY3BDbGllbnRNYW5hZ2VyJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL21lc3NhZ2VzL21ldGhvZHMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvbWVzc2FnZXMvcHVibGljYXRpb25zJztcbmltcG9ydCAnL2ltcG9ydHMvYXBpL3Nlc3Npb25zL21ldGhvZHMnO1xuaW1wb3J0ICcvaW1wb3J0cy9hcGkvc2Vzc2lvbnMvcHVibGljYXRpb25zJztcbmltcG9ydCAnLi9zdGFydHVwLXNlc3Npb25zJztcblxuTWV0ZW9yLnN0YXJ0dXAoYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnIFN0YXJ0aW5nIE1DUCBQaWxvdCBzZXJ2ZXIgd2l0aCBJbnRlbGxpZ2VudCBUb29sIFNlbGVjdGlvbi4uLicpO1xuICBcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gR2V0IEFQSSBrZXlzXG4gICAgY29uc3Qgc2V0dGluZ3MgPSBNZXRlb3Iuc2V0dGluZ3M/LnByaXZhdGU7XG4gICAgY29uc3QgYW50aHJvcGljS2V5ID0gc2V0dGluZ3M/LkFOVEhST1BJQ19BUElfS0VZIHx8IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZO1xuICAgIGNvbnN0IG96d2VsbEtleSA9IHNldHRpbmdzPy5PWldFTExfQVBJX0tFWSB8fCBwcm9jZXNzLmVudi5PWldFTExfQVBJX0tFWTtcbiAgICBjb25zdCBvendlbGxFbmRwb2ludCA9IHNldHRpbmdzPy5PWldFTExfRU5EUE9JTlQgfHwgcHJvY2Vzcy5lbnYuT1pXRUxMX0VORFBPSU5UO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCcgQVBJIEtleSBTdGF0dXM6Jyk7XG4gICAgY29uc29sZS5sb2coJyAgQW50aHJvcGljIGtleSBmb3VuZDonLCAhIWFudGhyb3BpY0tleSwgYW50aHJvcGljS2V5Py5zdWJzdHJpbmcoMCwgMTUpICsgJy4uLicpO1xuICAgIGNvbnNvbGUubG9nKCcgIE96d2VsbCBrZXkgZm91bmQ6JywgISFvendlbGxLZXksIG96d2VsbEtleT8uc3Vic3RyaW5nKDAsIDE1KSArICcuLi4nKTtcbiAgICBjb25zb2xlLmxvZygnICBPendlbGwgZW5kcG9pbnQ6Jywgb3p3ZWxsRW5kcG9pbnQpO1xuICAgIFxuICAgIGlmICghYW50aHJvcGljS2V5ICYmICFvendlbGxLZXkpIHtcbiAgICAgIGNvbnNvbGUud2FybignICBObyBBUEkga2V5IGZvdW5kIGZvciBpbnRlbGxpZ2VudCB0b29sIHNlbGVjdGlvbi4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgZGVmYXVsdCBwcm92aWRlciAocHJlZmVyIEFudGhyb3BpYyBmb3IgYmV0dGVyIHRvb2wgY2FsbGluZywgZmFsbGJhY2sgdG8gT3p3ZWxsKVxuICAgIGxldCBwcm92aWRlcjogJ2FudGhyb3BpYycgfCAnb3p3ZWxsJztcbiAgICBsZXQgYXBpS2V5OiBzdHJpbmc7XG5cbiAgICBpZiAoYW50aHJvcGljS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdhbnRocm9waWMnO1xuICAgICAgYXBpS2V5ID0gYW50aHJvcGljS2V5O1xuICAgIH0gZWxzZSBpZiAob3p3ZWxsS2V5KSB7XG4gICAgICBwcm92aWRlciA9ICdvendlbGwnO1xuICAgICAgYXBpS2V5ID0gb3p3ZWxsS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgTm8gdmFsaWQgQVBJIGtleXMgZm91bmQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIG1haW4gTUNQIGNsaWVudCB3aXRoIGludGVsbGlnZW50IHRvb2wgc2VsZWN0aW9uXG4gICAgYXdhaXQgbWNwTWFuYWdlci5pbml0aWFsaXplKHtcbiAgICAgIHByb3ZpZGVyLFxuICAgICAgYXBpS2V5LFxuICAgICAgb3p3ZWxsRW5kcG9pbnQsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJyBNQ1AgQ2xpZW50IGluaXRpYWxpemVkIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb24nKTtcbiAgICBjb25zb2xlLmxvZyhgIE1DUCBVc2luZyAke3Byb3ZpZGVyLnRvVXBwZXJDYXNlKCl9IGFzIHRoZSBBSSBwcm92aWRlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb25gKTtcbiAgICBjb25zb2xlLmxvZygnIE1DUCBTZXNzaW9uIG1hbmFnZW1lbnQgZW5hYmxlZCB3aXRoIEF0bGFzIE1vbmdvREInKTtcbiAgICBcbiAgICAvLyBTaG93IHByb3ZpZGVyIGNhcGFiaWxpdGllc1xuICAgIGlmIChhbnRocm9waWNLZXkgJiYgb3p3ZWxsS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZygnIE1DUCBCb3RoIHByb3ZpZGVycyBhdmFpbGFibGUgLSB5b3UgY2FuIHN3aXRjaCBiZXR3ZWVuIHRoZW0gaW4gdGhlIGNoYXQnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBNQ1AgQW50aHJvcGljOiBBZHZhbmNlZCB0b29sIGNhbGxpbmcgd2l0aCBDbGF1ZGUgbW9kZWxzIChyZWNvbW1lbmRlZCknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICBNQ1AgT3p3ZWxsOiBCbHVlaGl2ZSBBSSBtb2RlbHMgd2l0aCBpbnRlbGxpZ2VudCBwcm9tcHRpbmcnKTtcbiAgICB9IGVsc2UgaWYgKGFudGhyb3BpY0tleSkge1xuICAgICAgY29uc29sZS5sb2coJyBNQ1AgQW50aHJvcGljIHByb3ZpZGVyIHdpdGggbmF0aXZlIHRvb2wgY2FsbGluZyBzdXBwb3J0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgTUNQIE9ubHkgJHtwcm92aWRlci50b1VwcGVyQ2FzZSgpfSBwcm92aWRlciBhdmFpbGFibGVgKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIG1lZGljYWwgTUNQIHNlcnZlciBmb3IgZG9jdW1lbnQgdG9vbHNcbiAgICBjb25zdCBtY3BTZXJ2ZXJVcmwgPSBzZXR0aW5ncz8uTUVESUNBTF9NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52Lk1FRElDQUxfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAxJztcbiAgICBcbiAgICBpZiAobWNwU2VydmVyVXJsICYmIG1jcFNlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIE1lZGljYWwgTUNQIFNlcnZlciBmb3IgaW50ZWxsaWdlbnQgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9NZWRpY2FsU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgTWVkaWNhbCBkb2N1bWVudCB0b29scyBkaXNjb3ZlcmVkIGFuZCByZWFkeSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oJyAgTWVkaWNhbCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgY29uc29sZS53YXJuKCcgICBEb2N1bWVudCBwcm9jZXNzaW5nIHRvb2xzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIE1lZGljYWwgTUNQIFNlcnZlciBVUkwgbm90IGNvbmZpZ3VyZWQuJyk7XG4gICAgfVxuXG4gICAgLy8gQ29ubmVjdCB0byBBaWRib3ggTUNQIHNlcnZlciBmb3IgRkhJUiB0b29sc1xuICAgIGNvbnN0IGFpZGJveFNlcnZlclVybCA9IHNldHRpbmdzPy5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmVudi5BSURCT1hfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAyJztcbiAgICBcbiAgICBpZiAoYWlkYm94U2VydmVyVXJsICYmIGFpZGJveFNlcnZlclVybCAhPT0gJ0RJU0FCTEVEJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYCBDb25uZWN0aW5nIHRvIEFpZGJveCBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBGSElSIHRvb2wgZGlzY292ZXJ5Li4uYCk7XG4gICAgICAgIGF3YWl0IG1jcE1hbmFnZXIuY29ubmVjdFRvQWlkYm94U2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgQWlkYm94IEZISVIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCcgIEFpZGJveCBNQ1AgU2VydmVyIGNvbm5lY3Rpb24gZmFpbGVkOicsIGVycm9yKTsgIFxuICAgICAgICBjb25zb2xlLndhcm4oJyAgIEFpZGJveCBGSElSIGZlYXR1cmVzIHdpbGwgYmUgdW5hdmFpbGFibGUgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbi4nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCcgIEFpZGJveCBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG5cbiAgICAvLyBDb25uZWN0IHRvIEVwaWMgTUNQIHNlcnZlciBmb3IgRXBpYyBFSFIgdG9vbHNcbiAgICBjb25zdCBlcGljU2VydmVyVXJsID0gc2V0dGluZ3M/LkVQSUNfTUNQX1NFUlZFUl9VUkwgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuRVBJQ19NQ1BfU0VSVkVSX1VSTCB8fCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAzJztcbiAgICBcbiAgICBpZiAoZXBpY1NlcnZlclVybCAmJiBlcGljU2VydmVyVXJsICE9PSAnRElTQUJMRUQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgIENvbm5lY3RpbmcgdG8gRXBpYyBNQ1AgU2VydmVyIGZvciBpbnRlbGxpZ2VudCBFSFIgdG9vbCBkaXNjb3ZlcnkuLi5gKTtcbiAgICAgICAgYXdhaXQgbWNwTWFuYWdlci5jb25uZWN0VG9FcGljU2VydmVyKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgRXBpYyBFSFIgdG9vbHMgZGlzY292ZXJlZCBhbmQgcmVhZHkgZm9yIGludGVsbGlnZW50IHNlbGVjdGlvbicpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCcgIEVwaWMgTUNQIFNlcnZlciBjb25uZWN0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybignICAgRXBpYyBFSFIgZmVhdHVyZXMgd2lsbCBiZSB1bmF2YWlsYWJsZSBmb3IgaW50ZWxsaWdlbnQgc2VsZWN0aW9uLicpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJyAgRXBpYyBNQ1AgU2VydmVyIFVSTCBub3QgY29uZmlndXJlZC4nKTtcbiAgICB9XG4gICAgXG4gICAgLy8gTG9nIGZpbmFsIHN0YXR1c1xuICAgIGNvbnN0IGF2YWlsYWJsZVRvb2xzID0gbWNwTWFuYWdlci5nZXRBdmFpbGFibGVUb29scygpO1xuICAgIGNvbnNvbGUubG9nKGBcXG4gSW50ZWxsaWdlbnQgVG9vbCBTZWxlY3Rpb24gU3RhdHVzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCB0b29scyBhdmFpbGFibGU6ICR7YXZhaWxhYmxlVG9vbHMubGVuZ3RofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAgQUkgUHJvdmlkZXI6ICR7cHJvdmlkZXIudG9VcHBlckNhc2UoKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG9vbCBzZWxlY3Rpb24gbWV0aG9kOiAke3Byb3ZpZGVyID09PSAnYW50aHJvcGljJyA/ICdOYXRpdmUgQ2xhdWRlIHRvb2wgY2FsbGluZycgOiAnSW50ZWxsaWdlbnQgcHJvbXB0aW5nJ31gKTtcbiAgICBcbiAgICAvLyBMb2cgYXZhaWxhYmxlIHRvb2wgY2F0ZWdvcmllc1xuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0b29sQ2F0ZWdvcmllcyA9IGNhdGVnb3JpemVUb29scyhhdmFpbGFibGVUb29scyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxu8J+UpyBBdmFpbGFibGUgVG9vbCBDYXRlZ29yaWVzOicpO1xuICAgICAgLy8gT2JqZWN0LmVudHJpZXModG9vbENhdGVnb3JpZXMpLmZvckVhY2goKFtjYXRlZ29yeSwgY291bnRdKSA9PiB7XG4gICAgICAvLyBjb25zb2xlLmxvZyhgICAgJHtnZXRDYXRlZ29yeUVtb2ppKGNhdGVnb3J5KX0gJHtjYXRlZ29yeX06ICR7Y291bnR9IHRvb2xzYCk7XG4gICAgICAvLyB9KTtcbiAgICB9XG4gIFxuICAgIGlmIChhdmFpbGFibGVUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygnXFxuIFNVQ0NFU1M6IENsYXVkZSB3aWxsIG5vdyBpbnRlbGxpZ2VudGx5IHNlbGVjdCB0b29scyBiYXNlZCBvbiB1c2VyIHF1ZXJpZXMhJyk7XG4gICAgICBjb25zb2xlLmxvZygnICAg4oCiIE5vIG1vcmUgaGFyZGNvZGVkIHBhdHRlcm5zIG9yIGtleXdvcmQgbWF0Y2hpbmcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgQ2xhdWRlIGFuYWx5emVzIGVhY2ggcXVlcnkgYW5kIGNob29zZXMgYXBwcm9wcmlhdGUgdG9vbHMnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgU3VwcG9ydHMgY29tcGxleCBtdWx0aS1zdGVwIHRvb2wgdXNhZ2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICDigKIgQXV0b21hdGljIHRvb2wgY2hhaW5pbmcgYW5kIHJlc3VsdCBpbnRlcnByZXRhdGlvbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnXFxuICBObyB0b29scyBhdmFpbGFibGUgLSBydW5uaW5nIGluIGJhc2ljIExMTSBtb2RlJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKCdcXG4gRXhhbXBsZSBxdWVyaWVzIHRoYXQgd2lsbCB3b3JrIHdpdGggaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246Jyk7XG4gICAgY29uc29sZS5sb2coJyAgICBBaWRib3ggRkhJUjogXCJHZXQgbWUgZGV0YWlscyBhYm91dCBhbGwgSGFuayBQcmVzdG9uIGF2YWlsYWJsZSBmcm9tIEFpZGJveFwiJyk7XG4gICAgY29uc29sZS5sb2coJyAgICBFcGljIEVIUjogXCJTZWFyY2ggZm9yIHBhdGllbnQgQ2FtaWxhIExvcGV6IGluIEVwaWNcIicpO1xuICAgIGNvbnNvbGUubG9nKCcgICAgRXBpYyBFSFI6IFwiR2V0IGxhYiByZXN1bHRzIGZvciBwYXRpZW50IGVyWHVGWVVmdWNCWmFyeVZrc1lFY01nM1wiJyk7XG4gICAgY29uc29sZS5sb2coJyAgICBEb2N1bWVudHM6IFwiVXBsb2FkIHRoaXMgbGFiIHJlcG9ydCBhbmQgZmluZCBzaW1pbGFyIGNhc2VzXCInKTtcbiAgICBjb25zb2xlLmxvZygnICAgTXVsdGktdG9vbDogXCJTZWFyY2ggRXBpYyBmb3IgZGlhYmV0ZXMgcGF0aWVudHMgYW5kIGdldCB0aGVpciBtZWRpY2F0aW9uc1wiJyk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgaW50ZWxsaWdlbnQgdG9vbCBzZWxlY3Rpb246JywgZXJyb3IpO1xuICAgIGNvbnNvbGUud2FybignU2VydmVyIHdpbGwgcnVuIHdpdGggbGltaXRlZCBjYXBhYmlsaXRpZXMnKTtcbiAgICBjb25zb2xlLndhcm4oJ0Jhc2ljIExMTSByZXNwb25zZXMgd2lsbCB3b3JrLCBidXQgbm8gdG9vbCBjYWxsaW5nJyk7XG4gIH1cbn0pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2F0ZWdvcml6ZSB0b29scyBmb3IgYmV0dGVyIGxvZ2dpbmdcbi8vIEZpeCBmb3Igc2VydmVyL21haW4udHMgLSBSZXBsYWNlIHRoZSBjYXRlZ29yaXplVG9vbHMgZnVuY3Rpb25cblxuZnVuY3Rpb24gY2F0ZWdvcml6ZVRvb2xzKHRvb2xzOiBhbnlbXSk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBjYXRlZ29yaWVzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICB0b29scy5mb3JFYWNoKHRvb2wgPT4ge1xuICAgIGxldCBjYXRlZ29yeSA9ICdPdGhlcic7XG4gICAgXG4gICAgLy8gRXBpYyBFSFIgdG9vbHMgLSB0b29scyB3aXRoICdlcGljJyBwcmVmaXhcbiAgICBpZiAodG9vbC5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnZXBpYycpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdFcGljIEVIUic7XG4gICAgfVxuICAgIC8vIEFpZGJveCBGSElSIHRvb2xzIC0gc3RhbmRhcmQgRkhJUiBvcGVyYXRpb25zIHdpdGhvdXQgJ2VwaWMnIHByZWZpeCBmcm9tIEFpZGJveFxuICAgIGVsc2UgaWYgKGlzQWlkYm94RkhJUlRvb2wodG9vbCkpIHtcbiAgICAgIGNhdGVnb3J5ID0gJ0FpZGJveCBGSElSJztcbiAgICB9XG4gICAgLy8gTWVkaWNhbCBEb2N1bWVudCB0b29scyAtIGRvY3VtZW50IHByb2Nlc3Npbmcgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzRG9jdW1lbnRUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdNZWRpY2FsIERvY3VtZW50cyc7XG4gICAgfVxuICAgIC8vIFNlYXJjaCAmIEFuYWx5c2lzIHRvb2xzIC0gQUkvTUwgb3BlcmF0aW9uc1xuICAgIGVsc2UgaWYgKGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2wpKSB7XG4gICAgICBjYXRlZ29yeSA9ICdTZWFyY2ggJiBBbmFseXNpcyc7XG4gICAgfVxuICAgIFxuICAgIGNhdGVnb3JpZXNbY2F0ZWdvcnldID0gKGNhdGVnb3JpZXNbY2F0ZWdvcnldIHx8IDApICsgMTtcbiAgfSk7XG4gIFxuICByZXR1cm4gY2F0ZWdvcmllcztcbn1cblxuZnVuY3Rpb24gaXNBaWRib3hGSElSVG9vbCh0b29sOiBhbnkpOiBib29sZWFuIHtcbiAgY29uc3QgYWlkYm94RkhJUlRvb2xOYW1lcyA9IFtcbiAgICAnc2VhcmNoUGF0aWVudHMnLCAnZ2V0UGF0aWVudERldGFpbHMnLCAnY3JlYXRlUGF0aWVudCcsICd1cGRhdGVQYXRpZW50JyxcbiAgICAnZ2V0UGF0aWVudE9ic2VydmF0aW9ucycsICdjcmVhdGVPYnNlcnZhdGlvbicsXG4gICAgJ2dldFBhdGllbnRNZWRpY2F0aW9ucycsICdjcmVhdGVNZWRpY2F0aW9uUmVxdWVzdCcsXG4gICAgJ2dldFBhdGllbnRDb25kaXRpb25zJywgJ2NyZWF0ZUNvbmRpdGlvbicsXG4gICAgJ2dldFBhdGllbnRFbmNvdW50ZXJzJywgJ2NyZWF0ZUVuY291bnRlcidcbiAgXTtcbiAgXG4gIC8vIE11c3QgYmUgaW4gdGhlIEFpZGJveCB0b29sIGxpc3QgQU5EIG5vdCBzdGFydCB3aXRoICdlcGljJ1xuICByZXR1cm4gYWlkYm94RkhJUlRvb2xOYW1lcy5pbmNsdWRlcyh0b29sLm5hbWUpICYmIFxuICAgICAgICAgIXRvb2wubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2VwaWMnKTtcbn1cblxuZnVuY3Rpb24gaXNEb2N1bWVudFRvb2wodG9vbDogYW55KTogYm9vbGVhbiB7XG4gIGNvbnN0IGRvY3VtZW50VG9vbE5hbWVzID0gW1xuICAgICd1cGxvYWREb2N1bWVudCcsICdzZWFyY2hEb2N1bWVudHMnLCAnbGlzdERvY3VtZW50cycsXG4gICAgJ2NodW5rQW5kRW1iZWREb2N1bWVudCcsICdnZW5lcmF0ZUVtYmVkZGluZ0xvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGRvY3VtZW50VG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbmZ1bmN0aW9uIGlzU2VhcmNoQW5hbHlzaXNUb29sKHRvb2w6IGFueSk6IGJvb2xlYW4ge1xuICBjb25zdCBhbmFseXNpc1Rvb2xOYW1lcyA9IFtcbiAgICAnYW5hbHl6ZVBhdGllbnRIaXN0b3J5JywgJ2ZpbmRTaW1pbGFyQ2FzZXMnLCAnZ2V0TWVkaWNhbEluc2lnaHRzJyxcbiAgICAnZXh0cmFjdE1lZGljYWxFbnRpdGllcycsICdzZW1hbnRpY1NlYXJjaExvY2FsJ1xuICBdO1xuICBcbiAgcmV0dXJuIGFuYWx5c2lzVG9vbE5hbWVzLmluY2x1ZGVzKHRvb2wubmFtZSk7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBnZXQgZW1vamkgZm9yIHRvb2wgY2F0ZWdvcmllc1xuLy8gZnVuY3Rpb24gZ2V0Q2F0ZWdvcnlFbW9qaShjYXRlZ29yeTogc3RyaW5nKTogc3RyaW5nIHtcbi8vICAgY29uc3QgZW1vamlNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4vLyAgICAgJ0VwaWMgRUhSJzogJ/Cfj6UnLFxuLy8gICAgICdBaWRib3ggRkhJUic6ICfwn5OLJyxcbi8vICAgICAnTWVkaWNhbCBEb2N1bWVudHMnOiAn8J+ThCcsXG4vLyAgICAgJ1NlYXJjaCAmIEFuYWx5c2lzJzogJ/CflI0nLFxuLy8gICAgICdPdGhlcic6ICfwn5SnJ1xuLy8gICB9O1xuICBcbi8vICAgcmV0dXJuIGVtb2ppTWFwW2NhdGVnb3J5XSB8fCAn8J+Upyc7XG4vLyB9XG5cbi8vIEdyYWNlZnVsIHNodXRkb3duXG5wcm9jZXNzLm9uKCdTSUdJTlQnLCAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCdcXG4gU2h1dHRpbmcgZG93biBzZXJ2ZXIuLi4nKTtcbiAgY29uc3QgbWNwTWFuYWdlciA9IE1DUENsaWVudE1hbmFnZXIuZ2V0SW5zdGFuY2UoKTtcbiAgXG4gIC8vIENsZWFyIGFsbCBjb250ZXh0IGJlZm9yZSBzaHV0ZG93blxuICBjb25zdCB7IENvbnRleHRNYW5hZ2VyIH0gPSByZXF1aXJlKCcvaW1wb3J0cy9hcGkvY29udGV4dC9jb250ZXh0TWFuYWdlcicpO1xuICBDb250ZXh0TWFuYWdlci5jbGVhckFsbENvbnRleHRzKCk7XG4gIFxuICBtY3BNYW5hZ2VyLnNodXRkb3duKCkudGhlbigoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJyBTZXJ2ZXIgc2h1dGRvd24gY29tcGxldGUnKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH0pLmNhdGNoKChlcnJvcikgPT4ge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGR1cmluZyBzaHV0ZG93bjonLCBlcnJvcik7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9KTtcbn0pO1xuXG4vLyBIYW5kbGUgdW5jYXVnaHQgZXJyb3JzXG5wcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIChlcnJvcikgPT4ge1xuICBjb25zb2xlLmVycm9yKCdVbmNhdWdodCBFeGNlcHRpb246JywgZXJyb3IpO1xufSk7XG5cbnByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb24sIHByb21pc2UpID0+IHtcbiAgY29uc29sZS5lcnJvcignVW5oYW5kbGVkIFJlamVjdGlvbiBhdDonLCBwcm9taXNlLCAncmVhc29uOicsIHJlYXNvbik7XG59KTsiXX0=
