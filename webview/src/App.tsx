import React, { useState, useEffect } from 'react';
import 'reactflow/dist/style.css';
import './App.css';
import { CanvasWorkflow } from './components/CanvasWorkflow';
import { StageInspector } from './components/StageInspector';
import { generateDemoWorkflow } from './data/demoWorkflow';
import { WorkflowRun, Stage } from './types/workflow';

function App() {
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Carregar demo workflow ou workflow real
    const loadWorkflow = async () => {
      try {
        // Tentar carregar workflow real do VSCode API
        const vscodeApi = (window as any).vscodeApi;
        if (vscodeApi) {
          vscodeApi.postMessage({ command: 'load-workflow' });
        } else {
          // Fallback: demo workflow
          setWorkflowRun(generateDemoWorkflow());
          setLoading(false);
        }
      } catch (err) {
        // Em erro, usar demo
        setWorkflowRun(generateDemoWorkflow());
        setLoading(false);
      }
    };

    const handleMessage = (event: any) => {
      if (event.data.command === 'workflow-loaded') {
        setWorkflowRun(event.data.workflow);
        setLoading(false);
      } else if (event.data.command === 'workflow-updated') {
        setWorkflowRun(event.data.workflow);
      }
    };

    window.addEventListener('message', handleMessage);
    loadWorkflow();

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (loading) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner">⏳ Carregando workflow...</div>
      </div>
    );
  }

  if (!workflowRun) {
    return (
      <div className="App error-screen">
        <div className="error-message">❌ Nenhum workflow disponível</div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div>
            <h1>📊 {workflowRun.workflow.name}</h1>
            <p>{workflowRun.workflow.description}</p>
          </div>
          <div className="header-meta">
            <span className={`badge ${workflowRun.captureSource}`}>
              {workflowRun.captureSource === 'demo' ? '🎬 DEMO' : '🔴 REAL'}
            </span>
            <span className="meta-text">
              {workflowRun.stages.length} etapas • {workflowRun.stages.reduce((a, s) => a + s.actions.length, 0)} ações
            </span>
          </div>
        </div>
      </header>

      <main className="App-main">
        <div className="canvas-wrapper">
          <CanvasWorkflow
            stages={workflowRun.stages}
            onStageSelect={setSelectedStage}
          />
        </div>

        {selectedStage && (
          <StageInspector
            stage={selectedStage}
            onClose={() => setSelectedStage(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
