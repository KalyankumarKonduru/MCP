**MERMAID DIAGRAM: -**
```mermaid
graph TB
    subgraph "MCP Client Application (mcp-pilot-meteor)"
        subgraph "Frontend Layer"
            UI[Chat UI<br/>- Display messages<br/>- Input box<br/>- File upload button]
        end

        subgraph "MCP Client Core (The Actual Chatbot)"
            MCPClient[MCP Client Manager]
            Methods[Request Handler]
            Memory[(Message History)]
        end

        subgraph "Connected Services"
            LLM[LLM<br/>Claude/Ozwell]
            MedServer[Medical MCP Server<br/>Tools Provider]
        end
    end

    %% User interaction
    UI -->|User input| Methods
    Methods -->|Process| MCPClient
    
    %% MCP Client orchestration
    MCPClient -->|"Send prompt + tools"| LLM
    LLM -->|"Choose tool (if needed)"| MCPClient
    MCPClient -->|"Execute tool"| MedServer
    MedServer -->|"Tool result"| MCPClient
    MCPClient -->|"Send result to LLM"| LLM
    LLM -->|"Final response"| MCPClient
    
    %% Response flow
    MCPClient -->|Store| Memory
    MCPClient -->|Display| UI

    %% Styling
    classDef ui fill:#e3f2fd,stroke:#1565c0
    classDef brain fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px
    classDef service fill:#fff3e0,stroke:#f57c00

    class UI ui
    class MCPClient,Methods,Memory brain
    class LLM,MedServer service
