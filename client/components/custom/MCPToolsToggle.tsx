import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';

const MCPToolsToggle = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [enabledTools, setEnabledTools] = useState({});
  const [availableTools, setAvailableTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch available tools using Meteor method
  const fetchAvailableTools = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Call the Meteor method to get available tools
      const tools = await new Promise((resolve, reject) => {
        Meteor.call('mcp.getAvailableTools', (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      });
      
      // Use the tools exactly as they come from the server
      setAvailableTools(tools || []);
      
      // Load saved configuration from localStorage
      const savedConfig = localStorage.getItem('mcp-tools-config');
      if (savedConfig) {
        try {
          setEnabledTools(JSON.parse(savedConfig));
        } catch (err) {
          // If saved config is invalid, initialize all tools as enabled
          const initialState = {};
          tools.forEach(tool => {
            initialState[tool.name] = true;
          });
          setEnabledTools(initialState);
        }
      } else {
        // Initialize all tools as enabled by default
        const initialState = {};
        tools.forEach(tool => {
          initialState[tool.name] = true;
        });
        setEnabledTools(initialState);
      }
      
    } catch (err) {
      console.error('Error fetching tools:', err);
      setError(err.message || 'Failed to fetch tools');
    } finally {
      setLoading(false);
    }
  };

  // Fetch tools when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAvailableTools();
    }
  }, [isOpen]);

  const toggleTool = (toolName) => {
    setEnabledTools(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const enableAll = () => {
    const allEnabled = {};
    availableTools.forEach(tool => {
      allEnabled[tool.name] = true;
    });
    setEnabledTools(allEnabled);
  };

  const disableAll = () => {
    const allDisabled = {};
    availableTools.forEach(tool => {
      allDisabled[tool.name] = false;
    });
    setEnabledTools(allDisabled);
  };

  const saveConfiguration = () => {
    // Save to localStorage
    localStorage.setItem('mcp-tools-config', JSON.stringify(enabledTools));
    setIsOpen(false);
  };

  const enabledCount = Object.values(enabledTools).filter(Boolean).length;

  return (
    <>
      {/* Tools Icon Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="button button-ghost button-icon"
        aria-label="MCP Tools"
        title="Configure MCP Tools"
        style={{
          width: '32px',
          height: '32px',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Simple wrench icon using SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        
        {/* Show count badge if some tools are disabled */}
        {availableTools.length > 0 && enabledCount < availableTools.length && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: 'white',
            fontSize: '10px',
            borderRadius: '50%',
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {enabledCount}
          </span>
        )}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--background)',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            maxWidth: '48rem',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'var(--foreground)'
              }}>
                MCP Tools Configuration
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="button button-ghost button-icon"
                style={{ width: '32px', height: '32px' }}
              >
                ✕
              </button>
            </div>

            {/* Actions Bar */}
            {!loading && !error && availableTools.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                background: 'var(--muted)',
                borderBottom: '1px solid var(--border)'
              }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  Select which tools to enable for this chat
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={enableAll}
                    className="button button-ghost button-sm"
                  >
                    Enable All
                  </button>
                  <button
                    onClick={disableAll}
                    className="button button-ghost button-sm"
                  >
                    Disable All
                  </button>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px'
            }}>
              {/* Loading State */}
              {loading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '64px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--border)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <p style={{ marginTop: '16px', color: 'var(--muted-foreground)' }}>
                    Discovering available MCP tools...
                  </p>
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '64px',
                  textAlign: 'center'
                }}>
                  <p style={{ color: 'var(--destructive)', fontWeight: '500', marginBottom: '8px' }}>
                    Failed to load tools
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
                    {error}
                  </p>
                  <button
                    onClick={fetchAvailableTools}
                    className="button button-primary button-sm"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Tools List */}
              {!loading && !error && availableTools.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {availableTools.map((tool, index) => {
                    const isEnabled = enabledTools[tool.name] !== false;
                    
                    return (
                      <div
                        key={tool.name || index}
                        style={{
                          display: 'flex',
                          alignItems: 'start',
                          gap: '12px',
                          padding: '16px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: isEnabled ? 'var(--primary)' : 'var(--border)',
                          background: isEnabled ? 'var(--accent)' : 'var(--background)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => toggleTool(tool.name)}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleTool(tool.name)}
                          style={{ marginTop: '2px' }}
                        />
                        
                        {/* Tool Info */}
                        <div style={{ flex: 1 }}>
                          <h4 style={{
                            fontWeight: '500',
                            color: 'var(--foreground)',
                            marginBottom: '4px'
                          }}>
                            {tool.name}
                          </h4>
                          {tool.description && (
                            <p style={{
                              fontSize: '0.875rem',
                              color: 'var(--muted-foreground)',
                              lineHeight: '1.5'
                            }}>
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && availableTools.length === 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '64px',
                  textAlign: 'center'
                }}>
                  <p style={{ color: 'var(--muted-foreground)' }}>No MCP tools available</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '8px' }}>
                    Make sure MCP servers are running
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && !error && availableTools.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--muted)'
              }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  {enabledCount} of {availableTools.length} tools enabled
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="button button-outline button-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveConfiguration}
                    className="button button-primary button-sm"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default MCPToolsToggle;