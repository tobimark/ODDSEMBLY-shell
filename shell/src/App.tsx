import { useEffect, useRef, useState } from 'react';
import { TitleBar } from './regions/TitleBar';
import { Sidebar } from './regions/Sidebar';
import { NavBar } from './regions/NavBar';
import { CanvasWell } from './regions/CanvasWell';
import { Cards } from './regions/Cards';
import { AgentPanel } from './regions/AgentPanel';
import { WorkbenchProvider, useWorkbench } from './data/store';

/**
 * Fit-to-window scaling keeps the replica at a 1:1 pixel mapping when the
 * viewport is exactly 1453x865 (what the capture harness uses).
 */
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1453, window.innerHeight / 865);
      setScale(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

/**
 * Layout is the CrommaCode client area, 1440x852, in client-relative logical px.
 * The centre GameView canvas is deliberately an empty well; the chrome around it
 * is reproduced at pixel level.
 *
 * `WorkbenchProvider` is the only addition: it feeds the six frozen regions with
 * a real OpenCode snapshot through one store (see src/data/). Layout, geometry
 * and region composition are untouched.
 */
/**
 * Watches the workspace directory itself, not just the sidebar's switch event:
 * the directory can also change from the session menu, the bridge boot, or a
 * deleted session. Either way an open file belongs to the old workspace.
 */
function ProjectWatcher() {
  const snapshot = useWorkbench();
  const last = useRef(snapshot.projectDirectory);
  useEffect(() => {
    if (last.current === snapshot.projectDirectory) return;
    last.current = snapshot.projectDirectory;
    window.dispatchEvent(new CustomEvent('kunlun:project-changed'));
  }, [snapshot.projectDirectory]);
  return null;
}

export function App() {
  const scale = useStageScale();
  const [mode, setMode] = useState<'vibe' | 'files'>('vibe');
  const [file, setFile] = useState<string | null>(null);

  // The sidebar hands files over through one event, so the panel does not need
  // to know anything about the nav/well layers.
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      const path = typeof detail?.path === 'string' ? detail.path : null;
      if (!path) return;
      setFile(path);
      setMode('files');
    };
    window.addEventListener('kunlun:open-file', open);
    return () => window.removeEventListener('kunlun:open-file', open);
  }, []);

  // Switching project changes the directory itself: an open file belongs to the
  // old workspace, so the well goes back to 氛围 rather than showing a stale path.
  useEffect(() => {
    const reset = () => {
      setMode('vibe');
      setFile(null);
    };
    window.addEventListener('kunlun:project-changed', reset);
    return () => window.removeEventListener('kunlun:project-changed', reset);
  }, []);

  return (
    <WorkbenchProvider>
      <ProjectWatcher />
      <div className="viewport">
        <div className="stage" style={{ transform: `scale(${scale})` }}>
          <div className="client">
            <div className="surface" />
            <TitleBar />
            <Sidebar />
            <NavBar mode={mode} canShowFiles={file != null} onModeChange={setMode} />
            <CanvasWell mode={mode} file={file} onCloseFile={() => setMode('vibe')} />
            <Cards />
            <AgentPanel />
            <div className="gutter" />
          </div>
        </div>
      </div>
    </WorkbenchProvider>
  );
}
