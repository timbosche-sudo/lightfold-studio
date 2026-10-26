import { createStore, del, get, set, keys } from 'idb-keyval';
import type { Project } from '../types/project';
import { normalizeProject } from './projectFactory';

/** IndexedDB-backed project library (per browser / device). */
const projects = createStore('lightfold-projects', 'projects');
const meta = createStore('lightfold-meta', 'meta');

export interface LibraryEntry {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  thumbnail: string | null;
  revisionCount: number;
}

interface StoredProject {
  project: Project;
  thumbnail: string | null;
}

export async function saveProject(project: Project, thumbnail: string | null): Promise<void> {
  await set(project.id, { project, thumbnail } satisfies StoredProject, projects);
}

export async function loadProject(id: string): Promise<Project | null> {
  const s = await get<StoredProject>(id, projects);
  return s ? normalizeProject(s.project) : null;
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, projects);
}

export async function listProjects(): Promise<LibraryEntry[]> {
  const ids = await keys<string>(projects);
  const entries: LibraryEntry[] = [];
  for (const id of ids) {
    const s = await get<StoredProject>(id, projects);
    if (!s) continue;
    entries.push({
      id,
      name: s.project.name,
      updatedAt: s.project.updatedAt,
      createdAt: s.project.createdAt,
      thumbnail: s.thumbnail,
      revisionCount: s.project.revisions?.length ?? 0,
    });
  }
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The unsaved working copy, restored on reload. */
export type WorkingSaveState = 'saved' | 'unsaved' | 'never-saved';

export async function saveWorkingCopy(project: Project, saveState: WorkingSaveState): Promise<void> {
  await set('working', { project, saveState }, meta);
}

export async function loadWorkingCopy(): Promise<{ project: Project; saveState: WorkingSaveState } | null> {
  const w = await get<{ project: unknown; saveState: WorkingSaveState }>('working', meta);
  if (!w) return null;
  try {
    return { project: normalizeProject(w.project), saveState: w.saveState ?? 'unsaved' };
  } catch {
    return null;
  }
}
