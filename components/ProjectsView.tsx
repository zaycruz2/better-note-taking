import React, { useMemo } from 'react';
import { ViewMode } from '../types';
import { useProjects } from '../services/useProjects';
import ProjectsEditor from './ProjectsEditor';
import ProjectsBoard from './ProjectsBoard';
import { formatProjectsAsText } from '../utils/projectsText';

export default function ProjectsView(props: {
  viewMode: ViewMode;
  enabled: boolean;
  userId: string | null;
}) {
  const { viewMode, enabled, userId } = props;

  const { projects, byStatus, loading, error, refresh, create, update, remove } = useProjects({ userId, enabled });

  const text = useMemo(() => formatProjectsAsText(projects), [projects]);

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
        <ProjectsEditor text={text} />
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
          onRefresh={() => refresh()}
          onCreate={create}
          onUpdate={(id, patch) => update(id, patch)}
          onRemove={remove}
        />
      </div>
    </>
  );
}

