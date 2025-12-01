import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Characters from './pages/Characters';
import ConversationEditor from './pages/ConversationEditor';
import Settings from './pages/Settings';
import ASRSettings from './pages/ASRSettings';

function App() {
  console.log('App component rendering');
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/characters" element={<Characters />} />
        <Route path="/conversations" element={<ConversationEditor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/asr-settings" element={<ASRSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;

