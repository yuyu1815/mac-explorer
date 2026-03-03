import { TitleBar } from './components/TitleBar/TitleBar';
import { NavigationBar } from './components/NavigationBar/NavigationBar';
import { SidePanel } from './components/SidePanel/SidePanel';
import { MainPane } from './components/MainPane/MainPane';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { DetailsPane } from './components/DetailsPane/DetailsPane';
import { useAppStore } from './stores/appStore';
import './styles/global.css';

function App() {
  const showDetailsPane = useAppStore(s => s.showDetailsPane);

  return (
    <div className="app-container">
      <div style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
        <TitleBar />
        <NavigationBar />
        <Toolbar />
      </div>
      <div className="main-content">
        <SidePanel />
        <MainPane />
        {showDetailsPane && <DetailsPane />}
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
