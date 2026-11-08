import React from 'react';
import { Stage } from '../types/workflow';
import './StageInspector.css';

interface StageInspectorProps {
  stage: Stage | null;
  onClose: () => void;
}

export const StageInspector: React.FC<StageInspectorProps> = ({ stage, onClose }) => {
  if (!stage) return null;

  const getStateDisplay = (state: string) => {
    const map: Record<string, string> = {
      'planned': '◯ Planejado',
      'running': '▶ Executando',
      'completed': '✓ Concluído',
      'failed': '✕ Falhou',
      'cancelled': '⊘ Cancelado',
      'no-evidence': '? Sem Evidência',
    };
    return map[state] || state;
  };

  return (
    <div className="stage-inspector">
      <div className="inspector-header">
        <h2>{stage.name}</h2>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="inspector-content">
        {/* Status */}
        <div className="section">
          <h3>Status</h3>
          <div className="status-grid">
            <div><span className="label">Estado:</span> <span className="value">{getStateDisplay(stage.state)}</span></div>
            <div><span className="label">Ações:</span> <span className="value">{stage.actions.length}</span></div>
            {stage.startedAt && (
              <div><span className="label">Iniciado:</span> <span className="value">{new Date(stage.startedAt).toLocaleTimeString('pt-BR')}</span></div>
            )}
            {stage.endedAt && (
              <div><span className="label">Finalizado:</span> <span className="value">{new Date(stage.endedAt).toLocaleTimeString('pt-BR')}</span></div>
            )}
          </div>
        </div>

        {/* Descrição */}
        {stage.description && (
          <div className="section">
            <h3>Descrição</h3>
            <p className="description">{stage.description}</p>
          </div>
        )}

        {/* Ações */}
        <div className="section">
          <h3>Ações ({stage.actions.length})</h3>
          <div className="actions-list">
            {stage.actions.map((action, idx) => (
              <div key={idx} className="action-card">
                <div className="action-header">
                  <span className="action-name">{action.toolName}</span>
                  <span className={`action-status ${action.status}`}>{action.status}</span>
                </div>
                <div className="action-id">ID: {action.toolUseId.substring(0, 20)}...</div>
              </div>
            ))}
          </div>
        </div>

        {/* Entrada */}
        {(stage.input || stage.actions[0]?.input) && (
          <div className="section">
            <h3>Entrada</h3>
            <details open>
              <summary>Expandir JSON</summary>
              <pre className="json-preview">
                {JSON.stringify(stage.input || stage.actions[0]?.input, null, 2).substring(0, 500)}
                {JSON.stringify(stage.input || stage.actions[0]?.input, null, 2).length > 500 ? '...' : ''}
              </pre>
            </details>
          </div>
        )}

        {/* Saída */}
        {(stage.output || stage.actions[stage.actions.length - 1]?.output) && (
          <div className="section">
            <h3>Saída</h3>
            <details open>
              <summary>Expandir JSON</summary>
              <pre className="json-preview">
                {JSON.stringify(stage.output || stage.actions[stage.actions.length - 1]?.output, null, 2).substring(0, 500)}
                {JSON.stringify(stage.output || stage.actions[stage.actions.length - 1]?.output, null, 2).length > 500 ? '...' : ''}
              </pre>
            </details>
          </div>
        )}

        {/* Erro */}
        {stage.error && (
          <div className="section error-section">
            <h3>Erro</h3>
            <div className="error-message">{stage.error}</div>
          </div>
        )}

        {/* Dependências */}
        {stage.dependsOn && stage.dependsOn.length > 0 && (
          <div className="section">
            <h3>Depende De</h3>
            <div className="dependencies">
              {stage.dependsOn.map((depId) => (
                <span key={depId} className="dep-tag">{depId}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
