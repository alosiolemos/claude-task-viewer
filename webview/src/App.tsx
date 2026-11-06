import React, { useState, useEffect } from 'react';
import './App.css';

interface ToolEvent {
  timestamp: string;
  projectName: string;
  event: {
    tool_use_id?: string;
    tool_name?: string;
    tool_input?: any;
    tool_response?: any;
    captureSource?: string;
  };
}

function App() {
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = () => {
      (window as any).vscodeApi?.postMessage({ command: 'load-events' });
    };

    const handleMessage = (event: any) => {
      if (event.data.command === 'events-loaded') {
        setEvents(event.data.events);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    loadEvents();

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>📊 Painel Execução</h1>
        <p>Acompanhamento e auditoria de execução do Claude Code</p>
      </header>

      <main className="App-main">
        {loading ? (
          <div className="loading">⏳ Carregando eventos...</div>
        ) : events.length === 0 ? (
          <div className="empty">
            <p>Nenhum evento capturado ainda.</p>
            <p>Execute uma ação no Claude Code para capturar eventos.</p>
          </div>
        ) : (
          <div className="events-list">
            <p className="event-count">
              {events.length} evento{events.length !== 1 ? 's' : ''} capturado{events.length !== 1 ? 's' : ''}
            </p>
            {events.map((evt, idx) => (
              <div key={idx} className="event-card">
                <div className="event-header">
                  <span className="event-time">
                    🕐 {new Date(evt.timestamp).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="event-tool">
                    🔧 {evt.event.tool_name || 'Desconhecido'}
                  </span>
                </div>
                <div className="event-body">
                  <div className="event-id">
                    <strong>ID:</strong> {evt.event.tool_use_id?.substring(0, 20)}...
                  </div>
                  {evt.event.tool_input && (
                    <details>
                      <summary>📥 Entrada</summary>
                      <pre>{JSON.stringify(evt.event.tool_input, null, 2).substring(0, 200)}</pre>
                    </details>
                  )}
                  {evt.event.tool_response && (
                    <details>
                      <summary>📤 Saída</summary>
                      <pre>{JSON.stringify(evt.event.tool_response, null, 2).substring(0, 200)}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
