import React, { useState } from 'react';
import { CheckCircle2, Globe, Brain, FolderCheck } from 'lucide-react';

export const MultiSegmentSection: React.FC = () => {
  const [activeModel, setActiveModel] = useState<'rules' | 'onnx' | 'ollama'>('onnx');

  return (
    <section className="section ai-section">
      <div className="container ai-layout">
        <div className="ai-copy">
          <span className="eyebrow">Local AI Engine</span>
          <h2>Intelligent sorting that respects your privacy</h2>
          <p>
            SmartDM includes an embedded lightweight classification model that reads file extensions, headers, and URL context to automatically place downloads in structured folders.
          </p>

          <ul className="check-list">
            <li>
              <CheckCircle2 size={18} />
              <span>100% Offline Processing — No cloud requests or data collection</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>Custom regular expression pattern rules for power users</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>Automatic duplicate detection and version renaming</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>Optional integration with local LLMs (Ollama / LocalAI)</span>
            </li>
          </ul>
        </div>

        <div className="ai-workflow">
          {/* Interactive Model Switcher */}
          <div className="model-switch" aria-label="Select AI Model">
            <button
              className={activeModel === 'rules' ? 'active' : ''}
              onClick={() => setActiveModel('rules')}
            >
              Rule Engine
            </button>
            <button
              className={activeModel === 'onnx' ? 'active' : ''}
              onClick={() => setActiveModel('onnx')}
            >
              ONNX Model (Fast)
            </button>
            <button
              className={activeModel === 'ollama' ? 'active' : ''}
              onClick={() => setActiveModel('ollama')}
            >
              Ollama LLM
            </button>
          </div>

          <div className="workflow-line" />

          {/* Workflow Cards */}
          <div className="workflow-card source">
            <span>
              <Globe size={20} />
            </span>
            <div>
              <small>Incoming Stream</small>
              <b>https://cdn.example.com/build-x64.zip</b>
            </div>
          </div>

          <div className="workflow-card model">
            <span>
              <Brain size={20} />
            </span>
            <div>
              <small>
                {activeModel === 'rules' && 'Pattern Rules Matcher'}
                {activeModel === 'onnx' && 'Embedded Local Classifier (ONNX)'}
                {activeModel === 'ollama' && 'Local Ollama Context Engine'}
              </small>
              <b>
                {activeModel === 'rules' && 'Matched Extension .zip -> Archives'}
                {activeModel === 'onnx' && 'Confidence 99.4% -> Code Archive'}
                {activeModel === 'ollama' && 'Tagged: Developer Build Archive'}
              </b>
            </div>
          </div>

          <div className="workflow-card target">
            <span>
              <FolderCheck size={20} />
            </span>
            <div>
              <small>Target Folder</small>
              <b>/Downloads/Development/Archives/2026/</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
