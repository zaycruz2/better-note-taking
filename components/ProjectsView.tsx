import React, { useEffect, useMemo, useState } from 'react';
import { ViewMode } from '../types';
import { useProjects } from '../services/useProjects';
import ProjectsBoard from './ProjectsBoard';
import ProjectNotesPanel from './ProjectNotesPanel';

export default function ProjectsView(props: {
  viewMode: ViewMode;
  enabled: boolean;
  userId: string | null;
}) {
  const { viewMode, enabled, userId } = props;

  const { projects, byStatus, loading, error, refresh, create, update, remove } = useProjects({ userId, enabled });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!projects || projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    // Keep current selection if it still exists; otherwise pick the first active project, else first.
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) return;
    const active = projects.find((p) => p.status === 'active');
    setSelectedProjectId((active || projects[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  return (
    <>
      {/* Left "text" panel */}
      <div
        className={`
          flex-1 h-full transition-all duration-300
          ${viewMode === ViewMode.PREVIEW ? 'hidden' : 'block'}
          ${viewMode === ViewMode.SPLIT ? 'w-1/2 border-r border-gray-200' : 'w-full'}
        `}
      >
        <ProjectNotesPanel
          project={selectedProject}
          enabled={enabled}
          onUpdateNotes={async (id, notes) => {
            await update(id, { notes });
          }}
        />
      </div>

      {/* Right parsed UI panel */}
      <div
        className={`
          h-full transition-all duration-300 bg-gray-50
          ${viewMode === ViewMode.EDITOR ? 'hidden' : 'block'}
          ${viewMode === ViewMode.SPLIT ? 'w-1/2' : 'w-full'}
        `}
      >
        <ProjectsBoard
          enabled={enabled}
          loading={loading}
          error={error}
          projects={projects}
          byStatus={byStatus}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => setSelectedProjectId(id)}
          onRefresh={() => refresh()}
          onCreate={create}
          onUpdate={(id, patch) => update(id, patch)}
          onRemove={remove}
        />
      </div>
    </>
  );
}

